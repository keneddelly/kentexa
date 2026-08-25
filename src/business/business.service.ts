import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business, BusinessStatus } from './entities/business.entity';
import { User } from '../users/entities/user.entity';
import { SellerProfile, SellerStatus } from '../seller/entities/seller-profile.entity';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import {
  CommerceProfileType,
  CommerceProfileStatus,
} from '../commerce-profiles/entities/commerce-profile.entity';

// Phase 1 of the multi-role architecture: Business as a real entity,
// independent of Seller. See seller.service.ts's apply() for the existing
// (unchanged) individual-or-business seller application flow -- this
// service is the newer "I just want a Business profile, not to sell"
// path, plus the bridge that lets an existing Business activate Seller
// later without duplicating its own data.
@Injectable()
export class BusinessService {
  constructor(
    @InjectRepository(Business) private businessRepo: Repository<Business>,
    @InjectRepository(SellerProfile) private sellerProfileRepo: Repository<SellerProfile>,
    private commerceProfiles: CommerceProfilesService,
  ) {}

  async findMine(userId: number): Promise<Business | null> {
    return this.businessRepo.findOne({ where: { user: { id: userId } } });
  }

  async findById(id: number): Promise<Business> {
    const business = await this.businessRepo.findOne({ where: { id } });
    if (!business) throw new NotFoundException('Business not found');
    return business;
  }

  // Own dashboard stats -- only what this Business genuinely has data for
  // today. Leads/Messages are honest empty placeholders, not real backing
  // data yet (see Phase 2 plan's "explicitly not in this phase").
  async getDashboard(businessId: number, user: User) {
    const business = await this.findById(businessId);
    if (business.user.id !== user.id) {
      throw new NotFoundException('Business not found');
    }
    const [sellerProfile, commerceProfile] = await Promise.all([
      this.sellerProfileRepo.findOne({ where: { businessId: business.id } }),
      this.commerceProfiles.findForUserByType(user.id, CommerceProfileType.BUSINESS),
    ]);
    return {
      business,
      hasSeller: !!sellerProfile,
      followersCount: commerceProfile?.followersCount || 0,
      rating: commerceProfile?.rating || 0,
      reviewsCount: commerceProfile?.reviewsCount || 0,
      reputationScore: commerceProfile?.reputationScore || 0,
      leadsCount: 0,
      unreadMessagesCount: 0,
    };
  }

  // ── Create a Business with no Seller (spec section 7: a manufacturer
  // that only wants a digital presence) ─────────────────────────────────
  async create(
    user: User,
    dto: {
      legalName: string;
      tradingName?: string;
      description?: string;
      category?: string;
      address?: string;
      phone?: string;
      email?: string;
      regionId?: number;
      region?: string;
      districtId?: number;
      district?: string;
      wardId?: number;
      ward?: string;
      responsiblePersonName?: string;
      tinNumber?: string;
      registrationNumber?: string;
      businessLicenseNumber?: string;
    },
  ): Promise<Business> {
    const existing = await this.findMine(user.id);
    if (existing) throw new ConflictException('You already have a Business');

    const business = this.businessRepo.create({
      ...dto,
      user,
      status: BusinessStatus.ACTIVE,
    });
    const saved = await this.businessRepo.save(business);

    // Public presence alongside the operational record, same pattern
    // SellerService.apply() and CommerceProfilesBackfillService already
    // use for every other role type. Non-fatal.
    try {
      await this.commerceProfiles.createProfile({
        ownerId: user.id,
        type: CommerceProfileType.BUSINESS,
        displayName: saved.tradingName || saved.legalName,
        usernameSeed: saved.tradingName || saved.legalName,
        photoUrl: user.logo || saved.logo,
        bio: saved.description,
        location: saved.address,
        status: CommerceProfileStatus.ACTIVE,
        businessId: saved.id,
      });
    } catch {}

    return saved;
  }

  async update(
    businessId: number,
    user: User,
    dto: Partial<{
      legalName: string;
      tradingName: string;
      description: string;
      category: string;
      logo: string;
      coverImage: string;
      address: string;
      phone: string;
      email: string;
    }>,
  ): Promise<Business> {
    const business = await this.findById(businessId);
    if (business.user.id !== user.id) {
      throw new NotFoundException('Business not found');
    }
    await this.businessRepo.update(businessId, dto);
    const saved = await this.findById(businessId);

    // Keep the public CommerceProfile in sync -- same fields it was
    // seeded from at create() time. Best-effort: never blocks the save.
    const commerceProfile = await this.commerceProfiles.findForUserByType(
      user.id,
      CommerceProfileType.BUSINESS,
    );
    if (commerceProfile) {
      await this.commerceProfiles
        .updatePublicFields(commerceProfile.id, {
          displayName: saved.tradingName || saved.legalName,
          photoUrl: saved.logo,
          coverImage: saved.coverImage,
          bio: saved.description,
        })
        .catch(() => {});
    }

    return saved;
  }

  // ── Activate Seller on an existing Business (spec section 9: "a
  // business can activate Seller later") ─────────────────────────────────
  async activateSeller(businessId: number, user: User): Promise<SellerProfile> {
    const business = await this.findById(businessId);
    if (business.user.id !== user.id) {
      throw new NotFoundException('Business not found');
    }
    const existingSeller = await this.sellerProfileRepo.findOne({
      where: { user: { id: user.id } },
    });
    if (existingSeller) {
      throw new ConflictException('You already have a seller application');
    }

    const sellerProfile = this.sellerProfileRepo.create({
      user,
      businessId: business.id,
      businessName: business.tradingName || business.legalName,
      businessDescription: business.description,
      businessCategory: business.category,
      address: business.address,
      phone: business.phone,
      regionId: business.regionId,
      businessRegion: business.region,
      districtId: business.districtId,
      businessDistrict: business.district,
      wardId: business.wardId,
      businessCity: business.ward,
      registrationNumber: business.registrationNumber,
      tinNumber: business.tinNumber,
      businessLicenseNumber: business.businessLicenseNumber,
      sellerType: 'business',
      status: SellerStatus.PENDING,
    });
    return this.sellerProfileRepo.save(sellerProfile);
  }
}
