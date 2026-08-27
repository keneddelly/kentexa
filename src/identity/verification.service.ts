import { Injectable, Inject, ConflictException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import {
  IdentityProfile,
  IdentityVerificationStatus,
} from './entities/identity-profile.entity';
import { IdentityVerificationAudit } from './entities/identity-verification-audit.entity';
import { BusinessDocument } from './entities/business-document.entity';
import {
  SellerProfile,
  SellerStatus,
  SellerVerificationTier,
} from '../seller/entities/seller-profile.entity';
import { SuperAgent, SuperAgentStatus } from '../super-agents/entities/super-agent.entity';
import { Referral, ReferralStatus } from './entities/referral.entity';
import { ReferralReward } from './entities/referral-reward.entity';
import { Feature, FEATURE_REQUIREMENTS } from './verification.constants';
import type { IdentityVerificationProvider } from './providers/identity-verification-provider.interface';
import { IDENTITY_VERIFICATION_PROVIDER } from './identity.tokens';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';

const LEVEL_LABEL: Record<number, string> = {
  0: 'Basic Account',
  1: 'Verified Individual',
  2: 'Verified Seller',
  3: 'Trusted/Verified Business',
  4: 'Super Agent',
};

@Injectable()
export class VerificationService {
  constructor(
    @InjectRepository(IdentityProfile)
    private identityRepo: Repository<IdentityProfile>,
    @InjectRepository(IdentityVerificationAudit)
    private auditRepo: Repository<IdentityVerificationAudit>,
    @InjectRepository(SellerProfile)
    private sellerProfileRepo: Repository<SellerProfile>,
    @InjectRepository(SuperAgent)
    private superAgentRepo: Repository<SuperAgent>,
    @InjectRepository(BusinessDocument)
    private businessDocRepo: Repository<BusinessDocument>,
    @InjectRepository(Referral)
    private referralRepo: Repository<Referral>,
    @InjectRepository(ReferralReward)
    private referralRewardRepo: Repository<ReferralReward>,
    @Inject(IDENTITY_VERIFICATION_PROVIDER)
    private provider: IdentityVerificationProvider,
    private activityEvents: ActivityEventService,
  ) {}

  async getIdentityProfile(userId: number): Promise<IdentityProfile | null> {
    return this.identityRepo.findOne({ where: { user: { id: userId } } });
  }

  // 0-4, computed fresh every call from real records — never stored
  // redundantly, so there is nothing for a client to spoof (spec section
  // 32: identityVerified/sellerVerified/etc. must always be backend-derived).
  async getLevel(userId: number): Promise<number> {
    const identity = await this.getIdentityProfile(userId);
    const level1 =
      identity?.status === IdentityVerificationStatus.PENDING ||
      identity?.status === IdentityVerificationStatus.VERIFIED;
    if (!level1) return 0;

    const sellerProfile = await this.sellerProfileRepo.findOne({
      where: { user: { id: userId } },
    });
    const superAgent = await this.superAgentRepo.findOne({
      where: { user: { id: userId } },
    });

    if (superAgent?.status === SuperAgentStatus.ACTIVE) return 4;

    const level2 = sellerProfile?.status === SellerStatus.APPROVED;
    if (!level2) return 1;

    // Real business-document review (Phase 2), not the admin's old free-
    // text verificationTier choice — that field is now just a synced
    // display value (see reviewBusinessDocuments below), never the gate.
    const level3 =
      sellerProfile?.sellerType === 'business' &&
      sellerProfile?.businessDocumentsStatus === IdentityVerificationStatus.VERIFIED;
    if (level3) return 3;

    return 2;
  }

  async canUseFeature(userId: number, feature: Feature): Promise<boolean> {
    const level = await this.getLevel(userId);
    return level >= FEATURE_REQUIREMENTS[feature];
  }

  // Centralizes the check-then-throw pattern every gated controller needs
  // (classifieds/create, seller/apply, super-agents/apply, wallet/withdraw
  // each used to inline their own copy of this). Differentiates WHY a
  // caller is blocked so the frontend can route them correctly instead of
  // always showing "verify your identity": NOT_SUBMITTED/REJECTED are
  // genuinely an identity problem the VerifyIdentityModal flow fixes;
  // PENDING is never a reason to block on its own (it already satisfies
  // Level 1 — see getLevel()'s comment, a deliberate "pending counts"
  // policy, not an oversight); a level-1-clear user still short of a
  // HIGHER requirement (e.g. CREATE_PRODUCT needs an approved seller
  // application too) is missing something resubmitting NIDA can't fix, so
  // that gets its own distinct code rather than a misleading identity
  // prompt.
  async requireFeature(userId: number, feature: Feature): Promise<void> {
    const level = await this.getLevel(userId);
    const requiredLevel = FEATURE_REQUIREMENTS[feature];
    if (level >= requiredLevel) return;

    if (level === 0) {
      const identity = await this.getIdentityProfile(userId);
      if (identity?.status === IdentityVerificationStatus.REJECTED) {
        throw new ForbiddenException({
          code: 'VERIFICATION_REJECTED',
          requiredLevel,
          rejectionReason: identity.rejectionReason || null,
          message:
            'Your identity verification was rejected. Please resubmit your NIDA details.',
        });
      }
      throw new ForbiddenException({
        code: 'VERIFICATION_REQUIRED',
        requiredLevel,
        message: 'Verify your identity before continuing on Kentexa.',
      });
    }

    // Identity itself is fine — the missing piece is an approved seller
    // application. Two genuinely different situations share this branch:
    // never applied at all (e.g. reached SellerProducts.js's create form
    // without ever going through /seller/apply — the dashboard itself is
    // intentionally ungated as a discovery surface) vs applied and still
    // awaiting admin review. Conflating them as one "pending approval"
    // message would be actively wrong for the first case.
    const sellerProfile = await this.sellerProfileRepo.findOne({
      where: { user: { id: userId } },
    });
    if (!sellerProfile) {
      throw new ForbiddenException({
        code: 'SELLER_APPLICATION_REQUIRED',
        requiredLevel,
        currentLevel: level,
        message: 'Apply to become a seller before continuing.',
      });
    }
    throw new ForbiddenException({
      code: 'SELLER_APPROVAL_PENDING',
      requiredLevel,
      currentLevel: level,
      sellerStatus: sellerProfile.status,
      message: 'Your seller application is still pending approval.',
    });
  }

  async getMissingRequirements(
    userId: number,
    feature: Feature,
  ): Promise<{ level: number; requiredLevel: number; missing: string[] }> {
    const level = await this.getLevel(userId);
    const requiredLevel = FEATURE_REQUIREMENTS[feature];
    const missing: string[] = [];
    if (level < requiredLevel) {
      for (let l = level + 1; l <= requiredLevel; l++) {
        missing.push(LEVEL_LABEL[l] || `Level ${l}`);
      }
    }
    return { level, requiredLevel, missing };
  }

  // ── Submit / review — the actual state transitions ────────────────────────

  async submit(
    user: User,
    data: { nidaNumber: string; legalName: string; dateOfBirth: string; idDocumentImageUrl: string },
  ): Promise<IdentityProfile> {
    let profile = await this.identityRepo.findOne({ where: { user: { id: user.id } } });
    const previousStatus = profile?.status || IdentityVerificationStatus.NOT_SUBMITTED;

    const result = await this.provider.submit(data);

    if (!profile) {
      profile = this.identityRepo.create({ user });
    }
    profile.legalName = data.legalName;
    profile.dateOfBirth = data.dateOfBirth;
    profile.nidaNumber = data.nidaNumber;
    profile.idDocumentImageUrl = data.idDocumentImageUrl;
    profile.status = result.status;
    profile.rejectionReason = null;

    try {
      profile = await this.identityRepo.save(profile);
    } catch (err: any) {
      // Postgres unique_violation on nidaNumber — never reveal which
      // account already holds it (spec section 9).
      if (err?.code === '23505') {
        throw new ConflictException(
          'This identity is already linked to another account. If this is your identity, use account recovery.',
        );
      }
      throw err;
    }

    await this.auditRepo.save(
      this.auditRepo.create({
        user,
        verificationType: 'identity',
        previousStatus,
        newStatus: profile.status,
        reviewedBy: null,
        reason: null,
      }),
    );

    return profile;
  }

  async review(
    profileId: number,
    admin: User,
    approve: boolean,
    reason?: string,
  ): Promise<IdentityProfile> {
    const profile = await this.identityRepo.findOne({
      where: { id: profileId },
      relations: { user: true },
    });
    if (!profile) throw new ConflictException('Identity submission not found');

    const previousStatus = profile.status;
    profile.status = approve
      ? IdentityVerificationStatus.VERIFIED
      : IdentityVerificationStatus.REJECTED;
    profile.rejectionReason = approve ? null : reason || null;
    profile.reviewedBy = admin.id;
    profile.reviewedAt = new Date();
    const saved = await this.identityRepo.save(profile);

    await this.auditRepo.save(
      this.auditRepo.create({
        user: profile.user,
        verificationType: 'identity',
        previousStatus,
        newStatus: saved.status,
        reviewedBy: admin.id,
        reason: reason || null,
      }),
    );

    return saved;
  }

  async getPending(): Promise<IdentityProfile[]> {
    return this.identityRepo.find({
      where: { status: IdentityVerificationStatus.PENDING },
      order: { createdAt: 'ASC' } as any,
    });
  }

  async getAll(): Promise<IdentityProfile[]> {
    return this.identityRepo.find({ order: { createdAt: 'DESC' } as any });
  }

  // ── Business verification (Phase 2) ────────────────────────────────────

  async submitBusinessDocuments(
    sellerProfile: SellerProfile,
    data: {
      tinNumber?: string;
      businessLicenseNumber?: string;
      documents: { type: 'brela' | 'tin' | 'license' | 'other'; url: string }[];
    },
  ): Promise<void> {
    const previousStatus = sellerProfile.businessDocumentsStatus || IdentityVerificationStatus.NOT_SUBMITTED;

    sellerProfile.tinNumber = data.tinNumber || sellerProfile.tinNumber;
    sellerProfile.businessLicenseNumber =
      data.businessLicenseNumber || sellerProfile.businessLicenseNumber;
    sellerProfile.businessDocumentsStatus = IdentityVerificationStatus.PENDING;
    await this.sellerProfileRepo.save(sellerProfile);

    if (data.documents?.length) {
      await this.businessDocRepo.save(
        data.documents.map((d) =>
          this.businessDocRepo.create({
            sellerProfile,
            documentType: d.type,
            url: d.url,
          }),
        ),
      );
    }

    await this.auditRepo.save(
      this.auditRepo.create({
        user: sellerProfile.user,
        verificationType: 'business',
        previousStatus,
        newStatus: IdentityVerificationStatus.PENDING,
        reviewedBy: null,
        reason: null,
      }),
    );
  }

  async reviewBusinessDocuments(
    sellerProfileId: number,
    admin: User,
    approve: boolean,
    reason?: string,
  ): Promise<SellerProfile> {
    const sellerProfile = await this.sellerProfileRepo.findOne({
      where: { id: sellerProfileId },
      relations: { user: true },
    });
    if (!sellerProfile) throw new ConflictException('Seller profile not found');

    const previousStatus = sellerProfile.businessDocumentsStatus;
    sellerProfile.businessDocumentsStatus = approve
      ? IdentityVerificationStatus.VERIFIED
      : IdentityVerificationStatus.REJECTED;
    if (approve) {
      // Keeps every existing consumer of verificationTier (admin badges,
      // public seller API responses) accurate — it's a synced display
      // value now, not what getLevel() actually gates on.
      sellerProfile.verificationTier = SellerVerificationTier.VERIFIED_BUSINESS;
    }
    const saved = await this.sellerProfileRepo.save(sellerProfile);

    await this.auditRepo.save(
      this.auditRepo.create({
        user: sellerProfile.user,
        verificationType: 'business',
        previousStatus,
        newStatus: saved.businessDocumentsStatus,
        reviewedBy: admin.id,
        reason: reason || null,
      }),
    );

    return saved;
  }

  async getBusinessDocuments(sellerProfileId: number): Promise<BusinessDocument[]> {
    return this.businessDocRepo.find({
      where: { sellerProfile: { id: sellerProfileId } },
      order: { createdAt: 'ASC' } as any,
    });
  }

  async getPendingBusinessReviews(): Promise<SellerProfile[]> {
    return this.sellerProfileRepo.find({
      where: { businessDocumentsStatus: IdentityVerificationStatus.PENDING },
      order: { updatedAt: 'ASC' } as any,
    });
  }

  async getAllBusinessReviews(): Promise<SellerProfile[]> {
    return this.sellerProfileRepo.find({
      where: { sellerType: 'business' } as any,
      order: { updatedAt: 'DESC' } as any,
    });
  }

  // ── Referral program (Phase 4) ─────────────────────────────────────────

  async resolveReferralCode(code: string): Promise<SuperAgent | null> {
    if (!code) return null;
    return this.superAgentRepo.findOne({
      where: { referralCode: code, status: SuperAgentStatus.ACTIVE },
    });
  }

  // Called at registration only, when a valid referral code was used. The
  // Referral row's unique index on referredUser means this can only ever
  // succeed once per person — best-effort so a race/duplicate never blocks
  // registration itself.
  async recordReferralRegistration(
    referrer: SuperAgent,
    referredUser: User,
  ): Promise<void> {
    try {
      await this.referralRepo.save(
        this.referralRepo.create({
          referrerSuperAgent: referrer,
          referredUser,
          referralCodeUsed: referrer.referralCode || '',
          status: ReferralStatus.REGISTERED,
        }),
      );
    } catch {
      // Unique-violation or similar — never block registration over this.
    }
  }

  async generateReferralCodeIfMissing(superAgent: SuperAgent): Promise<void> {
    if (superAgent.referralCode) return;
    superAgent.referralCode = `KTX-SA-${superAgent.id}`;
    await this.superAgentRepo.save(superAgent);
  }

  // Called from SuperAgentsService.approve() right after a Super Agent
  // application goes ACTIVE — the real end of the qualification pipeline
  // (register -> identity verified -> apply -> approved -> active), all of
  // which already existed as separate steps before this phase; this is
  // just the hook at the last one. Best-effort/non-fatal: a referral
  // processing failure must never block the agent's own approval.
  async processReferralQualification(superAgent: SuperAgent): Promise<void> {
    try {
      const referredUserId = superAgent.user?.id;
      if (!referredUserId) return;
      const referredBySuperAgentId = superAgent.user.referredBySuperAgentId;
      if (!referredBySuperAgentId) return;

      const existing = await this.referralRepo.findOne({
        where: { referredUser: { id: referredUserId } },
      });
      if (!existing || existing.status !== ReferralStatus.REGISTERED) return;

      const referrerSuperAgent = await this.superAgentRepo.findOne({
        where: { id: referredBySuperAgentId },
      });
      if (!referrerSuperAgent) return;

      const [referredIdentity, referrerIdentity] = await Promise.all([
        this.getIdentityProfile(referredUserId),
        this.getIdentityProfile(referrerSuperAgent.user.id),
      ]);

      // Real money-equivalent value is granted here, so require an actual
      // admin-verified identity -- a stricter bar than the Level-1
      // feature-gate's "pending counts" rule used elsewhere.
      if (referredIdentity?.status !== IdentityVerificationStatus.VERIFIED) {
        return;
      }

      const isSelfReferral =
        !!referredIdentity.nidaNumber &&
        referredIdentity.nidaNumber === referrerIdentity?.nidaNumber;

      await this.referralRepo.manager.transaction(async (manager) => {
        const referralRepo = manager.getRepository(Referral);
        const rewardRepo = manager.getRepository(ReferralReward);
        const agentRepo = manager.getRepository(SuperAgent);

        if (isSelfReferral) {
          existing.status = ReferralStatus.REJECTED_FRAUD;
          await referralRepo.save(existing);
          return;
        }

        existing.status = ReferralStatus.QUALIFIED;
        existing.qualifiedAt = new Date();
        await referralRepo.save(existing);

        await rewardRepo.save(
          rewardRepo.create({
            referral: existing,
            superAgent: referrerSuperAgent,
            freeOrdersGranted: 10,
          }),
        );

        await agentRepo.update(referrerSuperAgent.id, {
          freeOrdersGranted: () => '"freeOrdersGranted" + 10',
        } as any);
      });

      this.activityEvents.record(
        isSelfReferral
          ? {
              eventType: 'REFERRAL_REJECTED_FRAUD',
              category: ActivityCategory.SECURITY,
              severity: 'warning',
              actorId: referredUserId,
              relatedUserId: referrerSuperAgent.user.id,
              targetType: 'super_agent',
              targetId: referrerSuperAgent.id,
            }
          : {
              eventType: 'REFERRAL_QUALIFIED',
              category: ActivityCategory.AGENT,
              actorId: referredUserId,
              relatedUserId: referrerSuperAgent.user.id,
              targetType: 'super_agent',
              targetId: referrerSuperAgent.id,
              metadata: { freeOrdersGranted: 10 },
            },
      );
    } catch (err: any) {
      console.error('processReferralQualification failed:', err?.message);
    }
  }

  async getMyReferrals(superAgentId: number): Promise<Referral[]> {
    return this.referralRepo.find({
      where: { referrerSuperAgent: { id: superAgentId } },
      order: { createdAt: 'DESC' } as any,
    });
  }

  async getAllReferrals(): Promise<Referral[]> {
    return this.referralRepo.find({ order: { createdAt: 'DESC' } as any });
  }
}
