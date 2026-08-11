import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Dispute,
  DisputeStatus,
  DisputeResolution,
  DisputeReason,
} from './entities/dispute.entity';
import {
  Order,
  OrderStatus,
  EscrowStatus,
} from '../orders/entities/order.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { mergeActiveRole } from '../users/utils/merge-active-role.util';
import { SmsService } from '../sms/sms.service';

@Injectable()
export class DisputesService {
  constructor(
    @InjectRepository(Dispute) private disputeRepo: Repository<Dispute>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private smsService: SmsService,
  ) {}

  // ── Buyer/Seller: raise a dispute ────────────────────────────────────────

  async raise(
    user: User,
    dto: {
      orderId: number;
      reason: DisputeReason;
      description: string;
      evidencePhotos?: string[];
    },
  ) {
    const order = await this.orderRepo.findOne({
      where: { id: dto.orderId },
      relations: { buyer: true, seller: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    // Only buyer or seller can raise
    const isBuyer = order.buyer?.id === user.id;
    const isSeller = order.seller?.id === user.id;
    if (!isBuyer && !isSeller) throw new ForbiddenException('Not your order');

    // Can only dispute delivered or in-transit orders
    if (
      !['delivered', 'in_transit', 'preparing', 'completed'].includes(
        order.status,
      )
    ) {
      throw new BadRequestException(
        `Cannot dispute order in status: ${order.status}`,
      );
    }

    // Check if dispute already exists for this order
    const existing = await this.disputeRepo.findOne({
      where: { order: { id: dto.orderId } },
    });
    if (existing && existing.status !== DisputeStatus.CLOSED) {
      throw new BadRequestException('A dispute already exists for this order');
    }

    // Freeze escrow
    await this.orderRepo.update(dto.orderId, {
      status: OrderStatus.DISPUTED,
      escrowStatus: EscrowStatus.DISPUTED,
      disputedAt: new Date(),
    });

    const dispute = await this.disputeRepo.save(
      this.disputeRepo.create({
        order: { id: dto.orderId } as any,
        raisedBy: user,
        arbitrator: null,
        status: DisputeStatus.OPEN,
        reason: dto.reason,
        description: dto.description,
        evidencePhotos: dto.evidencePhotos || null,
      } as any),
    );

    // Notify both parties
    const other = isBuyer ? order.seller : order.buyer;
    if (other?.phone) {
      await this.smsService
        .sendSms(
          other.phone,
          `KenteXa: Tatizo limewasilishwa kwa Agizo #${dto.orderId}. ` +
            `Timu ya KenteXa itaangalia na kuwasiliana nawe. ` +
            `Escrow imesimamishwa mpaka tatizo lisuluhishwe.`,
        )
        .catch(() => {});
    }

    // Notify admin via SMS to the KenteXa support number
    await this.smsService
      .sendSms(
        process.env.SUPPORT_PHONE || '+255788075633',
        `⚠️ Dispute mpya: Agizo #${dto.orderId} — ${dto.reason} — ${user.name}`,
      )
      .catch(() => {});

    return {
      disputeId: (dispute as any).id,
      message: 'Tatizo limewasilishwa. Tutawasiliana nawe hivi karibuni.',
    };
  }

  // ── Seller: respond to dispute ───────────────────────────────────────────

  async sellerRespond(user: User, disputeId: number, response: string) {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId },
      relations: { order: { seller: true, buyer: true } },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.order.seller?.id !== user.id)
      throw new ForbiddenException('Not your dispute');
    if (dispute.status === DisputeStatus.RESOLVED)
      throw new BadRequestException('Already resolved');

    await this.disputeRepo.update(disputeId, {
      sellerResponse: response,
    });
    return { message: 'Majibu yako yamewasilishwa' };
  }

  // ── Buyer: get their disputes ────────────────────────────────────────────

  async getMyDisputes(user: User) {
    return this.disputeRepo.find({
      where: { raisedBy: { id: user.id } },
      relations: { order: { product: true, seller: true } },
      order: { createdAt: 'DESC' },
    });
  }

  // ── Admin: get all disputes ──────────────────────────────────────────────

  async getAll(filters?: { status?: string }) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;

    return this.disputeRepo.find({
      where,
      relations: {
        order: { buyer: true, seller: true, product: true },
        raisedBy: true,
        arbitrator: true,
      },
      order: { createdAt: 'DESC' },
    });
  }

  // ── Admin: assign arbitrator ─────────────────────────────────────────────
  // Future: admin picks a trusted Super Agent from a different region.
  // For now: admin assigns any user with arbitrator role.

  async assignArbitrator(disputeId: number, arbitratorId: number) {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId },
      relations: { order: true },
    });
    const arbitrator = await this.userRepo.findOne({
      where: { id: arbitratorId },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (!arbitrator) throw new NotFoundException('User not found');

    // Grant arbitrator as an additional role rather than overwriting the
    // user's primary role — the previous version clobbered `role` directly,
    // so assigning a seller as arbitrator silently stripped their seller
    // access. Matches the pattern used by service-providers/transport for
    // exactly this situation.
    if (
      arbitrator.role !== UserRole.ARBITRATOR &&
      arbitrator.role !== UserRole.ADMIN
    ) {
      await this.userRepo.update(arbitratorId, {
        activeRoles: mergeActiveRole(
          arbitrator.activeRoles,
          UserRole.ARBITRATOR,
        ),
      });
    }

    await this.disputeRepo.update(disputeId, {
      arbitrator: { id: arbitratorId },
      status: DisputeStatus.REVIEWING,
      assignedAt: new Date(),
    });

    // Notify arbitrator
    if (arbitrator.phone) {
      await this.smsService
        .sendSms(
          arbitrator.phone,
          `KenteXa: Umepewa tatizo la Agizo #${dispute.order.id} kwa uamuzi. ` +
            `Ingia kwenye mfumo wa KenteXa kuona maelezo kamili.`,
        )
        .catch(() => {});
    }

    return {
      message: `Arbitrator ${arbitrator.name} amekabidhiwa tatizo hili`,
    };
  }

  // ── Admin/Arbitrator: resolve dispute ────────────────────────────────────

  async resolve(
    user: User,
    disputeId: number,
    dto: {
      resolution: DisputeResolution;
      resolutionNote: string;
      refundAmount?: number;
    },
  ) {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId },
      relations: {
        order: { buyer: true, seller: true },
        arbitrator: true,
        raisedBy: true,
      },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');

    // Only admin or assigned arbitrator can resolve
    const isAdmin =
      user.role === UserRole.ADMIN || user.role === UserRole.MANAGER;
    const isArbitrator = dispute.arbitrator?.id === user.id;
    if (!isAdmin && !isArbitrator)
      throw new ForbiddenException('Not authorised to resolve this dispute');

    // Apply resolution to order
    const orderUpdate: any = { status: 'completed', resolvedAt: new Date() };
    if (dto.resolution === DisputeResolution.FAVOUR_BUYER) {
      orderUpdate.escrowStatus = 'refunded';
      orderUpdate.payoutStatus = 'cancelled';
    } else if (dto.resolution === DisputeResolution.FAVOUR_SELLER) {
      orderUpdate.escrowStatus = 'released';
      orderUpdate.payoutStatus = 'released';
      orderUpdate.fundsReleasedAt = new Date();
    } else if (dto.resolution === DisputeResolution.SPLIT) {
      orderUpdate.escrowStatus = 'released';
      // Partial — handled manually by admin
    }

    await this.orderRepo.update(dispute.order.id, orderUpdate);
    await this.disputeRepo.update(disputeId, {
      status: DisputeStatus.RESOLVED,
      resolution: dto.resolution,
      resolutionNote: dto.resolutionNote,
      refundAmount: dto.refundAmount || null,
      resolvedAt: new Date(),
    });

    // Notify both parties
    const resolutionLabel =
      {
        [DisputeResolution.FAVOUR_BUYER]: 'kwa mnunuzi — malipo yatarudishwa',
        [DisputeResolution.FAVOUR_SELLER]: 'kwa muuzaji — pesa imetolewa',
        [DisputeResolution.SPLIT]: 'kwa makubaliano ya pande zote',
        [DisputeResolution.WITHDRAWN]: 'tatizo limeondolewa',
      }[dto.resolution] || dto.resolution;

    for (const person of [dispute.order.buyer, dispute.order.seller]) {
      if (person?.phone) {
        await this.smsService
          .sendSms(
            person.phone,
            `KenteXa: Tatizo la Agizo #${dispute.order.id} limetatuliwa ${resolutionLabel}. ` +
              `${dto.resolutionNote}`,
          )
          .catch(() => {});
      }
    }

    return { message: 'Tatizo limetatuliwa', resolution: dto.resolution };
  }

  // Order-keyed entry point for callers (shipping.service.ts) that only
  // know the order, not the dispute ID — resolves via the same resolve()
  // above so there's exactly one resolution code path.
  async resolveByOrder(
    user: User,
    orderId: number,
    resolution: DisputeResolution,
    resolutionNote: string,
  ) {
    const dispute = await this.disputeRepo.findOne({
      where: { order: { id: orderId } },
      order: { createdAt: 'DESC' },
    });
    if (
      !dispute ||
      ![DisputeStatus.OPEN, DisputeStatus.REVIEWING].includes(dispute.status)
    ) {
      throw new NotFoundException('No open dispute found for this order');
    }
    return this.resolve(user, dispute.id, { resolution, resolutionNote });
  }

  // ── Admin: get full dispute detail with custody chain ───────────────────

  async getDetail(disputeId: number) {
    const dispute = await this.disputeRepo.findOne({
      where: { id: disputeId },
      relations: {
        order: { buyer: true, seller: true, product: true },
        raisedBy: true,
        arbitrator: true,
      },
    });
    if (!dispute) throw new NotFoundException('Dispute not found');
    return dispute;
  }
}
