import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { COD_MESSAGES, SMS_SINGLE_PART, codText1, isSameCity } from './cod-sms';
import { SuperAgentsService } from './super-agents.service';

const GSM = /^[A-Za-z0-9 @£$¥\n\r_!"#%&'()*+,\-./:;<=>?]*$/;

describe('COD: same city only', () => {
  it('same city, however it is written; another city is not', () => {
    expect(isSameCity('Dar es Salaam', 'dar-es-salaam')).toBe(true);
    expect(isSameCity('Dar es Salaam', 'Dar')).toBe(true);
    expect(isSameCity('Mwanza', ' mwanza ')).toBe(true);
    expect(isSameCity('Dar es Salaam', 'Mwanza')).toBe(false);
    expect(isSameCity('Arusha', 'Moshi')).toBe(false);
    expect(isSameCity('', '')).toBe(false);
  });
});

describe('COD text 1 (owner wording: shop, item, price + usafiri = total, pay on delivery)', () => {
  it('reads exactly as the owner wrote it and fits one SMS', () => {
    const text = codText1({
      goods: 300000, bodaFee: 2000, lipaNamba: '5808450',
      shopName: 'BIS', itemName: 'Saa ya ukutani', reference: 'KTX 8822 3997 65',
    });
    expect(text).toBe('Oda yako kwa BIS imethibitishwa: Saa ya ukutani 300,000 + usafiri 2,000 = TZS 302,000. ' +
      'Lipa ukipokea: taslimu au Lipa 5808450. Fuatilia: KTX 8822 3997 65');
    expect(text.length).toBeLessThanOrEqual(SMS_SINGLE_PART);
    expect(text).not.toMatch(/Umelipa|KenteXa:/);
  });

  it('cash only when the seller has no Lipa Namba; a part-paid sale says "salio"', () => {
    const text = codText1({ goods: 60000, partlyPaid: true, bodaFee: 0, lipaNamba: null, shopName: 'Duka', itemName: 'Simu' });
    expect(text).toBe('Oda yako kwa Duka imethibitishwa: Simu salio 60,000 + usafiri 0 = TZS 60,000. Lipa ukipokea: taslimu.');
  });

  it('long names are shortened at whole words; amounts, how to pay and tracking stay', () => {
    const text = codText1({
      goods: 1250000, bodaFee: 5000, lipaNamba: '5808450', shopName: 'BIS Electronics',
      itemName: 'Televisheni ya Samsung inchi 55 Smart 4K pamoja na stendi ya ukutani', reference: 'KTX 8822 3997 65',
    });
    expect(text.length).toBeLessThanOrEqual(SMS_SINGLE_PART);
    expect(text).toMatch(/^Oda yako kwa BIS imethibitishwa: Televisheni 1,250,000/);
    expect(text).toMatch(/1,250,000 \+ usafiri 5,000 = TZS 1,255,000\. Lipa ukipokea: taslimu au Lipa 5808450\. Fuatilia: KTX 8822 3997 65$/);
  });

  it('stays one plain SMS whatever the names, emoji or amounts', () => {
    const text = codText1({
      goods: 9999999, partlyPaid: true, bodaFee: 99999, lipaNamba: '123456789012',
      shopName: '🔥 Super Mega Store ya Kariakoo na Mwenge Limited Company 🔥',
      itemName: '“Friji” kubwa sana ya milango miwili pamoja na mashine ya kufulia', reference: 'KTX 8822 3997 65',
    });
    expect(text.length).toBeLessThanOrEqual(SMS_SINGLE_PART);
    expect(text).toMatch(GSM);
    expect(text).toMatch(/9,999,999 \+ usafiri 99,999 = TZS 10,099,998\. Lipa ukipokea: taslimu au Lipa 123456789012\./);
  });

  it('with no shop name it still reads well', () => {
    expect(codText1({ goods: 5000, bodaFee: 2000, itemName: 'Kitabu', reference: 'KTX 1' }))
      .toBe('Oda yako imethibitishwa: Kitabu 5,000 + usafiri 2,000 = TZS 7,000. Lipa ukipokea: taslimu. Fuatilia: KTX 1');
  });
});

describe('createSellerShipment: COD refusals happen before anything is saved', () => {
  const seller = { id: 7, name: 'Duka', phone: '0700000001' } as any;
  const base = {
    description: 'Simu', recipientName: 'Amina', recipientPhone: '0700000002', deliveryAddress: 'Kariakoo',
    originCity: 'Dar es Salaam', transportMethod: 'boda', totalValue: 100000,
  };
  const make = (sale: any = null) => {
    const orderRepo = { create: jest.fn((x) => x), save: jest.fn() };
    const fake: any = {
      saleRepo: { findOne: jest.fn(async () => sale) },
      resolveBillingSellerProfile: async () => null,
      commerceProfiles: { findById: async () => null },
      orderRepo,
      bodaFees: { feeBetween: jest.fn(async () => 3000) },
    };
    fake.resolveCodBodaFee = (SuperAgentsService.prototype as any).resolveCodBodaFee.bind(fake);
    return { fake, orderRepo, call: (dto: any) => SuperAgentsService.prototype.createSellerShipment.call(fake, seller, dto) };
  };

  it('an intercity COD is refused', async () => {
    const { call, orderRepo } = make();
    await expect(call({ ...base, destinationCity: 'Mwanza', isCod: true, codAmountPaid: 0 }))
      .rejects.toThrow(COD_MESSAGES.intercity);
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('an intercity COD from a POS sale is refused too', async () => {
    const sale = { id: 3, sellerId: 7, status: 'completed', isCod: true, subtotal: 100000, amountPaid: 20000, balanceDue: 80000 };
    const { call, orderRepo } = make(sale);
    await expect(call({ ...base, destinationCity: 'Arusha', saleId: 3 })).rejects.toThrow(COD_MESSAGES.intercity);
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  it('a COD with the full amount paid is refused', async () => {
    const { call, orderRepo } = make();
    await expect(call({ ...base, destinationCity: 'Dar es Salaam', isCod: true, codAmountPaid: 100000 }))
      .rejects.toThrow(COD_MESSAGES.fullyPaid);
    expect(orderRepo.save).not.toHaveBeenCalled();
  });

  // The whole method, with every collaborator faked: what the buyer receives.
  const place = {
    displayLabel: 'Kariakoo, Ilala', latitude: -6.82, longitude: 39.27, regionName: 'Dar es Salaam', districtName: 'Ilala',
    providerKey: 'tz_seed', providerPlaceId: 'ward:6', resolutionMethod: 'admin_seed',
  };
  // The create transaction's queries: the parcel's shipment link, then the pickup task insert.
  const taskRows: any[] = [];
  const em = {
    query: jest.fn(async (sql: string, params: any[]) => {
      if (sql.includes('SELECT "shipmentId"')) return [{ shipmentId: 77 }];
      if (sql.includes('INSERT INTO public.parcel_pickup_task')) { taskRows.push(params); return [{ id: 501, status: 'requested' }]; }
      return [];
    }),
  };
  const pickupPlace = { providerKey: 'tz_seed', providerPlaceId: 'ward:6' };
  const full = (sale: any, profile: any = { lipaNamba: '5808450', address: 'Kariakoo' }) => {
    taskRows.length = 0;
    const sms = { sendSms: jest.fn(async () => true) };
    const parcelRepo = { update: jest.fn(async () => ({})) };
    const fake: any = {
      saleRepo: { findOne: jest.fn(async () => sale), update: jest.fn(async () => ({})) },
      resolveBillingSellerProfile: async () => profile ? { ...profile, freeOrdersUsed: 0, freeOrdersGranted: 50, platformFeePerOrder: 0 } : null,
      assertNotBillingBlocked: () => undefined,
      commerceProfiles: { findById: async () => null },
      orderRepo: { create: jest.fn((x) => x), save: jest.fn(async (x) => ({ ...x, id: 900 })), update: jest.fn(async () => ({})) },
      sellerProfileRepo: { update: jest.fn(async () => ({})) },
      createParcelForOrder: jest.fn(async () => ({ parcel: { id: 50 }, transitCity: null, expectedArrival: null, estimatedDays: 1 })),
      dataSource: {
        query: jest.fn(async () => [{ waybillNumber: null, createdAt: null }]),
        transaction: jest.fn(async (cb: any) => cb(em)),
      },
      locationIntelligence: { resolve: jest.fn(async () => place) },
      parcelRepo, smsService: sms,
      invoicesService: { recordManualPayment: jest.fn(async () => ({ receiptNumber: 'KNT-RCP-1' })) },
      auditLog: { record: jest.fn(async () => ({})) },
      inAppNotif: { shipmentCreatedById: jest.fn(async () => ({})) },
      businessCustomerService: { upsertFromOrder: jest.fn(async () => ({})) },
      bodaFees: { feeBetween: jest.fn(async () => 3000) },
    };
    fake.resolveCodBodaFee = (SuperAgentsService.prototype as any).resolveCodBodaFee.bind(fake);
    fake.resolveCodPickup = (SuperAgentsService.prototype as any).resolveCodPickup.bind(fake);
    // No saved shop place in these cases (cod-pickup-remembered.spec.ts covers reuse).
    fake.lastCodPickupSnapshot = (SuperAgentsService.prototype as any).lastCodPickupSnapshot.bind(fake);
    return { sms, parcelRepo, fake, call: (dto: any) => SuperAgentsService.prototype.createSellerShipment.call(fake, seller, dto) };
  };

  it('an intracity COD sends text 1 once, after the shipment is created, and keeps the boda fee on the Parcel', async () => {
    const sale = { id: 3, sellerId: 7, status: 'completed', isCod: true, subtotal: 100000, total: 100000,
      amountPaid: 20000, balanceDue: 80000, customerName: 'Amina', customerPhone: '0700000002', receiptNumber: 'R1' };
    const { sms, parcelRepo, fake, call } = full(sale);
    await call({ ...base, destinationCity: 'Dar es Salaam', saleId: 3, pickupPlace });
    expect(sms.sendSms).toHaveBeenCalledTimes(1);
    // The boda job: one direct pickup at the seller's resolved shop, requested by the seller.
    expect(taskRows).toHaveLength(1);
    const [parcelId, , , sellerId, origin, contactName, contactPhone] = taskRows[0];
    expect([parcelId, sellerId, contactName, contactPhone]).toEqual([50, 7, 'Duka', '0700000001']);
    expect(JSON.parse(origin)).toMatchObject({ city: 'Dar es Salaam', label: 'Kariakoo, Ilala', providerKey: 'tz_seed' });
    const [phone, text] = (sms.sendSms.mock.calls[0] as unknown) as [string, string];
    expect(phone).toBe('0700000002');
    expect(text).toMatch(/^Oda yako kwa Duka imethibitishwa: Simu salio 80,000 \+ usafiri 3,000 = TZS 83,000\. Lipa ukipokea: taslimu au Lipa 5808450\./);
    expect(text).not.toMatch(/Umelipa/);
    expect(parcelRepo.update).toHaveBeenCalledWith(50, { agreedDeliveryFee: 3000 });
    expect(fake.createParcelForOrder.mock.invocationCallOrder[0]).toBeLessThan(sms.sendSms.mock.invocationCallOrder[0]);
  });

  it('a paid POS sale keeps its shipping text and gets no boda fee', async () => {
    const sale = { id: 4, sellerId: 7, status: 'completed', isCod: false, subtotal: 50000, total: 50000,
      amountPaid: 50000, balanceDue: 0, customerName: 'Juma', customerPhone: '0700000003', receiptNumber: 'R2' };
    const { sms, parcelRepo, call } = full(sale);
    await call({ ...base, destinationCity: 'Mwanza', transportMethod: 'super_agent', saleId: 4 });
    expect(sms.sendSms).toHaveBeenCalledTimes(1);
    expect(((sms.sendSms.mock.calls[0] as unknown) as [string, string])[1]).toMatch(/ameanza kutuma bidhaa yako/);
    expect(parcelRepo.update).not.toHaveBeenCalled();
    expect(taskRows).toHaveLength(0); // no boda job: van/hub shipments are unchanged
  });

  it('a COD needs the boda pickup place (the seller\'s shop, picked on the map) before anything is saved', async () => {
    const sale = { id: 5, sellerId: 7, status: 'completed', isCod: true, subtotal: 100000, total: 100000,
      amountPaid: 20000, balanceDue: 80000, customerName: 'Amina', customerPhone: '0700000002', receiptNumber: 'R3' };
    const { call, fake } = full(sale);
    await expect(call({ ...base, destinationCity: 'Dar es Salaam', saleId: 5 })).rejects.toThrow(COD_MESSAGES.pickupPlaceRequired);
    fake.locationIntelligence.resolve = jest.fn(async () => ({ ...place, regionName: 'Arusha' }));
    await expect(call({ ...base, destinationCity: 'Dar es Salaam', saleId: 5, pickupPlace })).rejects.toThrow(COD_MESSAGES.pickupPlaceOtherCity);
    expect(fake.orderRepo.save).not.toHaveBeenCalled();
  });

  // The engine path: the seller form booked a journey and created the Shipment; the seller
  // endpoint adds the sale and starts that same Shipment (one shipment engine for all orders).
  const engine = (sale: any, legs: any[], shipment: any = { id: 88, requestedByUserId: 7, status: 'pending', orderId: null, journeySelectionId: 12 }) => {
    const h = full(sale);
    const updates: any[] = [];
    h.fake.dataSource.query = jest.fn(async (sql: string, params: any[]) => {
      if (sql.includes('FROM public.shipment WHERE id')) return [shipment];
      if (sql.includes('FROM public.journey_leg')) return legs;
      if (sql.includes('UPDATE public.shipment')) { updates.push(params); return []; }
      return [{ waybillNumber: null, createdAt: null }];
    });
    h.fake.startEngineShipment = (SuperAgentsService.prototype as any).startEngineShipment.bind(h.fake);
    h.fake.shipmentActivation = { confirmAndActivate: jest.fn(async () => ({ parcel: { id: 50 }, nextAction: { kind: 'agent_pickup' } })) };
    (h.parcelRepo as any).findOne = jest.fn(async () => ({ id: 50, description: 'x', deliveryAddress: 'y' }));
    return { ...h, updates };
  };
  const codSale = { id: 6, sellerId: 7, status: 'completed', isCod: true, subtotal: 100000, total: 100000,
    amountPaid: 20000, balanceDue: 80000, customerName: 'Amina', customerPhone: '0700000002', receiptNumber: 'R6' };
  const directLegs = [{ type: 'pickup', path: 'direct_delivery' }];

  it('engine path: a COD on a direct agent journey starts the seller\'s Shipment with the Order on it', async () => {
    const { fake, sms, parcelRepo, updates, call } = engine(codSale, directLegs);
    const res: any = await call({ ...base, destinationCity: 'Dar es Salaam', saleId: 6, shipmentId: 88, confirm: {} });
    expect(updates[0]).toEqual([88, 900]); // the Order goes on the Shipment before it starts
    expect(fake.shipmentActivation.confirmAndActivate).toHaveBeenCalledWith(7, 88, {});
    expect(fake.createParcelForOrder).not.toHaveBeenCalled();
    expect(taskRows).toHaveLength(0); // the agent job comes from the activation, not a second boda task
    expect(parcelRepo.update).toHaveBeenCalledWith(50, expect.objectContaining({ declaredValue: 80000, saleId: 6 }));
    expect(parcelRepo.update).toHaveBeenCalledWith(50, { agreedDeliveryFee: 3000 });
    expect(sms.sendSms).toHaveBeenCalledTimes(1);
    expect(res.nextAction).toEqual({ kind: 'agent_pickup' });
  });

  it('engine path: pay-on-delivery is refused on an office or transporter journey, before anything is saved', async () => {
    const { fake, call } = engine(codSale, [{ type: 'pickup', path: 'office_dropoff' }, { type: 'transport', path: null }]);
    await expect(call({ ...base, destinationCity: 'Dar es Salaam', saleId: 6, shipmentId: 88 })).rejects.toThrow(/wakala wa karibu/);
    expect(fake.orderRepo.save).not.toHaveBeenCalled();
    expect(fake.shipmentActivation.confirmAndActivate).not.toHaveBeenCalled();
  });

  it('engine path: another seller\'s or an already used Shipment is refused', async () => {
    const other = engine(codSale, directLegs, { id: 88, requestedByUserId: 99, status: 'pending', orderId: null, journeySelectionId: 12 });
    await expect(other.call({ ...base, destinationCity: 'Dar es Salaam', saleId: 6, shipmentId: 88 })).rejects.toThrow('Shipment not found');
    const used = engine(codSale, directLegs, { id: 88, requestedByUserId: 7, status: 'pending', orderId: 5, journeySelectionId: 12 });
    await expect(used.call({ ...base, destinationCity: 'Dar es Salaam', saleId: 6, shipmentId: 88 })).rejects.toThrow(/umeshatumika/);
  });

  it('engine path: if starting fails the Order is cancelled and the Shipment freed', async () => {
    const { fake, updates, call } = engine(codSale, directLegs);
    fake.shipmentActivation.confirmAndActivate = jest.fn(async () => { throw new BadRequestException('no hub'); });
    await expect(call({ ...base, destinationCity: 'Dar es Salaam', saleId: 6, shipmentId: 88 })).rejects.toThrow('no hub');
    expect(updates).toEqual([[88, 900], [88, 900]]);
    expect(fake.orderRepo.update).toHaveBeenCalledWith(900, { status: 'cancelled' });
  });

  it('the boda fee: the seller\'s own figure, else the KenteXa Dar default; outside Dar it is required', async () => {
    const { fake } = make();
    expect(await fake.resolveCodBodaFee({ bodaFee: 2500, destinationCity: 'Dar es Salaam', originCity: 'Dar es Salaam', deliveryAddress: 'x' }, null)).toBe(2500);
    expect(await fake.resolveCodBodaFee({ destinationCity: 'Dar es Salaam', originCity: 'Dar es Salaam', deliveryAddress: 'Mbezi' }, { address: 'Kariakoo' })).toBe(3000);
    expect(fake.bodaFees.feeBetween).toHaveBeenCalledWith('Kariakoo', 'Mbezi');
    await expect(fake.resolveCodBodaFee({ destinationCity: 'Mwanza', originCity: 'Mwanza', deliveryAddress: 'x' }, null))
      .rejects.toThrow(COD_MESSAGES.bodaFeeRequired);
    await expect(fake.resolveCodBodaFee({ bodaFee: -1, destinationCity: 'Mwanza', originCity: 'Mwanza', deliveryAddress: 'x' }, null))
      .rejects.toThrow(BadRequestException);
  });
});
