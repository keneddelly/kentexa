import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SellingCapability,
  SellingCapabilityType,
  SellingCapabilityVerificationLevel,
  SellingCapabilityStatus,
} from './entities/selling-capability.entity';

@Injectable()
export class SellingCapabilityService {
  constructor(
    @InjectRepository(SellingCapability)
    private repo: Repository<SellingCapability>,
  ) {}

  // Scoped to the specific profile, not the account — a profile that
  // hasn't itself been granted this capability can't sell just because
  // another profile on the same eligible account can.
  async hasCapability(
    commerceProfileId: number,
    capabilityType: SellingCapabilityType,
  ): Promise<boolean> {
    const row = await this.repo.findOne({
      where: { commerceProfile: { id: commerceProfileId }, capabilityType },
    });
    return row?.status === SellingCapabilityStatus.ACTIVE;
  }

  // Idempotent — updates the existing row for this (commerceProfile,
  // capabilityType) pair instead of creating a duplicate, so both the
  // backfill and the live approve() call site can call this safely
  // without a prior existence check. userId is accountability/audit only
  // (whose account this profile belongs to) — callers are responsible for
  // having already confirmed the underlying account is ELIGIBLE (verified
  // identity, approved SellerProfile) before granting capability to one of
  // its profiles; this method only records the grant, it doesn't itself
  // re-check eligibility.
  async grant(
    commerceProfileId: number,
    userId: number,
    capabilityType: SellingCapabilityType,
    verificationLevel: SellingCapabilityVerificationLevel,
    grantedBy: number | null,
  ): Promise<SellingCapability> {
    const existing = await this.repo.findOne({
      where: { commerceProfile: { id: commerceProfileId }, capabilityType },
    });
    if (existing) {
      existing.verificationLevel = verificationLevel;
      existing.status = SellingCapabilityStatus.ACTIVE;
      existing.grantedAt = new Date();
      existing.grantedBy = grantedBy;
      existing.restrictedReason = null;
      return this.repo.save(existing);
    }
    return this.repo.save(
      this.repo.create({
        commerceProfile: { id: commerceProfileId } as any,
        user: { id: userId } as any,
        capabilityType,
        verificationLevel,
        status: SellingCapabilityStatus.ACTIVE,
        grantedAt: new Date(),
        grantedBy,
      }),
    );
  }

  async restrict(
    commerceProfileId: number,
    capabilityType: SellingCapabilityType,
    reason: string,
  ): Promise<SellingCapability | null> {
    const existing = await this.repo.findOne({
      where: { commerceProfile: { id: commerceProfileId }, capabilityType },
    });
    if (!existing) return null;
    existing.status = SellingCapabilityStatus.RESTRICTED;
    existing.restrictedReason = reason;
    return this.repo.save(existing);
  }

  async findForProfile(commerceProfileId: number): Promise<SellingCapability[]> {
    return this.repo.find({ where: { commerceProfile: { id: commerceProfileId } } });
  }

  // Every capability across every profile this account holds — for
  // account-level admin/audit views only. Never use this to answer "can
  // profile X sell" — that's findForProfile/hasCapability.
  async findForUser(userId: number): Promise<SellingCapability[]> {
    return this.repo.find({ where: { user: { id: userId } } });
  }
}
