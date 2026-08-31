import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, LessThan, Repository } from 'typeorm';
import { v2 as cloudinary } from 'cloudinary';
import {
  BusinessBrandAuthorization,
  BrandAuthorizationStatus,
} from './entities/business-brand-authorization.entity';
import { BrandAuthorizationEvidence } from './entities/brand-authorization-evidence.entity';
import { BrandAuthorizationAuditLog } from './entities/brand-authorization-audit-log.entity';
import { Brand } from './entities/brand.entity';
import { CommerceProfile } from '../commerce-profiles/entities/commerce-profile.entity';
import { CommerceProfileScopeService } from '../commerce-profiles/commerce-profile-scope.service';
import { User } from '../users/entities/user.entity';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { SmsService } from '../sms/sms.service';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';

export type BrandBadge = 'brand_authorized' | 'kentexa_verified' | null;

const EXPIRING_SOON_DAYS = 7;

@Injectable()
export class BrandAuthorizationsService {
  private readonly logger = new Logger(BrandAuthorizationsService.name);

  constructor(
    @InjectRepository(BusinessBrandAuthorization) private repo: Repository<BusinessBrandAuthorization>,
    @InjectRepository(BrandAuthorizationEvidence) private evidenceRepo: Repository<BrandAuthorizationEvidence>,
    @InjectRepository(BrandAuthorizationAuditLog) private auditRepo: Repository<BrandAuthorizationAuditLog>,
    @InjectRepository(CommerceProfile) private profileRepo: Repository<CommerceProfile>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private profileScope: CommerceProfileScopeService,
    private notifications: InAppNotificationService,
    private sms: SmsService,
    private activityEvents: ActivityEventService,
  ) {}

  // ── Shared: write the audit row + activity event every transition needs.
  // Never called without also having just saved the new status — no
  // caller is allowed to change `status` without going through here.
  private async recordTransition(
    authorization: BusinessBrandAuthorization,
    previousStatus: string,
    actorUserId: number | null,
    reason: string | null,
  ): Promise<void> {
    await this.auditRepo.save(
      this.auditRepo.create({
        authorization,
        previousStatus,
        newStatus: authorization.status,
        actorUserId,
        reason,
      }),
    );
    this.activityEvents.record({
      eventType: `BRAND_AUTHORIZATION_${authorization.status.toUpperCase()}`,
      category: ActivityCategory.VERIFICATION,
      actorId: actorUserId,
      actorType: actorUserId ? 'user' : 'system',
      businessId: authorization.commerceProfileId,
      targetType: 'brand_authorization',
      targetId: authorization.id,
      metadata: { brandId: authorization.brand?.id, previousStatus, reason },
    });
  }

  private async notifyOwner(
    commerceProfileId: number,
    brandName: string,
    title: string,
    body: string,
    type: string,
  ): Promise<void> {
    const profile = await this.profileRepo.findOne({ where: { id: commerceProfileId } });
    if (!profile) return;
    await this.notifications
      .notify({
        userId: profile.ownerId,
        type,
        title,
        body,
        actionPage: 'MyBrands',
        actionParam: String(commerceProfileId),
        actionCommerceProfileId: commerceProfileId,
      })
      .catch(() => {});
    const owner = await this.userRepo.findOne({ where: { id: profile.ownerId } });
    if (owner?.phone) {
      this.sms.sendSms(owner.phone, `${title}: ${body}`).catch(() => {});
    }
  }

  // ── Seller: submit ──────────────────────────────────────────────────────
  async submit(
    userId: number,
    dto: {
      commerceProfileId: number;
      brandId: number;
      distributorId?: number;
      categoryScope?: string;
      modelScope?: string[];
      geographicScope?: string[];
      authorizationNumber?: string;
      issuedDate?: string;
      expiresAt?: string;
      verificationSource?: string;
    },
  ): Promise<BusinessBrandAuthorization> {
    await this.profileScope.requireAuthorized(
      userId,
      dto.commerceProfileId,
      'canManageBrandAuthorization',
    );

    const row = this.repo.create({
      commerceProfileId: dto.commerceProfileId,
      brand: { id: dto.brandId } as Brand,
      distributor: dto.distributorId ? ({ id: dto.distributorId } as any) : null,
      categoryScope: dto.categoryScope || null,
      modelScope: dto.modelScope || null,
      geographicScope: dto.geographicScope || null,
      authorizationNumber: dto.authorizationNumber || null,
      issuedDate: dto.issuedDate ? new Date(dto.issuedDate) : null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      verificationSource: dto.verificationSource || 'document_review',
      status: BrandAuthorizationStatus.PENDING,
      submittedBy: userId,
    });
    const saved = await this.repo.save(row);
    await this.recordTransition(saved, 'none', userId, 'submitted');
    return saved;
  }

  async addEvidence(
    userId: number,
    authorizationId: number,
    dto: { documentType: string; cloudinaryPublicId: string; format: string },
  ): Promise<BrandAuthorizationEvidence> {
    const authorization = await this.findOneOrThrow(authorizationId);
    await this.profileScope.requireAuthorized(
      userId,
      authorization.commerceProfileId,
      'canManageBrandAuthorization',
    );
    const evidence = this.evidenceRepo.create({
      authorization,
      documentType: dto.documentType,
      cloudinaryPublicId: dto.cloudinaryPublicId,
      format: dto.format,
      uploadedByUserId: userId,
    });
    return this.evidenceRepo.save(evidence);
  }

  async getSignedEvidenceUrl(
    userId: number,
    isAdmin: boolean,
    authorizationId: number,
    evidenceId: number,
  ): Promise<{ url: string; expiresAt: number }> {
    const authorization = await this.findOneOrThrow(authorizationId);
    if (!isAdmin) {
      await this.profileScope.requireAuthorized(
        userId,
        authorization.commerceProfileId,
        'canManageBrandAuthorization',
      );
    }
    const evidence = await this.evidenceRepo.findOne({
      where: { id: evidenceId, authorization: { id: authorizationId } },
    });
    if (!evidence) throw new NotFoundException('Evidence not found');

    const expiresAt = Math.floor(Date.now() / 1000) + 5 * 60;
    const url = cloudinary.utils.private_download_url(
      evidence.cloudinaryPublicId,
      evidence.format,
      { resource_type: 'raw', type: 'private', expires_at: expiresAt },
    );
    return { url, expiresAt };
  }

  async findMine(userId: number, commerceProfileId: number): Promise<BusinessBrandAuthorization[]> {
    await this.profileScope.requireAuthorized(userId, commerceProfileId);
    return this.repo.find({
      where: { commerceProfileId },
      relations: { brand: true, distributor: true },
      order: { createdAt: 'DESC' },
    });
  }

  private async findOneOrThrow(id: number): Promise<BusinessBrandAuthorization> {
    const row = await this.repo.findOne({ where: { id }, relations: { brand: true, distributor: true } });
    if (!row) throw new NotFoundException('Authorization request not found');
    return row;
  }

  // ── Admin ────────────────────────────────────────────────────────────────
  async findAllAdmin(status?: string): Promise<BusinessBrandAuthorization[]> {
    return this.repo.find({
      where: status ? { status: status as BrandAuthorizationStatus } : {},
      relations: { brand: true, distributor: true },
      order: { createdAt: 'DESC' },
    });
  }

  private async transition(
    id: number,
    admin: User,
    newStatus: BrandAuthorizationStatus,
    reason: string | null,
    requireReason: boolean,
    extra?: Partial<BusinessBrandAuthorization>,
  ): Promise<BusinessBrandAuthorization> {
    if (requireReason && !reason?.trim()) {
      throw new BadRequestException('A reason is required for this action');
    }
    const row = await this.findOneOrThrow(id);
    const previousStatus = row.status;
    row.status = newStatus;
    row.statusReason = reason || null;
    if (newStatus === BrandAuthorizationStatus.APPROVED) {
      row.reviewedBy = admin.id;
      row.reviewedAt = new Date();
    }
    if (extra) Object.assign(row, extra);
    const saved = await this.repo.save(row);
    await this.recordTransition(saved, previousStatus, admin.id, reason);

    const brandName = saved.brand?.name || 'the brand';
    const messages: Partial<Record<BrandAuthorizationStatus, [string, string]>> = {
      [BrandAuthorizationStatus.APPROVED]: ['Brand authorization approved', `Your ${brandName} authorization is now active.`],
      [BrandAuthorizationStatus.REJECTED]: ['Brand authorization rejected', `Your ${brandName} authorization request was rejected. ${reason || ''}`],
      [BrandAuthorizationStatus.SUSPENDED]: ['Brand authorization suspended', `Your ${brandName} authorization has been suspended. ${reason || ''}`],
      [BrandAuthorizationStatus.REVOKED]: ['Brand authorization revoked', `Your ${brandName} authorization has been revoked. ${reason || ''}`],
    };
    const msg = messages[newStatus];
    if (msg) {
      await this.notifyOwner(saved.commerceProfileId, brandName, msg[0], msg[1], `brand_authorization_${newStatus}`);
    }
    return saved;
  }

  approve(id: number, admin: User) {
    return this.transition(id, admin, BrandAuthorizationStatus.APPROVED, null, false);
  }

  reject(id: number, admin: User, reason: string) {
    return this.transition(id, admin, BrandAuthorizationStatus.REJECTED, reason, true);
  }

  suspend(id: number, admin: User, reason: string) {
    return this.transition(id, admin, BrandAuthorizationStatus.SUSPENDED, reason, true);
  }

  revoke(id: number, admin: User, reason: string) {
    return this.transition(id, admin, BrandAuthorizationStatus.REVOKED, reason, true);
  }

  // Renewal extends expiresAt on the existing row rather than creating a
  // duplicate — the audit trail (a fresh APPROVED transition row) is
  // enough to show it was renewed, no separate "renewal" entity needed.
  renew(id: number, admin: User, newExpiresAt: string) {
    return this.transition(
      id,
      admin,
      BrandAuthorizationStatus.APPROVED,
      'renewed',
      false,
      { expiresAt: newExpiresAt ? new Date(newExpiresAt) : null },
    );
  }

  // ── Badge computation — never stored, always computed fresh from live
  // status + scope, mirroring VerificationService.getLevel()'s own
  // "compute fresh, never cache" convention. A client can never submit
  // authorized:true and have it accepted; this is the only path that
  // decides it, and every caller (products.service.ts's read
  // serialization, this module's own badge-status endpoint) goes through
  // here. ─────────────────────────────────────────────────────────────────
  async getBadgeStatus(
    commerceProfileId: number,
    opts: { brandId?: number; category?: string; model?: string; city?: string } = {},
  ): Promise<{ badge: BrandBadge; authorization: BusinessBrandAuthorization | null }> {
    const profile = await this.profileRepo.findOne({ where: { id: commerceProfileId } });
    const kentexaVerified: BrandBadge = profile?.isVerified ? 'kentexa_verified' : null;

    if (!opts.brandId) return { badge: kentexaVerified, authorization: null };

    const candidates = await this.repo.find({
      where: { commerceProfileId, brand: { id: opts.brandId }, status: BrandAuthorizationStatus.APPROVED },
      relations: { brand: true, distributor: true },
    });

    const now = Date.now();
    const active = candidates.find((row) => {
      if (row.expiresAt && new Date(row.expiresAt).getTime() <= now) return false;
      if (row.categoryScope && opts.category && row.categoryScope !== opts.category) return false;
      if (row.modelScope?.length && opts.model && !row.modelScope.includes(opts.model)) return false;
      if (row.geographicScope?.length && opts.city && !row.geographicScope.includes(opts.city)) return false;
      return true;
    });

    if (active) return { badge: 'brand_authorized', authorization: active };
    return { badge: kentexaVerified, authorization: null };
  }

  // ── Daily sweep: flip overdue APPROVED rows to EXPIRED, notify. Same
  // @Cron precedent already used in orders.service.ts. ────────────────────
  @Cron('0 2 * * *')
  async expireOverdueAuthorizations(): Promise<void> {
    const overdue = await this.repo.find({
      where: { status: BrandAuthorizationStatus.APPROVED, expiresAt: LessThan(new Date()) },
      relations: { brand: true },
    });
    for (const row of overdue) {
      const previousStatus = row.status;
      row.status = BrandAuthorizationStatus.EXPIRED;
      const saved = await this.repo.save(row);
      await this.recordTransition(saved, previousStatus, null, 'auto-expired');
      await this.notifyOwner(
        saved.commerceProfileId,
        saved.brand?.name || 'the brand',
        'Brand authorization expired',
        `Your ${saved.brand?.name || 'brand'} authorization has expired.`,
        'brand_authorization_expired',
      ).catch(() => {});
    }
    if (overdue.length) {
      this.logger.log(`Auto-expired ${overdue.length} brand authorization(s)`);
    }

    // A day-wide window, not "less than N days away" — this cron runs
    // daily, so an unbounded LessThan() would re-notify every single day
    // for the whole week before expiry instead of once.
    const windowStart = new Date(Date.now() + (EXPIRING_SOON_DAYS - 1) * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(Date.now() + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000);
    const expiringSoon = await this.repo.find({
      where: { status: BrandAuthorizationStatus.APPROVED, expiresAt: Between(windowStart, windowEnd) },
      relations: { brand: true },
    });
    for (const row of expiringSoon) {
      await this.notifyOwner(
        row.commerceProfileId,
        row.brand?.name || 'the brand',
        'Brand authorization expiring soon',
        `Your ${row.brand?.name || 'brand'} authorization expires within ${EXPIRING_SOON_DAYS} days.`,
        'brand_authorization_expiring_soon',
      ).catch(() => {});
    }
  }
}
