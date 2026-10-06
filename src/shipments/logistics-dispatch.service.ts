import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CommunicationEngineService } from '../communication/communication-engine.service';
export type DispatchChannel = 'in_app' | 'sms' | 'call';
export interface DispatchPolicy { channels: DispatchChannel[]; callAfterMinutes?: number; }
@Injectable()
export class LogisticsDispatchService {
  constructor(private readonly db: DataSource, private readonly communication: CommunicationEngineService) {}
  async dispatchPickup(taskId: number, policy: DispatchPolicy = { channels: ['in_app'] }) {
    const rows: any[] = await this.db.query(`
      SELECT t.id,t.status,t."parcelId",s."originCity",s."destinationCity",s."itemDescription",
             a.id AS "agentId",a."userId",a."fullName",a.city,a."isOnline",a."maxWeightKg",s."weightKg"
      FROM parcel_pickup_task t JOIN parcel p ON p.id=t."parcelId" JOIN shipment s ON s.id=p."shipmentId"
      JOIN agent a ON a.status='approved' AND lower(trim(a.city))=lower(trim(s."originCity"))
       AND a."isOnline"=true AND (a."maxWeightKg" IS NULL OR a."maxWeightKg">=s."weightKg")
      WHERE t.id=$1 AND t.status='requested'
      ORDER BY COALESCE(a.rating,0) DESC,a.id ASC LIMIT 10
    `, [taskId]);
    if (!rows.length) return { taskId, dispatched: 0, state: 'awaiting_supply', escalation: policy };
    await this.communication.dispatch({
      eventType: 'LOGISTICS_PICKUP_AVAILABLE', sourceType: 'parcel_pickup_task', sourceId: taskId,
      recipients: rows.map(r => ({ userId: Number(r.userId), role: 'agent', actionPage: 'agent-pickups', actionParam: String(taskId) })),
      context: { taskId, originCity: rows[0].originCity, destinationCity: rows[0].destinationCity, itemDescription: rows[0].itemDescription || 'Parcel' },
    });
    return { taskId, dispatched: rows.length, candidateAgentIds: rows.map(r => Number(r.agentId)), state: 'offered',
      escalation: { channels: policy.channels, callAfterMinutes: policy.channels.includes('call') ? (policy.callAfterMinutes ?? 10) : null } };
  }
}
