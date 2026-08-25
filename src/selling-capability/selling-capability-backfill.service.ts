import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SellerProfile, SellerStatus } from '../seller/entities/seller-profile.entity';
import { SellingCapabilityService } from './selling-capability.service';
import {
  SellingCapabilityType,
  SellingCapabilityVerificationLevel,
} from './entities/selling-capability.entity';

export interface SellingCapabilityBackfillResult {
  granted: number;
  skippedNotApproved: number;
  skippedAlreadyGranted: number;
}

// One-time (idempotent, safe to re-run) catch-up: grants a real
// SellingCapability(SELL_PHYSICAL) row for every SellerProfile already
// APPROVED, so pre-existing sellers keep selling exactly as before once
// SellingCapability becomes the actual enforcement point (a later,
// separate phase per the Layer 1 audit's migration plan) — this pass
// only creates the grant, it doesn't change what's enforced today.
// verificationLevel mirrors the seller's own real sellerType, never
// upgraded/guessed — a business seller stays BUSINESS, an individual (or
// null/legacy) seller becomes INDIVIDUAL.
@Injectable()
export class SellingCapabilityBackfillService {
  private readonly logger = new Logger(SellingCapabilityBackfillService.name);

  constructor(
    @InjectRepository(SellerProfile) private sellerProfileRepo: Repository<SellerProfile>,
    private sellingCapability: SellingCapabilityService,
  ) {}

  async run(): Promise<SellingCapabilityBackfillResult> {
    const result: SellingCapabilityBackfillResult = {
      granted: 0,
      skippedNotApproved: 0,
      skippedAlreadyGranted: 0,
    };

    const sellerProfiles = await this.sellerProfileRepo.find();
    for (const sp of sellerProfiles) {
      if (sp.status !== SellerStatus.APPROVED) {
        result.skippedNotApproved++;
        continue;
      }
      if (!sp.user) continue;

      const already = await this.sellingCapability.hasCapability(
        sp.user.id,
        SellingCapabilityType.SELL_PHYSICAL,
      );
      if (already) {
        result.skippedAlreadyGranted++;
        continue;
      }

      await this.sellingCapability.grant(
        sp.user.id,
        SellingCapabilityType.SELL_PHYSICAL,
        sp.sellerType === 'business'
          ? SellingCapabilityVerificationLevel.BUSINESS
          : SellingCapabilityVerificationLevel.INDIVIDUAL,
        null,
      );
      result.granted++;
    }

    this.logger.log(
      `Selling capability backfill: ${result.granted} granted, ${result.skippedNotApproved} skipped (not approved), ${result.skippedAlreadyGranted} skipped (already granted)`,
    );
    return result;
  }
}
