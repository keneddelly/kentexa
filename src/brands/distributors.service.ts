import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Distributor } from './entities/distributor.entity';
import { BrandDistributor } from './entities/brand-distributor.entity';

@Injectable()
export class DistributorsService {
  constructor(
    @InjectRepository(Distributor) private repo: Repository<Distributor>,
    @InjectRepository(BrandDistributor) private brandDistributorRepo: Repository<BrandDistributor>,
  ) {}

  async findAll(): Promise<Distributor[]> {
    return this.repo.find({ where: { isActive: true }, order: { name: 'ASC' } });
  }

  async findOne(id: number): Promise<Distributor> {
    const distributor = await this.repo.findOne({ where: { id } });
    if (!distributor) throw new NotFoundException('Distributor not found');
    return distributor;
  }

  async create(dto: {
    name: string;
    commerceProfileId?: number;
    contactInfo?: { email?: string; phone?: string; address?: string };
  }): Promise<Distributor> {
    const distributor = this.repo.create({
      name: dto.name,
      commerceProfileId: dto.commerceProfileId ?? null,
      contactInfo: dto.contactInfo || null,
    });
    return this.repo.save(distributor);
  }

  async update(
    id: number,
    dto: Partial<{
      name: string;
      commerceProfileId: number | null;
      contactInfo: { email?: string; phone?: string; address?: string };
      verificationStatus: string;
      isActive: boolean;
    }>,
  ): Promise<Distributor> {
    const distributor = await this.findOne(id);
    Object.assign(distributor, dto);
    return this.repo.save(distributor);
  }

  // Associates a distributor with a brand, optionally scoped to one
  // category/region — a brand can have several of these rows for
  // regional/category-split distribution.
  async associateWithBrand(
    distributorId: number,
    brandId: number,
    scope: { categoryScope?: string; regionScope?: string } = {},
  ): Promise<BrandDistributor> {
    await this.findOne(distributorId); // 404s if missing
    const row = this.brandDistributorRepo.create({
      distributor: { id: distributorId } as Distributor,
      brand: { id: brandId } as any,
      categoryScope: scope.categoryScope || null,
      regionScope: scope.regionScope || null,
    });
    return this.brandDistributorRepo.save(row);
  }

  async listBrandsFor(distributorId: number): Promise<BrandDistributor[]> {
    return this.brandDistributorRepo.find({
      where: { distributor: { id: distributorId }, isActive: true },
      relations: { brand: true },
    });
  }
}
