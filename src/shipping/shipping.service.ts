import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Order,
  OrderStatus,
  EscrowStatus,
} from '../orders/entities/order.entity';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
  ) {}

  // ── Seller: Mark order as preparing ──
  async markPreparing(orderId: number, sellerId: number): Promise<Order> {
    const order = await this.getSellerOrder(orderId, sellerId);

    if (order.paymentStatus !== ('paid' as any)) {
      throw new BadRequestException('Cannot prepare unpaid order');
    }

    order.status = OrderStatus.PREPARING;
    return this.orderRepo.save(order);
  }

  // ── Seller (Direct): Upload shipment info ──
  async uploadShipmentInfo(
    orderId: number,
    sellerId: number,
    data: {
      trackingNumber: string;
      courierName: string;
      shipmentProofUrl?: string;
    },
  ): Promise<Order> {
    const order = await this.getSellerOrder(orderId, sellerId);

    if (order.shippingMethod !== 'direct') {
      throw new BadRequestException(
        'This order uses Agent delivery, not Direct shipping',
      );
    }

    if (!['preparing', 'paid'].includes(order.status)) {
      throw new BadRequestException(
        `Order status is ${order.status}, cannot ship`,
      );
    }

    order.trackingNumber = data.trackingNumber;
    order.courierName = data.courierName;
    order.shipmentProofUrl = data.shipmentProofUrl || null;
    order.shippedAt = new Date();
    order.status = OrderStatus.IN_TRANSIT;

    this.logger.log(
      `Order ${orderId} shipped via ${data.courierName}, tracking: ${data.trackingNumber}`,
    );
    return this.orderRepo.save(order);
  }

  // ── Agent: Mark as delivered ──
  async markDelivered(orderId: number, agentUserId: number): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.agentId !== String(agentUserId))
      throw new ForbiddenException('Not assigned to you');

    if (
      order.status !== OrderStatus.IN_TRANSIT &&
      order.status !== OrderStatus.READY_PICKUP
    ) {
      throw new BadRequestException(
        `Cannot mark delivered. Status: ${order.status}`,
      );
    }

    order.status = OrderStatus.DELIVERED;
    order.deliveredAt = new Date();
    order.escrowStatus = EscrowStatus.HOLDING;

    return this.orderRepo.save(order);
  }

  // ── Buyer: Confirm receipt → triggers fund release ──
  async buyerConfirmDelivery(orderId: number, buyerId: number): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    // ✅ Null-safe — offline orders may have no buyer User account
    if (!order.buyer || order.buyer.id !== buyerId) {
      throw new ForbiddenException('Access denied');
    }

    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException('Order not yet delivered');
    }

    order.status = OrderStatus.COMPLETED;
    order.completedAt = new Date();
    order.escrowStatus = EscrowStatus.RELEASED;
    order.fundsReleasedAt = new Date();
    order.paymentStatus = 'released' as any;

    this.logger.log(`Order ${orderId} completed. Funds released to seller.`);
    return this.orderRepo.save(order);
  }

  // ── Buyer: Open dispute ──
  async openDispute(
    orderId: number,
    buyerId: number,
    reason: string,
  ): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    // ✅ Null-safe — offline orders may have no buyer User account
    if (!order.buyer || order.buyer.id !== buyerId) {
      throw new ForbiddenException('Access denied');
    }

    if (!['delivered', 'in_transit', 'completed'].includes(order.status)) {
      throw new BadRequestException('Cannot dispute at this stage');
    }

    order.status = OrderStatus.DISPUTED;
    order.disputeReason = reason;
    order.disputeOpenedAt = new Date();
    order.escrowStatus = EscrowStatus.DISPUTED;

    this.logger.log(`Order ${orderId} disputed by buyer ${buyerId}: ${reason}`);
    return this.orderRepo.save(order);
  }

  // ── Admin: Resolve dispute ──
  async resolveDispute(
    orderId: number,
    resolution: 'release_to_seller' | 'refund_buyer',
  ): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    if (order.status !== OrderStatus.DISPUTED) {
      throw new BadRequestException('Order is not disputed');
    }

    if (resolution === 'release_to_seller') {
      order.status = OrderStatus.COMPLETED;
      order.escrowStatus = EscrowStatus.RELEASED;
      order.fundsReleasedAt = new Date();
      order.paymentStatus = 'released' as any;
    } else {
      order.status = OrderStatus.CANCELLED;
      order.escrowStatus = EscrowStatus.REFUNDED;
      order.paymentStatus = 'refunded' as any;
    }

    this.logger.log(`Dispute resolved for order ${orderId}: ${resolution}`);
    return this.orderRepo.save(order);
  }

  // ── Get order tracking info ──
  async getOrderTracking(orderId: number) {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    const timeline = this.buildTimeline(order);

    return {
      orderId: order.id,
      status: order.status,
      shippingMethod: order.shippingMethod,
      trackingNumber: order.trackingNumber,
      courierName: order.courierName,
      shipmentProofUrl: order.shipmentProofUrl,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      completedAt: order.completedAt,
      escrowStatus: order.escrowStatus,
      fundsReleasedAt: order.fundsReleasedAt,
      disputeReason: order.disputeReason,
      timeline,
      amounts: {
        total: Number(order.totalAmount),
        base: Number(order.baseAmount),
        delivery: 0,
        label: 'Free Delivery',
      },
    };
  }

  // ── Get seller orders ──
  async getSellerOrders(sellerId: number) {
    return this.orderRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.product', 'product')
      .leftJoinAndSelect('order.buyer', 'buyer')
      .leftJoinAndSelect('product.seller', 'seller')
      .where('seller.id = :sellerId', { sellerId })
      .orderBy('order.createdAt', 'DESC')
      .getMany();
  }

  // ── Auto-complete delivered orders after 7 days ──
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async autoCompleteDelivered() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const orders = await this.orderRepo
      .createQueryBuilder('order')
      .where('order.status = :status', { status: OrderStatus.DELIVERED })
      .andWhere('order.deliveredAt < :date', { date: sevenDaysAgo })
      .getMany();

    for (const order of orders) {
      order.status = OrderStatus.COMPLETED;
      order.completedAt = new Date();
      order.escrowStatus = EscrowStatus.RELEASED;
      order.fundsReleasedAt = new Date();
      order.paymentStatus = 'released' as any;
      await this.orderRepo.save(order);
      this.logger.log(`Auto-completed order ${order.id}`);
    }

    if (orders.length > 0) {
      this.logger.log(`Auto-completed ${orders.length} delivered orders`);
    }
  }

  // ── Helpers ──
  private async getSellerOrder(
    orderId: number,
    sellerId: number,
  ): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.seller?.id !== sellerId)
      throw new ForbiddenException('Not your order');
    return order;
  }

  private buildTimeline(order: Order) {
    const steps = [
      {
        status: 'pending_payment',
        label: 'Order Placed',
        icon: '🛒',
        done: true,
      },
      {
        status: 'paid',
        label: 'Payment Confirmed',
        icon: '💳',
        done: [
          'paid',
          'preparing',
          'ready_for_pickup',
          'in_transit',
          'delivered',
          'completed',
        ].includes(order.status),
      },
      {
        status: 'preparing',
        label: 'Seller Preparing',
        icon: '📦',
        done: [
          'preparing',
          'ready_for_pickup',
          'in_transit',
          'delivered',
          'completed',
        ].includes(order.status),
      },
      {
        status: 'in_transit',
        label: 'In Transit',
        icon: '🚚',
        done: ['in_transit', 'delivered', 'completed'].includes(order.status),
      },
      {
        status: 'delivered',
        label: 'Delivered',
        icon: '📬',
        done: ['delivered', 'completed'].includes(order.status),
      },
      {
        status: 'completed',
        label: 'Completed',
        icon: '✅',
        done: order.status === 'completed',
      },
    ];

    if (order.status === 'disputed') {
      steps.push({
        status: 'disputed',
        label: 'Under Dispute',
        icon: '⚠️',
        done: true,
      });
    }

    return steps;
  }
}
