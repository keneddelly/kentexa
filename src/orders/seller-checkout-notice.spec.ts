import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import {
  NoticeOrder,
  buildSellerCheckoutMessage,
  groupDirectOrdersBySeller,
  sellerCheckoutExpiry,
  sellerCheckoutLink,
  signSellerCheckoutToken,
  verifySellerCheckoutToken,
  whatsappLink,
  whatsappNumber,
} from './seller-checkout-notice';

const SECRET = 'unit-test-secret';

const camera: NoticeOrder = { id: 157, quantity: 1, totalAmount: '300000.00', deliveryFeeAmount: '0.00', paymentMethod: 'cod', paymentMode: 'cod_lipa', productName: 'SPY CAMERA ON REMOTE CONTROL ', sellerId: 2 };
const keychain: NoticeOrder = { id: 158, quantity: 2, totalAmount: '303000.00', deliveryFeeAmount: '1500.00', paymentMethod: 'cod', paymentMode: 'cod_lipa', productName: 'CAR KEY CHAIN SPY CAMERA ', sellerId: 2 };

describe('seller checkout notice — grouping', () => {
  it('a two-product cart from one seller is ONE group, in checkout order', () => {
    const groups = groupDirectOrdersBySeller([camera, keychain]);
    expect(groups).toEqual([{ sellerId: 2, orders: [camera, keychain] }]);
  });

  it('two sellers = two groups; online (non direct-payment) orders are left out', () => {
    const other = { ...camera, id: 159, sellerId: 9 };
    const online = { ...camera, id: 160, paymentMode: null };
    const groups = groupDirectOrdersBySeller([camera, other, keychain, online]);
    expect(groups.map((g) => [g.sellerId, g.orders.map((o) => o.id)])).toEqual([[2, [157, 158]], [9, [159]]]);
  });
});

describe('seller checkout notice — message text', () => {
  const base = { regionName: 'Dar es Salaam', districtName: 'Ilala', buyerName: 'Asha Juma', buyerPhone: '0712345678', link: 'https://kentexa.com/?sellerCheckout=abc.def' };

  it('two-product COD cart: order numbers, items with quantity and price, total, place, buyer, method, link', () => {
    expect(buildSellerCheckoutMessage({ ...base, orders: [camera, keychain] })).toBe([
      'KenteXa: Agizo jipya #157, #158.',
      '1) SPY CAMERA ON REMOTE CONTROL x1: TZS 300,000',
      '2) CAR KEY CHAIN SPY CAMERA x2: TZS 303,000 (pamoja na usafiri TZS 1,500)',
      'Jumla: TZS 603,000',
      'Malipo: Pesa mkononi wakati wa kupokea (COD)',
      'Mahali: Ilala, Dar es Salaam',
      'Mnunuzi: Asha Juma, 0712345678',
      'Maelezo: https://kentexa.com/?sellerCheckout=abc.def',
    ].join('\n'));
  });

  it('Lipa Namba, long product name shortened, unknown place and buyer said plainly', () => {
    const lipa = [{ ...camera, paymentMethod: 'lipa_namba', productName: 'A'.repeat(60) }, { ...keychain, paymentMethod: 'lipa_namba' }];
    const text = buildSellerCheckoutMessage({ ...base, orders: lipa, regionName: null, districtName: null, buyerName: null, buyerPhone: null });
    expect(text).toContain(`1) ${'A'.repeat(39)}… x1: TZS 300,000`);
    expect(text).toContain('Malipo: Lipa Namba yako');
    expect(text).toContain('Mahali: haijulikani');
    expect(text).toContain('Mnunuzi: haijulikani');
  });
});

describe('seller checkout notice — signed link (7 days)', () => {
  const now = 1_800_000_000;
  const payload = { s: 2, o: [157, 158], r: 1, d: 1, e: sellerCheckoutExpiry(now) };

  it('expires exactly 7 days later', () => {
    expect(payload.e - now).toBe(7 * 24 * 60 * 60);
  });

  it('round-trips with the right secret, before expiry', () => {
    const token = signSellerCheckoutToken(payload, SECRET);
    expect(verifySellerCheckoutToken(token, SECRET, now)).toEqual(payload);
    expect(verifySellerCheckoutToken(token, SECRET, payload.e - 1)).toEqual(payload);
  });

  it('nothing when expired, tampered, signed with another secret, or no secret', () => {
    const token = signSellerCheckoutToken(payload, SECRET);
    expect(verifySellerCheckoutToken(token, SECRET, payload.e)).toBeNull();
    const [body, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ ...payload, o: [1, 2, 3] })).toString('base64url');
    expect(verifySellerCheckoutToken(`${forged}.${sig}`, SECRET, now)).toBeNull();
    expect(verifySellerCheckoutToken(`${body}.${sig.slice(0, -2)}xx`, SECRET, now)).toBeNull();
    expect(verifySellerCheckoutToken(token, 'other-secret', now)).toBeNull();
    expect(verifySellerCheckoutToken(token, undefined, now)).toBeNull();
    expect(verifySellerCheckoutToken('garbage', SECRET, now)).toBeNull();
    expect(() => signSellerCheckoutToken(payload, undefined)).toThrow();
  });
});

describe('seller checkout notice — link site', () => {
  it('https://kentexa.com when FRONTEND_URL is not set; FRONTEND_URL (no trailing slash) when it is', () => {
    expect(sellerCheckoutLink('a.b', undefined)).toBe('https://kentexa.com/?sellerCheckout=a.b');
    expect(sellerCheckoutLink('a.b', '')).toBe('https://kentexa.com/?sellerCheckout=a.b');
    expect(sellerCheckoutLink('a.b', 'https://www.kentexa.com/')).toBe('https://www.kentexa.com/?sellerCheckout=a.b');
  });
});

describe('seller checkout notice — WhatsApp link', () => {
  it('normalises Tanzanian numbers; anything else is no number', () => {
    expect(whatsappNumber('0712 345 678')).toBe('255712345678');
    expect(whatsappNumber('+255 712-345-678')).toBe('255712345678');
    expect(whatsappNumber('712345678')).toBe('255712345678');
    expect(whatsappNumber('12345')).toBeNull();
    expect(whatsappNumber(null)).toBeNull();
  });

  it('wa.me with the same text pre-filled; null without a storeWhatsApp number', () => {
    const text = 'KenteXa: Agizo jipya #157.\nJumla: TZS 300,000';
    const link = whatsappLink('0712345678', text)!;
    expect(link.startsWith('https://wa.me/255712345678?text=')).toBe(true);
    expect(decodeURIComponent(link.split('?text=')[1])).toBe(text);
    expect(whatsappLink(null, text)).toBeNull();
    expect(whatsappLink('', text)).toBeNull();
  });
});

// ── OrdersService.createCheckout(): the real create() per item, same harness as
// orders.direct-payment-create.spec.ts (collaborators it needs are supplied, the rest inert).
const anyStub: any = new Proxy(function () {}, {
  get: (_t, p) => (p === 'then' || typeof p === 'symbol' ? undefined : anyStub),
  apply: () => Promise.resolve(undefined),
});
const build = <T>(props: Record<string, unknown>): T =>
  new Proxy(Object.assign(Object.create(OrdersService.prototype), props), {
    get: (t, p, r) => (p in t ? Reflect.get(t, p, r) : typeof p === 'symbol' ? undefined : anyStub),
  }) as T;

function setup(opts: { sellerPhone?: string | null; storeWhatsApp?: string | null; failSecond?: boolean } = {}) {
  const seller = { id: 2, name: 'kened', storeName: 'Bishoo intelligence system',
    phone: opts.sellerPhone === undefined ? '255700000002' : opts.sellerPhone, storeWhatsApp: opts.storeWhatsApp ?? null };
  const products: Record<number, any> = {
    31: { id: 31, name: 'SPY CAMERA ON REMOTE CONTROL', isAvailable: true, stock: 5, basePrice: 300000, deliveryFee: 0, bodaFee: 0, shippingMethod: 'agent', category: 'general', seller, codEnabled: true },
    34: { id: 34, name: 'CAR KEY CHAIN SPY CAMERA', isAvailable: true, stock: opts.failSecond ? 0 : 5, basePrice: 150000, deliveryFee: 0, bodaFee: 0, shippingMethod: 'agent', category: 'general', seller, codEnabled: true },
  };
  const profile = { regionId: 1, businessRegion: 'Dar es Salaam', lipaNamba: '55771234', lipaNambaName: 'Bishoo' };
  const query = jest.fn(async (sql: string, params: any[]) => {
    if (/FROM public\.seller_profile/.test(sql)) return [profile];
    if (/FROM public\.tz_region/.test(sql)) return params[0] === 1 ? [{ id: 1, name: 'Dar es Salaam' }] : [];
    if (/FROM public\.tz_district/.test(sql)) return params[0] === 1 && params[1] === 1 ? [{ id: 1, name: 'Ilala' }] : [];
    return [];
  });
  let nextId = 900;
  const repo = {
    create: jest.fn((v) => v), save: jest.fn(async (v) => ({ ...v, id: ++nextId })), update: jest.fn().mockResolvedValue(undefined),
    manager: { query },
  };
  const productsService = { findOne: jest.fn(async (id: number) => products[id]), decreaseStock: jest.fn().mockResolvedValue(undefined) };
  const smsService = { sendSms: jest.fn().mockResolvedValue(true) };
  const activityEvents = { record: jest.fn() };
  const svc = build<OrdersService>({ repo, productsService, smsService, activityEvents, invoicesService: { createForOrder: jest.fn() }, payoutRepo: { save: jest.fn(), create: jest.fn((v) => v) } });
  return { svc, smsService, activityEvents };
}
const checkout = (svc: OrdersService, paymentMethod: 'cod' | 'lipa_namba') =>
  svc.createCheckout({
    items: [{ productId: 31, quantity: 1 }, { productId: 34, quantity: 1 }],
    deliveryAddress: 'Ilala, Dar es Salaam', phone: '0712345678', regionId: 1, districtId: 1,
    shippingMethod: 'boda', paymentMethod,
  } as any, { id: 7, name: 'Asha Juma' } as any);

describe('OrdersService.createCheckout() — one seller notice per checkout', () => {
  const saved = { mode: process.env.MARKETPLACE_PAYMENT_MODE, secret: process.env.JWT_SECRET };
  beforeAll(() => { delete process.env.MARKETPLACE_PAYMENT_MODE; process.env.JWT_SECRET = SECRET; });
  afterAll(() => {
    if (saved.mode !== undefined) process.env.MARKETPLACE_PAYMENT_MODE = saved.mode;
    if (saved.secret !== undefined) process.env.JWT_SECRET = saved.secret; else delete process.env.JWT_SECRET;
  });
  const sellerSms = (sms: jest.Mock) => sms.mock.calls.filter(([phone]) => phone === '255700000002');
  const buyerSms = (sms: jest.Mock) => sms.mock.calls.filter(([phone]) => phone === '0712345678');

  it('two-product COD cart: two orders, ONE seller SMS with both items; buyer COD SMS unchanged (one per order)', async () => {
    const { svc, smsService } = setup();
    const res = await checkout(svc, 'cod');
    expect(res.orders.map((o: any) => o.id)).toEqual([901, 902]);
    const seller = sellerSms(smsService.sendSms);
    expect(seller).toHaveLength(1);
    const text: string = seller[0][1];
    expect(text.split('\n').slice(0, 7)).toEqual([
      'KenteXa: Agizo jipya #901, #902.',
      '1) SPY CAMERA ON REMOTE CONTROL x1: TZS 300,000',
      '2) CAR KEY CHAIN SPY CAMERA x1: TZS 150,000',
      'Jumla: TZS 450,000',
      'Malipo: Pesa mkononi wakati wa kupokea (COD)',
      'Mahali: Ilala, Dar es Salaam',
      'Mnunuzi: Asha Juma, 0712345678',
    ]);
    const token = text.split('?sellerCheckout=')[1];
    expect(verifySellerCheckoutToken(token, SECRET)).toEqual(expect.objectContaining({ s: 2, o: [901, 902], r: 1, d: 1 }));
    expect(buyerSms(smsService.sendSms).map(([, m]) => m)).toEqual([
      'KenteXa: Oda #901 imethibitishwa. Hakuna malipo ya awali yanayohitajika. Utalipa TZS 300,000 wakati wa kupokea.',
      'KenteXa: Oda #902 imethibitishwa. Hakuna malipo ya awali yanayohitajika. Utalipa TZS 150,000 wakati wa kupokea.',
    ]);
    expect(res.sellerNotices).toEqual([{ sellerId: 2, storeName: 'Bishoo intelligence system', orderIds: [901, 902], whatsappUrl: null }]);
  });

  it('two-product Lipa Namba cart: one seller SMS, no buyer COD SMS; WhatsApp link only with storeWhatsApp', async () => {
    const { svc, smsService } = setup({ storeWhatsApp: '0754000111' });
    const res = await checkout(svc, 'lipa_namba');
    const seller = sellerSms(smsService.sendSms);
    expect(seller).toHaveLength(1);
    expect(seller[0][1]).toContain('Malipo: Lipa Namba yako');
    expect(buyerSms(smsService.sendSms)).toHaveLength(0);
    const url = res.sellerNotices[0].whatsappUrl!;
    expect(url.startsWith('https://wa.me/255754000111?text=')).toBe(true);
    expect(decodeURIComponent(url.split('?text=')[1])).toBe(seller[0][1]);
  });

  it('seller without a phone: no SMS, logged, the orders still succeed', async () => {
    const { svc, smsService, activityEvents } = setup({ sellerPhone: null });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await checkout(svc, 'cod');
    expect(res.orders).toHaveLength(2);
    expect(sellerSms(smsService.sendSms)).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('has no phone; SMS skipped for orders 901,902'));
    expect(activityEvents.record).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'SELLER_CHECKOUT_NOTICE', metadata: expect.objectContaining({ smsSent: false, sellerHasPhone: false }),
    }));
    warn.mockRestore();
  });

  it('second item fails: the first order stays, its seller is still told, the error reaches the buyer', async () => {
    const { svc, smsService } = setup({ failSecond: true });
    await expect(checkout(svc, 'cod')).rejects.toThrow('Insufficient stock');
    const seller = sellerSms(smsService.sendSms);
    expect(seller).toHaveLength(1);
    expect(seller[0][1].split('\n')[0]).toBe('KenteXa: Agizo jipya #901.');
  });
});

describe('OrdersService.getSellerCheckoutView() — the private link', () => {
  const savedSecret = process.env.JWT_SECRET;
  beforeAll(() => { process.env.JWT_SECRET = SECRET; });
  afterAll(() => { if (savedSecret !== undefined) process.env.JWT_SECRET = savedSecret; else delete process.env.JWT_SECRET; });

  const orders = [
    { id: 901, seller: { id: 2 }, buyer: { name: 'Asha Juma' }, product: { name: 'SPY CAMERA' }, quantity: 1, totalAmount: '300000.00', paymentMethod: 'cod', phone: '0712345678', deliveryAddress: 'Ilala, Dar es Salaam' },
    { id: 902, seller: { id: 9 }, buyer: { name: 'Asha Juma' }, product: { name: 'Other seller item' }, quantity: 1, totalAmount: '5000.00', paymentMethod: 'cod' },
  ];
  const svc = (staffOf: number[] = []) => build<OrdersService>({
    sellerScope: { isAuthorizedFor: jest.fn(async (_u: any, sellerId: number) => staffOf.includes(sellerId)) },
    repo: {
      find: jest.fn(async () => orders),
      manager: { query: jest.fn(async (sql: string) => (/tz_region/.test(sql) ? [{ id: 1, name: 'Dar es Salaam' }] : [{ id: 1, name: 'Ilala' }])) },
    },
  });

  const seller2 = { id: 2 } as any;

  it('valid token: only that seller\'s orders from that checkout', async () => {
    const token = signSellerCheckoutToken({ s: 2, o: [901, 902], r: 1, d: 1, e: sellerCheckoutExpiry() }, SECRET);
    const view = await svc().getSellerCheckoutView(token, seller2);
    expect(view.orderIds).toEqual([901]);
    expect(view.total).toBe(300000);
    expect(view).toEqual(expect.objectContaining({ regionName: 'Dar es Salaam', districtName: 'Ilala', buyerName: 'Asha Juma', buyerPhone: '0712345678' }));
  });

  it('login is the key too: another account gets 403; the seller\'s staff or an active admin get in', async () => {
    const token = signSellerCheckoutToken({ s: 2, o: [901], r: 1, d: 1, e: sellerCheckoutExpiry() }, SECRET);
    await expect(svc().getSellerCheckoutView(token, { id: 9 } as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc().getSellerCheckoutView(token, undefined as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect((await svc([2]).getSellerCheckoutView(token, { id: 9 } as any)).orderIds).toEqual([901]);
    expect((await svc().getSellerCheckoutView(token, { id: 9 } as any, { roleType: 'admin' } as any)).orderIds).toEqual([901]);
  });

  it('no token, a bad one, or an expired one: nothing (404)', async () => {
    const expired = signSellerCheckoutToken({ s: 2, o: [901], r: 1, d: 1, e: Math.floor(Date.now() / 1000) - 1 }, SECRET);
    await expect(svc().getSellerCheckoutView(expired, seller2)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc().getSellerCheckoutView('x.y', seller2)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc().getSellerCheckoutView('', seller2)).rejects.toBeInstanceOf(NotFoundException);
  });
});
