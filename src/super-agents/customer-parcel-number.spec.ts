import {
  customerParcelNumber, customerTrackRef, readWaybillCustomerFrom, smsSafeName,
} from './customer-parcel-number';
import { SuperAgentsService } from './super-agents.service';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { ParcelStatus } from './entities/parcel.entity';

// SMS parts: GSM-7 = 160 chars (153 per part when longer). Any other
// character switches the WHOLE message to UCS-2 = 70 chars (67 per part).
const GSM = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const EXT = '^{}\\[~]|€';
function smsParts(msg: string): { gsm: boolean; parts: number } {
  let len = 0;
  for (const ch of msg) {
    if (GSM.includes(ch)) len += 1;
    else if (EXT.includes(ch)) len += 2;
    else { const n = [...msg].length; return { gsm: false, parts: n <= 70 ? 1 : Math.ceil(n / 67) }; }
  }
  return { gsm: true, parts: len <= 160 ? 1 : Math.ceil(len / 153) };
}

const FROM = '2026-10-13T08:00:00+03:00';
const after = new Date('2026-10-13T09:00:00+03:00');
const before = new Date('2026-10-12T09:41:00+03:00');

describe('WAYBILL_CUSTOMER_FROM', () => {
  it('empty or unreadable = off (KTX-ORD everywhere, as before)', () => {
    expect(readWaybillCustomerFrom({})).toBeNull();
    expect(readWaybillCustomerFrom({ WAYBILL_CUSTOMER_FROM: '  ' })).toBeNull();
    expect(readWaybillCustomerFrom({ WAYBILL_CUSTOMER_FROM: 'tomorrow' })).toBeNull();
  });
  it('reads a value without a time zone as Tanzania time, never UTC', () => {
    expect(readWaybillCustomerFrom({ WAYBILL_CUSTOMER_FROM: '2026-10-13 08:00' })!.toISOString()).toBe('2026-10-13T05:00:00.000Z');
    expect(readWaybillCustomerFrom({ WAYBILL_CUSTOMER_FROM: '2026-10-13' })!.toISOString()).toBe('2026-10-12T21:00:00.000Z');
    expect(readWaybillCustomerFrom({ WAYBILL_CUSTOMER_FROM: FROM })!.toISOString()).toBe('2026-10-13T05:00:00.000Z');
  });
});

describe('the one number the customer sees', () => {
  const from = readWaybillCustomerFrom({ WAYBILL_CUSTOMER_FROM: FROM });
  const newParcel = { trackingNumber: 'KTX-ORD-200', waybillNumber: 'KTX9815951521', createdAt: after };
  it('a parcel created after the switch shows its waybill (printed form) and links use the stored form', () => {
    expect(customerParcelNumber(newParcel, from)).toBe('KTX 9815 9515 21');
    expect(customerTrackRef(newParcel, from)).toBe('KTX9815951521');
  });
  it('a parcel created before the switch keeps KTX-ORD until delivery', () => {
    expect(customerParcelNumber({ ...newParcel, createdAt: before }, from)).toBe('KTX-ORD-200');
    expect(customerTrackRef({ ...newParcel, createdAt: before }, from)).toBe('KTX-ORD-200');
  });
  it('no waybill (parcels before Release B) or switch off -> KTX-ORD', () => {
    expect(customerParcelNumber({ ...newParcel, waybillNumber: null }, from)).toBe('KTX-ORD-200');
    expect(customerParcelNumber(newParcel, null)).toBe('KTX-ORD-200');
  });
});

describe('office names inside SMS', () => {
  it('replaces curly quotes and removes emoji; plain names unchanged', () => {
    expect(smsSafeName('Mama’s Parcels 🚚')).toBe("Mama's Parcels");
    expect(smsSafeName('“Juma” Logistics — Kariakoo')).toBe('"Juma" Logistics - Kariakoo');
    expect(smsSafeName('🇹🇿 Tanzania Express 👍🏽')).toBe('Tanzania Express');
    expect(smsSafeName('Kariakoo Parcel Office')).toBe('Kariakoo Parcel Office');
    expect(smsSafeName(null)).toBe('');
  });
  it('a cleaned name never switches an SMS to the expensive mode', () => {
    for (const name of ['Mama’s Parcels 🚚', '“Juma” — Kariakoo ✨', 'Café Délivery']) {
      expect(smsParts(`${smsSafeName(name)}\n\nHabari`).gsm).toBe(true);
    }
  });
});

describe('real counter SMS texts (waybill on, office name with ’ and emoji)', () => {
  const user: any = { id: 9 };
  const context: any = { userId: 9, roleType: AccountRoleType.SUPER_AGENT };
  const saved = process.env.WAYBILL_CUSTOMER_FROM;
  let sent: string[];
  let service: any;
  const makeParcel = (createdAt: Date) => ({
    id: 31, trackingNumber: 'KTX-ORD-1234', waybillNumber: 'KTX9815951521', createdAt,
    status: ParcelStatus.DISPATCHED, senderName: 'Juma Hamisi', senderPhone: '0712000111',
    recipientName: 'Amina Hassan', buyerPhone: '0787000222', actualShippingFee: 15000,
    originCity: 'Dar es Salaam', destinationCity: 'Mwanza', busCompany: 'Shabiby Line',
    busTicketNumber: '45821', superAgent: { id: 3, businessName: 'Mama’s Parcels 🚚' }, order: null,
  });

  beforeEach(() => {
    process.env.WAYBILL_CUSTOMER_FROM = FROM;
    sent = [];
    service = Object.create(SuperAgentsService.prototype);
    service.resolveActingSuperAgent = jest.fn(async () => ({ id: 3 }));
    service.smsService = { sendSms: jest.fn(async (_p: string, m: string) => { sent.push(m); return true; }) };
    service.auditLog = { record: jest.fn(async () => undefined) };
    service.invoicesService = { findByOrderId: jest.fn(async () => null) };
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.WAYBILL_CUSTOMER_FROM;
    else process.env.WAYBILL_CUSTOMER_FROM = saved;
  });

  it('sender SMS: the waybill, cheap mode, no extra part compared with KTX-ORD', async () => {
    service.parcelRepo = { findOne: jest.fn(async () => makeParcel(after)) };
    await service.resendSenderSms(user, 'KTX-ORD-1234', context);
    service.parcelRepo = { findOne: jest.fn(async () => makeParcel(before)) };
    await service.resendSenderSms(user, 'KTX-ORD-1234', context);
    const [withWaybill, withOrd] = sent;
    expect(withWaybill).toContain('kifurushi KTX 9815 9515 21.');
    expect(withWaybill).toContain("Mama's Parcels");
    expect(withOrd).toContain('kifurushi KTX-ORD-1234.');
    expect(smsParts(withWaybill)).toEqual({ gsm: true, parts: smsParts(withOrd).parts });
  });

  it('recipient SMS: the waybill, "-" instead of "→", cheap mode, no extra part', async () => {
    service.parcelRepo = { findOne: jest.fn(async () => makeParcel(after)) };
    await service.resendReceiverSms(user, 'KTX-ORD-1234', context);
    service.parcelRepo = { findOne: jest.fn(async () => makeParcel(before)) };
    await service.resendReceiverSms(user, 'KTX-ORD-1234', context);
    const [withWaybill, withOrd] = sent;
    expect(withWaybill).toContain('Kifurushi: KTX 9815 9515 21');
    expect(withWaybill).toContain('Njia: Dar es Salaam - Mwanza');
    expect(withWaybill).not.toContain('→');
    expect(smsParts(withWaybill)).toEqual({ gsm: true, parts: smsParts(withOrd).parts });
    expect(smsParts(withWaybill).parts).toBe(2);
  });
});
