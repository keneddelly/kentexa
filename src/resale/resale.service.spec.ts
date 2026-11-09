import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ResaleService } from './resale.service';

/** "Uza tena" (owner 2026-11-09): who may resell, and what each screen shows. */
function build(product: any, extra: Record<string, any[]> = {}) {
  const calls: any[] = [];
  const db: any = {
    query: jest.fn(async (sql: string, params: any[]) => {
      calls.push([sql, params]);
      if (/FROM public\.product p WHERE p\.id/.test(sql)) return product ? [product] : [];
      if (/INSERT INTO public\.resale_offer/.test(sql)) return [{ id: 7, price: String(params[2]), note: params[3], isActive: true }];
      for (const [k, v] of Object.entries(extra)) if (sql.includes(k)) return v;
      return [];
    }),
  };
  const events: any = { record: jest.fn(async () => undefined) };
  return { svc: new ResaleService(db, events), db, events, calls };
}
const phone = { resaleOpen: true, resalePrice: '42000.00', resaleMinPrice: null, basePrice: '50000.00', sellerId: 9, isActive: true, id: 3, name: 'Simu' };

describe('Uza tena: offers', () => {
  it('a verified person saves an offer at their price and sees the profit for one sale', async () => {
    const { svc, events } = build(phone);
    const r = await svc.saveOffer({ id: 20, isVerified: true }, { productId: 3, price: 55000, note: ' Bei ya jumla pia ' });
    expect(r).toMatchObject({ id: 7, productId: 3, price: 55000, note: 'Bei ya jumla pia', profitEach: 13000 });
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'RESALE_OFFER_SAVED', actorId: 20, relatedUserId: 9 }));
  });

  it('refuses: phone not verified, product not open, own product, price under the floor', async () => {
    await expect(build(phone).svc.saveOffer({ id: 20, isVerified: false }, { productId: 3, price: 55000 })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(build({ ...phone, resaleOpen: false }).svc.saveOffer({ id: 20, isVerified: true }, { productId: 3, price: 55000 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(build(phone).svc.saveOffer({ id: 9, isVerified: true }, { productId: 3, price: 55000 })).rejects.toThrow('yako mwenyewe');
    await expect(build(phone).svc.saveOffer({ id: 20, isVerified: true }, { productId: 3, price: 41000 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('terms: closed products say so; open ones give the supplier price and floor', async () => {
    expect(await build({ ...phone, resaleOpen: false }).svc.terms(3, 20)).toEqual({ open: false, productId: 3 });
    expect(await build(phone).svc.terms(3, 20)).toMatchObject({ open: true, own: false, publicPrice: 50000, supplierPrice: 42000, floor: 42000, offer: null });
    // The supplier sees its own terms even while closed.
    expect(await build({ ...phone, resaleOpen: false }).svc.terms(3, 9)).toEqual({ open: false, productId: 3, own: true, publicPrice: 50000, supplierPrice: 42000, minPrice: null });
  });

  it('the shared offer shows the reseller and the price, never the supplier price', async () => {
    const row = { id: 7, productId: 3, price: '55000.00', note: null, isActive: true, resaleOpen: true, resalePrice: '42000.00', resaleMinPrice: null, resellerId: 20, resellerName: 'Neema', resellerPhoto: null };
    const { svc } = build(phone, { 'JOIN public."user" u ON u.id = o."resellerUserId"': [row] });
    const r = await svc.publicOffer(7);
    expect(r).toEqual({ id: 7, productId: 3, price: 55000, note: null, reseller: { id: 20, name: 'Neema', photo: null } });
    expect(JSON.stringify(r)).not.toContain('42000');
    const closed = build(phone, { 'JOIN public."user" u ON u.id = o."resellerUserId"': [{ ...row, isActive: false }] });
    await expect(closed.svc.publicOffer(7)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('my offers: profit for one sale, and a warning when the supplier raised its price', async () => {
    const rows = [{ id: 7, productId: 3, price: '55000.00', note: null, isActive: true, name: 'Simu', images: 'a.jpg,b.jpg', stock: 4,
      resaleOpen: true, resalePrice: '56000.00', resaleMinPrice: null, orders: '2' }];
    const { svc } = build(phone, { 'WHERE o."resellerUserId" = $1::int': rows });
    const [o] = await svc.myOffers(20);
    expect(o).toMatchObject({ id: 7, image: 'a.jpg', profitEach: -1000, orders: 2, needsNewPrice: true });
  });
});
