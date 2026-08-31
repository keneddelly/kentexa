import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OfficialProduct } from './entities/official-product.entity';

@Injectable()
export class OfficialProductsService {
  constructor(
    @InjectRepository(OfficialProduct) private repo: Repository<OfficialProduct>,
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
}
