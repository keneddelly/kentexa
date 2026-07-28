import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payout, PayoutStatus } from './entities/payout.entity';
import {
  Order,
  PayoutStatus as OrderPayoutStatus,
  PaymentStatus,
} from '../orders/entities/order.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class PayoutsService {
  constructor(
    @InjectRepository(Payout)
    private payoutRepo: Repository<Payout>,

    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
  ) {}

  // ─── Admin: Get all pending payouts ──────────────────────────────────────
  async getAllPending() {
    return this.payoutRepo.find({
      where: { status: PayoutStatus.PENDING },
      order: { createdAt: 'DESC' },
      relations: { seller: true, order: { product: true } },
    });
  }

  // ─── Admin: Get all payouts ───────────────────────────────────────────────
  async getAll() {
    return this.payoutRepo.find({
      order: { createdAt: 'DESC' },
      relations: { seller: true, order: { product: true } },
    });
  }

  // ─── Admin: Get payouts by seller ─────────────────────────────────────────
  async getBySeller(sellerId: number) {
    return this.payoutRepo.find({
      where: { seller: { id: sellerId } },
      order: { createdAt: 'DESC' },
      relations: { order: { product: true } },
    });
  }

  // ─── Admin: Trigger payout for one order ─────────────────────────────────
  async processPayout(
    orderId: number,
    paymentMethod: string,
    transactionReference: string,
    notes?: string,
  ) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: { seller: true, product: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.paymentStatus !== PaymentStatus.PAID) {
      throw new BadRequestException('Order has not been paid yet');
    }
    if (order.payoutStatus === OrderPayoutStatus.PAID) {
      throw new BadRequestException('Payout already processed for this order');
    }
    if (!order.seller) {
      throw new BadRequestException(
        'This order has no seller (admin store order)',
      );
    }

    const payout = await this.payoutRepo.findOne({
      where: { order: { id: orderId } },
    });
    if (!payout)
      throw new NotFoundException('Payout record not found for this order');

    payout.status = PayoutStatus.PAID;
    payout.paidAt = new Date();
    payout.paymentMethod = paymentMethod;
    payout.transactionReference = transactionReference;
    payout.notes = notes ?? null;
    await this.payoutRepo.save(payout);

    order.payoutStatus = OrderPayoutStatus.PAID;
    await this.orderRepo.save(order);

    return payout;
  }

  // ─── Admin: Bulk payout for a seller (all pending) ────────────────────────
  async processBulkPayout(
    sellerId: number,
    paymentMethod: string,
    transactionReference: string,
    notes?: string,
  ) {
    const pending = await this.payoutRepo.find({
      where: { seller: { id: sellerId }, status: PayoutStatus.PENDING },
      relations: { order: true },
    });
    if (pending.length === 0) {
      throw new BadRequestException('No pending payouts for this seller');
    }

    const now = new Date();
    for (const payout of pending) {
      payout.status = PayoutStatus.PAID;
      payout.paidAt = now;
      payout.paymentMethod = paymentMethod;
      payout.transactionReference = transactionReference;
      payout.notes = notes ?? null;
      await this.payoutRepo.save(payout);

      await this.orderRepo.update(payout.order.id, {
        payoutStatus: OrderPayoutStatus.PAID,
      });
    }

    const totalPaid = pending.reduce((s, p) => s + Number(p.sellerAmount), 0);
    return {
      message: `${pending.length} payouts processed`,
      totalPaid,
      count: pending.length,
    };
  }

  // ─── Seller: Get my payouts ───────────────────────────────────────────────
  async getMyPayouts(user: User) {
    const payouts = await this.payoutRepo.find({
      where: { seller: { id: user.id } },
      order: { createdAt: 'DESC' },
      relations: { order: { product: true, buyer: true } },
    });

    const totalEarned = payouts
      .filter((p) => p.status === PayoutStatus.PAID)
      .reduce((s, p) => s + Number(p.sellerAmount), 0);

    const totalPending = payouts
      .filter((p) => p.status === PayoutStatus.PENDING)
      .reduce((s, p) => s + Number(p.sellerAmount), 0);

    return { payouts, totalEarned, totalPending };
  }
}
