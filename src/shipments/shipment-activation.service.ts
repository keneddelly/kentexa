import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { ShipmentsService } from './shipments.service';
import type { ConfirmShipmentDto } from './shipments.service';
import { PickupTasksService } from './pickup-tasks.service';
import { ShipmentHandoffOption } from './entities/shipment.entity';
import { LogisticsDispatchService } from './logistics-dispatch.service';

/**
 * Issue #95 orchestration boundary.
 * Confirmation freezes the commercial/route/hub plan. Only after that succeeds
 * do we activate the first executable action. Task assignment is NOT custody.
 */
@Injectable()
export class ShipmentActivationService {
  constructor(
    private readonly shipments: ShipmentsService,
    private readonly pickupTasks: PickupTasksService,
    private readonly dispatch: LogisticsDispatchService,
  ) {}

  private activationKey(userId: number, shipmentId: number) {
    const h = createHash('sha256').update(`shipment-first-action:${userId}:${shipmentId}`).digest('hex').slice(0, 32).split('');
    h[12] = '4'; h[16] = ['8','9','a','b'][parseInt(h[16], 16) % 4];
    const s = h.join('');
    return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
  }

  async confirmAndActivate(userId: number, shipmentId: number, dto: ConfirmShipmentDto) {
    const confirmed = await this.shipments.confirmShipment(userId, shipmentId, dto);

    // Customer drop-off/point service: the first action belongs to the
    // customer. Do not invent an Agent task and do not claim custody.
    if (confirmed.shipment.pickupOption !== ShipmentHandoffOption.DOOR) {
      return {
        ...confirmed,
        nextAction: {
          type: 'customer_dropoff',
          actor: 'customer',
          hubId: confirmed.shipment.originHubId ?? null,
          status: 'awaiting_customer',
        },
      };
    }

    const isDirect =
      confirmed.shipment.originHubSource === 'not_required' &&
      confirmed.shipment.destinationHubSource === 'not_required';

    const task = await this.pickupTasks.requestForShipment(userId, shipmentId, {
      requestKey: this.activationKey(userId, shipmentId),
      servicePath: isDirect ? 'direct_delivery' : 'hub_routed',
      pickupContactName: confirmed.shipment.senderName || 'Sender',
      pickupContactPhone: confirmed.shipment.senderPhone || '',
    });

    const dispatch = await this.dispatch.dispatchPickup(task.id, {
      channels: ['in_app', 'sms', 'call'],
      callAfterMinutes: 10,
    });

    return {
      ...confirmed,
      nextAction: {
        type: 'agent_pickup',
        actor: 'eligible_local_agent',
        taskId: task.id,
        status: task.status,
        custodyStarted: false,
        dispatch,
      },
    };
  }
}
