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
import { PaymentEvidenceService } from '../payments/payment-evidence.service';
import { SellerScope, workspacePartition } from '../business/seller-scope.service';
import { ownershipFlag } from '../ownership/ownership-feature-flags.service';

@Injectable()
export class PayoutsService {
  constructor(
    @InjectRepository(Payout)
    private payoutRepo: Repository<Payout>,

    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
    private paymentEvidence: PaymentEvidenceService,
  ) {}

  // S0 — the individual and bulk payout paths must apply the SAME
  // eligibility rule; the audit found bulk skipping this check entirely.
  // paymentStatus is checked first (cheap, catches the common legitimate
  // case), then PaymentEvidence backstops it for checkout orders so a
  // forged/self-set paymentStatus can't reach a real payout either.
  private async assertPayoutEligible(order: Order): Promise<void> {
    if (order.paymentStatus !== PaymentStatus.PAID) {
      throw new BadRequestException(`Order #${order.id} has not been paid yet`);
    }
    const evidence = await this.paymentEvidence.check({
      id: order.id,
      source: order.source,
      paymentMethod: order.paymentMethod,
      totalAmount: order.totalAmount,
      codUpfrontAmount: (order as any).codUpfrontAmount,
    });
    if (evidence.applicable && !evidence.sufficient) {
      throw new BadRequestException(`Order #${order.id} does not have verified payment evidence for a payout`);
    }
  }

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
    await this.assertPayoutEligible(order);
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
    const processed: typeof pending = [];
    const skipped: Array<{ orderId: number; reason: string }> = [];
    for (const payout of pending) {
      try {
        await this.assertPayoutEligible(payout.order);
      } catch (err: any) {
        // S0 fix: bulk payout previously had NO eligibility check at all (unlike processPayout) —
        // an ineligible order in the batch is now skipped and reported, never silently paid out.
        skipped.push({ orderId: payout.order.id, reason: err.message || 'not eligible' });
        continue;
      }

      payout.status = PayoutStatus.PAID;
      payout.paidAt = now;
      payout.paymentMethod = paymentMethod;
      payout.transactionReference = transactionReference;
      payout.notes = notes ?? null;
      await this.payoutRepo.save(payout);

      await this.orderRepo.update(payout.order.id, {
        payoutStatus: OrderPayoutStatus.PAID,
      });
      processed.push(payout);
    }

    if (processed.length === 0) {
      throw new BadRequestException(`None of the ${pending.length} pending payouts for this seller are eligible right now`);
    }

    const totalPaid = processed.reduce((s, p) => s + Number(p.sellerAmount), 0);
    return {
      message: `${processed.length} payouts processed${skipped.length ? `, ${skipped.length} skipped` : ''}`,
      totalPaid,
      count: processed.length,
      skipped,
    };
  }

  // ─── Seller: Get my payouts ───────────────────────────────────────────────
  // commerceProfileId scopes payouts to one specific business — otherwise
  // (the default) an account running more than one business sees every
  // payout across all of them merged together (profile-architecture-
  // audit-2026-08 Stage 6). Legacy orders with no commerceProfileId of
  // their own still show up, same NULL-fallback rule used everywhere else.
  async getMyPayouts(user: User, commerceProfileId?: number, scope?: SellerScope) {
    const qb = this.payoutRepo
      .createQueryBuilder('payout')
      .leftJoinAndSelect('payout.seller', 'seller')
      .leftJoinAndSelect('payout.order', 'order')
      .leftJoinAndSelect('order.product', 'product')
      .leftJoinAndSelect('order.buyer', 'buyer')
      .where('payout."sellerId" = :sid', { sid: user.id })
      .orderBy('payout.createdAt', 'DESC');
    // I2G: a payout inherits its workspace through its order (never carries its own column).
    const part = workspacePartition(scope, 'order."workspaceId"', ownershipFlag('ORDER_WORKSPACE_ENFORCE'));
    if (part) qb.andWhere(part.clause, part.params);
    if (commerceProfileId) {
      qb.andWhere(
        '(order."commerceProfileId" = :cpid OR order."commerceProfileId" IS NULL)',
        { cpid: commerceProfileId },
      );
    }
    const payouts = await qb.getMany();

    const totalEarned = payouts
      .filter((p) => p.status === PayoutStatus.PAID)
      .reduce((s, p) => s + Number(p.sellerAmount), 0);

    const totalPending = payouts
      .filter((p) => p.status === PayoutStatus.PENDING)
      .reduce((s, p) => s + Number(p.sellerAmount), 0);

    return { payouts, totalEarned, totalPending };
  }
}
