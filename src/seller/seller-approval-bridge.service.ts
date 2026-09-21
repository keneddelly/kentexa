import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SellerProfile } from './entities/seller-profile.entity';
import { SellerService } from './seller.service';
import { User } from '../users/entities/user.entity';
import { BusinessCapabilityApplicationService } from '../business/business-capability-application.service';
import { BusinessCapabilityApplication } from '../business/entities/business-capability-application.entity';
import { BusinessCapabilityCode } from '../business/entities/business-capability.entity';
import { RoleProfileType } from '../role-context/entities/account-role.entity';

/**
 * Compatibility routing for the existing admin Seller Approve/Reject buttons
 * (PATCH /seller/:id/approve|reject).
 *
 * BusinessCapabilityApplication is the ONLY approval authority for Business
 * Selling. A Business-linked SellerProfile is never approved or rejected by the
 * legacy Seller lifecycle: its exact canonical application is found and the
 * canonical engine (which owns the transaction) is called. Only a genuinely
 * legacy/unbound (Personal) SellerProfile keeps the legacy SellerService path.
 *
 * Lives in the Seller module's routing layer (SellerModule already imports
 * BusinessModule; BusinessModule does not import SellerModule), so neither
 * SellerService nor the engine gains a new dependency and no forwardRef is needed.
 */
@Injectable()
export class SellerApprovalBridgeService {
  constructor(
    @InjectRepository(SellerProfile) private readonly profileRepo: Repository<SellerProfile>,
    @InjectRepository(BusinessCapabilityApplication) private readonly applicationRepo: Repository<BusinessCapabilityApplication>,
    private readonly sellerService: SellerService,
    private readonly capabilityApplications: BusinessCapabilityApplicationService,
  ) {}

  async approve(profileId: number, admin: User, verificationTier?: string) {
    const profile = await this.loadProfile(profileId);
    if (profile.businessId == null) return this.sellerService.approve(profileId, verificationTier as any);

    const application = await this.findCanonicalApplication(profile);
    // The engine owns every state: PENDING approves, APPROVED is verified idempotently,
    // REJECTED/CANCELLED throw their explicit conflict. Never the legacy lifecycle.
    return this.capabilityApplications.approveApplication(application.id, admin, { verificationTier });
  }

  async reject(profileId: number, admin: User, reason: string) {
    const profile = await this.loadProfile(profileId);
    if (profile.businessId == null) return this.sellerService.reject(profileId, reason);

    const application = await this.findCanonicalApplication(profile);
    return this.capabilityApplications.rejectApplication(application.id, admin, reason);
  }

  private async loadProfile(profileId: number): Promise<SellerProfile> {
    const profile = await this.profileRepo.findOne({ where: { id: profileId } });
    if (!profile) throw new NotFoundException('Seller profile not found');
    return profile;
  }

  /** Exact linkage only: this SellerProfile id + commerce + this profile's own Business. Never guessed. */
  private async findCanonicalApplication(profile: SellerProfile): Promise<BusinessCapabilityApplication> {
    const applications = await this.applicationRepo.find({
      where: {
        operationalProfileType: RoleProfileType.SELLER_PROFILE,
        operationalProfileId: profile.id,
        capabilityCode: BusinessCapabilityCode.COMMERCE,
        businessId: profile.businessId as number,
      },
    });
    if (applications.length === 0) {
      throw new ConflictException({ code: 'BUSINESS_SELLING_APPLICATION_REQUIRED', message: 'BUSINESS_SELLING_APPLICATION_REQUIRED' });
    }
    if (applications.length > 1) {
      throw new ConflictException({ code: 'BUSINESS_SELLING_APPLICATION_AMBIGUOUS', message: 'BUSINESS_SELLING_APPLICATION_AMBIGUOUS' });
    }
    return applications[0];
  }
}
