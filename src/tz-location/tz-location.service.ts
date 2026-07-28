import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { TzRegion } from './entities/tz-region.entity';
import { TzDistrict } from './entities/tz-district.entity';
import { TzWard } from './entities/tz-ward.entity';
import {
  TZ_REGIONS,
  TZ_DISTRICTS_BY_REGION,
  DAR_WARDS,
  OTHER_CITY_WARDS,
} from './seed-tz-locations';

// ── Seed data types ───────────────────────────────────────────────────────────

interface RegionSeed {
  name: string;
  nameSw?: string;
  capital?: string;
  code?: string;
  lat: number;
  lng: number;
  sortOrder?: number;
}

interface DistrictSeed {
  name: string;
  nameSw?: string;
  lat: number;
  lng: number;
  isUrban?: boolean;
}

interface WardSeed {
  name: string;
  lat: number;
  lng: number;
  isUrban?: boolean;
  densityClass?: string;
}

@Injectable()
export class TzLocationService {
  constructor(
    @InjectRepository(TzRegion) private regionRepo: Repository<TzRegion>,
    @InjectRepository(TzDistrict) private districtRepo: Repository<TzDistrict>,
    @InjectRepository(TzWard) private wardRepo: Repository<TzWard>,
  ) {}

  // ── Seed all Tanzania location data ──────────────────────────────────────

  async seedAll() {
    const results = { regions: 0, districts: 0, wards: 0 };

    // 1. Seed regions
    for (const r of TZ_REGIONS as RegionSeed[]) {
      const exists = await this.regionRepo.findOne({ where: { name: r.name } });
      if (!exists) {
        await this.regionRepo.save(this.regionRepo.create(r as any));
        results.regions++;
      }
    }

    // 2. Seed districts
    const districtsByRegion = TZ_DISTRICTS_BY_REGION as Record<
      string,
      DistrictSeed[]
    >;
    for (const [regionName, districts] of Object.entries(districtsByRegion)) {
      const region = await this.regionRepo.findOne({
        where: { name: regionName },
      });
      if (!region) continue;
      for (const d of districts) {
        const exists = await this.districtRepo.findOne({
          where: { name: d.name, regionId: region.id },
        });
        if (!exists) {
          await this.districtRepo.save(
            this.districtRepo.create({
              ...d,
              region,
              regionId: region.id,
            } as any),
          );
          results.districts++;
        }
      }
    }

    // 3. Seed Dar es Salaam wards
    const darWards = DAR_WARDS as Record<string, WardSeed[]>;
    for (const [districtName, wards] of Object.entries(darWards)) {
      const district = await this.districtRepo.findOne({
        where: { name: districtName },
      });
      if (!district) continue;
      for (const w of wards) {
        const exists = await this.wardRepo.findOne({
          where: { name: w.name, districtId: district.id },
        });
        if (!exists) {
          await this.wardRepo.save(
            this.wardRepo.create({
              ...w,
              districtId: district.id,
              regionId: district.regionId,
            } as any),
          );
          results.wards++;
        }
      }
    }

    // 4. Seed other city wards
    const otherWards = OTHER_CITY_WARDS as Record<
      string,
      Record<string, WardSeed[]>
    >;
    for (const [, districtMap] of Object.entries(otherWards)) {
      for (const [districtName, wards] of Object.entries(districtMap)) {
        const district = await this.districtRepo.findOne({
          where: { name: districtName },
        });
        if (!district) continue;
        for (const w of wards) {
          const exists = await this.wardRepo.findOne({
            where: { name: w.name, districtId: district.id },
          });
          if (!exists) {
            await this.wardRepo.save(
              this.wardRepo.create({
                ...w,
                districtId: district.id,
                regionId: district.regionId,
                isUrban: w.isUrban !== undefined ? w.isUrban : true,
              } as any),
            );
            results.wards++;
          }
        }
      }
    }

    return {
      message: 'Tanzania location data seeded successfully',
      regions: results.regions,
      districts: results.districts,
      wards: results.wards,
    };
  }

  // ── Regions ───────────────────────────────────────────────────────────────

  async getRegions() {
    return this.regionRepo.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  // ── Districts ─────────────────────────────────────────────────────────────

  async getDistricts(regionId: number) {
    return this.districtRepo.find({
      where: { regionId, isActive: true },
      order: { isUrban: 'DESC', name: 'ASC' },
    });
  }

  async getDistrictsByRegionName(regionName: string) {
    const region = await this.regionRepo.findOne({
      where: { name: ILike(`%${regionName}%`) },
    });
    if (!region)
      throw new NotFoundException(`Mkoa haukupatikana: ${regionName}`);
    return this.getDistricts(region.id);
  }

  // ── Wards ─────────────────────────────────────────────────────────────────

  async getWards(districtId: number) {
    return this.wardRepo.find({
      where: { districtId, isActive: true },
      order: { isUrban: 'DESC', name: 'ASC' },
    });
  }

  async getWardsByDistrictName(districtName: string, regionName?: string) {
    const where: any = { name: ILike(`%${districtName}%`), isActive: true };
    if (regionName) {
      const region = await this.regionRepo.findOne({
        where: { name: ILike(`%${regionName}%`) },
      });
      if (region) where.regionId = region.id;
    }
    const district = await this.districtRepo.findOne({ where });
    if (!district)
      throw new NotFoundException(`Wilaya haikupatikana: ${districtName}`);
    return this.getWards(district.id);
  }

  // ── Search ────────────────────────────────────────────────────────────────
  // Free text → structured location
  // "Bunju"  → { region: Dar, district: Kinondoni, ward: Bunju }
  // "Songea" → { region: Ruvuma, district: Songea Municipal }

  async search(query: string) {
    const q = query.trim();

    // Ward first (most specific)
    const wards = await this.wardRepo.find({
      where: { name: ILike(`%${q}%`), isActive: true },
      relations: { district: { region: true } },
      take: 8,
    });
    if (wards.length > 0) {
      return wards.map((w) => ({
        type: 'ward',
        wardId: w.id,
        ward: w.name,
        districtId: w.districtId,
        district: (w.district as any)?.name,
        regionId: w.regionId,
        region: (w.district as any)?.region?.name,
        lat: w.lat,
        lng: w.lng,
        fullAddress: `${w.name}, ${(w.district as any)?.name}, ${(w.district as any)?.region?.name}`,
      }));
    }

    // District
    const districts = await this.districtRepo.find({
      where: { name: ILike(`%${q}%`), isActive: true },
      relations: { region: true },
      take: 5,
    });
    if (districts.length > 0) {
      return districts.map((d) => ({
        type: 'district',
        districtId: d.id,
        district: d.name,
        regionId: d.regionId,
        region: (d.region as any)?.name,
        lat: d.lat,
        lng: d.lng,
        fullAddress: `${d.name}, ${(d.region as any)?.name}`,
      }));
    }

    // Region
    const regions = await this.regionRepo.find({
      where: { name: ILike(`%${q}%`), isActive: true },
      take: 5,
    });
    return regions.map((r) => ({
      type: 'region',
      regionId: r.id,
      region: r.name,
      lat: r.lat,
      lng: r.lng,
      fullAddress: r.name,
    }));
  }

  // ── Delivery type ─────────────────────────────────────────────────────────
  // same_ward | same_district | same_region | intercity

  async resolveDeliveryType(
    originWardId: number | null,
    destWardId: number | null,
    originRegionName?: string,
    destRegionName?: string,
  ): Promise<{
    type:
      | 'same_ward'
      | 'same_district'
      | 'same_region'
      | 'intercity'
      | 'unknown';
    estimatedMinutes?: number;
    suggestedMethod: 'boda' | 'car' | 'van' | 'bus';
  }> {
    if (!originWardId || !destWardId) {
      if (originRegionName && destRegionName) {
        const same =
          originRegionName.toLowerCase() === destRegionName.toLowerCase();
        return {
          type: same ? 'same_region' : 'intercity',
          suggestedMethod: same ? 'car' : 'bus',
        };
      }
      return { type: 'unknown', suggestedMethod: 'bus' };
    }

    if (originWardId === destWardId) {
      return {
        type: 'same_ward',
        estimatedMinutes: 20,
        suggestedMethod: 'boda',
      };
    }

    const [origin, dest] = await Promise.all([
      this.wardRepo.findOne({ where: { id: originWardId } }),
      this.wardRepo.findOne({ where: { id: destWardId } }),
    ]);
    if (!origin || !dest) return { type: 'unknown', suggestedMethod: 'bus' };

    if (origin.districtId === dest.districtId) {
      return {
        type: 'same_district',
        estimatedMinutes: 45,
        suggestedMethod: 'boda',
      };
    }
    if (origin.regionId === dest.regionId) {
      return {
        type: 'same_region',
        estimatedMinutes: 90,
        suggestedMethod: 'car',
      };
    }
    return { type: 'intercity', suggestedMethod: 'bus' };
  }

  // ── Resolve agent location ────────────────────────────────────────────────

  async resolveAgentLocation(query: string) {
    const ward = await this.wardRepo.findOne({
      where: { name: ILike(`%${query}%`), isActive: true },
      relations: { district: { region: true } },
    });
    if (ward) {
      return {
        wardId: ward.id,
        ward: ward.name,
        districtId: ward.districtId,
        district: (ward.district as any)?.name,
        regionId: ward.regionId,
        region: (ward.district as any)?.region?.name,
        lat: ward.lat,
        lng: ward.lng,
      };
    }

    const district = await this.districtRepo.findOne({
      where: { name: ILike(`%${query}%`), isActive: true },
      relations: { region: true },
    });
    if (district) {
      return {
        wardId: null,
        ward: null,
        districtId: district.id,
        district: district.name,
        regionId: district.regionId,
        region: (district.region as any)?.name,
        lat: district.lat,
        lng: district.lng,
      };
    }

    return null;
  }
}
