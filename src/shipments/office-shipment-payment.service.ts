import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import type { RoleContext } from '../role-context/role-context.types';
import { SmsService } from '../sms/sms.service';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';
import { formatWaybill } from './waybill';

/**
 * The office records the payment it took for a send-form shipment (owner
 * 2026-10-24: the money step was missing; walk-ins already record theirs at
 * the counter, marketplace orders have their own).
 *
 * KenteXa never holds the money: this is the office's own record of what the
 * sender paid it, in its own cash ledger (super_agent_cash_collection, the same
 * immutable table the cash desk uses), once per parcel. Cash always; mobile
 * money once migration 1792900000000 allows it in that table.
 *
 * Only the office that holds the parcel (parcel.superAgentId), as its own active
 * operator, and only after it has received the parcel.
 */

export const OFFICE_PAYMENT_MESSAGES = {
  notOffice: 'Ingia kama ofisi (Super Agent) ili uweke malipo.',
  notFound: 'Mzigo huu haupatikani.',
  notYours: 'Mzigo huu hauko kwenye ofisi yako.',
  notSendForm: 'Malipo ya mzigo huu yanawekwa sehemu nyingine (oda au mauzo ya kaunta).',
  notReceived: 'Pokea mzigo kwanza, kisha weka malipo.',
  badAmount: 'Weka kiasi kilicholipwa (zaidi ya 0).',
  badMethod: 'Chagua njia ya malipo: taslimu au mobile money.',
  already: 'Malipo ya mzigo huu yameshawekwa.',
} as const;

export const OFFICE_PAYMENT_METHODS = ['cash', 'mobile_money'] as const;
export type OfficePaymentMethod = (typeof OFFICE_PAYMENT_METHODS)[number];

const RECEIVED_OR_LATER = ['received_at_hub', 'verified', 'ready_for_dispatch', 'dispatched', 'in_transit', 'transferred_hub',
  'arrived_at_hub', 'awaiting_buyer', 'out_for_delivery', 'delivered', 'self_pickup'];
const MAX_AMOUNT = 10_000_000;
const keyFor = (parcelId: number) => `office-intake:${parcelId}`;

/** Validates what the office typed; throws a message key. Pure. */
export function readOfficePayment(dto: any, allowed: readonly string[]): { amount: number; method: OfficePaymentMethod; reference: string | null } {
  const amount = Math.round(Number(dto?.amount));
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) throw new Error('badAmount');
  const method = String(dto?.method || 'cash') as OfficePaymentMethod;
  if (!allowed.includes(method)) throw new Error('badMethod');
  const ref = typeof dto?.reference === 'string' ? dto.reference.trim().slice(0, 60) : '';
  return { amount, method, reference: ref || null };
}

/** The sender's one-part receipt SMS (GSM text). Pure. */
export function officePaymentSms(input: { officeName: string; amount: number; method: OfficePaymentMethod; number: string }): string {
  const name = String(input.officeName || 'Ofisi').replace(/[^A-Za-z0-9 .,'&()\-/]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28);
  const how = input.method === 'mobile_money' ? 'kwa mobile money' : 'taslimu';
  return `${name}: tumepokea TZS ${input.amount.toLocaleString('en-US')} ${how} kwa mzigo ${input.number}. Asante.`;
}

@Injectable()
export class OfficeShipmentPaymentService {
  private mobileMoneyReady = false;
  private checkedAt = 0;

  constructor(
    private readonly db: DataSource,
    @Optional() private readonly sms?: SmsService,
    @Optional() private readonly activityEvents?: ActivityEventService,
  ) {}

  /** Mobile money is accepted by the ledger once migration 1792900000000 widened its check. */
  async methods(): Promise<OfficePaymentMethod[]> {
    if (!this.mobileMoneyReady && Date.now() - this.checkedAt > 60_000) {
      this.checkedAt = Date.now();
      try {
        const [row] = await this.db.query(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE conname = 'CHK_super_agent_cash_collection_payment_method'`);
        this.mobileMoneyReady = String(row?.def || '').includes('mobile_money');
      } catch { this.mobileMoneyReady = false; }
    }
    return this.mobileMoneyReady ? ['cash', 'mobile_money'] : ['cash'];
  }

  private async office(userId: number, role: RoleContext) {
    if (!role || role.userId !== userId || role.roleType !== AccountRoleType.SUPER_AGENT) {
      throw new ForbiddenException(OFFICE_PAYMENT_MESSAGES.notOffice);
    }
    const [hub] = await this.db.query(
      'SELECT id, status, "userId", "workspaceId", "businessName" FROM public.super_agent WHERE id = $1', [role.profileId]);
    if (!hub || hub.userId !== userId || hub.status !== 'active' ||
        (hub.workspaceId != null && hub.workspaceId !== role.workspaceId)) {
      throw new ForbiddenException(OFFICE_PAYMENT_MESSAGES.notOffice);
    }
    return { id: Number(hub.id), name: String(hub.businessName || '') };
  }

  /** Send-form parcels this office has received and not yet recorded a payment for. */
  async pending(userId: number, role: RoleContext) {
    const hub = await this.office(userId, role);
    const rows: any[] = await this.db.query(
      `SELECT p.id AS "parcelId", p."waybillNumber", COALESCE(s."trackingNumber", p."trackingNumber") AS "trackingNumber",
              s."senderName", s."senderPhone", s."destinationCity", s."itemDescription", s."priceQuoted"
         FROM public.parcel p
         JOIN public.shipment s ON s.id = p."shipmentId"
        WHERE p."superAgentId" = $1 AND s."intakeChannel" = 'self_service'
          AND p.status::text = ANY($2::text[])
          AND p."createdAt" > now() - interval '60 days'
          AND NOT EXISTS (SELECT 1 FROM public.super_agent_cash_collection c WHERE c."parcelId" = p.id)
        ORDER BY p.id DESC LIMIT 50`, [hub.id, RECEIVED_OR_LATER]);
    return {
      methods: await this.methods(),
      parcels: rows.map((r) => ({
        parcelId: Number(r.parcelId),
        waybill: r.waybillNumber ? formatWaybill(r.waybillNumber) : null,
        trackingNumber: r.trackingNumber,
        sender: { name: r.senderName ?? null, phone: r.senderPhone ?? null },
        itemDescription: r.itemDescription ?? null,
        destinationCity: r.destinationCity ?? null,
        amountDue: r.priceQuoted == null ? null : Number(r.priceQuoted),
      })),
    };
  }

  async record(userId: number, role: RoleContext, dto: any) {
    const hub = await this.office(userId, role);
    let input;
    try { input = readOfficePayment(dto, await this.methods()); } catch (e: any) {
      throw new BadRequestException((OFFICE_PAYMENT_MESSAGES as any)[e?.message] || OFFICE_PAYMENT_MESSAGES.badAmount);
    }
    const parcelId = Number(dto?.parcelId);
    if (!Number.isInteger(parcelId) || parcelId <= 0) throw new NotFoundException(OFFICE_PAYMENT_MESSAGES.notFound);

    const result = await this.db.transaction(async (em) => {
      const [p] = await em.query(
        `SELECT p.id, p.status::text AS status, p."superAgentId", p."waybillNumber", p."trackingNumber",
                s."intakeChannel", s."priceQuoted", s."senderPhone", s."trackingNumber" AS "shipmentNumber"
           FROM public.parcel p LEFT JOIN public.shipment s ON s.id = p."shipmentId"
          WHERE p.id = $1 FOR UPDATE OF p`, [parcelId]);
      if (!p) throw new NotFoundException(OFFICE_PAYMENT_MESSAGES.notFound);
      if (Number(p.superAgentId) !== hub.id) throw new ForbiddenException(OFFICE_PAYMENT_MESSAGES.notYours);
      if (p.intakeChannel !== 'self_service') throw new BadRequestException(OFFICE_PAYMENT_MESSAGES.notSendForm);
      if (!RECEIVED_OR_LATER.includes(p.status)) throw new BadRequestException(OFFICE_PAYMENT_MESSAGES.notReceived);

      const [prior] = await em.query(
        `SELECT id, "collectedAmount", "paymentMethod", "idempotencyKey" FROM public.super_agent_cash_collection
          WHERE "parcelId" = $1 ORDER BY id ASC LIMIT 1`, [parcelId]);
      if (prior) {
        // The same entry sent twice (a double tap) is fine; anything else is a second payment.
        if (prior.idempotencyKey === keyFor(parcelId) && Number(prior.collectedAmount) === input.amount &&
            prior.paymentMethod === input.method) {
          return { p, id: Number(prior.id), replay: true };
        }
        throw new ConflictException(OFFICE_PAYMENT_MESSAGES.already);
      }
      const [row] = await em.query(
        `INSERT INTO public.super_agent_cash_collection
           ("parcelId", "superAgentId", "quoteId", "priceContextAmount", "priceContextCurrency", "collectedAmount", currency,
            "paymentMethod", "actorUserId", "receiptReference", "idempotencyKey", "reconciliationStatus")
         VALUES ($1, $2, NULL, $3, 'TZS', $4, 'TZS', $5, $6, $7, $8, 'pending') RETURNING id`,
        [parcelId, hub.id, p.priceQuoted == null ? input.amount : Number(p.priceQuoted), input.amount, input.method,
          userId, input.reference, keyFor(parcelId)]);
      return { p, id: Number(row.id), replay: false };
    });

    const number = result.p.waybillNumber ? formatWaybill(result.p.waybillNumber) : (result.p.shipmentNumber || result.p.trackingNumber);
    if (!result.replay) {
      void this.activityEvents?.record({
        eventType: 'SHIPMENT_PAYMENT_RECORDED', category: ActivityCategory.PAYMENT,
        actorId: userId, actorType: 'super_agent', targetType: 'parcel', targetId: parcelId,
        metadata: { superAgentId: hub.id, amount: input.amount, method: input.method,
          amountDue: result.p.priceQuoted == null ? null : Number(result.p.priceQuoted) },
      } as any).catch(() => undefined);
      if (this.sms && result.p.senderPhone) {
        await this.sms.sendSms(result.p.senderPhone,
          officePaymentSms({ officeName: hub.name, amount: input.amount, method: input.method, number })).catch(() => false);
      }
    }
    return { id: result.id, parcelId, amount: input.amount, method: input.method, number, replay: result.replay };
  }
}
