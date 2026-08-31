import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OfficialProduct } from './entities/official-product.entity';
import {
  CommerceProfile,
  CommerceProfileType,
} from '../commerce-profiles/entities/commerce-profile.entity';
import { CommerceProfileScopeService } from '../commerce-profiles/commerce-profile-scope.service';

@Injectable()
export class OfficialProductsService {
  constructor(
    @InjectRepository(OfficialProduct) private repo: Repository<OfficialProduct>,
    @InjectRepository(CommerceProfile) private profileRepo: Repository<CommerceProfile>,
    private profileScope: CommerceProfileScopeService,
  ) {}

  // Public — feeds the seller-side officialProductId picker (same shape
  // as BrandsService.findAll()/search()).
  async findAll(brandId?: number): Promise<OfficialProduct[]> {
    return this.repo.find({
      where: brandId ? { brandId, isActive: true } : { isActive: true },
      order: { name: 'ASC' },
    });
  }

  async search(query: string, brandId?: number): Promise<OfficialProduct[]> {
    const qb = this.repo.createQueryBuilder('p').where('p.isActive = true');
    if (brandId) qb.andWhere('p.brandId = :brandId', { brandId });
    if (query?.trim()) qb.andWhere('LOWER(p.name) LIKE :q', { q: `%${query.trim().toLowerCase()}%` });
    return qb.orderBy('p.name', 'ASC').limit(20).getMany();
  }

  async findOne(id: number): Promise<OfficialProduct> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Official product not found');
    return row;
  }

  async create(dto: {
    brandId: number;
    name: string;
    category: string;
    subcategory?: string;
    officialSpecs?: Record<string, string>;
    officialImages?: string[];
  }): Promise<OfficialProduct> {
    const row = this.repo.create({
      brandId: dto.brandId,
      name: dto.name,
      category: dto.category,
      subcategory: dto.subcategory || null,
      officialSpecs: dto.officialSpecs || null,
      officialImages: dto.officialImages || [],
    });
    return this.repo.save(row);
  }

  async update(
    id: number,
    dto: Partial<{
      name: string;
      category: string;
      subcategory: string;
      officialSpecs: Record<string, string>;
      officialImages: string[];
      isActive: boolean;
    }>,
  ): Promise<OfficialProduct> {
    const row = await this.findOne(id);
    Object.assign(row, dto);
    return this.repo.save(row);
  }

  // ── Brand-managed catalog authoring (spec §20) ───────────────────────────
  // Lets a logged-in brand identity (src/brands/ Phase C) manage their own
  // OfficialProduct rows directly, purely additive on top of the admin-only
  // create()/update() above — those stay untouched and are still the only
  // path for a brand that hasn't been given login access yet. Same
  // ownership-check shape as BrandDashboardService.getDashboard(): resolve
  // via CommerceProfileScopeService, then confirm the profile really is a
  // BRAND identity before trusting its brandId for anything.
  private async resolveBrandOwnerProfile(
    commerceProfileId: number,
    userId: number,
  ): Promise<CommerceProfile> {
    await this.profileScope.requireAuthorized(userId, commerceProfileId);
    const profile = await this.profileRepo.findOne({ where: { id: commerceProfileId } });
    if (!profile || profile.type !== CommerceProfileType.BRAND || !profile.brandId) {
      throw new NotFoundException('This profile is not a brand identity');
    }
    return profile;
  }

  // Owner sees everything they've created, active and inactive — the
  // public findAll() above filters to isActive-only for buyers/sellers
  // browsing, which would hide a brand's own draft/retired items from
  // themselves.
  async findAllForOwner(commerceProfileId: number, userId: number): Promise<OfficialProduct[]> {
    const profile = await this.resolveBrandOwnerProfile(commerceProfileId, userId);
    return this.repo.find({ where: { brandId: profile.brandId as number }, order: { name: 'ASC' } });
  }

  // brandId always comes from the resolved profile, never the client —
  // a brand can never create a catalog row under another brand's identity.
  async createForOwner(
    commerceProfileId: number,
    userId: number,
    dto: {
      name: string;
      category: string;
      subcategory?: string;
      officialSpecs?: Record<string, string>;
      officialImages?: string[];
    },
  ): Promise<OfficialProduct> {
    const profile = await this.resolveBrandOwnerProfile(commerceProfileId, userId);
    return this.create({ ...dto, brandId: profile.brandId as number });
  }

  async updateForOwner(
    commerceProfileId: number,
    userId: number,
    id: number,
    dto: Partial<{
      name: string;
      category: string;
      subcategory: string;
      officialSpecs: Record<string, string>;
      officialImages: string[];
      isActive: boolean;
    }>,
  ): Promise<OfficialProduct> {
    const profile = await this.resolveBrandOwnerProfile(commerceProfileId, userId);
    const existing = await this.findOne(id);
    if (existing.brandId !== profile.brandId) {
      throw new ForbiddenException('This item does not belong to your brand');
    }
    return this.update(id, dto);
  }
}
