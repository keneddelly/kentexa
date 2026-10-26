import { PARTNER_JOB_MESSAGE, partnerGateSql, sellerPartnerTableReady } from '../partner-invitations/seller-agent-partner-gate';
import {
  BadRequestException, ConflictException, ForbiddenException, Injectable,
  Logger, NotFoundException, Optional,
} from '@nestjs/common';
import { createHash, randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { DataSource } from 'typeorm';
import { InvoicesService } from '../invoices/invoices.service';
import { settleManualAgentCod } from '../super-agents/agent-cod-settlement';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import type { RoleContext } from '../role-context/role-context.types';
import { ShipmentHubSource } from './shipment-hub-source';
import { projectShipment, projectShipmentForParcel } from './shipment-projection';
import { SmsService } from '../sms/sms.service';
import { CommunicationEngineService } from '../communication/communication-engine.service';
import { customerParcelNumber, smsSafeName } from '../super-agents/customer-parcel-number';
import { AGENT_BASE_MESSAGES, distanceM, pickupPointForAgent, roughDistanceLabel, SHOW_PIN_WARD } from './pickup-pin';
import { formatWaybill } from './waybill';

export type PickupServicePath = 'direct_delivery' | 'hub_routed';
export interface RequestPickupDto {
  requestKey: string;
  servicePath: PickupServicePath;
  pickupContactName: string;
  pickupContactPhone: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const normalizeCity = (value: string | null) => value?.trim().toLocaleLowerCase('en') ?? '';

// Same shape as the existing hub-to-Agent challenge: six digits, salted scrypt
// bound to the parcel and the exact actor, ten-minute life, five attempts,
// one issue per minute.
const CODE_TTL_MS = 10 * 60_000;
const CODE_COOLDOWN_MS = 60_000;
const CODE_MAX_ATTEMPTS = 5;
const SIX_DIGITS = /^\d{6}$/;
const collectedKey = (taskId: number) => `pickup-task-collected:${taskId}`;
const hubReceivedKey = (taskId: number) => `pickup-task-hub-received:${taskId}`;
const deliveredKey = (taskId: number) => `pickup-task-delivered:${taskId}`;

/** The sender's SMS when an agent accepts: plain characters only (1 SMS part). */
export function pickupAcceptedSms(agentName: string | null, agentPhone: string, reference: string) {
  const name = smsSafeName(agentName).slice(0, 30) || 'Wakala';
  return `KenteXa: Wakala ${name}, simu ${agentPhone}, anakuja kuchukua mzigo${reference ? ` ${reference}` : ''}.`;
}

// COD seller shipment (owner 2026-10-22): the recipient's delivery code is issued when
// the boda rider accepts the pickup and lasts until delivery. Still one-use, bound to
// the rider and the recipient's phone, and cleared if the rider changes. It is kept on the
// task's own recipient-code columns (migration 1792300000000 allows them while 'claimed').
const COD_CODE_TTL_MS = 30 * 24 * 60 * 60_000;
export const COD_CODE_ALREADY_SENT = 'Namba ya kupokea ilishatumwa kwa mnunuzi boda alipokubali kazi.';
/** Clears a task's recipient code (its CHECK allows one only on a claimed/collected direct task). */
export const CLEAR_TASK_DELIVERY_CODE = `"deliveryCodeHash"=NULL,"deliveryCodeIssuedAt"=NULL,"deliveryCodeExpiresAt"=NULL,"deliveryAttempts"=0`;
/** A code sent on the rider's accept (lasts until delivery), not a short door code. */
const isAcceptCode = (t: any) => !!(t.deliveryCodeIssuedAt && t.deliveryCodeExpiresAt &&
  new Date(t.deliveryCodeExpiresAt).getTime() - new Date(t.deliveryCodeIssuedAt).getTime() > CODE_TTL_MS);

/** The material a recipient delivery code is hashed with; a COD code also binds the recipient's phone. */
const deliveryCodeMaterial = (code: string, parcelId: number, agentUserId: number, taskId: number, codPhone: string | null) =>
  `${code}:${parcelId}:${agentUserId}:${taskId}:deliver${codPhone ? `:${codPhone}` : ''}`;

/** Text 2 (COD): the buyer's one text when the boda rider accepts, one SMS part. */
export function codRiderSms(riderName: string | null, riderPhone: string, code: string, reference: string) {
  const name = smsSafeName(riderName).slice(0, 24) || 'Boda';
  const ref = reference ? ` ${reference}` : '';
  return `KenteXa: Boda ${name}, simu ${riderPhone}, ataleta mzigo wako${ref}. Namba ya kupokea: ${code}. Mpe boda ukipokea mzigo tu.`;
}

/**
 * A direct (no-hub) boda pickup task for a COD seller shipment, written inside the
 * seller's own create transaction. The public request endpoint stays for independent
 * Parcels only; this one path takes an Order's Parcel, with a server-resolved origin.
 */
export async function insertSellerCodPickupTask(em: any, input: {
  parcelId: number; sellerUserId: number; contactName: string; contactPhone: string;
  originSnapshot: Record<string, unknown>;
}) {
  const key = randomUUID();
  const hash = createHash('sha256').update(JSON.stringify([
    'seller_cod', input.parcelId, input.sellerUserId, input.contactName, input.contactPhone,
  ])).digest('hex');
  const rows: any[] = await em.query(`INSERT INTO public.parcel_pickup_task
    ("parcelId","requestKey","requestPayloadHash","requestedByUserId","servicePath",
     "originSnapshot","pickupContactName","pickupContactPhone","originHubId")
    VALUES ($1,$2,$3,$4,'direct_delivery',$5::jsonb,$6,$7,NULL) RETURNING id,status`,
  [input.parcelId, key, hash, input.sellerUserId, JSON.stringify(input.originSnapshot),
    input.contactName.slice(0, 160), input.contactPhone.slice(0, 32)]);
  return { id: Number(rows[0].id), status: rows[0].status };
}

/** The agent's SMS when the sender cancels a pickup the agent had accepted (review D3). */
export function pickupCancelledSms(reference: string) {
  return `KenteXa: Kazi ya kuchukua mzigo${reference ? ` ${reference}` : ''} imesitishwa na mtumaji. Usiende kuchukua.`;
}

/**
 * Request and claim (Stage 3S) plus the physical first mile (Stage 3S-A):
 * sender -> Agent (origin_agent_collected) and Agent -> exact origin hub
 * (origin_hub_received). A claim, a "handed over" tap, a location or a photo
 * never proves custody; only a locked, idempotent custody event does, written
 * in the same transaction as the task, Parcel and tracking changes.
 */
@Injectable()
export class PickupTasksService {
  private readonly logger = new Logger(PickupTasksService.name);
  constructor(
    private readonly db: DataSource,
    // Gate 4: the recipient's delivery code is sent by SMS. Optional only so
    // the existing hand-built instances in specs keep constructing.
    @Optional() private readonly sms?: SmsService,
    // Review D3: in-app message to the agent when an accepted job is cancelled.
    @Optional() private readonly communication?: CommunicationEngineService,
    // COD seller shipments: the collected balance is receipted like the hub path.
    @Optional() private readonly invoices?: InvoicesService,
  ) {}

  /** The Order behind a pickup's Parcel when it is a COD seller shipment still to collect; else null. */
  private async codOrderFor(em: any, orderId: number | null, lock = false) {
    if (!orderId) return null;
    const rows: any[] = await em.query(`SELECT id, source, "paymentMethod", "codRemainingBalance", "totalAmount",
      "codBalanceCollected" FROM public."order" WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`, [orderId]);
    const o = rows[0];
    return o && o.paymentMethod === 'cod' && o.source === 'seller_shipment' ? o : null;
  }

  async requestForShipment(userId: number, shipmentId: number, input: RequestPickupDto) {
    if (!input || !UUID.test(input.requestKey ?? '')) throw new BadRequestException('requestKey must be a UUID');
    if (input.servicePath !== 'direct_delivery' && input.servicePath !== 'hub_routed') {
      throw new BadRequestException('Invalid pickup service path');
    }
    const name = typeof input.pickupContactName === 'string' ? input.pickupContactName.trim() : '';
    const phone = typeof input.pickupContactPhone === 'string' ? input.pickupContactPhone.trim() : '';
    if (!name || name.length > 160 || !phone || phone.length > 32) {
      throw new BadRequestException('Pickup contact name and phone are required');
    }
    const key = input.requestKey.toLowerCase();
    const hash = createHash('sha256').update(JSON.stringify([
      shipmentId, userId, input.servicePath, name, phone,
    ])).digest('hex');

    return this.db.transaction(async (em) => {
      const shipments: any[] = await em.query(
        'SELECT * FROM public.shipment WHERE id=$1 FOR UPDATE', [shipmentId],
      );
      const s = shipments[0];
      if (!s) throw new NotFoundException('Shipment not found');
      if (s.requestedByUserId !== userId) throw new ForbiddenException('Not your shipment');
      const parcels: any[] = await em.query(
        'SELECT id,status,"orderId","shipmentId" FROM public.parcel WHERE "shipmentId"=$1 FOR UPDATE',
        [shipmentId],
      );
      if (parcels.length !== 1 || parcels[0].orderId !== null) {
        throw new ConflictException('Shipment needs one independent Parcel');
      }
      const parcelId = parcels[0].id;
      const existing: any[] = await em.query(
        'SELECT id,"requestPayloadHash",status,"parcelId" FROM public.parcel_pickup_task WHERE "requestKey"=$1',
        [key],
      );
      if (existing.length) {
        if (existing[0].parcelId !== parcelId || existing[0].requestPayloadHash !== hash) {
          throw new ConflictException('Pickup request key already belongs to different details');
        }
        return { id: existing[0].id, parcelId, status: existing[0].status, replay: true };
      }
      if (s.status !== 'confirmed' || parcels[0].status !== 'pending') {
        throw new ConflictException('Shipment is not ready for a new pickup task');
      }
      const legacyCollection: any[] = await em.query(`SELECT id FROM public.parcel_collection
        WHERE "parcelId"=$1 AND status IN ('requested','claimed','collected') LIMIT 1`, [parcelId]);
      if (legacyCollection.length) throw new ConflictException('Parcel already has a collection job');

      // A Shipment's location snapshot has server-authored provenance. Free
      // text is historical display data, not verified Agent coverage.
      if (!s.originProviderKey || s.originProviderKey === 'user' ||
          !s.originResolutionMethod || s.originResolutionMethod === 'user_typed') {
        throw new BadRequestException('Select a resolved origin place for Agent pickup');
      }
      let hubId: number | null = null;
      if (input.servicePath === 'direct_delivery') {
        if (s.originHubSource !== ShipmentHubSource.NOT_REQUIRED || s.destinationHubSource !== ShipmentHubSource.NOT_REQUIRED ||
            !normalizeCity(s.originCity) || normalizeCity(s.originCity) !== normalizeCity(s.destinationCity)) {
          throw new BadRequestException('Direct Agent delivery requires a no-hub intracity Shipment');
        }
      } else {
        hubId = s.originHubId;
        if (!hubId || ![ShipmentHubSource.SENDER_SELECTED, ShipmentHubSource.AUTO_SINGLE_CANDIDATE].includes(s.originHubSource)) {
          throw new BadRequestException('Select an origin hub before requesting hub-routed pickup');
        }
        const hubs: any[] = await em.query('SELECT id FROM public.super_agent WHERE id=$1 AND status=$2 AND "isTrainingOffice" = false', [hubId, 'active']);
        if (hubs.length !== 1) throw new ConflictException('Selected origin hub is unavailable');
      }
      const active: any[] = await em.query(`SELECT id FROM public.parcel_pickup_task
        WHERE "parcelId"=$1 AND status IN ('requested','claimed','collected','awaiting_hub')`, [parcelId]);
      if (active.length) throw new ConflictException('Parcel already has an active pickup task');
      const snapshot = {
        city: s.originCity, label: s.originLocationLabel,
        latitude: s.originLatitude, longitude: s.originLongitude,
        region: s.originRegionName, district: s.originDistrictName,
        providerKey: s.originProviderKey, resolutionMethod: s.originResolutionMethod,
      };
      const rows: any[] = await em.query(`INSERT INTO public.parcel_pickup_task
        ("parcelId","requestKey","requestPayloadHash","requestedByUserId","servicePath",
         "originSnapshot","pickupContactName","pickupContactPhone","originHubId")
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) RETURNING id,status`,
        [parcelId, key, hash, userId, input.servicePath, JSON.stringify(snapshot), name, phone, hubId]);
      return { id: rows[0].id, parcelId, status: rows[0].status, replay: false };
    });
  }

  async claim(taskId: number, userId: number, role: RoleContext) {
    if (!role || role.userId !== userId || role.roleType !== AccountRoleType.AGENT) {
      throw new ForbiddenException('Active Agent context required');
    }
    const preliminary: any[] = await this.db.query(`SELECT t."parcelId",p."shipmentId"
      FROM public.parcel_pickup_task t JOIN public.parcel p ON p.id=t."parcelId"
      WHERE t.id=$1`, [taskId]);
    if (preliminary.length !== 1 || !preliminary[0].shipmentId) throw new NotFoundException('Pickup task not found');
    const result = await this.db.transaction(async (em) => {
      const s: any[] = await em.query('SELECT id,status,"originCity" FROM public.shipment WHERE id=$1 FOR UPDATE',
        [preliminary[0].shipmentId]);
      const p: any[] = await em.query('SELECT id,status,"shipmentId" FROM public.parcel WHERE id=$1 FOR UPDATE',
        [preliminary[0].parcelId]);
      const t: any[] = await em.query('SELECT * FROM public.parcel_pickup_task WHERE id=$1 FOR UPDATE', [taskId]);
      if (s.length !== 1 || p.length !== 1 || t.length !== 1 ||
          p[0].shipmentId !== s[0].id || t[0].parcelId !== p[0].id ||
          s[0].status !== 'confirmed' || p[0].status !== 'pending') {
        throw new ConflictException('Pickup task is no longer available');
      }
      const agent: any[] = await em.query(`SELECT id,city,status,"userId","baseLatitude","baseLongitude" FROM public.agent
        WHERE id=$1 FOR UPDATE`, [role.profileId]);
      if (agent.length !== 1 || agent[0].userId !== userId || agent[0].status !== 'approved') {
        throw new ForbiddenException('Approved active Agent profile required');
      }
      // Section 18 (b): a base point is required to accept a pickup.
      if (agent[0].baseLatitude == null || agent[0].baseLongitude == null) {
        throw new BadRequestException(AGENT_BASE_MESSAGES.required);
      }
      if (!normalizeCity(agent[0].city) || normalizeCity(agent[0].city) !== normalizeCity(s[0].originCity)) {
        throw new ForbiddenException('Agent does not cover this pickup city');
      }
      if (t[0].status === 'claimed' && t[0].agentProfileId === role.profileId) {
        return { id: taskId, parcelId: p[0].id, status: 'claimed', replay: true };
      }
      if (t[0].status !== 'requested' || t[0].agentProfileId !== null) {
        throw new ConflictException('Pickup task was claimed or closed');
      }
      // Seller partner agents first, for a few minutes (seller-agent-partner-gate.ts).
      if (sellerPartnerTableReady() && partnerGateSql('$2::int') !== 'TRUE') {
        const gate: any[] = await em.query(`SELECT ${partnerGateSql('$2::int')} AS ok
          FROM public.parcel_pickup_task t JOIN public.parcel p ON p.id = t."parcelId"
          JOIN public.shipment s ON s.id = p."shipmentId" WHERE t.id = $1`, [taskId, userId]);
        if (!gate[0]?.ok) throw new ConflictException(PARTNER_JOB_MESSAGE);
      }
      await em.query(`UPDATE public.parcel_pickup_task SET status='claimed',
        "agentProfileId"=$1,"claimedAt"=now(),"updatedAt"=now() WHERE id=$2`, [role.profileId, taskId]);
      return { id: taskId, parcelId: p[0].id, status: 'claimed', replay: false };
    });
    // Only a fresh accept tells the sender (a repeated tap is a replay).
    if (!result.replay) await this.tellSenderAgentIsComing(taskId);
    // COD seller shipment: the buyer's text 2 (rider and delivery code), once, on a fresh accept.
    if (!result.replay) await this.sendCodCodeOnAccept(taskId, userId);
    return result;
  }

  /**
   * Text 2 for a COD seller shipment: when the boda rider accepts, the recipient gets the
   * rider's name and phone and the delivery code, valid until delivery. Sent once, after
   * the accept is saved; a failed SMS never undoes the accept and leaves no code behind
   * (the rider can then send a short-lived one at the door).
   */
  private async sendCodCodeOnAccept(taskId: number, agentUserId: number) {
    if (!this.sms) return;
    const code = String(randomInt(100000, 1000000));
    const salt = randomBytes(16).toString('hex');
    let issued: { hash: string; phone: string; text: string } | null = null;
    try {
      issued = await this.db.transaction(async (em) => {
        const { s, p, t } = await this.lockChain(em, taskId);
        if (t.status !== 'claimed' || t.servicePath !== 'direct_delivery' || t.deliveryCodeHash) return null;
        const order = await this.codOrderFor(em, p.orderId);
        if (!order || order.codBalanceCollected) return null;
        const phone = typeof s.receiverPhone === 'string' ? s.receiverPhone.trim() : '';
        if (!phone) return null;
        const [agent] = await em.query(`SELECT a."fullName", COALESCE(NULLIF(btrim(a.phone), ''), u.phone) AS phone
          FROM public.agent a LEFT JOIN public."user" u ON u.id = a."userId" WHERE a.id = $1`, [t.agentProfileId]);
        if (!agent?.phone) return null;
        const hash = `${salt}:${scryptSync(deliveryCodeMaterial(code, p.id, agentUserId, t.id, phone), salt, 32).toString('hex')}`;
        const now = new Date();
        // On the task: the hash binds the rider and the recipient's phone; a release or cancel clears it.
        await em.query(`UPDATE public.parcel_pickup_task SET "deliveryCodeHash"=$1,"deliveryCodeIssuedAt"=$2,
          "deliveryCodeExpiresAt"=$3,"deliveryAttempts"=0,"updatedAt"=now() WHERE id=$4`,
        [hash, now, new Date(now.getTime() + COD_CODE_TTL_MS), t.id]);
        const reference = customerParcelNumber({
          trackingNumber: s.trackingNumber ?? p.trackingNumber, waybillNumber: p.waybillNumber, createdAt: p.createdAt,
        }) || '';
        return { hash, phone, text: codRiderSms(agent.fullName, agent.phone, code, reference) };
      });
      if (!issued) return;
      const sent = await this.sms.sendSms(issued.phone, issued.text, true).catch(() => false);
      if (!sent) throw new Error('SMS not sent');
    } catch (err: any) {
      if (issued) {
        await this.db.query(`UPDATE public.parcel_pickup_task SET ${CLEAR_TASK_DELIVERY_CODE},"updatedAt"=now()
          WHERE id=$1 AND "deliveryCodeHash"=$2`, [taskId, issued.hash]).catch(() => undefined);
      }
      this.logger.warn(`COD rider text not sent for task ${taskId}: ${err?.message || err}`);
    }
  }

  /**
   * One SMS to the sender when an agent accepts: who is coming and their
   * phone. Sent after the accept is saved; a failed SMS never undoes it.
   */
  private async tellSenderAgentIsComing(taskId: number) {
    if (!this.sms) return;
    try {
      const rows: any[] = await this.db.query(`
        SELECT t."pickupContactPhone" AS "senderPhone", a."fullName" AS "agentName",
               COALESCE(NULLIF(btrim(a.phone), ''), u.phone) AS "agentPhone",
               s."trackingNumber" AS "shipmentNumber", p."trackingNumber", p."waybillNumber", p."createdAt"
          FROM public.parcel_pickup_task t
          JOIN public.parcel p ON p.id = t."parcelId"
          JOIN public.shipment s ON s.id = p."shipmentId"
          JOIN public.agent a ON a.id = t."agentProfileId"
          LEFT JOIN public."user" u ON u.id = a."userId"
         WHERE t.id = $1`, [taskId]);
      const r = rows[0];
      if (!r?.senderPhone || !r.agentPhone) return;
      const reference = customerParcelNumber({
        trackingNumber: r.shipmentNumber ?? r.trackingNumber, waybillNumber: r.waybillNumber, createdAt: r.createdAt,
      });
      await this.sms.sendSms(r.senderPhone, pickupAcceptedSms(r.agentName, r.agentPhone, reference));
    } catch (err: any) {
      this.logger.warn(`Pickup accepted SMS not sent for task ${taskId}: ${err?.message || err}`);
    }
  }

  // ══ Stage 3S-A: the physical first mile ═══════════════════════════════════

  private assertAgentRole(role: RoleContext, userId: number) {
    if (!role || role.userId !== userId || role.roleType !== AccountRoleType.AGENT) {
      throw new ForbiddenException('Active Agent context required');
    }
  }

  /** Lock order is always shipment -> parcel -> task, exactly like claim(). */
  private async lockChain(em: any, taskId: number) {
    const pre: any[] = await em.query(`SELECT t."parcelId",p."shipmentId"
      FROM public.parcel_pickup_task t JOIN public.parcel p ON p.id=t."parcelId" WHERE t.id=$1`, [taskId]);
    if (pre.length !== 1 || !pre[0].shipmentId) throw new NotFoundException('Pickup task not found');
    const s: any[] = await em.query('SELECT * FROM public.shipment WHERE id=$1 FOR UPDATE', [pre[0].shipmentId]);
    const p: any[] = await em.query('SELECT * FROM public.parcel WHERE id=$1 FOR UPDATE', [pre[0].parcelId]);
    const t: any[] = await em.query('SELECT * FROM public.parcel_pickup_task WHERE id=$1 FOR UPDATE', [taskId]);
    if (s.length !== 1 || p.length !== 1 || t.length !== 1 || p[0].shipmentId !== s[0].id || t[0].parcelId !== p[0].id) {
      throw new ConflictException('Pickup task is no longer consistent');
    }
    return { s: s[0], p: p[0], t: t[0] };
  }

  private async approvedAgent(em: any, role: RoleContext, userId: number, lock = true) {
    const rows: any[] = await em.query(`SELECT id,city,status,"userId","fullName","baseLatitude","baseLongitude" FROM public.agent
      WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`, [role.profileId]);
    if (rows.length !== 1 || rows[0].userId !== userId || rows[0].status !== 'approved') {
      throw new ForbiddenException('Approved active Agent profile required');
    }
    return rows[0];
  }

  private async lastCustody(em: any, parcelId: number) {
    const rows: any[] = await em.query(`SELECT * FROM public.parcel_custody_event WHERE "parcelId"=$1
      ORDER BY "recordedAt" DESC, id DESC LIMIT 1`, [parcelId]);
    return rows[0] ?? null;
  }

  private async custodyByKey(em: any, parcelId: number, key: string) {
    const rows: any[] = await em.query(
      'SELECT * FROM public.parcel_custody_event WHERE "parcelId"=$1 AND "operationKey"=$2', [parcelId, key]);
    return rows[0] ?? null;
  }

  private async recordCustody(em: any, e: {
    parcelId: number; eventKind: string; operationKey: string;
    fromType: string | null; fromId: number | null; toType: string; toId: number | null;
    role: RoleContext; hubId: number | null; evidenceRef: string;
  }) {
    await em.query(`INSERT INTO public.parcel_custody_event
      ("parcelId","eventKind","operationKey","fromCustodianType","fromCustodianId","toCustodianType","toCustodianId",
       "actorSource","actorUserId","actorAccountRoleId","actorRoleType","actorWorkspaceId","actorProviderId",
       "hubId","assignmentId","evidenceRef")
      VALUES ($1,$2,$3,$4,$5,$6,$7,'account_role',$8,$9,$10,$11,NULL,$12,NULL,$13)`,
    [e.parcelId, e.eventKind, e.operationKey, e.fromType, e.fromId, e.toType, e.toId,
      e.role.userId, e.role.accountRoleId, e.role.roleType, e.role.workspaceId ?? null, e.hubId, e.evidenceRef]);
  }

  private async recordTracking(em: any, parcelId: number, status: string, city: string | null, note: string,
    by: string | null, phone: string | null, location: string | null, type: 'local_agent' | 'super_agent') {
    await em.query(`INSERT INTO public.parcel_tracking
      ("parcelId",status,city,note,"updatedBy","handlerPhone","handlerLocation","handlerType")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [parcelId, status, city, note, by, phone, location, type]);
  }

  /**
   * The requester obtains a short-lived code for the claimed Agent and passes
   * it to them in person: sender handoff evidence that only the requester side
   * can produce. Issuing proves nothing by itself.
   */
  async issueHandoffCode(userId: number, shipmentId: number) {
    const code = String(randomInt(100000, 1000000));
    const salt = randomBytes(16).toString('hex');
    const now = new Date();
    return this.db.transaction(async (em) => {
      const s: any[] = await em.query('SELECT * FROM public.shipment WHERE id=$1 FOR UPDATE', [shipmentId]);
      if (!s[0]) throw new NotFoundException('Shipment not found');
      if (s[0].requestedByUserId !== userId) throw new ForbiddenException('Not your shipment');
      const p: any[] = await em.query('SELECT id,status FROM public.parcel WHERE "shipmentId"=$1 FOR UPDATE', [shipmentId]);
      if (p.length !== 1) throw new ConflictException('Shipment needs one independent Parcel');
      const t: any[] = await em.query(`SELECT * FROM public.parcel_pickup_task WHERE "parcelId"=$1
        AND status IN ('requested','claimed','collected','awaiting_hub') FOR UPDATE`, [p[0].id]);
      if (t.length !== 1 || t[0].status !== 'claimed' || t[0].agentProfileId == null || p[0].status !== 'pending') {
        throw new ConflictException('A claimed Agent pickup is required before a handoff code can be issued');
      }
      if (t[0].handoffCodeIssuedAt && now.getTime() - new Date(t[0].handoffCodeIssuedAt).getTime() < CODE_COOLDOWN_MS) {
        throw new ConflictException('Wait before issuing another handoff code');
      }
      const agent: any[] = await em.query('SELECT "userId",status FROM public.agent WHERE id=$1', [t[0].agentProfileId]);
      if (agent.length !== 1 || agent[0].status !== 'approved') throw new ConflictException('Assigned Agent is unavailable');
      const hash = `${salt}:${scryptSync(`${code}:${p[0].id}:${agent[0].userId}:${t[0].id}`, salt, 32).toString('hex')}`;
      await em.query(`UPDATE public.parcel_pickup_task SET "handoffCodeHash"=$1,"handoffCodeIssuedAt"=$2,
        "handoffCodeExpiresAt"=$3,"handoffAttempts"=0,"updatedAt"=now() WHERE id=$4`,
      [hash, now, new Date(now.getTime() + CODE_TTL_MS), t[0].id]);
      return { taskId: t[0].id, code, expiresInSeconds: CODE_TTL_MS / 1000 };
    });
  }

  /** Sender -> Agent. The assigned Agent enters the sender's code; one idempotent custody event. */
  async collect(taskId: number, userId: number, role: RoleContext, code: string) {
    this.assertAgentRole(role, userId);
    const outcome = await this.db.transaction(async (em) => {
      const { s, p, t } = await this.lockChain(em, taskId);
      // A committed collection followed by a lost response replays without a second event.
      if (['collected', 'awaiting_hub', 'hub_received'].includes(t.status)) {
        const done = await this.custodyByKey(em, p.id, collectedKey(taskId));
        if (t.agentProfileId === role.profileId && done) {
          return { id: taskId, parcelId: p.id, status: t.status, replay: true };
        }
        throw new ForbiddenException('This pickup was collected by another Agent');
      }
      if (t.status !== 'claimed' || t.agentProfileId !== role.profileId) {
        throw new ForbiddenException('This pickup is not assigned to you');
      }
      const agent = await this.approvedAgent(em, role, userId);
      if (!normalizeCity(agent.city) || normalizeCity(agent.city) !== normalizeCity(s.originCity)) {
        throw new ForbiddenException('Agent does not cover this pickup city');
      }
      // An Order's Parcel is collected here only as a COD seller shipment (its boda job).
      if (s.status !== 'confirmed' || p.status !== 'pending' ||
          (p.orderId !== null && !(await this.codOrderFor(em, p.orderId)))) {
        throw new ConflictException('Parcel is not awaiting sender handoff');
      }
      const legacy: any[] = await em.query(`SELECT id FROM public.parcel_collection
        WHERE "parcelId"=$1 AND status IN ('requested','claimed','collected') LIMIT 1`, [p.id]);
      if (legacy.length) throw new ConflictException('Parcel already has a collection job');
      if (await this.lastCustody(em, p.id)) throw new ConflictException('Parcel already has custody evidence');
      if (!SIX_DIGITS.test(code ?? '')) throw new BadRequestException('Enter the six-digit sender handoff code');
      if (!t.handoffCodeHash || !t.handoffCodeExpiresAt || new Date(t.handoffCodeExpiresAt).getTime() <= Date.now() ||
          t.handoffAttempts >= CODE_MAX_ATTEMPTS) {
        throw new ConflictException('Sender handoff code is expired or unavailable');
      }
      const [salt, expected] = String(t.handoffCodeHash).split(':');
      const valid = !!salt && expected?.length === 64 && timingSafeEqual(Buffer.from(expected, 'hex'),
        scryptSync(`${code}:${p.id}:${userId}:${t.id}`, salt, 32));
      if (!valid) {
        await em.query('UPDATE public.parcel_pickup_task SET "handoffAttempts"="handoffAttempts"+1,"updatedAt"=now() WHERE id=$1', [taskId]);
        return { invalid: true as const };
      }
      await this.recordCustody(em, {
        parcelId: p.id, eventKind: 'origin_agent_collected', operationKey: collectedKey(taskId),
        fromType: null, fromId: null, toType: 'local_agent', toId: agent.id, role, hubId: null,
        evidenceRef: `sender-code:${createHash('sha256').update(t.handoffCodeHash).digest('hex')}`,
      });
      await em.query("UPDATE public.parcel SET status='collected_by_agent' WHERE id=$1", [p.id]);
      await em.query(`UPDATE public.parcel_pickup_task SET status='collected',"collectedAt"=now(),
        "handoffCodeHash"=NULL,"handoffCodeIssuedAt"=NULL,"handoffCodeExpiresAt"=NULL,"handoffAttempts"=0,
        "updatedAt"=now() WHERE id=$1`, [taskId]);
      await this.recordTracking(em, p.id, 'collected_by_agent', s.originCity,
        'Collected from the sender by the assigned Agent', agent.fullName ?? null, null, null, 'local_agent');
      // Gate 4: on a direct delivery the same Agent now carries the parcel
      // to the recipient -- no hub, no vehicle, no carrier is involved or shown.
      if (t.servicePath === 'direct_delivery') {
        await em.query("UPDATE public.parcel SET status='out_for_delivery' WHERE id=$1", [p.id]);
        await this.recordTracking(em, p.id, 'out_for_delivery', s.originCity,
          'On the way to the recipient with the same Agent', agent.fullName ?? null, null, null, 'local_agent');
      }
      // Gate 3: the Shipment is derived from the custody event and Parcel
      // status just written, by the ONE projector.
      await projectShipment(em, s.id);
      return { id: taskId, parcelId: p.id, status: 'collected', replay: false };
    });
    if ('invalid' in outcome) throw new BadRequestException('Incorrect sender handoff code');
    return outcome;
  }

  /**
   * Agent -> hub, step 1: the Agent says they are at the selected hub. This is
   * ONLY a request for acknowledgment: no custody event, no Parcel change.
   */
  async requestHubHandover(taskId: number, userId: number, role: RoleContext) {
    this.assertAgentRole(role, userId);
    return this.db.transaction(async (em) => {
      const { p, t } = await this.lockChain(em, taskId);
      if (t.agentProfileId !== role.profileId) throw new ForbiddenException('This pickup is not assigned to you');
      if (t.servicePath !== 'hub_routed') throw new ConflictException('Direct pickups do not end at a hub');
      if (['awaiting_hub', 'hub_received'].includes(t.status)) {
        return { id: taskId, parcelId: p.id, status: t.status, replay: true };
      }
      if (t.status !== 'collected') throw new ConflictException('The Agent must collect the Parcel first');
      await this.approvedAgent(em, role, userId);
      const last = await this.lastCustody(em, p.id);
      if (!last || last.operationKey !== collectedKey(taskId) || last.toCustodianType !== 'local_agent' ||
          last.toCustodianId !== t.agentProfileId) {
        throw new ConflictException('The assigned Agent does not currently hold this Parcel');
      }
      await em.query(`UPDATE public.parcel_pickup_task SET status='awaiting_hub',"handoverRequestedAt"=now(),
        "updatedAt"=now() WHERE id=$1`, [taskId]);
      return { id: taskId, parcelId: p.id, status: 'awaiting_hub', replay: false };
    });
  }

  /** Agent -> hub, step 2: only the exact selected, active origin hub can confirm physical receipt. */
  async hubReceive(taskId: number, userId: number, role: RoleContext) {
    if (!role || role.userId !== userId || role.roleType !== AccountRoleType.SUPER_AGENT) {
      throw new ForbiddenException('Active Super Agent context required');
    }
    return this.db.transaction(async (em) => {
      const { p, s, t } = await this.lockChain(em, taskId);
      const hubs: any[] = await em.query(`SELECT id,city,status,"userId","workspaceId","businessName",phone,address
        FROM public.super_agent WHERE id=$1 FOR UPDATE`, [role.profileId]);
      const hub = hubs[0];
      if (!hub || hub.userId !== userId || hub.status !== 'active' ||
          (hub.workspaceId != null && hub.workspaceId !== role.workspaceId)) {
        throw new ForbiddenException('An active receiving hub is required');
      }
      if (t.servicePath !== 'hub_routed' || t.originHubId !== hub.id) {
        throw new ForbiddenException('This is not the selected origin hub for this pickup');
      }
      if (t.status === 'hub_received') {
        const done = await this.custodyByKey(em, p.id, hubReceivedKey(taskId));
        if (done && done.hubId === hub.id) return { id: taskId, parcelId: p.id, status: 'hub_received', replay: true };
        throw new ConflictException('Hub receipt is not consistent');
      }
      if (t.status !== 'awaiting_hub') throw new ConflictException('The Agent has not asked this hub to receive the Parcel');
      if (p.superAgentId !== hub.id || p.status !== 'collected_by_agent') {
        throw new ConflictException('Parcel cannot be received by this hub');
      }
      const last = await this.lastCustody(em, p.id);
      if (!last || last.operationKey !== collectedKey(taskId) || last.toCustodianType !== 'local_agent' ||
          last.toCustodianId !== t.agentProfileId) {
        throw new ConflictException('The assigned Agent does not currently hold this Parcel');
      }
      await this.recordCustody(em, {
        parcelId: p.id, eventKind: 'origin_hub_received', operationKey: hubReceivedKey(taskId),
        fromType: 'local_agent', fromId: t.agentProfileId, toType: 'super_agent', toId: hub.id,
        role, hubId: hub.id, evidenceRef: `pickup-task:${taskId}`,
      });
      await em.query("UPDATE public.parcel SET status='received_at_hub' WHERE id=$1", [p.id]);
      await projectShipmentForParcel(em, p.id);
      await em.query(`UPDATE public.parcel_pickup_task SET status='hub_received',"completedAt"=now(),
        "updatedAt"=now() WHERE id=$1`, [taskId]);
      await this.recordTracking(em, p.id, 'received_at_hub', hub.city ?? s.originCity,
        'Received at the origin hub from the collecting Agent', hub.businessName ?? null,
        hub.phone ?? null, hub.address ?? hub.city ?? null, 'super_agent');

      // Custody is now proven at the origin hub. Derive the next executable
      // transport leg from the committed journey; notification is only an
      // operational activation and does not transfer custody.
      const nextLeg: any[] = s.journeySelectionId ? await em.query(`
        SELECT l.id,l.sequence,l."providerId",l."runId",tp."userId" AS "providerUserId"
          FROM public.journey_leg l
          LEFT JOIN public.transport_provider tp ON tp.id=l."providerId"
         WHERE l."journeySelectionId"=$1 AND l.type='transport'
         ORDER BY l.sequence ASC LIMIT 1`, [s.journeySelectionId]) : [];
      const next = nextLeg[0] ?? null;
      let transportTender: any = null;
      if (next?.providerId != null && next?.runId != null) {
        // Activate the transport action, not merely describe it. Resolve the
        // immutable Run stop that represents THIS physical hub and create a
        // one-use movement authority for the committed provider/run. The
        // provider can then accept the booked parcel through the existing
        // ParcelRunAssignment flow. This tender does not transfer custody.
        const stops: any[] = await em.query(`
          SELECT rs.id,rs.sequence,rs."superAgentId",rs."sourceRouteStopId"
            FROM public.transport_run_stop rs
           WHERE rs."runId"=$1
           ORDER BY rs.sequence ASC`, [next.runId]);
        const load = stops.find((rs: any) => Number(rs.superAgentId) === Number(hub.id));
        const legDetails: any[] = await em.query(
          'SELECT "loadRouteStopId","unloadRouteStopId" FROM public.journey_leg WHERE id=$1',
          [next.id],
        );
        const committed = legDetails[0] ?? {};
        const unload = stops.find((rs: any) =>
          committed.unloadRouteStopId != null &&
          Number(rs.sourceRouteStopId) === Number(committed.unloadRouteStopId));
        if (load && unload && Number(load.sequence) < Number(unload.sequence)) {
          const tenderKey = `journey-leg:${next.id}:parcel:${p.id}:hub:${hub.id}`;
          const tenderRows: any[] = await em.query(`
            INSERT INTO public.parcel_movement_tender
              ("parcelId","transportProviderId","runId","loadRunStopId","releasingSuperAgentId",
               "source","status","issuedByUserId","issuedByRoleType","idempotencyKey")
            VALUES ($1,$2,$3,$4,$5,'journey_next_action','open',$6,'super_agent',$7)
            ON CONFLICT ("idempotencyKey") DO UPDATE
              SET "idempotencyKey"=EXCLUDED."idempotencyKey"
            RETURNING id,status,"runId","loadRunStopId","transportProviderId"`,
            [p.id,next.providerId,next.runId,load.id,hub.id,userId,tenderKey]);
          transportTender = tenderRows[0] ?? null;
        }
      }
      return {
        id: taskId, parcelId: p.id, status: 'hub_received', replay: false,
        nextAction: next && transportTender ? {
          type: 'transport_handoff',
          journeyLegId: Number(next.id),
          providerId: Number(next.providerId),
          runId: Number(next.runId),
          tenderId: Number(transportTender.id),
          custodyStarted: false,
          providerUserId: next.providerUserId == null ? null : Number(next.providerUserId),
        } : { type: 'manual_planning', reason: next ? 'committed_transport_leg_not_executable' : 'no_committed_transport_leg', custodyStarted: false },
      };
    });
  }

  // ══ Gate 4: direct delivery, Agent -> recipient ═══════════════════════════

  /**
   * The Agent who collected a direct-delivery parcel asks for the recipient's
   * code. It is sent ONLY to the recipient's phone (the number the sender
   * gave); the Agent never sees it and must be told it in person. Issuing
   * proves nothing by itself.
   */
  async issueDeliveryCode(taskId: number, userId: number, role: RoleContext) {
    this.assertAgentRole(role, userId);
    const code = String(randomInt(100000, 1000000));
    const salt = randomBytes(16).toString('hex');
    const now = new Date();
    const issued = await this.db.transaction(async (em) => {
      const { s, p, t } = await this.lockChain(em, taskId);
      if (t.agentProfileId !== role.profileId) throw new ForbiddenException('This pickup is not assigned to you');
      if (t.servicePath !== 'direct_delivery') throw new ConflictException('This pickup ends at a hub, not at the recipient');
      if (t.status !== 'collected') throw new ConflictException('Collect the Parcel from the sender first');
      await this.approvedAgent(em, role, userId);
      await this.assertAgentHolds(em, p.id, taskId, t.agentProfileId);
      const phone = typeof s.receiverPhone === 'string' ? s.receiverPhone.trim() : '';
      if (!phone) throw new ConflictException('Recipient contact number is missing');
      // COD: the code sent when the rider accepted lasts until delivery and is never repeated.
      const cod = await this.codOrderFor(em, p.orderId);
      if (cod && t.deliveryCodeHash && isAcceptCode(t) && new Date(t.deliveryCodeExpiresAt).getTime() > now.getTime()) {
        throw new ConflictException(COD_CODE_ALREADY_SENT);
      }
      if (t.deliveryCodeIssuedAt && now.getTime() - new Date(t.deliveryCodeIssuedAt).getTime() < CODE_COOLDOWN_MS) {
        throw new ConflictException('Wait before sending another delivery code');
      }
      const hash = `${salt}:${scryptSync(deliveryCodeMaterial(code, p.id, userId, t.id, cod ? phone : null), salt, 32).toString('hex')}`;
      await em.query(`UPDATE public.parcel_pickup_task SET "deliveryCodeHash"=$1,"deliveryCodeIssuedAt"=$2,
        "deliveryCodeExpiresAt"=$3,"deliveryAttempts"=0,"updatedAt"=now() WHERE id=$4`,
      [hash, now, new Date(now.getTime() + CODE_TTL_MS), taskId]);
      const reference = customerParcelNumber({
        trackingNumber: s.trackingNumber ?? p.trackingNumber, waybillNumber: p.waybillNumber, createdAt: p.createdAt,
      }) || `#${p.id}`;
      return { phone, hash, reference };
    });
    const sent = this.sms
      ? await this.sms.sendSms(issued.phone,
          `KenteXa: Namba ya kupokea kifurushi ${issued.reference} ni ${code}. Inaisha dakika 10. Mpe wakala wakati unapokea kifurushi.`,
          true).catch(() => false)
      : false;
    if (!sent) {
      // An unsent code must not sit there looking issued (and holding the cooldown).
      await this.db.query(`UPDATE public.parcel_pickup_task SET "deliveryCodeHash"=NULL,"deliveryCodeIssuedAt"=NULL,
        "deliveryCodeExpiresAt"=NULL,"deliveryAttempts"=0,"updatedAt"=now() WHERE id=$1 AND "deliveryCodeHash"=$2`,
      [taskId, issued.hash]);
      throw new ConflictException('Delivery code could not be sent; retry');
    }
    return { id: taskId, sent: true, expiresInSeconds: CODE_TTL_MS / 1000 };
  }

  /**
   * Agent -> recipient. The assigned Agent enters the code the recipient
   * received; one idempotent custody event closes the delivery, the Parcel
   * becomes delivered, and the Shipment follows through the projector.
   */
  async deliver(taskId: number, userId: number, role: RoleContext, code: string) {
    this.assertAgentRole(role, userId);
    const outcome = await this.db.transaction(async (em) => {
      const { s, p, t } = await this.lockChain(em, taskId);
      if (t.status === 'delivered') {
        const done = await this.custodyByKey(em, p.id, deliveredKey(taskId));
        if (t.agentProfileId === role.profileId && done) {
          return { id: taskId, parcelId: p.id, status: 'delivered', replay: true };
        }
        throw new ForbiddenException('This delivery was completed by another Agent');
      }
      if (t.agentProfileId !== role.profileId) throw new ForbiddenException('This pickup is not assigned to you');
      if (t.servicePath !== 'direct_delivery') throw new ConflictException('This pickup ends at a hub, not at the recipient');
      if (t.status !== 'collected') throw new ConflictException('Collect the Parcel from the sender first');
      const agent = await this.approvedAgent(em, role, userId);
      if (s.status === 'cancelled') throw new ConflictException('This shipment was cancelled');
      await this.assertAgentHolds(em, p.id, taskId, t.agentProfileId);
      if (!SIX_DIGITS.test(code ?? '')) throw new BadRequestException('Enter the six-digit recipient delivery code');
      // COD seller shipment: the code is bound to the rider and the recipient's phone, and the
      // balance is collected and settled in this same transaction (the hub path's steps).
      const cod = await this.codOrderFor(em, p.orderId, true);
      if (cod && cod.codBalanceCollected) throw new ConflictException('COD balance already collected');
      if (cod && !this.invoices) throw new ConflictException('COD collection is unavailable; try again later');
      const codPhone = cod && typeof s.receiverPhone === 'string' ? s.receiverPhone.trim() : null;
      // One code, on the task (sent on the rider's accept for a COD, else at the door); a COD's
      // hash also binds the recipient's phone, so a changed number cannot use it.
      if (!t.deliveryCodeHash || !t.deliveryCodeExpiresAt || new Date(t.deliveryCodeExpiresAt).getTime() <= Date.now() ||
          t.deliveryAttempts >= CODE_MAX_ATTEMPTS || (cod && !codPhone)) {
        throw new ConflictException('Recipient delivery code is expired or unavailable');
      }
      const [salt, expected] = String(t.deliveryCodeHash).split(':');
      const valid = !!salt && expected?.length === 64 && timingSafeEqual(Buffer.from(expected, 'hex'),
        scryptSync(deliveryCodeMaterial(code, p.id, userId, t.id, codPhone), salt, 32));
      if (!valid) {
        await em.query('UPDATE public.parcel_pickup_task SET "deliveryAttempts"="deliveryAttempts"+1,"updatedAt"=now() WHERE id=$1', [taskId]);
        return { invalid: true as const };
      }
      await this.recordCustody(em, {
        parcelId: p.id, eventKind: 'recipient_agent_delivery', operationKey: deliveredKey(taskId),
        fromType: 'local_agent', fromId: t.agentProfileId, toType: 'recipient_contact', toId: null, role, hubId: null,
        evidenceRef: `recipient-code:${createHash('sha256').update(t.deliveryCodeHash).digest('hex')}`,
      });
      if (cod) {
        const event = await this.custodyByKey(em, p.id, deliveredKey(taskId));
        // The rider's delivery earning is the boda fee the buyer pays them in cash.
        await settleManualAgentCod(em, {
          order: cod, parcelId: p.id, custodyEventId: Number(event.id),
          agent: { id: Number(t.agentProfileId), deliveryCommission: p.agreedDeliveryFee },
          expectedAmount: Number(cod.codRemainingBalance || 0),
          recordInvoice: (m) => this.invoices!.recordCodBalanceCollectedForOrderId(Number(cod.id), Number(cod.totalAmount || 0), m),
        });
      }
      await em.query(`UPDATE public.parcel SET status='delivered',"deliveredTime"=now(),"buyerConfirmed"=true WHERE id=$1`, [p.id]);
      await em.query(`UPDATE public.parcel_pickup_task SET status='delivered',"deliveredAt"=now(),"completedAt"=now(),
        "deliveryCodeHash"=NULL,"deliveryCodeIssuedAt"=NULL,"deliveryCodeExpiresAt"=NULL,"deliveryAttempts"=0,
        "updatedAt"=now() WHERE id=$1`, [taskId]);
      await this.recordTracking(em, p.id, 'delivered', s.destinationCity,
        'Handed to the recipient by the Agent; recipient code confirmed', agent.fullName ?? null, null, null, 'local_agent');
      await projectShipment(em, s.id);
      return { id: taskId, parcelId: p.id, status: 'delivered', replay: false };
    });
    if ('invalid' in outcome) throw new BadRequestException('Incorrect recipient delivery code');
    return outcome;
  }

  /** The assigned Agent must be the parcel's CURRENT custodian, by the ledger. */
  private async assertAgentHolds(em: any, parcelId: number, taskId: number, agentProfileId: number) {
    const last = await this.lastCustody(em, parcelId);
    if (!last || last.operationKey !== collectedKey(taskId) || last.toCustodianType !== 'local_agent' ||
        last.toCustodianId !== agentProfileId) {
      throw new ConflictException('The assigned Agent does not currently hold this Parcel');
    }
  }

  // ══ Gate 4: the Agent's queue and the sender's view ═══════════════════════

  /**
   * Pickup jobs an Agent may claim: requested, unclaimed, in the Agent's own
   * city. Deliberately area-level only -- no contact name, phone or exact
   * address until the Agent has claimed the job.
   */
  async listAvailable(userId: number, role: RoleContext) {
    this.assertAgentRole(role, userId);
    const agent = await this.approvedAgent(this.db, role, userId, false);
    if (!normalizeCity(agent.city)) return [];
    // Seller partner agents first, for a few minutes (seller-agent-partner-gate.ts).
    const partnerGate = partnerGateSql('$3::int');
    const rows: any[] = await this.db.query(
      `SELECT t.id, t."servicePath", t."createdAt", t."originSnapshot",
              s."destinationLocationLabel", s."destinationCity", s."originCity",
              s."itemDescription", s."weightKg", h."businessName" AS "originHubName",
              pw.name AS "pickupWardName",
              COALESCE(s."pickupPinLatitude", s."originLatitude") AS "pointLat",
              COALESCE(s."pickupPinLongitude", s."originLongitude") AS "pointLng"
         FROM public.parcel_pickup_task t
         JOIN public.parcel p ON p.id = t."parcelId"
         JOIN public.shipment s ON s.id = p."shipmentId"
         LEFT JOIN public.super_agent h ON h.id = t."originHubId"
         LEFT JOIN public.tz_ward pw ON pw.id = s."pickupPinWardId"
        WHERE t.status = 'requested' AND s.status = 'confirmed' AND p.status = 'pending'
          AND lower(btrim(s."originCity")) = $1
          -- D2: a job this agent released ("Siwezi kufika" or timeout) is not offered to him again.
          AND NOT EXISTS (SELECT 1 FROM public.activity_events e WHERE e."eventType" = 'PICKUP_RELEASED'
                AND e."targetType" = 'parcel_pickup_task' AND e."targetId" = t.id AND e."actorProfileId" = $2)
          AND ${partnerGate}
        ORDER BY t."createdAt" ASC LIMIT 50`,
      partnerGate === 'TRUE' ? [normalizeCity(agent.city), agent.id] : [normalizeCity(agent.city), agent.id, userId],
    );
    // Section 18 (b): distance from the agent's base, rounded; nearest first.
    const hasBase = agent.baseLatitude != null && agent.baseLongitude != null;
    const dist = (r: any) => (hasBase && r.pointLat != null && r.pointLng != null
      ? distanceM(Number(agent.baseLatitude), Number(agent.baseLongitude), Number(r.pointLat), Number(r.pointLng)) : null);
    const ranked = rows.map((r) => ({ r, d: dist(r) }))
      .sort((x, y) => (x.d == null ? 1 : 0) - (y.d == null ? 1 : 0) || (x.d ?? 0) - (y.d ?? 0));
    return ranked.map(({ r, d }) => ({
      id: r.id,
      servicePath: r.servicePath as PickupServicePath,
      requestedAt: r.createdAt,
      distance: roughDistanceLabel(d),
      pickupArea: r.originSnapshot?.label ?? r.originSnapshot?.district ?? r.originCity,
      // Before accepting: at most the ward (approximate, off for now), never the pin or the landmark.
      pickupWard: SHOW_PIN_WARD ? r.pickupWardName ?? null : null,
      destinationArea: r.destinationLocationLabel ?? r.destinationCity,
      deliverTo: r.servicePath === 'direct_delivery' ? 'recipient' : 'hub',
      originHubName: r.originHubName ?? null,
      itemDescription: r.itemDescription,
      weightKg: Number(r.weightKg) || 0,
    }));
  }

  /**
   * The Agent's own jobs, with what they need to do them: the pickup contact
   * once claimed, and -- for a direct delivery they have collected -- the
   * recipient to reach.
   */
  async listMine(userId: number, role: RoleContext) {
    this.assertAgentRole(role, userId);
    const rows: any[] = await this.db.query(
      `SELECT t.id, t.status, t."servicePath", t."createdAt", t."claimedAt", t."collectedAt", t."deliveredAt",
              t."completedAt", t."originSnapshot", t."pickupContactName", t."pickupContactPhone",
              (t."handoffCodeHash" IS NOT NULL) AS "senderCodeIssued",
              (t."deliveryCodeHash" IS NOT NULL) AS "recipientCodeIssued",
              s."trackingNumber", s."receiverName", s."receiverPhone", s."destinationLocationLabel",
              s."destinationCity", s."originCity", s."itemDescription", s."weightKg",
              h."businessName" AS "originHubName", h.address AS "originHubAddress",
              s."pickupPinLatitude", s."pickupPinLongitude", s."pickupPinAccuracyM", s."pickupLandmark",
              pw.name AS "pickupWardName",
              o."paymentMethod" AS "orderPaymentMethod", o.source AS "orderSource",
              o."codRemainingBalance", o."codBalanceCollected", p."agreedDeliveryFee"
         FROM public.parcel_pickup_task t
         JOIN public.parcel p ON p.id = t."parcelId"
         JOIN public.shipment s ON s.id = p."shipmentId"
         LEFT JOIN public."order" o ON o.id = p."orderId"
         LEFT JOIN public.super_agent h ON h.id = t."originHubId"
         LEFT JOIN public.tz_ward pw ON pw.id = s."pickupPinWardId"
        WHERE t."agentProfileId" = $1
          AND (t.status IN ('claimed','collected','awaiting_hub')
               OR (t.status IN ('delivered','hub_received') AND t."completedAt" > now() - interval '7 days'))
        ORDER BY (t.status IN ('claimed','collected','awaiting_hub')) DESC, t."updatedAt" DESC LIMIT 50`,
      [role.profileId],
    );
    return rows.map((r) => {
      const direct = r.servicePath === 'direct_delivery';
      const open = ['claimed', 'collected', 'awaiting_hub'].includes(r.status);
      return {
        id: r.id,
        status: r.status,
        servicePath: r.servicePath as PickupServicePath,
        trackingNumber: r.trackingNumber,
        itemDescription: r.itemDescription,
        weightKg: Number(r.weightKg) || 0,
        pickupArea: r.originSnapshot?.label ?? r.originSnapshot?.district ?? r.originCity,
        // Contact details only while the job is open.
        pickupContact: open ? { name: r.pickupContactName, phone: r.pickupContactPhone } : null,
        // The exact pickup point only AFTER accepting, while going to collect (section 18).
        pickupPoint: r.status === 'claimed' ? pickupPointForAgent(r) : null,
        deliverTo: direct ? 'recipient' : 'hub',
        recipient: direct && r.status === 'collected'
          ? { name: r.receiverName, phone: r.receiverPhone, area: r.destinationLocationLabel ?? r.destinationCity }
          : null,
        destinationArea: r.destinationLocationLabel ?? r.destinationCity,
        originHub: direct ? null : { name: r.originHubName ?? null, address: r.originHubAddress ?? null },
        senderCodeIssued: !!r.senderCodeIssued,
        recipientCodeIssued: !!r.recipientCodeIssued,
        // COD seller shipment: what the rider collects at the door (goods balance + boda fee).
        cod: r.orderPaymentMethod === 'cod' && r.orderSource === 'seller_shipment' && !r.codBalanceCollected
          ? {
              goods: Number(r.codRemainingBalance) || 0,
              bodaFee: Number(r.agreedDeliveryFee) || 0,
              total: (Number(r.codRemainingBalance) || 0) + (Number(r.agreedDeliveryFee) || 0),
            }
          : null,
        // What the Agent does next, so every screen says the same thing.
        nextAction:
          r.status === 'claimed' ? 'collect_from_sender'
          : r.status === 'collected' ? (direct ? 'deliver_to_recipient' : 'take_to_hub')
          : r.status === 'awaiting_hub' ? 'wait_for_hub'
          : null,
        claimedAt: r.claimedAt, collectedAt: r.collectedAt, deliveredAt: r.deliveredAt, completedAt: r.completedAt,
      };
    });
  }

  /**
   * Gate 5: what a hub desk is waiting for -- Shipments that chose this hub
   * as their origin and whose parcel has not been received here yet. Either
   * the sender drops it off (the desk receives it by the customer's Shipment
   * number) or an Agent brings it (the desk confirms that Agent's handover).
   * `nextAction` says which, so the desk never has to guess.
   */
  async listHubExpected(userId: number, role: RoleContext) {
    if (!role || role.userId !== userId || role.roleType !== AccountRoleType.SUPER_AGENT) {
      throw new ForbiddenException('Active Super Agent context required');
    }
    const [hub] = await this.db.query(
      'SELECT id, status, "userId", "workspaceId" FROM public.super_agent WHERE id=$1', [role.profileId]);
    if (!hub || hub.userId !== userId || hub.status !== 'active' ||
        (hub.workspaceId != null && hub.workspaceId !== role.workspaceId)) {
      throw new ForbiddenException('An active receiving hub is required');
    }
    const rows: any[] = await this.db.query(
      `SELECT p.id AS "parcelId", COALESCE(s."trackingNumber", p."trackingNumber") AS "trackingNumber",
              p."waybillNumber", p."orderId", o.source::text AS "orderSource",
              p.status AS "parcelStatus", s."senderName", s."senderPhone", s."itemDescription", s."weightKg",
              s."destinationCity", t.id AS "taskId", t.status AS "taskStatus", a."fullName" AS "agentName",
              trip."scheduledDeparture", trip."providerName"
         FROM public.parcel p
         JOIN public.shipment s ON s.id = p."shipmentId"
         LEFT JOIN public."order" o ON o.id = p."orderId"
         LEFT JOIN LATERAL (
           SELECT x.id, x.status, x."agentProfileId" FROM public.parcel_pickup_task x
            WHERE x."parcelId" = p.id AND x.status IN ('requested','claimed','collected','awaiting_hub')
            ORDER BY x.id DESC LIMIT 1) t ON true
         LEFT JOIN public.agent a ON a.id = t."agentProfileId"
         LEFT JOIN LATERAL (
           SELECT r."scheduledDeparture", tp.name AS "providerName"
             FROM public.journey_leg l
             JOIN public.transport_run r ON r.id = l."runId"
             JOIN public.transport_provider tp ON tp.id = r."providerId"
            WHERE l."journeySelectionId" = s."journeySelectionId" AND l.type = 'transport'
            ORDER BY l.sequence ASC LIMIT 1) trip ON true
        WHERE p."superAgentId" = $1 AND p.status IN ('pending','collected_by_agent')
          AND s.status IN ('confirmed','collected')
        ORDER BY trip."scheduledDeparture" ASC NULLS LAST, p.id ASC LIMIT 100`,
      [hub.id],
    );
    return rows.map((r) => ({
      parcelId: r.parcelId,
      trackingNumber: r.trackingNumber,
      // The one KenteXa number for this parcel, wherever it came from.
      waybill: r.waybillNumber ? formatWaybill(r.waybillNumber) : null,
      orderId: r.orderId == null ? null : Number(r.orderId),
      // Where it came from (owner 2026-10-26): a KenteXa marketplace order, a seller's own
      // order (seller form / POS), or a customer's shipment (the send form).
      kind: r.orderId == null ? 'shipment' : r.orderSource === 'online' ? 'marketplace' : 'seller',
      itemDescription: r.itemDescription,
      weightKg: Number(r.weightKg) || 0,
      destinationCity: r.destinationCity,
      sender: { name: r.senderName ?? null, phone: r.senderPhone ?? null },
      bookedTrip: r.scheduledDeparture ? { departureAt: r.scheduledDeparture, providerName: r.providerName ?? null } : null,
      pickupTask: r.taskId ? { id: r.taskId, status: r.taskStatus, agentName: r.agentName ?? null } : null,
      nextAction:
        r.taskStatus === 'awaiting_hub' ? 'confirm_agent_handover'
        : r.taskId ? 'agent_on_the_way'
        // A marketplace order the seller is bringing: received with its order step.
        : r.orderId != null && r.orderSource === 'online' ? 'receive_order'
        : 'receive_from_sender',
    }));
  }

  /** The sender's view of their Shipment's pickup: its state and, once claimed, who is coming. */
  async getForShipment(userId: number, shipmentId: number) {
    const [s] = await this.db.query('SELECT id, "requestedByUserId" FROM public.shipment WHERE id=$1', [shipmentId]);
    if (!s) throw new NotFoundException('Shipment not found');
    if (s.requestedByUserId !== userId) throw new ForbiddenException('Not your shipment');
    const [t] = await this.db.query(
      `SELECT t.id, t.status, t."servicePath", t."createdAt", t."claimedAt", t."collectedAt", t."deliveredAt",
              t."completedAt", t."handoffCodeExpiresAt", a."fullName" AS "agentName", a.phone AS "agentPhone"
         FROM public.parcel_pickup_task t
         JOIN public.parcel p ON p.id = t."parcelId"
         LEFT JOIN public.agent a ON a.id = t."agentProfileId"
        WHERE p."shipmentId" = $1 ORDER BY t.id DESC LIMIT 1`,
      [shipmentId],
    );
    if (!t) return { task: null };
    const assigned = ['claimed', 'collected', 'awaiting_hub'].includes(t.status);
    return {
      task: {
        id: t.id, status: t.status, servicePath: t.servicePath as PickupServicePath,
        agent: assigned ? { name: t.agentName ?? null, phone: t.agentPhone ?? null } : null,
        nextAction:
          t.status === 'requested' ? 'wait_for_agent'
          : t.status === 'claimed' ? 'give_code_to_agent'
          : null,
        requestedAt: t.createdAt, claimedAt: t.claimedAt, collectedAt: t.collectedAt,
        deliveredAt: t.deliveredAt, completedAt: t.completedAt,
      },
    };
  }

  /**
   * The requester cancels BEFORE physical collection. Once custody exists it
   * cannot be erased: the task, event and Parcel keep their history.
   */
  async cancel(userId: number, shipmentId: number) {
    const result: any = await this.db.transaction(async (em) => {
      const s: any[] = await em.query('SELECT * FROM public.shipment WHERE id=$1 FOR UPDATE', [shipmentId]);
      if (!s[0]) throw new NotFoundException('Shipment not found');
      if (s[0].requestedByUserId !== userId) throw new ForbiddenException('Not your shipment');
      const p: any[] = await em.query('SELECT * FROM public.parcel WHERE "shipmentId"=$1 FOR UPDATE', [shipmentId]);
      if (p.length !== 1) throw new ConflictException('Shipment needs one independent Parcel');
      const t: any[] = await em.query(`SELECT * FROM public.parcel_pickup_task WHERE "parcelId"=$1
        ORDER BY id DESC LIMIT 1 FOR UPDATE`, [p[0].id]);
      if (!t[0]) throw new NotFoundException('No pickup task for this Shipment');
      if (t[0].status === 'cancelled') return { id: t[0].id, parcelId: p[0].id, status: 'cancelled', replay: true };
      if (t[0].status !== 'requested' && t[0].status !== 'claimed') {
        throw new ConflictException('Custody has already started; the pickup can no longer be cancelled');
      }
      // A COD code sent when the rider accepted is cancelled with the job.
      await em.query(`UPDATE public.parcel_pickup_task SET status='cancelled',"cancelledAt"=now(),
        "handoffCodeHash"=NULL,"handoffCodeIssuedAt"=NULL,"handoffCodeExpiresAt"=NULL,"handoffAttempts"=0,
        ${t[0].deliveryCodeHash ? `${CLEAR_TASK_DELIVERY_CODE},` : ''}"updatedAt"=now() WHERE id=$1`, [t[0].id]);
      return { id: t[0].id, parcelId: p[0].id, status: 'cancelled', replay: false,
        acceptedByAgent: t[0].status === 'claimed' ? t[0].agentProfileId : null };
    });
    const { acceptedByAgent, ...answer } = result;
    // Review D3: an agent who already accepted is told (once; a replay sends nothing).
    if (!answer.replay && acceptedByAgent) await this.tellAgentJobCancelled(answer.id, Number(acceptedByAgent));
    return answer;
  }

  /**
   * The sender cancelled a pickup this agent had accepted: one in-app message
   * and one SMS (the agent may already be on the way). Never undoes the cancel.
   */
  private async tellAgentJobCancelled(taskId: number, agentProfileId: number) {
    try {
      const rows: any[] = await this.db.query(`
        SELECT a."userId", COALESCE(NULLIF(btrim(a.phone), ''), u.phone) AS "agentPhone",
               s."trackingNumber" AS "shipmentNumber", p."trackingNumber", p."waybillNumber", p."createdAt"
          FROM public.parcel_pickup_task t
          JOIN public.parcel p ON p.id = t."parcelId"
          JOIN public.shipment s ON s.id = p."shipmentId"
          JOIN public.agent a ON a.id = $2
          LEFT JOIN public."user" u ON u.id = a."userId"
         WHERE t.id = $1`, [taskId, agentProfileId]);
      const r = rows[0];
      if (!r) return;
      const reference = customerParcelNumber({
        trackingNumber: r.shipmentNumber ?? r.trackingNumber, waybillNumber: r.waybillNumber, createdAt: r.createdAt,
      });
      if (r.userId && this.communication) {
        await this.communication.dispatch({
          eventType: 'LOGISTICS_PICKUP_CANCELLED', sourceType: 'parcel_pickup_task', sourceId: taskId,
          recipients: [{ userId: Number(r.userId), role: 'agent', actionPage: 'agent-pickups', actionParam: String(taskId) }],
          context: { taskId, reference: reference || `#${taskId}` },
        }).catch((err: any) => this.logger.warn(`Pickup cancelled in-app not sent for task ${taskId}: ${err?.message || err}`));
      }
      if (r.agentPhone && this.sms) await this.sms.sendSms(r.agentPhone, pickupCancelledSms(reference));
    } catch (err: any) {
      this.logger.warn(`Pickup cancelled message not sent for task ${taskId}: ${err?.message || err}`);
    }
  }

}
