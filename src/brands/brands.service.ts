import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Brand } from './entities/brand.entity';
import {
  CommerceProfile,
  CommerceProfileType,
} from '../commerce-profiles/entities/commerce-profile.entity';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

@Injectable()
export class BrandsService {
  constructor(
    @InjectRepository(Brand) private repo: Repository<Brand>,
    @InjectRepository(CommerceProfile) private profileRepo: Repository<CommerceProfile>,
  ) {}

  // Public — feeds the product-creation brand picker and storefront
  // display. isActive-only by default so a retired/merged brand row
  // doesn't keep surfacing for new listings.
  async findAll(includeInactive = false): Promise<Brand[]> {
    return this.repo.find({
      where: includeInactive ? {} : { isActive: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Brand> {
    const brand = await this.repo.findOne({ where: { id } });
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }

  async search(query: string): Promise<Brand[]> {
    if (!query?.trim()) return this.findAll();
    return this.repo
      .createQueryBuilder('b')
      .where('b.isActive = true')
      .andWhere('LOWER(b.name) LIKE :q', { q: `%${query.trim().toLowerCase()}%` })
      .orderBy('b.name', 'ASC')
      .limit(20)
      .getMany();
  }

  // Resolves an AI-parsed free-text brand guess ("LG") into a real Brand
  // row — reuses search()'s own case-insensitive match rather than a
  // second query shape, just takes the first hit. Deliberately not fuzzy/
  // typo-tolerant. Never null-throws — callers (ProductsService.search(),
  // the /brands/authorized-businesses endpoint) treat "didn't resolve" as
  // a normal, fail-open case, not an error.
  async findByName(name: string): Promise<Brand | null> {
    if (!name?.trim()) return null;
    const matches = await this.search(name);
    return matches[0] ?? null;
  }

  async create(dto: {
    name: string;
    legalName?: string;
    logoUrl?: string;
    description?: string;
    website?: string;
    countryOfOrigin?: string;
    officialContactInfo?: { email?: string; phone?: string };
  }): Promise<Brand> {
    const baseSlug = slugify(dto.name);
    if (!baseSlug) throw new BadRequestException('Brand name is required');

    // Slugs are unique — append a numeric suffix on collision rather than
    // rejecting the whole request (two brands can share a first word,
    // e.g. "Samsung Electronics" vs a future "Samsung Life").
    let slug = baseSlug;
    let suffix = 1;
    while (await this.repo.findOne({ where: { slug } })) {
      slug = `${baseSlug}-${++suffix}`;
    }

    const brand = this.repo.create({
      name: dto.name,
      legalName: dto.legalName || null,
      slug,
      logoUrl: dto.logoUrl || null,
      description: dto.description || null,
      website: dto.website || null,
      countryOfOrigin: dto.countryOfOrigin || null,
      officialContactInfo: dto.officialContactInfo || null,
    });
    return this.repo.save(brand);
  }

  async update(
    id: number,
    dto: Partial<{
      name: string;
      legalName: string;
      logoUrl: string;
      description: string;
      website: string;
      countryOfOrigin: string;
      officialContactInfo: { email?: string; phone?: string };
      isActive: boolean;
    }>,
  ): Promise<Brand> {
    const brand = await this.findOne(id);
    Object.assign(brand, dto);
    return this.repo.save(brand);
  }

  async setVerificationStatus(id: number, status: 'unverified' | 'verified'): Promise<Brand> {
    const brand = await this.findOne(id);
    brand.verificationStatus = status;
    return this.repo.save(brand);
  }

  // ── Brand identity (Phase C) — always admin-provisioned, never self-
  // registered, same trust-bearing-identity gating already used for HUB/
  // AGENT/TRANSPORT_PROVIDER. Idempotent: a brand only ever has one
  // CommerceProfile, so calling this again just reassigns the owner
  // rather than creating a second one. ────────────────────────────────
  async createOrReassignProfile(brandId: number, userId: number): Promise<CommerceProfile> {
    const brand = await this.findOne(brandId);

    const existing = await this.profileRepo.findOne({ where: { brandId } });
    if (existing) {
      existing.ownerId = userId;
      return this.profileRepo.save(existing);
    }

    let username = brand.slug;
    let suffix = 1;
    while (await this.profileRepo.findOne({ where: { username } })) {
      username = `${brand.slug}-${++suffix}`;
    }

    const profile = this.profileRepo.create({
      ownerId: userId,
      type: CommerceProfileType.BRAND,
      username,
      displayName: brand.name,
      photoUrl: brand.logoUrl,
      brandId: brand.id,
    });
    return this.profileRepo.save(profile);
  }
}
