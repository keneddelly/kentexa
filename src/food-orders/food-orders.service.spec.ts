import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FoodOrdersService, foodPaymentOptions, foodOrderCode } from './food-orders.service';
import { SuperAgentsService } from '../super-agents/super-agents.service';
import { OfficeBodaFeeService } from '../super-agents/office-boda-fee.service';

const HOTEL = { id: 9, ownerId: 70, name: 'Hoteli Amani', status: 'active', commerceProfileId: 31, phone: '0712000000' };
const SETTINGS = {
  businessId: 9, enabled: true, acceptingOrders: true, dineIn: true, pickup: true, payAfterDineIn: true, codPickup: false,
  tableCount: 12, roomCount: 0, openingHours: null, lipaNamba: '123456', lipaNambaName: 'AMANI',
};

function make(over: { settings?: any; items?: any[]; order?: any } = {}) {
  const calls: { sql: string; params: any[] }[] = [];
  const settings = { ...SETTINGS, ...(over.settings || {}) };
  const db = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('to_regclass')) return [{ ok: true }];
      if (sql.includes('FROM public.business b')) return [HOTEL];
      if (sql.includes('FROM public.food_menu_settings')) return [settings];
      if (sql.includes('FROM public.food_menu_item') && sql.includes('ANY($2::int[])')) {
        return (over.items ?? [{ id: 1, name: 'Pilau ya nyama', price: '7000.00' }, { id: 2, name: 'Chipsi mayai', price: '5000.00' }])
          .filter((i) => params[1].includes(i.id));
      }
      if (sql.startsWith('INSERT INTO public.food_order')) {
        return [{ id: 412, businessId: 9, customerId: 5, mode: params[2], placeType: params[3], placeNumber: params[4], items: JSON.parse(params[5]),
          note: params[6], totalAmount: params[7], paymentMethod: params[8], paymentStatus: 'pending', status: 'new' }];
      }
      if (sql.includes('SELECT * FROM public.food_order WHERE id = $1 AND "businessId"')) return over.order ? [over.order] : [];
      if (sql.startsWith('UPDATE public.food_order')) return [{ ...(over.order || {}), status: 'x' }];
      return [];
    }),
  };
  const notifications = { notify: jest.fn(async () => ({})) };
  const activity = { record: jest.fn(async () => undefined) };
  const svc = new FoodOrdersService(db as any, notifications as any, activity as any);
  return { svc, calls, notifications, activity };
}

describe('Hotel food ordering (owner 2026-10-27)', () => {
  it('ways to pay: Lipa Namba when set; after eating only for eat-here; cash on pickup only when the hotel allows it', () => {
    expect(foodPaymentOptions({ payAfterDineIn: true, codPickup: false }, 'dine_in', true)).toEqual(['lipa_namba', 'pay_after']);
    expect(foodPaymentOptions({ payAfterDineIn: true, codPickup: false }, 'pickup', true)).toEqual(['lipa_namba']);
    expect(foodPaymentOptions({ payAfterDineIn: false, codPickup: true }, 'pickup', false)).toEqual(['cod']);
    expect(foodOrderCode(7)).toBe('H-0007');
  });

  it('prices come from the menu, never from the customer, and the hotel owner is told', async () => {
    const { svc, calls, notifications, activity } = make();
    const res: any = await svc.placeOrder({ id: 5 }, {
      businessId: 9, mode: 'dine_in', placeType: 'table', placeNumber: 4, paymentMethod: 'lipa_namba', note: ' Chipsi  bila pilipili ',
      items: [{ itemId: 1, qty: 1, price: 1 }, { itemId: 2, qty: 2, price: 1 }],
    });
    expect(res).toMatchObject({ code: 'H-0412', total: 17000, place: 'Meza 4', note: 'Chipsi bila pilipili' });
    const insert = calls.find((c) => c.sql.startsWith('INSERT INTO public.food_order'))!;
    expect(insert.params[7]).toBe(17000);
    expect(JSON.parse(insert.params[5])).toEqual([
      { itemId: 1, name: 'Pilau ya nyama', price: 7000, qty: 1 }, { itemId: 2, name: 'Chipsi mayai', price: 5000, qty: 2 },
    ]);
    expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 70, actionPage: 'HotelKitchen', actionParam: '9', title: 'Oda mpya ya chakula · Meza 4' }));
    expect(activity.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'FOOD_ORDER_PLACED', businessId: 9, targetId: 412 }));
  });

  it('refuses a dish not available today, cash on pickup the hotel did not allow, and a table number the hotel does not have', async () => {
    const base = { businessId: 9, mode: 'pickup', paymentMethod: 'lipa_namba', items: [{ itemId: 3, qty: 1 }] };
    await expect(make().svc.placeOrder({ id: 5 }, base)).rejects.toThrow('Baadhi ya vyakula havipo leo');
    await expect(make().svc.placeOrder({ id: 5 }, { ...base, items: [{ itemId: 1, qty: 1 }], paymentMethod: 'cod' }))
      .rejects.toThrow('hairuhusu');
    await expect(make({ settings: { codPickup: true } }).svc.placeOrder({ id: 5 }, { ...base, items: [{ itemId: 1, qty: 1 }], paymentMethod: 'cod' }))
      .resolves.toMatchObject({ paymentMethod: 'cod', place: 'Chukua' });
    await expect(make().svc.placeOrder({ id: 5 }, { ...base, mode: 'dine_in', placeType: 'table', placeNumber: 13, items: [{ itemId: 1, qty: 1 }] }))
      .rejects.toThrow(BadRequestException);
    await expect(make().svc.placeOrder({ id: 5 }, { ...base, mode: 'dine_in', placeType: 'room', placeNumber: 1, items: [{ itemId: 1, qty: 1 }] }))
      .rejects.toThrow('namba ya meza au chumba');
    await expect(make({ settings: { acceptingOrders: false } }).svc.placeOrder({ id: 5 }, base)).rejects.toThrow('haipokei oda');
  });

  it('only the hotel owner runs the kitchen; accepting needs the minutes; handing over a cash order marks it paid', async () => {
    const order = { id: 412, businessId: 9, customerId: 5, mode: 'pickup', status: 'new', paymentMethod: 'cod', paymentStatus: 'pending', totalAmount: '5000' };
    await expect(make({ order }).svc.step(9, 412, { id: 71 }, 'accept', { minutes: 20 })).rejects.toThrow(ForbiddenException);
    await expect(make({ order }).svc.step(9, 412, { id: 70 }, 'accept', {})).rejects.toThrow('dakika');
    const ok = make({ order });
    await ok.svc.step(9, 412, { id: 70 }, 'accept', { minutes: 20 });
    expect(ok.notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 5, actionPage: 'FoodOrder', actionParam: '412',
      body: 'H-0412 · Jikoni wamesema: tayari baada ya dakika 20.' }));
    await expect(make({ order }).svc.step(9, 412, { id: 70 }, 'ready', {})).rejects.toThrow('haiwezi');

    const done = make({ order: { ...order, status: 'ready' } });
    await done.svc.step(9, 412, { id: 70 }, 'done', {});
    const update = done.calls.find((c) => c.sql.startsWith('UPDATE public.food_order'))!;
    expect(update.sql).toContain(`WHEN "paymentMethod" IN ('cod', 'pay_after') THEN 'paid'`);
  });

  it('a Lipa Namba payment is confirmed only after the customer sent a screenshot', async () => {
    const order = { id: 412, businessId: 9, customerId: 5, mode: 'dine_in', status: 'cooking', paymentMethod: 'lipa_namba', paymentStatus: 'pending', totalAmount: '17000' };
    await expect(make({ order }).svc.step(9, 412, { id: 70 }, 'confirm-payment', {})).rejects.toThrow('haiwezi');
    const ok = make({ order: { ...order, paymentStatus: 'proof_sent' } });
    await ok.svc.step(9, 412, { id: 70 }, 'confirm-payment', {});
    expect(ok.notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ title: 'Malipo yamethibitishwa' }));
  });
});

describe('Letewa: food delivery by a wakala, paid on delivery (owner 2026-10-27, part 2)', () => {
  const PLACE = { providerKey: 'tz_seed', providerPlaceId: 'sinza', label: 'Sinza, Ubungo, Dar es Salaam', region: 'Dar es Salaam', district: 'Ubungo' };
  function deliveryHarness(over: { order?: any; engineFails?: boolean; fee?: number | null } = {}) {
    const calls: { sql: string; params: any[] }[] = [];
    const settings = { ...SETTINGS, delivery: true, pickupPlace: PLACE };
    const db = {
      query: jest.fn(async (sql: string, params: any[] = []) => {
        calls.push({ sql, params });
        if (sql.includes('to_regclass') || sql.includes('information_schema.columns')) return [{ ok: true }];
        if (sql.includes('FROM public.business b')) return [HOTEL];
        if (sql.includes('FROM public.food_menu_settings')) return [settings];
        if (sql.includes('ANY($2::int[])')) return [{ id: 1, name: 'Pilau ya nyama', price: '7000.00' }].filter((i) => params[1].includes(i.id));
        if (sql.startsWith('SELECT phone FROM public."user"')) return [{ phone: '0712345678' }];
        if (sql.startsWith('SELECT * FROM public."user"')) return [{ id: 70, name: 'Amani Owner', phone: '255700000070' }];
        if (sql.startsWith('SELECT name, phone FROM public."user"')) return [{ name: 'Neema', phone: '255712345678' }];
        if (sql.startsWith('INSERT INTO public.food_order')) {
          return [{ id: 500, businessId: 9, customerId: 5, mode: params[2], items: JSON.parse(params[3]), totalAmount: params[5],
            paymentMethod: params[6], deliveryAddress: params[7], deliveryPhone: params[8], deliveryFee: params[9], status: 'new' }];
        }
        if (sql.includes('SELECT * FROM public.food_order WHERE id = $1 AND "businessId"')) return over.order ? [over.order] : [];
        if (sql.startsWith('UPDATE public.food_order SET status = \'cooking\'')) return [{ ...over.order, status: 'cooking', readyInMinutes: params[1] }];
        if (sql.startsWith('UPDATE public.food_order SET "shippingOrderId"')) return [{ ...over.order, status: 'cooking', shippingOrderId: params[1], trackingNumber: params[2] }];
        if (sql.startsWith('UPDATE public.food_order SET "deliveryError"')) return [{ ...over.order, status: 'cooking', deliveryError: params[1] }];
        return [];
      }),
    };
    const engine = { createSellerShipment: jest.fn(async () => {
      if (over.engineFails) throw new BadRequestException('Hakuna mtandao');
      return { orderId: 880, trackingNumber: 'KTX-ORD-880', customerNumber: 'KTX1234567890' };
    }) };
    const boda = { feeBetween: jest.fn(async () => (over.fee === undefined ? 3000 : over.fee)) };
    const tokens = new Map<any, any>([[SuperAgentsService, engine], [OfficeBodaFeeService, boda]]);
    const moduleRef = { get: jest.fn((t: any) => tokens.get(t)) };
    const svc = new FoodOrdersService(db as any, { notify: jest.fn(async () => ({})) } as any, { record: jest.fn(async () => undefined) } as any, moduleRef as any);
    return { svc, calls, engine, boda };
  }

  it('the fee is KenteXa\'s (Dar rate card from the hotel\'s place), and delivery is paid on delivery only', async () => {
    const h = deliveryHarness();
    await expect(h.svc.deliveryFee(9, 'Mbezi Beach')).resolves.toEqual({ fee: 3000 });
    expect(h.boda.feeBetween).toHaveBeenCalledWith('Sinza, Ubungo, Dar es Salaam', 'Mbezi Beach');
    const base = { businessId: 9, mode: 'delivery', deliveryAddress: 'Mbezi Beach, karibu na shule', items: [{ itemId: 1, qty: 2 }] };
    await expect(h.svc.placeOrder({ id: 5 }, { ...base, paymentMethod: 'lipa_namba' })).rejects.toThrow('kinalipwa ukipokea');
    const res: any = await h.svc.placeOrder({ id: 5 }, { ...base, paymentMethod: 'cod', deliveryFee: 1 });
    expect(res).toMatchObject({ place: 'Letewa', total: 14000, deliveryFee: 3000 });
    const insert = h.calls.find((c) => c.sql.startsWith('INSERT INTO public.food_order'))!;
    expect(insert.params.slice(7)).toEqual(['Mbezi Beach, karibu na shule', '255712345678', 3000]);
    await expect(deliveryHarness({ fee: null }).svc.placeOrder({ id: 5 }, { ...base, paymentMethod: 'cod' })).rejects.toThrow('bei ya kuleta');
  });

  it('accepting sends the wakala job through the one shipment engine as a pay-on-delivery seller shipment', async () => {
    const order = { id: 500, businessId: 9, customerId: 5, mode: 'delivery', status: 'new', paymentMethod: 'cod', paymentStatus: 'pending',
      totalAmount: '14000', deliveryFee: '3000', deliveryAddress: 'Mbezi Beach', deliveryPhone: '255712345678',
      items: [{ itemId: 1, name: 'Pilau ya nyama', price: 7000, qty: 2 }] };
    const h = deliveryHarness({ order });
    const res: any = await h.svc.step(9, 500, { id: 70 }, 'accept', { minutes: 20 });
    expect(h.engine.createSellerShipment).toHaveBeenCalledWith(expect.objectContaining({ id: 70 }), expect.objectContaining({
      isCod: true, codAmountPaid: 0, bodaFee: 3000, totalValue: 14000, transportMethod: 'agent',
      originCity: 'Dar es Salaam', destinationCity: 'Dar es Salaam', deliveryAddress: 'Mbezi Beach', recipientPhone: '255712345678',
      recipientName: 'Neema', pickupPlace: { providerKey: 'tz_seed', providerPlaceId: 'sinza' },
    }), expect.objectContaining({ businessId: 9, commerceProfileId: 31 }));
    expect(res).toMatchObject({ status: 'cooking', trackingNumber: 'KTX1234567890' });

    const failed = deliveryHarness({ order, engineFails: true });
    await expect(failed.svc.step(9, 500, { id: 70 }, 'accept', { minutes: 20 })).resolves.toMatchObject({ deliveryError: 'Hakuna mtandao' });
  });

  it('the kitchen cannot finish a wakala delivery; the delivery code does (the order is synced as done)', async () => {
    const order = { id: 500, businessId: 9, customerId: 5, mode: 'delivery', status: 'ready', shippingOrderId: 880, paymentMethod: 'cod' };
    const h = deliveryHarness({ order });
    await expect(h.svc.step(9, 500, { id: 70 }, 'done', {})).rejects.toThrow('haiwezi');
    await h.svc.kitchen(9, { id: 70 });
    const sync = h.calls.find((c) => c.sql.includes(`o.status::text IN ('delivered', 'completed')`))!;
    expect(sync.params).toEqual([9]);
  });
});
