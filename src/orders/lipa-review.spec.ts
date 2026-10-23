import 'reflect-metadata';
import { BadRequestException, ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import {
  LIPA_REVIEW_MESSAGES, lipaConfirmedSms, lipaRejectedSms, lipaReviewActions,
} from './lipa-review';
import { LipaReviewService } from './lipa-review.service';

describe('Lipa payment review: texts and actions', () => {
  it('buyer SMS on confirm names the shop, the amount and the next step, one plain SMS', () => {
    const physical = lipaConfirmedSms({ shopName: 'BIS', orderId: 181, amount: 302000, digital: false });
    expect(physical).toBe('BIS: Tumepokea malipo yako TZS 302,000 ya oda #181. Oda inaandaliwa.');
    const digital = lipaConfirmedSms({ shopName: 'BIS 🔥', orderId: 181, amount: 5000, digital: true });
    expect(digital).toBe('BIS: Tumepokea malipo yako TZS 5,000 ya oda #181. Pakua bidhaa yako: KenteXa > Oda zangu.');
    expect(lipaConfirmedSms({ shopName: 'x'.repeat(200), orderId: 999999, amount: 99999999, digital: true }).length).toBeLessThanOrEqual(160);
  });

  it('buyer SMS on reject gives the reason and how to send a new screenshot', () => {
    expect(lipaRejectedSms({ shopName: 'BIS', orderId: 181, reason: 'amount_wrong' }))
      .toBe('BIS: Malipo ya oda #181 hayajathibitishwa (kiasi hakilingani na bei). Tuma picha mpya: KenteXa > Oda zangu.');
    expect(lipaRejectedSms({ shopName: 'x'.repeat(200), orderId: 999999, reason: 'not_received' }).length).toBeLessThanOrEqual(160);
  });

  it('who may do what', () => {
    expect(lipaReviewActions({ decision: null, cancelled: false, viewer: 'seller' })).toEqual({ canConfirm: true, canReject: true, canResend: false });
    // The seller found the money after rejecting: may still confirm.
    expect(lipaReviewActions({ decision: 'rejected', cancelled: false, viewer: 'seller' })).toEqual({ canConfirm: true, canReject: false, canResend: false });
    expect(lipaReviewActions({ decision: 'confirmed', cancelled: false, viewer: 'seller' })).toEqual({ canConfirm: false, canReject: false, canResend: false });
    expect(lipaReviewActions({ decision: 'rejected', cancelled: false, viewer: 'buyer' })).toEqual({ canConfirm: false, canReject: false, canResend: true });
    expect(lipaReviewActions({ decision: null, cancelled: false, viewer: 'buyer' })).toEqual({ canConfirm: false, canReject: false, canResend: false });
    expect(lipaReviewActions({ decision: null, cancelled: true, viewer: 'seller' })).toEqual({ canConfirm: false, canReject: false, canResend: false });
  });
});

describe('LipaReviewService', () => {
  const SELLER = { id: 2 } as any;
  const BUYER = { id: 5 } as any;
  const STRANGER = { id: 9 } as any;

  const make = (opts: { ready?: boolean; order?: Record<string, any>; digital?: boolean } = {}) => {
    const order: any = {
      id: 181, sellerId: 2, buyerId: 5, status: 'preparing', paymentMethod: 'lipa_namba', totalAmount: '302000',
      lipaProofUrl: 'kentexa/payment-proofs/abc.jpg', lipaReference: 'QJK7H2', lipaConfirmedAt: new Date(), phone: '255712000001',
      lipaDecision: null, lipaDecidedAt: null, lipaRejectReason: null, ...opts.order,
    };
    const updates: Array<{ sql: string; params: any[] }> = [];
    const query = jest.fn(async (sql: string, params: any[] = []) => {
      if (/information_schema\.columns/.test(sql)) return [{ n: opts.ready === false ? 0 : 4 }];
      if (/FROM public\."order" o WHERE o\.id/.test(sql)) return [{ ...order }];
      if (/AS "shopName"/.test(sql)) return [{ shopName: 'BIS', buyerPhone: '255712000001', digital: !!opts.digital }];
      if (/^\s*UPDATE public\."order"/.test(sql)) {
        updates.push({ sql, params });
        if (/"lipaDecision" = 'confirmed'/.test(sql)) Object.assign(order, { lipaDecision: 'confirmed', paymentStatus: 'paid', status: params[2] ? 'paid' : order.status });
        else if (/"lipaDecision" = 'rejected'/.test(sql)) Object.assign(order, { lipaDecision: 'rejected', lipaRejectReason: params[2] });
        else if (/"lipaDecision" = NULL/.test(sql)) Object.assign(order, { lipaDecision: null, lipaRejectReason: null, lipaProofUrl: params[1] });
        return [];
      }
      return [];
    });
    const db: any = { query, transaction: async (fn: any) => fn({ query }) };
    const sms = { sendSms: jest.fn(async () => true) };
    const activity = { record: jest.fn(async () => undefined) };
    const scope = { isAuthorizedFor: jest.fn(async () => false) };
    const svc = new LipaReviewService(db, sms as any, activity as any, scope as any);
    return { svc, sms, activity, updates, order };
  };

  it('says "not switched on" until the migration has run', async () => {
    const { svc } = make({ ready: false });
    await expect(svc.get(SELLER, 181)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('seller confirms: paid, the buyer gets one SMS, a repeated tap changes nothing', async () => {
    const { svc, sms, activity, updates } = make();
    const view = await svc.confirm(SELLER, 181);
    expect(view).toMatchObject({ decision: 'confirmed', canConfirm: false, canReject: false });
    expect(updates).toHaveLength(1);
    expect(updates[0].sql).toContain(`"paymentStatus" = 'paid'`);
    expect(updates[0].params).toEqual([181, 2, false]);                 // physical: status kept
    expect(sms.sendSms).toHaveBeenCalledWith('255712000001', 'BIS: Tumepokea malipo yako TZS 302,000 ya oda #181. Oda inaandaliwa.');
    expect(activity.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'LIPA_PAYMENT_CONFIRMED', targetId: 181 }));
    await svc.confirm(SELLER, 181);
    expect(updates).toHaveLength(1);
    expect(sms.sendSms).toHaveBeenCalledTimes(1);
  });

  it('a digital product: confirming makes the order paid, which unlocks the download', async () => {
    const { svc, updates, sms } = make({ digital: true });
    await svc.confirm(SELLER, 181);
    expect(updates[0].params).toEqual([181, 2, true]);
    expect((sms.sendSms.mock.calls[0] as any[])[1]).toContain('Pakua bidhaa yako');
  });

  it('only the seller (or their order staff) decides', async () => {
    const { svc } = make();
    await expect(svc.confirm(STRANGER, 181)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.confirm(BUYER, 181)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.reject(BUYER, 181, 'unclear')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.get(STRANGER, 181)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('reject needs one of the three reasons; the buyer is told; a confirmed payment cannot be rejected', async () => {
    const { svc, sms } = make();
    await expect(svc.reject(SELLER, 181, 'because')).rejects.toBeInstanceOf(BadRequestException);
    const view = await svc.reject(SELLER, 181, 'amount_wrong');
    expect(view).toMatchObject({ decision: 'rejected', rejectReason: 'amount_wrong', canConfirm: true });
    expect((sms.sendSms.mock.calls[0] as any[])[1]).toContain('kiasi hakilingani na bei');
    const done = make({ order: { lipaDecision: 'confirmed', lipaDecidedAt: new Date() } });
    await expect(done.svc.reject(SELLER, 181, 'unclear')).rejects.toBeInstanceOf(ConflictException);
  });

  it('the buyer sends a new screenshot only after a rejection; it goes back to waiting', async () => {
    const fresh = make();
    await expect(fresh.svc.resend(BUYER, 181, { proofId: 'kentexa/payment-proofs/new.jpg' })).rejects.toThrow(LIPA_REVIEW_MESSAGES.notRejected);
    const { svc } = make({ order: { lipaDecision: 'rejected', lipaDecidedAt: new Date(), lipaRejectReason: 'unclear' } });
    await expect(svc.resend(BUYER, 181, { proofId: 'https://evil.example/x.jpg' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.resend(STRANGER, 181, { proofId: 'kentexa/payment-proofs/new.jpg' })).rejects.toBeInstanceOf(ForbiddenException);
    const view = await svc.resend(BUYER, 181, { proofId: 'kentexa/payment-proofs/new.jpg', reference: 'R2' });
    expect(view).toMatchObject({ decision: null, canResend: false });
  });

  it('a cancelled order cannot be confirmed', async () => {
    const { svc } = make({ order: { status: 'cancelled' } });
    await expect(svc.confirm(SELLER, 181)).rejects.toBeInstanceOf(ConflictException);
  });

  it('not a Lipa Namba order: refused', async () => {
    const { svc } = make({ order: { paymentMethod: 'cod' } });
    await expect(svc.get(SELLER, 181)).rejects.toThrow(LIPA_REVIEW_MESSAGES.notLipa);
  });
});
