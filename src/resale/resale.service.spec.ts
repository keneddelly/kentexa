import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ResaleService } from './resale.service';

/** "Uza tena" (owner 2026-11-09): who may resell, and what each screen shows. */
function build(product: any, extra: Record<string, any[]> = {}, member = true) {
  const calls: any[] = [];
  const db: any = {
    query: jest.fn(async (sql: string, params: any[]) => {
      calls.push([sql, params]);
      if (/resale_member/.test(sql) && /SELECT 1/.test(sql)) return member ? [{ ok: 1 }] : [];
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

describe('Uza tena R3: the profit record', () => {
  const order = (over: any = {}) => ({ id: 50, status: 'delivered', quantity: 1, resaleUnitPrice: '55000', supplierUnitPrice: '42000',
    resellerProfit: '13000', deliveredAt: new Date().toISOString(), completedAt: null, createdAt: null, resellerPaidAt: null,
    resellerPaidRef: null, resellerConfirmedAt: null, resellerDisputedAt: null, resellerDisputeNote: null,
    productNameSnapshot: 'Simu', sellerId: 9, resellerUserId: 20, ...over });
  const make = (row: any) => {
    const db: any = { query: jest.fn(async (sql: string) => (/WHERE o\.id = \$1::int AND o\."resellerUserId" IS NOT NULL/.test(sql) ? [row] : [])) };
    const events: any = { record: jest.fn(async () => undefined) };
    const notifier: any = { notify: jest.fn(async () => ({})) };
    return { svc: new ResaleService(db, events, notifier), db, events, notifier };
  };

  it('the supplier marks a delivered profit paid with its reference; the reseller is told', async () => {
    const { svc, db, notifier, events } = make(order());
    await expect(svc.markPaid(9, 50, ' QK71X2 ')).resolves.toEqual({ orderId: 50, state: 'paid', paidRef: 'QK71X2' });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('"resellerPaidAt" = now()'), [50, 'QK71X2']);
    expect(notifier.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 20, title: 'Umelipwa faida yako' }));
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'RESELLER_PAID' }));
  });

  it('refuses: another shop, before delivery, without a reference', async () => {
    await expect(make(order()).svc.markPaid(8, 50, 'QK71X2')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(make(order({ status: 'in_transit' })).svc.markPaid(9, 50, 'QK71X2')).rejects.toThrow('baada ya mteja kupokea');
    await expect(make(order()).svc.markPaid(9, 50, '')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('the reseller confirms or disputes only after the shop says paid; a dispute tells the shop', async () => {
    await expect(make(order()).svc.confirm(20, 50)).rejects.toBeInstanceOf(BadRequestException);
    await expect(make(order({ resellerPaidAt: new Date() })).svc.confirm(21, 50)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(make(order({ resellerPaidAt: new Date() })).svc.confirm(20, 50)).resolves.toEqual({ orderId: 50, state: 'confirmed' });
    const d = make(order({ resellerPaidAt: new Date(), resellerPaidRef: 'QK71X2' }));
    await expect(d.svc.dispute(20, 50, 'Sijaona pesa')).resolves.toEqual({ orderId: 50, state: 'disputed' });
    expect(d.notifier.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 9, title: 'Muuzaji hajapokea faida' }));
    expect(d.events.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'RESELLER_PAY_DISPUTED', severity: 'warning' }));
  });

  it('totals: coming, owed, received', async () => {
    const rows = [order({ id: 1, status: 'preparing' }), order({ id: 2 }), order({ id: 3, resellerPaidAt: new Date(), resellerConfirmedAt: new Date() })];
    const db: any = { query: jest.fn(async () => rows) };
    const svc = new ResaleService(db, { record: jest.fn() } as any);
    const r = await svc.myProfits(20);
    expect(r.totals).toEqual({ coming: 13000, owed: 13000, paid: 0, received: 13000 });
    expect(r.items.map((i: any) => i.state)).toEqual(['waiting', 'owed', 'confirmed']);
  });
});

describe('Uza tena: the catalogue (owner 2026-11-10)', () => {
  it('search, category, one shop and profit sort, with category chips and "more"', async () => {
    const calls: any[] = [];
    const items = Array.from({ length: 31 }, (_, i) => ({ id: i + 1, name: `Simu ${i}`, images: 'a.jpg', category: 'electronics', basePrice: '50000',
      resalePrice: '42000', resaleMinPrice: null, stock: 3, sellerId: 9, supplierName: 'BIS' }));
    const db: any = { query: jest.fn(async (sql: string, params: any[]) => {
      if (/resale_member/.test(sql)) return [{ ok: 1 }];
      calls.push([sql, params]);
      return /GROUP BY p.category/.test(sql) ? [{ category: 'electronics', n: 31 }] : items;
    }) };
    const svc = new ResaleService(db, { record: jest.fn() } as any);
    const r = await svc.openProducts(20, { q: 'sim_u%', category: 'electronics', supplierId: 9, sort: 'profit', page: 2 });
    expect(r.items).toHaveLength(30);
    expect(r).toMatchObject({ hasMore: true, page: 2, categories: [{ key: 'electronics', count: 31 }] });
    expect(r.items[0]).toMatchObject({ supplierPrice: 42000, profitAtShopPrice: 8000, supplierId: 9, category: 'electronics' });
    const [listSql, listParams] = calls[0];
    expect(listSql).toContain('ILIKE');
    expect(listSql).toContain('(p."basePrice" - p."resalePrice") DESC');
    expect(listParams).toEqual([20, '%sim\\_u\\%%', 9, 'electronics', 30]);
    // The chips count every category under the same search, not only the chosen one.
    expect(calls[1][1]).toEqual([20, '%sim\\_u\\%%', 9]);
  });

  it('a shop page asks how many of its products are open', async () => {
    const db: any = { query: jest.fn(async () => [{ n: 4 }]) };
    await expect(new ResaleService(db, { record: jest.fn() } as any).supplierOpenCount(9)).resolves.toEqual({ supplierId: 9, count: 4 });
  });
});

describe('Uza tena members (owner 2026-11-10): prices only for people who joined', () => {
  const phone2 = { resaleOpen: true, resalePrice: '42000.00', resaleMinPrice: null, basePrice: '50000.00', sellerId: 9, isActive: true, id: 3, name: 'Simu' };
  it('a non-member sees that it can be resold, never a price; cannot save an offer or open the catalogue', async () => {
    const { svc } = build(phone2, {}, false);
    const t: any = await svc.terms(3, 20);
    expect(t).toEqual({ open: true, productId: 3, own: false, member: false });
    expect(JSON.stringify(t)).not.toContain('42000');
    await expect(svc.saveOffer({ id: 20, isVerified: true }, { productId: 3, price: 55000 })).rejects.toThrow('Jiunge na Uza tena');
    await expect(svc.openProducts(20)).rejects.toThrow('Jiunge na Uza tena');
  });
  it('joining needs a verified phone and the rules accepted; it is recorded', async () => {
    const { svc, events, calls } = build(phone2, { '"rulesAcceptedAt", "isActive" FROM public.resale_member': [{ joinedAt: 'x', rulesAcceptedAt: 'y', isActive: true }] });
    await expect(svc.join({ id: 20, isVerified: false }, { acceptRules: true })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.join({ id: 20, isVerified: true }, {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.join({ id: 20, isVerified: true }, { acceptRules: true })).resolves.toEqual({ member: true, joinedAt: 'x', rulesAccepted: true });
    expect(calls.some(([sql]: any) => /INSERT INTO public.resale_member/.test(sql))).toBe(true);
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'RESELLER_JOINED', actorId: 20 }));
  });
});
