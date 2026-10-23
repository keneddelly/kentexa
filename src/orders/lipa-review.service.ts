import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException,
  OnModuleInit, ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { SmsService } from '../sms/sms.service';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';
import { SellerScopeService } from '../business/seller-scope.service';
import { LIPA_PROOF_REF, signedLipaProofUrl } from './lipa-proof';
import {
  isRejectReason, LIPA_REASON_TEXT, LIPA_REVIEW_MESSAGES, LipaDecision, lipaConfirmedSms, lipaRejectedSms,
  lipaReviewActions,
} from './lipa-review';

const COLUMNS_SQL = `SELECT count(*)::int AS n FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'order'
    AND column_name IN ('lipaDecision','lipaDecidedAt','lipaDecidedByUserId','lipaRejectReason')`;

/**
 * Lipa Namba payment review (see lipa-review.ts). The decision columns arrive by
 * migration 1792600000000; they are not on the Order entity, so every read and write
 * here is plain SQL, and the endpoints answer "not switched on yet" until they exist.
 */
@Injectable()
export class LipaReviewService implements OnModuleInit {
  private readonly logger = new Logger(LipaReviewService.name);
  private ready = false;

  constructor(
    private readonly db: DataSource,
    private readonly sms: SmsService,
    private readonly activityEvents: ActivityEventService,
    private readonly sellerScope: SellerScopeService,
  ) {}

  async onModuleInit() {
    await this.refresh();
    this.logger.log(`Lipa payment review: ${this.ready ? 'on' : 'waiting for migration 1792600000000'}`);
  }

  @Cron('* * * * *')
  async refresh() {
    if (this.ready) return true;
    try { this.ready = (await this.db.query(COLUMNS_SQL))[0]?.n === 4; } catch { this.ready = false; }
    return this.ready;
  }

  private async assertReady() {
    if (!(await this.refresh())) throw new ServiceUnavailableException(LIPA_REVIEW_MESSAGES.notReady);
  }

  /** The order with what the review needs; `lock` for a decision. */
  private async load(em: { query: (sql: string, p?: any[]) => Promise<any> }, orderId: number, lock = false) {
    const rows: any[] = await em.query(`
      SELECT o.id, o."sellerId", o."buyerId", o.status::text AS status, o."paymentMethod"::text AS "paymentMethod",
             o."totalAmount", o."lipaProofUrl", o."lipaReference", o."lipaConfirmedAt", o.phone,
             o."lipaDecision", o."lipaDecidedAt", o."lipaRejectReason"
        FROM public."order" o WHERE o.id = $1 ${lock ? 'FOR UPDATE' : ''}`, [orderId]);
    const o = rows[0];
    if (!o) throw new NotFoundException('Order not found');
    if (o.paymentMethod !== 'lipa_namba') throw new BadRequestException(LIPA_REVIEW_MESSAGES.notLipa);
    return o;
  }

  private async isSellerSide(user: User, sellerId: number) {
    return !!user && (user.id === sellerId || (await this.sellerScope.isAuthorizedFor(user, sellerId, 'canViewOrders')));
  }

  private async context(orderId: number) {
    const rows: any[] = await this.db.query(`
      SELECT COALESCE(NULLIF(btrim(sp."businessName"), ''), NULLIF(btrim(s."storeName"), ''), s.name) AS "shopName",
             COALESCE(NULLIF(btrim(b.phone), ''), o.phone) AS "buyerPhone",
             (p."productType" = 'digital') AS digital
        FROM public."order" o
        LEFT JOIN public."user" s ON s.id = o."sellerId"
        LEFT JOIN public."user" b ON b.id = o."buyerId"
        LEFT JOIN public.product p ON p.id = o."productId"
        LEFT JOIN LATERAL (SELECT x."businessName" FROM public.seller_profile x
                            WHERE x."userId" = o."sellerId" ORDER BY x.id ASC LIMIT 1) sp ON true
       WHERE o.id = $1`, [orderId]);
    return rows[0] ?? {};
  }

  private view(o: any, viewer: 'seller' | 'buyer') {
    const decision = (o.lipaDecision ?? null) as LipaDecision;
    return {
      orderId: o.id,
      decision,
      decidedAt: o.lipaDecidedAt ?? null,
      rejectReason: o.lipaRejectReason ?? null,
      rejectReasonText: o.lipaRejectReason ? LIPA_REASON_TEXT[o.lipaRejectReason as keyof typeof LIPA_REASON_TEXT] ?? null : null,
      reference: o.lipaReference ?? null,
      sentAt: o.lipaConfirmedAt ?? null,
      // A fresh private link (10 minutes) on every request, only after the checks above.
      proofUrl: signedLipaProofUrl(o.lipaProofUrl),
      amount: Number(o.totalAmount || 0),
      ...lipaReviewActions({ decision, cancelled: o.status === 'cancelled', viewer }),
    };
  }

  /** Seller (or their order staff) or the buyer: the screenshot and the decision. */
  async get(user: User, orderId: number) {
    await this.assertReady();
    const o = await this.load(this.db, orderId);
    if (await this.isSellerSide(user, o.sellerId)) return this.view(o, 'seller');
    if (user?.id === o.buyerId) return this.view(o, 'buyer');
    throw new ForbiddenException(LIPA_REVIEW_MESSAGES.notBuyer);
  }

  async confirm(user: User, orderId: number) {
    await this.assertReady();
    const pre = await this.load(this.db, orderId);
    if (!(await this.isSellerSide(user, pre.sellerId))) throw new ForbiddenException(LIPA_REVIEW_MESSAGES.notYours);
    const ctx = await this.context(orderId);
    const result = await this.db.transaction(async (em) => {
      const o = await this.load(em, orderId, true);
      if (o.status === 'cancelled') throw new ConflictException(LIPA_REVIEW_MESSAGES.cancelled);
      if (o.lipaDecision === 'confirmed') return { order: o, replay: true };
      // Paid. A digital product is "paid" as an order too, which unlocks its download;
      // a physical order keeps its fulfilment status (it is already being prepared).
      await em.query(`UPDATE public."order" SET "paymentStatus" = 'paid',
          status = CASE WHEN $3 AND status::text IN ('preparing','pending_payment') THEN 'paid' ELSE status END,
          "lipaDecision" = 'confirmed', "lipaDecidedAt" = now(), "lipaDecidedByUserId" = $2, "lipaRejectReason" = NULL,
          "updatedAt" = now()
        WHERE id = $1`, [orderId, user.id, !!ctx.digital]);
      return { order: await this.load(em, orderId), replay: false };
    });
    if (!result.replay) {
      this.record('LIPA_PAYMENT_CONFIRMED', user, pre, {});
      if (ctx.buyerPhone) {
        await this.sms.sendSms(ctx.buyerPhone, lipaConfirmedSms({
          shopName: ctx.shopName, orderId, amount: Number(pre.totalAmount || 0), digital: !!ctx.digital,
        })).catch(() => false);
      }
    }
    return this.view(result.order, 'seller');
  }

  async reject(user: User, orderId: number, reason: unknown) {
    await this.assertReady();
    if (!isRejectReason(reason)) throw new BadRequestException(LIPA_REVIEW_MESSAGES.badReason);
    const pre = await this.load(this.db, orderId);
    if (!(await this.isSellerSide(user, pre.sellerId))) throw new ForbiddenException(LIPA_REVIEW_MESSAGES.notYours);
    const ctx = await this.context(orderId);
    const result = await this.db.transaction(async (em) => {
      const o = await this.load(em, orderId, true);
      if (o.status === 'cancelled') throw new ConflictException(LIPA_REVIEW_MESSAGES.cancelled);
      if (o.lipaDecision === 'confirmed') throw new ConflictException(LIPA_REVIEW_MESSAGES.alreadyConfirmed);
      if (o.lipaDecision === 'rejected' && o.lipaRejectReason === reason) return { order: o, replay: true };
      await em.query(`UPDATE public."order" SET "lipaDecision" = 'rejected', "lipaDecidedAt" = now(),
          "lipaDecidedByUserId" = $2, "lipaRejectReason" = $3, "updatedAt" = now() WHERE id = $1`, [orderId, user.id, reason]);
      return { order: await this.load(em, orderId), replay: false };
    });
    if (!result.replay) {
      this.record('LIPA_PAYMENT_REJECTED', user, pre, { reason });
      if (ctx.buyerPhone) {
        await this.sms.sendSms(ctx.buyerPhone, lipaRejectedSms({ shopName: ctx.shopName, orderId, reason })).catch(() => false);
      }
    }
    return this.view(result.order, 'seller');
  }

  /** The buyer sends a new screenshot after a rejection: back to "waiting for the seller". */
  async resend(user: User, orderId: number, dto: { proofId?: string; reference?: string }) {
    await this.assertReady();
    const proof = typeof dto?.proofId === 'string' ? dto.proofId.trim() : '';
    if (!LIPA_PROOF_REF.test(proof)) throw new BadRequestException('Picha ya malipo haikupokelewa. Ipakie tena.');
    const reference = typeof dto?.reference === 'string' && dto.reference.trim() ? dto.reference.trim().slice(0, 60) : null;
    const result = await this.db.transaction(async (em) => {
      const o = await this.load(em, orderId, true);
      if (user?.id !== o.buyerId) throw new ForbiddenException(LIPA_REVIEW_MESSAGES.notBuyer);
      if (o.status === 'cancelled') throw new ConflictException(LIPA_REVIEW_MESSAGES.cancelled);
      if (o.lipaDecision !== 'rejected') throw new ConflictException(LIPA_REVIEW_MESSAGES.notRejected);
      await em.query(`UPDATE public."order" SET "lipaProofUrl" = $2, "lipaReference" = $3, "lipaConfirmedAt" = now(),
          "lipaDecision" = NULL, "lipaDecidedAt" = NULL, "lipaDecidedByUserId" = NULL, "lipaRejectReason" = NULL,
          "updatedAt" = now() WHERE id = $1`, [orderId, proof, reference]);
      return this.load(em, orderId);
    });
    this.record('LIPA_PROOF_RESENT', user, result, {});
    return this.view(result, 'buyer');
  }

  private record(eventType: string, user: User, o: any, metadata: Record<string, unknown>) {
    void this.activityEvents.record({
      eventType, category: ActivityCategory.COMMERCE, actorId: user?.id ?? null,
      actorType: eventType === 'LIPA_PROOF_RESENT' ? 'buyer' : 'seller',
      relatedUserId: eventType === 'LIPA_PROOF_RESENT' ? o.sellerId : o.buyerId,
      targetType: 'order', targetId: o.id,
      metadata: { amount: Number(o.totalAmount || 0), ...metadata },
    } as any).catch(() => undefined); // the decision is saved either way
  }
}
