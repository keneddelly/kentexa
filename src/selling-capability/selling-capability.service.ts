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

  async hasCapability(
    userId: number,
    capabilityType: SellingCapabilityType,
  ): Promise<boolean> {
    const row = await this.repo.findOne({
      where: { user: { id: userId }, capabilityType },
    });
    return row?.status === SellingCapabilityStatus.ACTIVE;
  }

  // Idempotent — updates the existing row for this (user, capabilityType)
  // pair instead of creating a duplicate, so both the backfill and the
  // live approve() call site can call this safely without a prior
  // existence check.
  async grant(
    userId: number,
    capabilityType: SellingCapabilityType,
    verificationLevel: SellingCapabilityVerificationLevel,
    grantedBy: number | null,
  ): Promise<SellingCapability> {
    const existing = await this.repo.findOne({
      where: { user: { id: userId }, capabilityType },
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
    userId: number,
    capabilityType: SellingCapabilityType,
    reason: string,
  ): Promise<SellingCapability | null> {
    const existing = await this.repo.findOne({
      where: { user: { id: userId }, capabilityType },
    });
    if (!existing) return null;
    existing.status = SellingCapabilityStatus.RESTRICTED;
    existing.restrictedReason = reason;
    return this.repo.save(existing);
  }

  async findForUser(userId: number): Promise<SellingCapability[]> {
    return this.repo.find({ where: { user: { id: userId } } });
  }
}
