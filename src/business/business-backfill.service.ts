import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business, BusinessStatus } from './entities/business.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { CommerceProfile, CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';

export interface BusinessBackfillResult {
  businessCreated: number;
  sellerProfilesLinked: number;
  commerceProfilesLinked: number;
  skippedAlreadyExisted: number;
  skippedNotBusinessType: number;
}

// One-time (idempotent, safe to re-run) catch-up: creates a real Business
// row for every existing SellerProfile that was explicitly marked
// sellerType === 'business' (Phase 2 of the identity work), copying the
// business-shaped fields SellerProfile was carrying on their behalf, and
// links SellerProfile.businessId / CommerceProfile.businessId back to it.
// Deliberately conservative: SellerProfile rows created before sellerType
// existed (null) are left alone rather than guessed at -- nothing reads
// businessId yet, so leaving them unlinked changes no behavior; they can
// be linked later (e.g. by an admin action) once there's a reason to.
@Injectable()
export class BusinessBackfillService {
  private readonly logger = new Logger(BusinessBackfillService.name);

  constructor(
    @InjectRepository(Business) private businessRepo: Repository<Business>,
    @InjectRepository(SellerProfile) private sellerProfileRepo: Repository<SellerProfile>,
    @InjectRepository(CommerceProfile) private commerceProfileRepo: Repository<CommerceProfile>,
  ) {}

  async run(): Promise<BusinessBackfillResult> {
    const result: BusinessBackfillResult = {
      businessCreated: 0,
      sellerProfilesLinked: 0,
      commerceProfilesLinked: 0,
      skippedAlreadyExisted: 0,
      skippedNotBusinessType: 0,
    };

    const sellerProfiles = await this.sellerProfileRepo.find();
    for (const sp of sellerProfiles) {
      if (sp.sellerType !== 'business') {
        result.skippedNotBusinessType++;
        continue;
      }
      if (sp.businessId) {
        result.skippedAlreadyExisted++;
        continue;
      }
      if (!sp.user) continue;

      const business = this.businessRepo.create({
        user: sp.user,
        legalName: sp.businessName,
        description: sp.businessDescription,
        category: sp.businessCategory,
        logo: sp.logo,
        address: sp.address,
        phone: sp.phone,
        regionId: sp.regionId,
        region: sp.businessRegion,
        districtId: sp.districtId,
        district: sp.businessDistrict,
        wardId: sp.wardId,
        ward: sp.businessCity,
        tinNumber: sp.tinNumber,
        registrationNumber: sp.registrationNumber,
        businessLicenseNumber: sp.businessLicenseNumber,
        businessVerificationStatus: sp.businessDocumentsStatus,
        status: BusinessStatus.ACTIVE,
      });
      const savedBusiness = await this.businessRepo.save(business);
      result.businessCreated++;

      await this.sellerProfileRepo.update(sp.id, { businessId: savedBusiness.id });
      result.sellerProfilesLinked++;

      const commerceProfile = await this.commerceProfileRepo.findOne({
        where: { sellerProfileId: sp.id, type: CommerceProfileType.BUSINESS },
      });
      if (commerceProfile && !commerceProfile.businessId) {
        await this.commerceProfileRepo.update(commerceProfile.id, {
          businessId: savedBusiness.id,
        });
        result.commerceProfilesLinked++;
      }
    }

    this.logger.log(
      `Business backfill: ${result.businessCreated} created, ${result.sellerProfilesLinked} SellerProfiles linked, ${result.commerceProfilesLinked} CommerceProfiles linked, ${result.skippedNotBusinessType} skipped (not business type), ${result.skippedAlreadyExisted} skipped (already linked)`,
    );
    return result;
  }
}
