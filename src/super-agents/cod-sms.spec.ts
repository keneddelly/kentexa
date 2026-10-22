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

describe('COD text 1 (goods + boda = total, to pay on delivery)', () => {
  it('shows goods, boda fee, total, "Utalipa wakati wa kupokea" and how to pay; never "Umelipa"', () => {
    const text = codText1({ goods: 100000, bodaFee: 3000, lipaNamba: '5808450', reference: 'Oda: KTX-ORD-148' });
    expect(text).toBe('KenteXa: Bidhaa TZS 100,000 + boda TZS 3,000 = Jumla TZS 103,000. ' +
      'Utalipa wakati wa kupokea: taslimu au Lipa Namba 5808450. Oda: KTX-ORD-148.');
    expect(text).not.toMatch(/Umelipa/);
  });

  it('cash only when the seller has no Lipa Namba; a part-paid sale says "Salio la bidhaa"', () => {
    const text = codText1({ goods: 60000, partlyPaid: true, bodaFee: 0, lipaNamba: null });
    expect(text).toBe('KenteXa: Salio la bidhaa TZS 60,000 + boda TZS 0 = Jumla TZS 60,000. Utalipa wakati wa kupokea: taslimu.');
  });

  it('stays one plain SMS even with large amounts and a long reference', () => {
    const text = codText1({
      goods: 9999999, partlyPaid: true, bodaFee: 99999, lipaNamba: '123456789012', reference: 'Mzigo: 2610-12345678',
    });
    expect(text.length).toBeLessThanOrEqual(SMS_SINGLE_PART);
    expect(text).toMatch(GSM);
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
  const full = (sale: any, profile: any = { lipaNamba: '5808450', address: 'Kariakoo' }) => {
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
      dataSource: { query: jest.fn(async () => [{ waybillNumber: null, createdAt: null }]) },
      parcelRepo, smsService: sms,
      invoicesService: { recordManualPayment: jest.fn(async () => ({ receiptNumber: 'KNT-RCP-1' })) },
      auditLog: { record: jest.fn(async () => ({})) },
      inAppNotif: { shipmentCreatedById: jest.fn(async () => ({})) },
      businessCustomerService: { upsertFromOrder: jest.fn(async () => ({})) },
      bodaFees: { feeBetween: jest.fn(async () => 3000) },
    };
    fake.resolveCodBodaFee = (SuperAgentsService.prototype as any).resolveCodBodaFee.bind(fake);
    return { sms, parcelRepo, fake, call: (dto: any) => SuperAgentsService.prototype.createSellerShipment.call(fake, seller, dto) };
  };

  it('an intracity COD sends text 1 once, after the shipment is created, and keeps the boda fee on the Parcel', async () => {
    const sale = { id: 3, sellerId: 7, status: 'completed', isCod: true, subtotal: 100000, total: 100000,
      amountPaid: 20000, balanceDue: 80000, customerName: 'Amina', customerPhone: '0700000002', receiptNumber: 'R1' };
    const { sms, parcelRepo, fake, call } = full(sale);
    await call({ ...base, destinationCity: 'Dar es Salaam', saleId: 3 });
    expect(sms.sendSms).toHaveBeenCalledTimes(1);
    const [phone, text] = (sms.sendSms.mock.calls[0] as unknown) as [string, string];
    expect(phone).toBe('0700000002');
    expect(text).toMatch(/^KenteXa: Salio la bidhaa TZS 80,000 \+ boda TZS 3,000 = Jumla TZS 83,000\. Utalipa wakati wa kupokea: taslimu au Lipa Namba 5808450\./);
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
