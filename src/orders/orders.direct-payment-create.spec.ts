import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';

/**
 * Release F: OrdersService.create() in MARKETPLACE_PAYMENT_MODE cod_lipa (the default).
 * Same isolation as orders.checkout-dto-integrity.spec.ts: the real create() runs, only the
 * collaborators it needs are supplied, everything else is an inert stub.
 */
const anyStub: any = new Proxy(function () {}, {
  get: (_t, p) => (p === 'then' || typeof p === 'symbol' ? undefined : anyStub),
  apply: () => Promise.resolve(undefined),
});
const build = <T>(props: Record<string, unknown>): T =>
  new Proxy(Object.assign(Object.create(OrdersService.prototype), props), {
    get: (t, p, r) => (p in t ? Reflect.get(t, p, r) : typeof p === 'symbol' ? undefined : anyStub),
  }) as T;

const buyer = { id: 1, name: 'Asha' };
const DAR = { id: 1, name: 'Dar es Salaam' };
const ARUSHA = { id: 3, name: 'Arusha' };

function setup(opts: { codEnabled?: boolean; lipaNamba?: string | null } = {}) {
  const product = {
    id: 10, isAvailable: true, stock: 5, basePrice: 20000, deliveryFee: 4000, bodaFee: 2500,
    shippingMethod: 'agent', category: 'general', seller: { id: 55 }, codEnabled: opts.codEnabled ?? true,
  };
  const seller = { regionId: 1, businessRegion: 'Dar es Salaam', lipaNamba: opts.lipaNamba === undefined ? '55771234' : opts.lipaNamba, lipaNambaName: 'Juma Shop' };
  const query = jest.fn(async (sql: string, params: any[]) => {
    if (/FROM public\.seller_profile/.test(sql)) return [seller];
    if (/FROM public\.tz_region/.test(sql)) return [params[0] === 1 ? DAR : params[0] === 3 ? ARUSHA : undefined].filter(Boolean);
    return [];
  });
  const repo = {
    create: jest.fn((v) => v), save: jest.fn(async (v) => ({ ...v, id: 700 })), update: jest.fn().mockResolvedValue(undefined),
    manager: { query },
  };
  const productsService = { findOne: jest.fn().mockResolvedValue(product), decreaseStock: jest.fn().mockResolvedValue(undefined) };
  const invoicesService = { createForOrder: jest.fn() };
  const payoutRepo = { save: jest.fn(), create: jest.fn((v) => v) };
  const svc = build<OrdersService>({ repo, productsService, invoicesService, payoutRepo });
  return { svc, repo, invoicesService, payoutRepo };
}
const PROOF = { url: 'https://res.cloudinary.com/kentexa/image/upload/v1/slip.jpg', reference: 'QX12' };
const place = (svc: OrdersService, regionId: number | undefined, paymentMethod?: string, opts?: any) =>
  svc.create({ productId: 10, quantity: 1, deliveryAddress: 'Kariakoo', regionId, paymentMethod } as any, buyer as any, opts);

describe('OrdersService.create() — MARKETPLACE_PAYMENT_MODE cod_lipa', () => {
  const savedMode = process.env.MARKETPLACE_PAYMENT_MODE;
  beforeAll(() => { delete process.env.MARKETPLACE_PAYMENT_MODE; }); // default = cod_lipa
  afterAll(() => { if (savedMode !== undefined) process.env.MARKETPLACE_PAYMENT_MODE = savedMode; });

  it('same city COD: preparing, everything paid on delivery, no escrow, no payout, no KenteXa invoice', async () => {
    const { svc, repo, invoicesService, payoutRepo } = setup();
    await place(svc, 1, 'cod');
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      paymentMethod: 'cod', paymentMode: 'cod_lipa', sameCity: true, status: 'preparing',
      escrowStatus: null, payoutStatus: null, codUpfrontAmount: 0, codRemainingBalance: 24000,
    }));
    expect(invoicesService.createForOrder).not.toHaveBeenCalled();
    expect(payoutRepo.save).not.toHaveBeenCalled();
  });

  it('Lipa Namba, same city and other city: created only with the payment proof, which is kept', async () => {
    let t = setup();
    await place(t.svc, 1, 'lipa_namba', { checkout: true, lipaProof: PROOF });
    expect(t.repo.create).toHaveBeenCalledWith(expect.objectContaining({
      paymentMethod: 'lipa_namba', paymentMode: 'cod_lipa', sameCity: true, escrowStatus: null,
      lipaProofUrl: PROOF.url, lipaReference: 'QX12', lipaConfirmedAt: expect.any(Date),
    }));
    t = setup();
    await place(t.svc, 3, 'lipa_namba', { checkout: true, lipaProof: PROOF });
    expect(t.repo.create).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'lipa_namba', sameCity: false, codUpfrontAmount: null }));
  });

  it('Lipa Namba without proof (e.g. POST /orders): refused, nothing written', async () => {
    const { svc, repo } = setup();
    await expect(place(svc, 1, 'lipa_namba')).rejects.toThrow('pakia picha ya malipo');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('sold out or short stock: refused with the product named, in Swahili', async () => {
    const { svc, repo } = setup();
    (svc as any).productsService.findOne.mockResolvedValue({ id: 10, name: 'Simu A', isAvailable: false, stock: 0 });
    await expect(place(svc, 1, 'cod')).rejects.toThrow('"Simu A" imeisha');
    (svc as any).productsService.findOne.mockResolvedValue({ id: 10, name: 'Simu A', isAvailable: true, stock: 0 });
    await expect(place(svc, 1, 'cod')).rejects.toThrow('"Simu A" imeisha');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it.each([
    ['online payment (old process hidden)', 1, 'online', {}],
    ['no payment method', 1, undefined, {}],
    ['COD to another city', 3, 'cod', {}],
    ['COD with no buyer region (never on a guess)', undefined, 'cod', {}],
    ['COD on a product the seller did not allow', 1, 'cod', { codEnabled: false }],
    ['Lipa Namba when the seller has none', 1, 'lipa_namba', { lipaNamba: null }],
  ])('refuses %s, writes nothing', async (_label, region, method, opts) => {
    const { svc, repo } = setup(opts as any);
    await expect(place(svc, region as any, method as any, { checkout: true, lipaProof: PROOF })).rejects.toThrow(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('in "online" mode the old process is unchanged and Lipa Namba is refused', async () => {
    process.env.MARKETPLACE_PAYMENT_MODE = 'online';
    try {
      const t = setup();
      await place(t.svc, 1, 'online');
      expect(t.repo.create).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'online', paymentMode: null, escrowStatus: 'holding', payoutStatus: 'pending' }));
      expect(t.invoicesService.createForOrder).toHaveBeenCalled();
      const u = setup();
      await expect(place(u.svc, 1, 'lipa_namba')).rejects.toThrow(BadRequestException);
    } finally { delete process.env.MARKETPLACE_PAYMENT_MODE; }
  });
});
