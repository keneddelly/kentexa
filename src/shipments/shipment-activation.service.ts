import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ShipmentsService, ConfirmShipmentDto } from './shipments.service';
import { PickupTasksService } from './pickup-tasks.service';
import { ShipmentHandoffOption } from './entities/shipment.entity';

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
  ) {}

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
      requestKey: randomUUID(),
      servicePath: isDirect ? 'direct_delivery' : 'hub_routed',
      pickupContactName: confirmed.shipment.senderName || 'Sender',
      pickupContactPhone: confirmed.shipment.senderPhone || '',
    });

    return {
      ...confirmed,
      nextAction: {
        type: 'agent_pickup',
        actor: 'eligible_local_agent',
        taskId: task.id,
        status: task.status,
        custodyStarted: false,
      },
    };
  }
}
