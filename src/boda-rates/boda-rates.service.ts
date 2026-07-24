import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BodaRateCard } from './boda-rate-card.entity';

/**
 * BodaRatesService — calculates boda fee based on buyer address + item weight
 * Rate card is stored in DB and editable by admin
 */
@Injectable()
export class BodaRatesService implements OnModuleInit {
  private readonly logger = new Logger(BodaRatesService.name);

  constructor(
    @InjectRepository(BodaRateCard) private rateRepo: Repository<BodaRateCard>,
  ) {}

  // ── Seed default rates if none exist ────────────────────────────────────
  async onModuleInit() {
    const count = await this.rateRepo.count();
    if (count === 0) {
      await this.seedDefaultRates();
    }
  }

  private async seedDefaultRates() {
    const defaults: Partial<BodaRateCard>[] = [
      // Base fee — always charged
      {
        rateKey: 'base', label: 'Ada ya Msingi', category: 'base',
        fee: 1500, sortOrder: 0, isActive: true,
        keywords: [], weightMin: undefined, weightMax: undefined,
      },
      // Zone fees — added on top of base based on buyer address
      {
        rateKey: 'zone_1', label: 'Eneo 1 — Kariakoo / Ilala / Upanga',
        category: 'zone', fee: 500, sortOrder: 1, isActive: true,
        keywords: ['kariakoo','ilala','upanga','kisutu','gerezani','kivukoni','Chang\'ombe'],
        weightMin: undefined, weightMax: undefined,
      },
      {
        rateKey: 'zone_2', label: 'Eneo 2 — Kinondoni / Ubungo / Temeke',
        category: 'zone', fee: 1500, sortOrder: 2, isActive: true,
        keywords: ['kinondoni','mikocheni','mwenge','sinza','ubungo','magomeni',
                   'mwananyamala','tandale','manzese','kijitonyama','temeke',
                   'kigamboni','kurasini','mtoni','msasani','masaki','oyster bay'],
        weightMin: undefined, weightMax: undefined,
      },
      {
        rateKey: 'zone_3', label: 'Eneo 3 — Mbagala / Mbezi / Kimara',
        category: 'zone', fee: 3000, sortOrder: 3, isActive: true,
        keywords: ['mbagala','mbagala kuu','yombo','tandika','mbezi','mbezi louis',
                   'mbezi beach','kimara','kibamba','makuburi'],
        weightMin: undefined, weightMax: undefined,
      },
      {
        rateKey: 'zone_4', label: 'Eneo 4 — Bunju / Tegeta / Boko',
        category: 'zone', fee: 6000, sortOrder: 4, isActive: true,
        keywords: ['bunju','bunju a','bunju b','mbweni','tegeta','boko','kunduchi'],
        weightMin: undefined, weightMax: undefined,
      },
      // Weight surcharges — added on top of base + zone
      {
        rateKey: 'weight_0_2', label: 'Uzito 0 – 2 kg',
        category: 'weight', fee: 0, sortOrder: 1, isActive: true,
        keywords: [], weightMin: 0, weightMax: 2,
      },
      {
        rateKey: 'weight_2_5', label: 'Uzito 2 – 5 kg',
        category: 'weight', fee: 1000, sortOrder: 2, isActive: true,
        keywords: [], weightMin: 2, weightMax: 5,
      },
      {
        rateKey: 'weight_5_10', label: 'Uzito 5 – 10 kg',
        category: 'weight', fee: 2500, sortOrder: 3, isActive: true,
        keywords: [], weightMin: 5, weightMax: 10,
      },
      {
        rateKey: 'weight_10_plus', label: 'Uzito 10+ kg',
        category: 'weight', fee: 5000, sortOrder: 4, isActive: true,
        keywords: [], weightMin: 10, weightMax: 9999,
      },
    ];

    for (const rate of defaults) {
      await this.rateRepo.save(this.rateRepo.create(rate));
    }
    this.logger.log('BodaRateCard seeded with default rates');
  }

  // ── Calculate boda fee for a given address + weight ──────────────────────
  async calculateFee(buyerAddress: string, weightKg: number = 0): Promise<{
    fee: number;
    breakdown: { label: string; fee: number }[];
    zone: string | null;
    zoneKey: string | null;
  }> {
    const rates = await this.rateRepo.find({ where: { isActive: true } });
    const lower = (buyerAddress || '').toLowerCase().trim();

    // 1. Base fee
    const baseRate = rates.find(r => r.category === 'base');
    const baseFee  = baseRate?.fee || 1500;
    const breakdown: { label: string; fee: number }[] = [
      { label: baseRate?.label || 'Ada ya Msingi', fee: baseFee },
    ];

    // 2. Zone fee — find matching zone by keywords
    const zoneRates = rates
      .filter(r => r.category === 'zone')
      .sort((a, b) => a.sortOrder - b.sortOrder);

    let zoneFee  = 0;
    let zoneName: string | null = null;
    let zoneKey: string | null  = null;

    for (const zone of zoneRates) {
      const keywords = zone.keywords || [];
      if (keywords.some(kw => lower.includes(kw.toLowerCase()))) {
        zoneFee  = zone.fee;
        zoneName = zone.label;
        zoneKey  = zone.rateKey;
        breakdown.push({ label: zone.label, fee: zone.fee });
        break;
      }
    }

    // If no zone matched but address looks like Dar — use zone 2 as default
    const isDar = ['dar','kariakoo','ilala','kinondoni','temeke','ubungo','salaam','dsm']
      .some(kw => lower.includes(kw));
    if (!zoneName && isDar) {
      const zone2 = zoneRates.find(z => z.rateKey === 'zone_2');
      if (zone2) {
        zoneFee  = zone2.fee;
        zoneName = zone2.label;
        zoneKey  = zone2.rateKey;
        breakdown.push({ label: `${zone2.label} (kadirio)`, fee: zone2.fee });
      }
    }

    // 3. Weight surcharge
    const weight = Number(weightKg) || 0;
    const weightRates = rates
      .filter(r => r.category === 'weight')
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const weightRate = weightRates.find(r =>
      weight >= Number(r.weightMin) && weight < Number(r.weightMax)
    );
    const weightFee = weightRate?.fee || 0;
    if (weightFee > 0) {
      breakdown.push({ label: weightRate?.label || 'Ada ya Uzito', fee: weightFee });
    }

    const total = baseFee + zoneFee + weightFee;
    return { fee: total, breakdown, zone: zoneName, zoneKey };
  }

  // ── Get all rates for admin panel ────────────────────────────────────────
  async getAllRates() {
    return this.rateRepo.find({ order: { category: 'ASC', sortOrder: 'ASC' } });
  }

  // ── Update a rate ────────────────────────────────────────────────────────
  async updateRate(rateKey: string, dto: { fee?: number; label?: string; isActive?: boolean; keywords?: string[] }) {
    const rate = await this.rateRepo.findOne({ where: { rateKey } });
    if (!rate) {
      // Create it if it doesn't exist
      return this.rateRepo.save(this.rateRepo.create({ rateKey, ...dto } as any));
    }
    Object.assign(rate, dto);
    return this.rateRepo.save(rate);
  }

  // ── Get rate card summary for frontend ──────────────────────────────────
  async getRateCardSummary() {
    const rates = await this.rateRepo.find({
      where: { isActive: true },
      order: { category: 'ASC', sortOrder: 'ASC' },
    });
    return {
      base:    rates.filter(r => r.category === 'base'),
      zones:   rates.filter(r => r.category === 'zone'),
      weights: rates.filter(r => r.category === 'weight'),
    };
  }
}