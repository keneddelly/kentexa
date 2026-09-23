import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';

/**
 * Checkout DTO Integrity hotfix (Issue #11 Stage 2 review). Before this fix,
 * ValidationPipe's whitelist:true silently stripped shippingMethod/
 * needsCollection/isRuralCollection/deliveryFee/collectionFee/location
 * fields from every checkout POST before OrdersService.create() ever saw
 * them, even though create() read several via (dto as any) as if they were
 * real. A buyer's shipping-method/collection selection therefore had no
 * effect on the created order, silently.
 *
 * Same isolation strategy as orders.service.payment-guards.spec.ts: unit
 * tests against the real class, only the specific collaborators create()
 * actually needs for these assertions are supplied; everything else
 * resolves to an inert stub so the real guard/pricing code runs unmodified.
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

const baseProduct = (overrides: Record<string, any> = {}) => ({
  id: 10,
  isAvailable: true,
  stock: 5,
  basePrice: 20000,
  deliveryFee: 4000,
  bodaFee: 2500,
  shippingMethod: 'agent',
  category: 'general',
  seller: { id: 55 },
  codEnabled: false,
  ...overrides,
});

describe('OrdersService.create() — Checkout DTO Integrity', () => {
  it('honors an eligible, buyer-selected shippingMethod and derives its fee server-side (never from the request)', async () => {
    const product = baseProduct();
    const productsService = {
      findOne: jest.fn().mockResolvedValue(product),
      decreaseStock: jest.fn().mockResolvedValue(undefined),
    };
    const repo = { create: jest.fn((v) => v), save: jest.fn(async (v) => ({ ...v, id: 900 })), update: jest.fn().mockResolvedValue(undefined) };
    const getDeliveryMethods = jest.fn().mockResolvedValue({
      isSameCity: true,
      batchZone: null,
      methods: [{ key: 'boda', fee: 2500 }, { key: 'kentexa_delivery', fee: 3000 }],
    });
    const svc = build<OrdersService>({ repo, productsService, getDeliveryMethods });

    await svc.create(
      { productId: 10, quantity: 1, deliveryAddress: 'Kariakoo', shippingMethod: 'boda' } as any,
      buyer as any,
    );

    expect(getDeliveryMethods).toHaveBeenCalledWith('Kariakoo', 10);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ shippingMethod: 'boda', deliveryFeeAmount: 2500 }), // product.bodaFee, NOT a request-supplied value
    );
  });

  it('rejects a syntactically valid but ineligible shippingMethod for this product/address (contextual, not a static enum)', async () => {
    const product = baseProduct();
    const productsService = { findOne: jest.fn().mockResolvedValue(product), decreaseStock: jest.fn() };
    const repo = { create: jest.fn(), save: jest.fn(), update: jest.fn() };
    // e.g. an intercity address where only 'agent' is actually offered
    const getDeliveryMethods = jest.fn().mockResolvedValue({ isSameCity: false, batchZone: null, methods: [{ key: 'agent', fee: 4000 }] });
    const svc = build<OrdersService>({ repo, productsService, getDeliveryMethods });

    await expect(
      svc.create({ productId: 10, quantity: 1, deliveryAddress: 'Mwanza', shippingMethod: 'boda' } as any, buyer as any),
    ).rejects.toThrow(BadRequestException);

    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('falls back to the product default when shippingMethod is omitted (unchanged pre-hotfix behavior)', async () => {
    const product = baseProduct({ shippingMethod: 'agent' });
    const productsService = { findOne: jest.fn().mockResolvedValue(product), decreaseStock: jest.fn().mockResolvedValue(undefined) };
    const repo = { create: jest.fn((v) => v), save: jest.fn(async (v) => ({ ...v, id: 901 })), update: jest.fn().mockResolvedValue(undefined) };
    const getDeliveryMethods = jest.fn();
    const svc = build<OrdersService>({ repo, productsService, getDeliveryMethods });

    await svc.create({ productId: 10, quantity: 1, deliveryAddress: 'Kariakoo' } as any, buyer as any);

    expect(getDeliveryMethods).not.toHaveBeenCalled(); // no eligibility check needed when the buyer made no choice
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ shippingMethod: 'agent' }));
  });

  it('honors needsCollection/isRuralCollection as buyer intent, but the fee is always the fixed server rate', async () => {
    const product = baseProduct();
    const productsService = { findOne: jest.fn().mockResolvedValue(product), decreaseStock: jest.fn().mockResolvedValue(undefined) };
    const repo = { create: jest.fn((v) => v), save: jest.fn(async (v) => ({ ...v, id: 902 })), update: jest.fn().mockResolvedValue(undefined) };
    const svc = build<OrdersService>({ repo, productsService });

    await svc.create(
      { productId: 10, quantity: 1, deliveryAddress: 'Kariakoo', needsCollection: true, isRuralCollection: true } as any,
      buyer as any,
    );

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ needsCollection: true, isRuralCollection: true, collectionFee: 3000 }),
    );
  });

  // Collection intent must be validated against the resolved shipping
  // context server-side, exactly like shippingMethod itself — the frontend
  // already only ever sends needsCollection for intercity/agent orders
  // (needsCollection && !isSameCity), but the backend must not rely on that.
  describe('collection intent — contextual validation, not trusted at face value', () => {
    it('intercity/agent + needsCollection=true succeeds and charges the server-derived urban/rural rate', async () => {
      const product = baseProduct({ shippingMethod: 'agent' });
      const productsService = { findOne: jest.fn().mockResolvedValue(product), decreaseStock: jest.fn().mockResolvedValue(undefined) };
      const repo = { create: jest.fn((v) => v), save: jest.fn(async (v) => ({ ...v, id: 910 })), update: jest.fn().mockResolvedValue(undefined) };
      const svc = build<OrdersService>({ repo, productsService });

      await svc.create(
        { productId: 10, quantity: 1, deliveryAddress: 'Mwanza', needsCollection: true, isRuralCollection: false } as any,
        buyer as any,
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ needsCollection: true, isRuralCollection: false, collectionFee: 1500 }),
      );
    });

    it('same-city boda + needsCollection=true does NOT create a paid collection service (silently normalized, not trusted)', async () => {
      const product = baseProduct({ shippingMethod: 'agent' });
      const productsService = { findOne: jest.fn().mockResolvedValue(product), decreaseStock: jest.fn().mockResolvedValue(undefined) };
      const repo = { create: jest.fn((v) => v), save: jest.fn(async (v) => ({ ...v, id: 911 })), update: jest.fn().mockResolvedValue(undefined) };
      const getDeliveryMethods = jest.fn().mockResolvedValue({ isSameCity: true, batchZone: null, methods: [{ key: 'boda', fee: 2500 }] });
      const svc = build<OrdersService>({ repo, productsService, getDeliveryMethods });

      await svc.create(
        { productId: 10, quantity: 1, deliveryAddress: 'Kariakoo', shippingMethod: 'boda', needsCollection: true, isRuralCollection: true } as any,
        buyer as any,
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ needsCollection: false, isRuralCollection: false, collectionFee: null }),
      );
    });

    it('same-city Kentexa Delivery + needsCollection=true does NOT create a paid collection service either', async () => {
      const product = baseProduct({ shippingMethod: 'agent' });
      const productsService = { findOne: jest.fn().mockResolvedValue(product), decreaseStock: jest.fn().mockResolvedValue(undefined) };
      const repo = { create: jest.fn((v) => v), save: jest.fn(async (v) => ({ ...v, id: 912 })), update: jest.fn().mockResolvedValue(undefined) };
      const getDeliveryMethods = jest.fn().mockResolvedValue({ isSameCity: true, batchZone: 'Mbezi', methods: [{ key: 'kentexa_delivery', fee: 3000 }] });
      const svc = build<OrdersService>({ repo, productsService, getDeliveryMethods });

      await svc.create(
        { productId: 10, quantity: 1, deliveryAddress: 'Mbezi', shippingMethod: 'kentexa_delivery', needsCollection: true } as any,
        buyer as any,
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ needsCollection: false, collectionFee: null }),
      );
    });

    it('isRuralCollection=true with needsCollection=false (or normalized-false) cannot create a fee/state side effect', async () => {
      const product = baseProduct({ shippingMethod: 'agent' });
      const productsService = { findOne: jest.fn().mockResolvedValue(product), decreaseStock: jest.fn().mockResolvedValue(undefined) };
      const repo = { create: jest.fn((v) => v), save: jest.fn(async (v) => ({ ...v, id: 913 })), update: jest.fn().mockResolvedValue(undefined) };
      const svc = build<OrdersService>({ repo, productsService });

      await svc.create(
        { productId: 10, quantity: 1, deliveryAddress: 'Mwanza', needsCollection: false, isRuralCollection: true } as any,
        buyer as any,
      );

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ needsCollection: false, isRuralCollection: false, collectionFee: null }),
      );
    });
  });

  it('a client-forged deliveryFee/collectionFee on the raw request object has NO effect on the persisted amounts', async () => {
    const product = baseProduct(); // bodaFee: 2500
    const productsService = { findOne: jest.fn().mockResolvedValue(product), decreaseStock: jest.fn().mockResolvedValue(undefined) };
    const repo = { create: jest.fn((v) => v), save: jest.fn(async (v) => ({ ...v, id: 903 })), update: jest.fn().mockResolvedValue(undefined) };
    // Intercity ('agent') so needsCollection is legitimately eligible here —
    // this test is specifically about fee tampering, not collection-context
    // gating (covered separately below).
    const getDeliveryMethods = jest.fn().mockResolvedValue({ isSameCity: false, batchZone: null, methods: [{ key: 'agent', fee: 4000 }] });
    const svc = build<OrdersService>({ repo, productsService, getDeliveryMethods });

    // Simulates a payload that bypassed the DTO's own type (e.g. a direct API
    // call) attempting to dictate its own fee/price — proves create() no
    // longer reads these properties AT ALL, not merely that the (now-removed)
    // DTO fields are absent.
    const tamperedDto: any = {
      productId: 10,
      quantity: 1,
      deliveryAddress: 'Mwanza',
      shippingMethod: 'agent',
      needsCollection: true,
      isRuralCollection: false,
      deliveryFee: 1,
      collectionFee: 1,
    };

    await svc.create(tamperedDto, buyer as any);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryFeeAmount: 4000, collectionFee: 1500 }), // server-derived, ignoring the tampered 1/1
    );
  });

  it('drift guard: create() no longer reads shippingMethod/deliveryFee/needsCollection/isRuralCollection/collectionFee via an untyped (dto as any) cast', () => {
    const src = fs.readFileSync(path.resolve(__dirname, 'orders.service.ts'), 'utf8');
    const offenders = ['shippingMethod', 'deliveryFee', 'needsCollection', 'isRuralCollection', 'collectionFee'].filter((field) =>
      new RegExp(`\\(dto as any\\)\\.${field}\\b`).test(src),
    );
    expect(offenders).toEqual([]);
  });
});
