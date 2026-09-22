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
import { User } from '../users/entities/user.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DisputesService } from '../disputes/disputes.service';
import {
  DisputeReason,
  DisputeResolution,
} from '../disputes/entities/dispute.entity';
import { SellerScopeService, SellerScope, workspacePartition } from '../business/seller-scope.service';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { RoleContext } from '../role-context/role-context.types';
import { PaymentEvidenceService } from '../payments/payment-evidence.service';
import { ownershipFlag } from '../ownership/ownership-feature-flags.service';
import { OrderReleaseService } from '../money-routing/order-release.service';
import { MoneyRoutingBlockedException } from '../money-routing/order-routing-target';

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
    private disputesService: DisputesService,
    private sellerScope: SellerScopeService,
    private paymentEvidence: PaymentEvidenceService,
    private orderRelease: OrderReleaseService,
  ) {}

  // ── Seller: Mark order as preparing ──
  // S0: the mutable paymentStatus column stays the cheap first check, but a
  // checkout order additionally needs verified PaymentEvidence — closing
  // the path where a forged/self-set paymentStatus alone could move an
  // unpaid order into fulfilment (see the checkout/payment integrity audit).
  async markPreparing(orderId: number, sellerId: number): Promise<Order> {
    const order = await this.getSellerOrder(orderId, sellerId);

    if (order.paymentStatus !== ('paid' as any)) {
      throw new BadRequestException('Cannot prepare unpaid order');
    }
    const evidence = await this.paymentEvidence.check({
      id: order.id,
      source: order.source,
      paymentMethod: order.paymentMethod,
      totalAmount: order.totalAmount,
      codUpfrontAmount: (order as any).codUpfrontAmount,
    });
    if (evidence.applicable && !evidence.sufficient) {
      throw new BadRequestException('Cannot prepare an order without verified payment evidence');
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

    // I2G: the ONE canonical release (guard -> seller-proceeds routing -> release state, atomically).
    await this.orderRelease.releaseSellerProceeds({
      orderId,
      source: 'ESCROW_RELEASE',
      orderUpdate: { status: OrderStatus.COMPLETED, completedAt: new Date(), paymentStatus: 'released' },
    });
    this.logger.log(`Order ${orderId} completed. Funds released to seller.`);
    return (await this.orderRepo.findOne({ where: { id: orderId } })) as Order;
  }

  // ── Buyer: Open dispute ──
  // Delegates to DisputesService.raise() rather than mutating the order
  // directly — this used to be a second, disconnected dispute mechanism
  // with no Dispute row at all, so a dispute opened here never showed up
  // in the real disputes admin dashboard. Now there's exactly one path.
  async openDispute(
    orderId: number,
    buyer: User,
    reason: string,
  ): Promise<{ disputeId: number; message: string }> {
    return this.disputesService.raise(buyer, {
      orderId,
      reason: DisputeReason.OTHER,
      description: reason,
    });
  }

  // ── Admin: Resolve dispute ──
  async resolveDispute(
    orderId: number,
    admin: User,
    resolution: 'release_to_seller' | 'refund_buyer',
  ): Promise<{ message: string; resolution: DisputeResolution }> {
    const mapped =
      resolution === 'release_to_seller'
        ? DisputeResolution.FAVOUR_SELLER
        : DisputeResolution.FAVOUR_BUYER;
    return this.disputesService.resolveByOrder(
      admin,
      orderId,
      mapped,
      `Resolved via shipping admin panel: ${resolution}`,
    );
  }

  // ── Get order tracking info ──
  // Every other lookup in this service scopes by buyer/seller ownership —
  // this one didn't, so any logged-in user could pull any order's tracking
  // (incl. escrow/dispute state) by ID-guessing. requestingUser is optional
  // only so existing internal callers keep working; the controller always
  // passes it.
  async getOrderTracking(
    orderId: number,
    requestingUser?: User,
    roleContext?: RoleContext,
  ) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: { buyer: true, seller: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (requestingUser) {
      const isOwner =
        order.buyer?.id === requestingUser.id ||
        order.seller?.id === requestingUser.id;
      const isAdmin =
        roleContext?.roleType === AccountRoleType.ADMIN ||
        roleContext?.roleType === AccountRoleType.MANAGER;
      const isAuthorizedStaff =
        !isOwner &&
        !isAdmin &&
        order.seller?.id &&
        (await this.sellerScope.isAuthorizedFor(
          requestingUser,
          order.seller.id,
          'canViewOrders',
        ));
      if (!isOwner && !isAdmin && !isAuthorizedStaff) {
        throw new ForbiddenException(
          'You do not have access to this order.',
        );
      }
    }

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
  async getSellerOrders(sellerId: number, scope?: SellerScope) {
    const part = workspacePartition(scope, 'order."workspaceId"', ownershipFlag('ORDER_WORKSPACE_ENFORCE'));
    return this.orderRepo
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.product', 'product')
      .leftJoinAndSelect('order.buyer', 'buyer')
      .leftJoinAndSelect('product.seller', 'seller')
      .where('seller.id = :sellerId', { sellerId })
      .andWhere(part ? part.clause : '1=1', part?.params ?? {})
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

    let completed = 0;
    for (const order of orders) {
      try {
        // I2G: canonical release; an unroutable order stays delivered/unreleased (BLOCKED entry recorded).
        await this.orderRelease.releaseSellerProceeds({
          orderId: order.id,
          source: 'AUTO_RELEASE',
          orderUpdate: { status: OrderStatus.COMPLETED, completedAt: new Date(), paymentStatus: 'released' },
        });
        completed += 1;
        this.logger.log(`Auto-completed order ${order.id}`);
      } catch (e) {
        if (e instanceof MoneyRoutingBlockedException) {
          this.logger.warn(`Auto-complete held for order ${order.id}: ${e.reason}`);
        } else {
          this.logger.error(`Auto-complete failed for order ${order.id}: ${(e as Error).message}`);
        }
      }
    }

    if (completed > 0) {
      this.logger.log(`Auto-completed ${completed} delivered orders`);
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
