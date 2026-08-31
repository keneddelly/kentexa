import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import {
  WarrantyRegistration,
  WarrantyRegistrationStatus,
} from './entities/warranty-registration.entity';
import { WarrantyClaim, WarrantyClaimStatus } from './entities/warranty-claim.entity';
import { WarrantyClaimAuditLog } from './entities/warranty-claim-audit-log.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { Product } from '../products/entities/products.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { BrandsService } from '../brands/brands.service';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';

@Injectable()
export class WarrantyService {
  private readonly logger = new Logger(WarrantyService.name);

  constructor(
    @InjectRepository(WarrantyRegistration) private repo: Repository<WarrantyRegistration>,
    @InjectRepository(WarrantyClaim) private claimRepo: Repository<WarrantyClaim>,
    @InjectRepository(WarrantyClaimAuditLog) private auditRepo: Repository<WarrantyClaimAuditLog>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    private brands: BrandsService,
    private notifications: InAppNotificationService,
    private activityEvents: ActivityEventService,
  ) {}

  // Manual, buyer-initiated only — never auto-created at order-delivery
  // time, keeping this fully out of OrdersService's transaction-critical
  // delivery/completion code path (same reasoning Phase D's serial
  // assignment already established). Idempotent: calling this again for
  // the same order just returns the existing registration.
  async register(
    orderId: number,
    user: User,
    opts: { serialNumber?: string } = {},
  ): Promise<WarrantyRegistration> {
    const existing = await this.repo.findOne({ where: { orderId } });
    if (existing) return existing;

    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: { buyer: true, seller: true, product: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.buyer || order.buyer.id !== user.id) {
      throw new ForbiddenException('This is not your order');
    }
    if (order.status !== OrderStatus.COMPLETED) {
      throw new BadRequestException('This order is not yet completed');
    }
    if (!order.product) {
      throw new BadRequestException('No warranty available for this product');
    }

    const brand = order.brandId ? await this.brands.findOne(order.brandId).catch(() => null) : null;
    const durationMonths = (order.product as any).warrantyMonths ?? brand?.defaultWarrantyMonths ?? null;
    if (!durationMonths) {
      throw new BadRequestException('No warranty available for this product');
    }

    const startDate = order.deliveredAt ?? order.completedAt ?? new Date();
    const expiresAt = new Date(startDate);
    expiresAt.setMonth(expiresAt.getMonth() + durationMonths);

    const registration = this.repo.create({
      orderId: order.id,
      productId: order.product.id,
      buyerId: user.id,
      sellerId: order.seller?.id,
      brandId: order.brandId,
      serialNumber: opts.serialNumber?.trim() || null,
      startDate,
      durationMonths,
      expiresAt,
      status: WarrantyRegistrationStatus.ACTIVE,
    });
    const saved = await this.repo.save(registration);

    this.activityEvents.record({
      eventType: 'WARRANTY_REGISTERED',
      category: ActivityCategory.COMMERCE,
      actorId: user.id,
      targetType: 'order',
      targetId: order.id,
      metadata: { registrationId: saved.id, brandId: order.brandId, durationMonths },
    });

    return saved;
  }

  async findMine(userId: number): Promise<WarrantyRegistration[]> {
    return this.repo.find({ where: { buyerId: userId }, order: { createdAt: 'DESC' } });
  }

  async findOne(id: number, user: User): Promise<WarrantyRegistration> {
    const registration = await this.repo.findOne({ where: { id } });
    if (!registration) throw new NotFoundException('Warranty registration not found');
    if (
      user.role !== UserRole.ADMIN &&
      registration.buyerId !== user.id &&
      registration.sellerId !== user.id
    ) {
      throw new ForbiddenException('You cannot view this warranty registration');
    }
    return registration;
  }

  async fileClaim(
    registrationId: number,
    user: User,
    dto: { reason: string; evidenceImages?: string[] },
  ): Promise<WarrantyClaim> {
    const registration = await this.repo.findOne({ where: { id: registrationId } });
    if (!registration) throw new NotFoundException('Warranty registration not found');
    if (registration.buyerId !== user.id) {
      throw new ForbiddenException('This is not your warranty registration');
    }
    if (registration.status !== WarrantyRegistrationStatus.ACTIVE) {
      throw new BadRequestException('This warranty is not active');
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException('A reason is required');
    }

    const claim = await this.claimRepo.save(
      this.claimRepo.create({
        registrationId,
        reason: dto.reason.trim(),
        evidenceImages: dto.evidenceImages?.length ? dto.evidenceImages : null,
        status: WarrantyClaimStatus.SUBMITTED,
        submittedBy: user.id,
      }),
    );

    await this.auditRepo.save(
      this.auditRepo.create({
        claim,
        previousStatus: 'none',
        newStatus: WarrantyClaimStatus.SUBMITTED,
        actorUserId: user.id,
        reason: null,
      }),
    );

    this.activityEvents.record({
      eventType: 'WARRANTY_CLAIM_FILED',
      category: ActivityCategory.COMMERCE,
      actorId: user.id,
      targetType: 'warranty_registration',
      targetId: registrationId,
      relatedUserId: registration.sellerId,
      metadata: { claimId: claim.id },
    });

    this.notifications
      .notify({
        userId: registration.sellerId,
        type: 'warranty_claim_filed',
        title: 'New warranty claim',
        body: 'A customer filed a warranty claim on one of your sales.',
        actionPage: 'SellerWarrantyClaims',
        actionParam: String(registrationId),
      })
      .catch(() => {});

    return claim;
  }

  async getClaims(registrationId: number, user: User): Promise<WarrantyClaim[]> {
    const registration = await this.findOne(registrationId, user);
    return this.claimRepo.find({
      where: { registrationId: registration.id },
      order: { createdAt: 'DESC' },
    });
  }

  // sellerId here is the already-resolved caller (SellerScopeService.resolve()
  // in the controller) — checked against the registration's own snapshotted
  // sellerId, same ownership shape ProductsService.createVariant() uses
  // against product.seller.id.
  async reviewClaim(
    claimId: number,
    caller: { id: number; role: UserRole },
    dto: { status: WarrantyClaimStatus; resolution?: string },
  ): Promise<WarrantyClaim> {
    const claim = await this.claimRepo.findOne({ where: { id: claimId } });
    if (!claim) throw new NotFoundException('Warranty claim not found');
    const registration = await this.repo.findOne({ where: { id: claim.registrationId } });
    if (!registration) throw new NotFoundException('Warranty registration not found');

    if (caller.role !== UserRole.ADMIN && registration.sellerId !== caller.id) {
      throw new ForbiddenException('You cannot review this claim');
    }
    if (
      ![
        WarrantyClaimStatus.UNDER_REVIEW,
        WarrantyClaimStatus.APPROVED,
        WarrantyClaimStatus.REJECTED,
        WarrantyClaimStatus.RESOLVED,
      ].includes(dto.status)
    ) {
      throw new BadRequestException('Invalid claim status');
    }

    const previousStatus = claim.status;
    claim.status = dto.status;
    claim.reviewedBy = caller.id;
    claim.reviewedAt = new Date();
    claim.resolution = dto.resolution?.trim() || null;
    const saved = await this.claimRepo.save(claim);

    await this.auditRepo.save(
      this.auditRepo.create({
        claim: saved,
        previousStatus,
        newStatus: saved.status,
        actorUserId: caller.id,
        reason: dto.resolution || null,
      }),
    );

    this.notifications
      .notify({
        userId: registration.buyerId,
        type: `warranty_claim_${saved.status}`,
        title: 'Warranty claim update',
        body: `Your warranty claim was marked "${saved.status.replace(/_/g, ' ')}".`,
        actionPage: 'MyWarranties',
        actionParam: String(registration.id),
      })
      .catch(() => {});

    return saved;
  }

  async findAllClaimsAdmin(): Promise<WarrantyClaim[]> {
    return this.claimRepo.find({ order: { createdAt: 'DESC' } });
  }

  // Full audit trail for one claim — spec §24's "Audit — full history"
  // admin capability, same as BrandAuthorizationsService.getAuditLog().
  // Raw actorUserId, not resolved to a name — no User repo in this
  // service, and the admin can already cross-reference ids elsewhere.
  async getClaimAudit(claimId: number): Promise<WarrantyClaimAuditLog[]> {
    return this.auditRepo.find({
      where: { claim: { id: claimId } },
      order: { createdAt: 'ASC' },
    });
  }

  // Layer 2 building block for BrandDashboardService — the metric Phase C's
  // own comment said was intentionally missing until this system existed.
  async countForBrand(brandId: number): Promise<number> {
    return this.repo.count({ where: { brandId } });
  }

  // Daily sweep, same shape as BrandAuthorizationsService.expireOverdueAuthorizations().
  @Cron('0 3 * * *')
  async expireOverdueRegistrations(): Promise<void> {
    const result = await this.repo.update(
      { status: WarrantyRegistrationStatus.ACTIVE, expiresAt: LessThan(new Date()) },
      { status: WarrantyRegistrationStatus.EXPIRED },
    );
    if (result.affected) {
      this.logger.log(`Auto-expired ${result.affected} warranty registration(s)`);
    }
  }
}
