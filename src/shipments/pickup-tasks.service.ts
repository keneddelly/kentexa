import {
  BadRequestException, ConflictException, ForbiddenException, Injectable,
  NotFoundException, Optional,
} from '@nestjs/common';
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from 'crypto';
import { DataSource } from 'typeorm';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import type { RoleContext } from '../role-context/role-context.types';
import { ShipmentHubSource } from './shipment-hub-source';
import { projectShipment, projectShipmentForParcel } from './shipment-projection';
import { SmsService } from '../sms/sms.service';

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

/**
 * Request and claim (Stage 3S) plus the physical first mile (Stage 3S-A):
 * sender -> Agent (origin_agent_collected) and Agent -> exact origin hub
 * (origin_hub_received). A claim, a "handed over" tap, a location or a photo
 * never proves custody; only a locked, idempotent custody event does, written
 * in the same transaction as the task, Parcel and tracking changes.
 */
@Injectable()
export class PickupTasksService {
  constructor(
    private readonly db: DataSource,
    // Gate 4: the recipient's delivery code is sent by SMS. Optional only so
    // the existing hand-built instances in specs keep constructing.
    @Optional() private readonly sms?: SmsService,
  ) {}

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
        const hubs: any[] = await em.query('SELECT id FROM public.super_agent WHERE id=$1 AND status=$2', [hubId, 'active']);
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
    return this.db.transaction(async (em) => {
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
      const agent: any[] = await em.query(`SELECT id,city,status,"userId" FROM public.agent
        WHERE id=$1 FOR UPDATE`, [role.profileId]);
      if (agent.length !== 1 || agent[0].userId !== userId || agent[0].status !== 'approved') {
        throw new ForbiddenException('Approved active Agent profile required');
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
      await em.query(`UPDATE public.parcel_pickup_task SET status='claimed',
        "agentProfileId"=$1,"claimedAt"=now(),"updatedAt"=now() WHERE id=$2`, [role.profileId, taskId]);
      return { id: taskId, parcelId: p[0].id, status: 'claimed', replay: false };
    });
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
    const rows: any[] = await em.query(`SELECT id,city,status,"userId","fullName" FROM public.agent
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
      if (s.status !== 'confirmed' || p.status !== 'pending' || p.orderId !== null) {
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
      return { id: taskId, parcelId: p.id, status: 'hub_received', replay: false };
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
      if (t.deliveryCodeIssuedAt && now.getTime() - new Date(t.deliveryCodeIssuedAt).getTime() < CODE_COOLDOWN_MS) {
        throw new ConflictException('Wait before sending another delivery code');
      }
      const hash = `${salt}:${scryptSync(`${code}:${p.id}:${userId}:${t.id}:deliver`, salt, 32).toString('hex')}`;
      await em.query(`UPDATE public.parcel_pickup_task SET "deliveryCodeHash"=$1,"deliveryCodeIssuedAt"=$2,
        "deliveryCodeExpiresAt"=$3,"deliveryAttempts"=0,"updatedAt"=now() WHERE id=$4`,
      [hash, now, new Date(now.getTime() + CODE_TTL_MS), taskId]);
      return { phone, hash, reference: s.trackingNumber ?? p.trackingNumber ?? `#${p.id}` };
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
      if (!t.deliveryCodeHash || !t.deliveryCodeExpiresAt || new Date(t.deliveryCodeExpiresAt).getTime() <= Date.now() ||
          t.deliveryAttempts >= CODE_MAX_ATTEMPTS) {
        throw new ConflictException('Recipient delivery code is expired or unavailable');
      }
      const [salt, expected] = String(t.deliveryCodeHash).split(':');
      const valid = !!salt && expected?.length === 64 && timingSafeEqual(Buffer.from(expected, 'hex'),
        scryptSync(`${code}:${p.id}:${userId}:${t.id}:deliver`, salt, 32));
      if (!valid) {
        await em.query('UPDATE public.parcel_pickup_task SET "deliveryAttempts"="deliveryAttempts"+1,"updatedAt"=now() WHERE id=$1', [taskId]);
        return { invalid: true as const };
      }
      await this.recordCustody(em, {
        parcelId: p.id, eventKind: 'recipient_agent_delivery', operationKey: deliveredKey(taskId),
        fromType: 'local_agent', fromId: t.agentProfileId, toType: 'recipient_contact', toId: null, role, hubId: null,
        evidenceRef: `recipient-code:${createHash('sha256').update(t.deliveryCodeHash).digest('hex')}`,
      });
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
    const rows: any[] = await this.db.query(
      `SELECT t.id, t."servicePath", t."createdAt", t."originSnapshot",
              s."destinationLocationLabel", s."destinationCity", s."originCity",
              s."itemDescription", s."weightKg", h."businessName" AS "originHubName"
         FROM public.parcel_pickup_task t
         JOIN public.parcel p ON p.id = t."parcelId"
         JOIN public.shipment s ON s.id = p."shipmentId"
         LEFT JOIN public.super_agent h ON h.id = t."originHubId"
        WHERE t.status = 'requested' AND s.status = 'confirmed' AND p.status = 'pending'
          AND lower(btrim(s."originCity")) = $1
        ORDER BY t."createdAt" ASC LIMIT 50`,
      [normalizeCity(agent.city)],
    );
    return rows.map((r) => ({
      id: r.id,
      servicePath: r.servicePath as PickupServicePath,
      requestedAt: r.createdAt,
      pickupArea: r.originSnapshot?.label ?? r.originSnapshot?.district ?? r.originCity,
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
              h."businessName" AS "originHubName", h.address AS "originHubAddress"
         FROM public.parcel_pickup_task t
         JOIN public.parcel p ON p.id = t."parcelId"
         JOIN public.shipment s ON s.id = p."shipmentId"
         LEFT JOIN public.super_agent h ON h.id = t."originHubId"
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
        deliverTo: direct ? 'recipient' : 'hub',
        recipient: direct && r.status === 'collected'
          ? { name: r.receiverName, phone: r.receiverPhone, area: r.destinationLocationLabel ?? r.destinationCity }
          : null,
        destinationArea: r.destinationLocationLabel ?? r.destinationCity,
        originHub: direct ? null : { name: r.originHubName ?? null, address: r.originHubAddress ?? null },
        senderCodeIssued: !!r.senderCodeIssued,
        recipientCodeIssued: !!r.recipientCodeIssued,
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
    return this.db.transaction(async (em) => {
      const s: any[] = await em.query('SELECT * FROM public.shipment WHERE id=$1 FOR UPDATE', [shipmentId]);
      if (!s[0]) throw new NotFoundException('Shipment not found');
      if (s[0].requestedByUserId !== userId) throw new ForbiddenException('Not your shipment');
      const p: any[] = await em.query('SELECT id FROM public.parcel WHERE "shipmentId"=$1 FOR UPDATE', [shipmentId]);
      if (p.length !== 1) throw new ConflictException('Shipment needs one independent Parcel');
      const t: any[] = await em.query(`SELECT * FROM public.parcel_pickup_task WHERE "parcelId"=$1
        ORDER BY id DESC LIMIT 1 FOR UPDATE`, [p[0].id]);
      if (!t[0]) throw new NotFoundException('No pickup task for this Shipment');
      if (t[0].status === 'cancelled') return { id: t[0].id, parcelId: p[0].id, status: 'cancelled', replay: true };
      if (t[0].status !== 'requested' && t[0].status !== 'claimed') {
        throw new ConflictException('Custody has already started; the pickup can no longer be cancelled');
      }
      await em.query(`UPDATE public.parcel_pickup_task SET status='cancelled',"cancelledAt"=now(),
        "handoffCodeHash"=NULL,"handoffCodeIssuedAt"=NULL,"handoffCodeExpiresAt"=NULL,"handoffAttempts"=0,
        "updatedAt"=now() WHERE id=$1`, [t[0].id]);
      return { id: t[0].id, parcelId: p[0].id, status: 'cancelled', replay: false };
    });
  }

}
