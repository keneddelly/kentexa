import {
  BadRequestException, ConflictException, ForbiddenException, Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import type { RoleContext } from '../role-context/role-context.types';

export type PickupServicePath = 'direct_delivery' | 'hub_routed';
export interface RequestPickupDto {
  requestKey: string;
  servicePath: PickupServicePath;
  pickupContactName: string;
  pickupContactPhone: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const normalizeCity = (value: string | null) => value?.trim().toLocaleLowerCase('en') ?? '';

/** Request and claim only. Neither action writes custody, tracking or money. */
@Injectable()
export class PickupTasksService {
  constructor(private readonly db: DataSource) {}

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
        if (s.originHubSource !== 'not_required' || s.destinationHubSource !== 'not_required' ||
            !normalizeCity(s.originCity) || normalizeCity(s.originCity) !== normalizeCity(s.destinationCity)) {
          throw new BadRequestException('Direct Agent delivery requires a no-hub intracity Shipment');
        }
      } else {
        hubId = s.originHubId;
        if (!hubId || !['sender_selected','auto_single_candidate'].includes(s.originHubSource)) {
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
}
