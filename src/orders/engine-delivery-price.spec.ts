import { engineDeliveryFees } from './engine-delivery-price';
import { OrdersService } from './orders.service';

// Owner 2026-10-25: "seller should no longer set price". Checkout delivery comes from
// the shipment engine; a trip it cannot price is not offered.
describe('engineDeliveryFees', () => {
  const engine = (offers: any[]) => ({ discover: jest.fn(async () => offers) });
  const base = { fromCity: 'Dar es Salaam', toCity: 'Dar es Salaam', origin: 'Kariakoo', destination: 'Mbezi Beach', weightKg: 2, sameCity: true };

  it('same city: the agent\'s price; an agent with no fee set falls to the KenteXa rate card, never the seller', async () => {
    const e = engine([{ serviceType: 'direct_delivery', price: 4000 }, { serviceType: 'office', price: 3500 }]);
    expect(await engineDeliveryFees(e, base)).toEqual({ sameCity: 4000, intercity: null });
    expect(e.discover).toHaveBeenCalledWith(expect.objectContaining({ pickup: 'door', delivery: 'door', origin: { text: 'Kariakoo' } }));
    const card = jest.fn(async () => 3000);
    expect(await engineDeliveryFees(engine([{ serviceType: 'direct_delivery', price: 0 }]), { ...base, rateCard: card })).toEqual({ sameCity: 3000, intercity: null });
    expect(await engineDeliveryFees(engine([{ serviceType: 'office', price: 3500 }]), base)).toEqual({ sameCity: 3500, intercity: null });
  });

  it('another city: the cheapest priced office or transporter; unpriced ones are not a price', async () => {
    const e = engine([{ serviceType: 'office', price: 12000 }, { serviceType: 'composed_intercity', price: 9000 }, { serviceType: 'office', price: null }]);
    expect(await engineDeliveryFees(e, { ...base, toCity: 'Mbeya', sameCity: false })).toEqual({ sameCity: null, intercity: 9000 });
    expect(e.discover).toHaveBeenCalledWith(expect.objectContaining({ pickup: 'point', delivery: 'collect' }));
    expect(await engineDeliveryFees(engine([{ serviceType: 'office', price: null }]), { ...base, toCity: 'Kigoma', sameCity: false }))
      .toEqual({ sameCity: null, intercity: null });
  });

  it('no engine, or the engine fails: no price (never a guess)', async () => {
    expect(await engineDeliveryFees(undefined, base)).toEqual({ sameCity: null, intercity: null });
    expect(await engineDeliveryFees({ discover: async () => { throw new Error('down'); } }, base)).toEqual({ sameCity: null, intercity: null });
  });
});

describe('OrdersService.getDeliveryMethods priced by the engine', () => {
  const product = { id: 10, basePrice: 20000, deliveryFee: 9999, bodaFee: 8888, sellerCity: 'Dar es Salaam', weightKg: 1, seller: { businessLocation: 'Kariakoo' } };
  const build = (offers: any[]) => {
    const svc: any = Object.create(OrdersService.prototype);
    svc.productsService = { findOne: jest.fn(async () => product) };
    svc.serviceOffers = { discover: jest.fn(async () => offers) };
    return svc as OrdersService;
  };

  it('same city: the agent method at the engine price, not the seller\'s boda fee', async () => {
    const r: any = await build([{ serviceType: 'direct_delivery', price: 4000 }]).getDeliveryMethods('Sinza, Dar es Salaam', 10);
    expect(r.methods[0]).toMatchObject({ key: 'boda', fee: 4000, totalPrice: 24000 });
  });

  it('another city: the office method at the engine price; none when the engine has no price', async () => {
    const r: any = await build([{ serviceType: 'office', price: 12000 }]).getDeliveryMethods('Sokoine, Mbeya', 10);
    expect(r).toMatchObject({ isSameCity: false, methods: [{ key: 'agent', fee: 12000 }] });
    const none: any = await build([]).getDeliveryMethods('Sokoine, Mbeya', 10);
    expect(none.methods).toEqual([]);
  });
});
