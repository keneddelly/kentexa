import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { Agent } from '../agents/entities/agent.entity';
import { User } from '../users/entities/user.entity';
import { SmsService } from '../sms/sms.service';

@Injectable()
export class AgentOrdersService {
  constructor(
    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
    @InjectRepository(Agent)
    private agentRepo: Repository<Agent>,
    private smsService: SmsService,
  ) {}

  async getAvailableOrders(agent: User) {
    // Get agent's registered location
    const agentProfile = await this.agentRepo.findOne({
      where: { user: { id: agent.id } },
    });

    const agentCity = agentProfile?.city || agentProfile?.district || null;
    const agentDistrict = agentProfile?.district || null;
    const agentRegion = agentProfile?.region || null;

    // Build location-aware query
    // Priority: same district → same city → same region → any. (Ward-level
    // matching isn't possible yet — Agent has no ward field to match against.)
    const query = this.orderRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.buyer', 'buyer')
      .leftJoinAndSelect('o.product', 'product')
      .leftJoinAndSelect('o.seller', 'seller')
      .where('o.status IN (:...statuses)', {
        statuses: [OrderStatus.PAID, OrderStatus.PREPARING],
      })
      // Only show orders that need local delivery (boda/agent)
      .andWhere(
        '(o.shippingMethod = :boda OR o.shippingMethod = :agent OR o.shippingMethod IS NULL)',
        { boda: 'boda', agent: 'agent' },
      )
      .orderBy('o.createdAt', 'DESC')
      .take(30);

    // Add location filter if agent has location set
    if (agentCity) {
      query.andWhere(
        `(
          LOWER(o.destinationCity) = LOWER(:city)
          OR LOWER(o.deliveryAddress) LIKE LOWER(:cityLike)
          ${agentDistrict ? 'OR LOWER(o.deliveryAddress) LIKE LOWER(:districtLike)' : ''}
          ${agentRegion ? 'OR LOWER(o.deliveryAddress) LIKE LOWER(:regionLike)' : ''}
        )`,
        {
          city: agentCity,
          cityLike: `%${agentCity}%`,
          ...(agentDistrict ? { districtLike: `%${agentDistrict}%` } : {}),
          ...(agentRegion ? { regionLike: `%${agentRegion}%` } : {}),
        },
      );
    }

    const orders = await query.getMany();

    // If no location set or no results in area, return all available
    if (!agentCity || orders.length === 0) {
      return this.orderRepo.find({
        where: [
          { status: OrderStatus.PAID },
          { status: OrderStatus.PREPARING },
        ],
        relations: { buyer: true, product: true, seller: true },
        order: { createdAt: 'DESC' },
        take: 30,
      });
    }

    return orders;
  }

  async getMyOrders(agent: User) {
    return this.orderRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.buyer', 'buyer')
      .leftJoinAndSelect('o.product', 'product')
      .leftJoinAndSelect('o.seller', 'seller')
      .where('o.agentId = :agentId', { agentId: String(agent.id) })
      .orderBy('o.updatedAt', 'DESC')
      .getMany();
  }

  async claimOrder(orderId: number, agent: User) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: { buyer: true, product: true, seller: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if ((order as any).agentId)
      throw new BadRequestException('Already claimed by another agent');
    if (![OrderStatus.PAID, OrderStatus.PREPARING].includes(order.status)) {
      throw new BadRequestException(
        `Order cannot be claimed. Status: ${order.status}`,
      );
    }

    // Atomic conditional update — the checks above are only for the
    // friendly error messages. This WHERE clause is what actually prevents
    // two agents claiming the same order in the same race window.
    const result = await this.orderRepo
      .createQueryBuilder()
      .update()
      .set({ agentId: String(agent.id), status: OrderStatus.PREPARING })
      .where('id = :id', { id: orderId })
      .andWhere('"agentId" IS NULL')
      .andWhere('status IN (:...statuses)', {
        statuses: [OrderStatus.PAID, OrderStatus.PREPARING],
      })
      .execute();
    if (!result.affected) {
      throw new BadRequestException(
        'Already claimed by another agent, or no longer available.',
      );
    }

    if (order.seller?.phone) {
      await this.smsService.sendSms(
        order.seller.phone,
        `KenteXa: Agent ${agent.name || 'Agent'} will pick up Order #${orderId}. Please prepare the item.`,
      );
    }
    return { message: 'Order claimed successfully', orderId };
  }

  async confirmPickup(orderId: number, agent: User, note?: string) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: { buyer: true, seller: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if ((order as any).agentId !== String(agent.id))
      throw new ForbiddenException('Not assigned to you');
    if (order.status !== OrderStatus.PREPARING) {
      throw new BadRequestException(
        `Cannot confirm pickup. Status: ${order.status}`,
      );
    }

    await this.orderRepo.update(orderId, {
      status: OrderStatus.IN_TRANSIT,
      agentReceivedAt: new Date(),
      agentNote: note || null,
    });

    if (order.buyer?.phone) {
      await this.smsService.sendSms(
        order.buyer.phone,
        `KenteXa: Your order #${orderId} has been picked up! Agent: ${agent.name || 'KenteXa Agent'}.`,
      );
    }
    return {
      message: 'Pickup confirmed',
      orderId,
      status: OrderStatus.IN_TRANSIT,
    };
  }

  async confirmDelivery(orderId: number, agent: User, note?: string) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: { buyer: true, seller: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if ((order as any).agentId !== String(agent.id))
      throw new ForbiddenException('Not assigned to you');
    if (
      ![OrderStatus.IN_TRANSIT, OrderStatus.READY_PICKUP].includes(order.status)
    ) {
      throw new BadRequestException(
        `Cannot confirm delivery. Status: ${order.status}`,
      );
    }

    // Calculate auto-release deadline
    // Local/Dar orders: 3 days. Intercity: 5 days.
    // Determined by shippingMethod — 'agent' intercity = 5 days, everything else = 3 days
    const isIntercity = ['agent', 'bus', 'courier'].includes(
      (order as any).shippingMethod || '',
    );
    const releaseDays = isIntercity ? 5 : 3;
    const autoReleaseAt = new Date();
    autoReleaseAt.setDate(autoReleaseAt.getDate() + releaseDays);

    await this.orderRepo.update(orderId, {
      status: OrderStatus.DELIVERED,
      deliveredAt: new Date(),
      agentNote: note || null,
      autoReleaseAt, // escrow released automatically after this deadline if buyer silent
    });

    // Credit agent's delivery count — used for tier calculation.
    // The agentRepo isn't injected here (to avoid circular deps) — the agent
    // dashboard reads delivery counts from order stats directly. Full agent
    // entity update happens in super-agents.service.ts's
    // creditLocalAgentForDelivery(), called from the parcel flow instead.

    if (order.buyer?.phone) {
      await this.smsService.sendSms(
        order.buyer.phone,
        `KenteXa: Agizo lako #${orderId} limefikishwa! Asante kwa kununua KenteXa. 🎉`,
      );
    }
    if (order.seller?.phone) {
      await this.smsService.sendSms(
        order.seller.phone,
        `KenteXa: Agizo #${orderId} limefikishwa kwa mafanikio.`,
      );
    }
    return {
      message: 'Delivery confirmed',
      orderId,
      status: OrderStatus.DELIVERED,
    };
  }

  async getOrderDetails(orderId: number, agent: User) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: { buyer: true, product: true, seller: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    return {
      id: order.id,
      status: order.status,
      paymentStatus: order.paymentStatus,
      quantity: order.quantity,
      totalAmount: Number(order.totalAmount),
      deliveryAddress: order.deliveryAddress,
      phone: order.phone,
      deliveredAt: order.deliveredAt,
      agentNote: (order as any).agentNote || null,
      isMyOrder: (order as any).agentId === String(agent.id),
      buyer: { name: order.buyer?.name, phone: order.buyer?.phone },
      seller: { name: order.seller?.name, phone: order.seller?.phone },
      product: { name: order.product?.name, images: order.product?.images },
    };
  }

  async getAgentPickupStats(agent: User) {
    const all = await this.orderRepo
      .createQueryBuilder('o')
      .where('o.agentId = :agentId', { agentId: String(agent.id) })
      .getMany();

    return {
      total: all.length,
      delivered: all.filter((o) => o.status === OrderStatus.DELIVERED).length,
      inProgress: all.filter((o) =>
        [
          OrderStatus.PREPARING,
          OrderStatus.IN_TRANSIT,
          OrderStatus.READY_PICKUP,
        ].includes(o.status),
      ).length,
      pending: all.filter((o) => o.status === OrderStatus.PAID).length,
    };
  }
}
