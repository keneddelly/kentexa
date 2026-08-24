import { Injectable, Inject, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import {
  IdentityProfile,
  IdentityVerificationStatus,
} from './entities/identity-profile.entity';
import { IdentityVerificationAudit } from './entities/identity-verification-audit.entity';
import {
  SellerProfile,
  SellerStatus,
  SellerVerificationTier,
} from '../seller/entities/seller-profile.entity';
import { SuperAgent, SuperAgentStatus } from '../super-agents/entities/super-agent.entity';
import { Feature, FEATURE_REQUIREMENTS } from './verification.constants';
import type { IdentityVerificationProvider } from './providers/identity-verification-provider.interface';
import { IDENTITY_VERIFICATION_PROVIDER } from './identity.tokens';

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
    @Inject(IDENTITY_VERIFICATION_PROVIDER)
    private provider: IdentityVerificationProvider,
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

    const level3 =
      sellerProfile?.verificationTier === SellerVerificationTier.VERIFIED_BUSINESS;
    if (level3) return 3;

    return 2;
  }

  async canUseFeature(userId: number, feature: Feature): Promise<boolean> {
    const level = await this.getLevel(userId);
    return level >= FEATURE_REQUIREMENTS[feature];
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
}
