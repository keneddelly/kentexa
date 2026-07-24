/**
 * TzPricingService — Smart district-level shipping price estimation
 *
 * Architecture designed for partner integration:
 *
 * Phase 1 (Now): KenteXa estimates based on region routes + district surcharges
 * Phase 2 (Partner): Bus company's real price replaces estimate for their routes
 * Phase 3 (Market): Multiple providers, buyer picks cheapest/fastest
 *
 * Pricing logic:
 *   1. Look up direct route (originCity → destinationCity)
 *   2. If not found, look up region route (originRegion → destinationRegion)
 *   3. Apply district surcharge based on urban/rural classification
 *   4. Round to nearest TZS 500
 *   5. Return with confidence level (exact/estimated/unknown)
 *
 * Surcharge tiers:
 *   Regional capital (Moshi Municipal) → 0% surcharge (base price)
 *   Urban district (Moshi Rural)       → 5% surcharge
 *   Rural district (Mwanga, Same)      → 10% surcharge
 *   Remote rural (Rombo)               → 15% surcharge
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { IntercityRoute } from '../super-agents/entities/intercity-route.entity';
import { TzRegion }   from './entities/tz-region.entity';
import { TzDistrict } from './entities/tz-district.entity';

export interface PriceEstimate {
  basePrice:       number;   // base route price
  districtFee:     number;   // surcharge for district (0 if capital/direct)
  totalPrice:      number;   // final price shown to user
  perKgFee:        number;   // additional per kg above 1kg base
  estimatedDays:   number;
  transitCity:     string | null;
  confidence:      'exact' | 'estimated' | 'unknown';
  // What powered this estimate
  routeType:       'direct' | 'region_to_region' | 'district' | 'transit' | 'fallback';
  via:             string | null;   // e.g. "via Moshi" for Mwanga
  providerName:    string | null;   // e.g. "Scandinavian Express" if partner
  isPartnerPrice:  boolean;
  // Display string for UI
  displayPrice:    string;   // e.g. "~TZS 5,500" or "TZS 5,000"
  displayNote:     string;   // e.g. "Bei halisi ya Scandinavian"
}

@Injectable()
export class TzPricingService {
  private readonly logger = new Logger(TzPricingService.name);

  constructor(
    @InjectRepository(IntercityRoute)
    private routeRepo: Repository<IntercityRoute>,
    @InjectRepository(TzRegion)
    private regionRepo: Repository<TzRegion>,
    @InjectRepository(TzDistrict)
    private districtRepo: Repository<TzDistrict>,
  ) {}


  // ── Tanzania region capitals — maps region name to route city ────────────
  // IntercityRoute uses city names (e.g. 'Moshi') not region names ('Kilimanjaro')
  // This map lets us find the right route when given a region name
  private readonly REGION_CAPITALS: Record<string, string> = {
    'Dar es Salaam': 'Dar es Salaam',
    'Mwanza':        'Mwanza',
    'Arusha':        'Arusha',
    'Kilimanjaro':   'Moshi',
    'Tanga':         'Tanga',
    'Morogoro':      'Morogoro',
    'Dodoma':        'Dodoma',
    'Mbeya':         'Mbeya',
    'Iringa':        'Iringa',
    'Mara':          'Musoma',
    'Kagera':        'Bukoba',
    'Kigoma':        'Kigoma',
    'Tabora':        'Tabora',
    'Shinyanga':     'Shinyanga',
    'Singida':       'Singida',
    'Lindi':         'Lindi',
    'Mtwara':        'Mtwara',
    'Ruvuma':        'Songea',
    'Pwani':         'Kibaha',
    'Rukwa':         'Sumbawanga',
    'Manyara':       'Babati',
    'Geita':         'Geita',
    'Katavi':        'Mpanda',
    'Njombe':        'Njombe',
    'Simiyu':        'Bariadi',
    'Songwe':        'Vwawa',
    'Zanzibar North':'Mkokotoni',
    'Zanzibar South':'Koani',
    'Zanzibar West': 'Zanzibar City',
    'Pemba North':   'Wete',
    'Pemba South':   'Chake Chake',
  };

  // ── Round to nearest TZS 500 ─────────────────────────────────────────────

  private round500(amount: number): number {
    return Math.ceil(amount / 500) * 500;
  }

  // ── District surcharge multiplier ─────────────────────────────────────────
  // isUrban + name contains 'Municipal' or 'City' = regional capital = no surcharge
  // isUrban but not capital = 5% surcharge
  // !isUrban = rural = 10% surcharge

  private districtMultiplier(district: TzDistrict | null, route?: IntercityRoute): number {
    if (!district) return 1.0;

    // Use route's custom multiplier if set (partner may override)
    if (route) {
      const name = district.name.toLowerCase();
      const isCapital = name.includes('municipal') || name.includes('city') ||
                        name.includes('mjini');
      if (isCapital) return 1.0;
      if (district.isUrban) return Number(route.districtMultiplierUrban) || 1.05;
      return Number(route.districtMultiplierRural) || 1.10;
    }

    // Default multipliers
    const name = district.name.toLowerCase();
    const isCapital = name.includes('municipal') || name.includes('city') ||
                      name.includes('mjini');
    if (isCapital) return 1.0;
    if (district.isUrban) return 1.05;
    return 1.10;
  }

  // ── Main estimate method ──────────────────────────────────────────────────

  async estimate(params: {
    originCity:       string;        // "Dar es Salaam"
    destinationCity:  string;        // "Mwanga" or "Kilimanjaro"
    weightKg?:        number;        // default 1
    originRegion?:    string;        // pre-resolved region name
    destRegion?:      string;        // pre-resolved region name
    destDistrictId?:  number;        // for precise district surcharge
    destDistrictName?:string;        // fallback
  }): Promise<PriceEstimate> {
    const weight = Math.max(params.weightKg || 1, 1);

    // ── Step 1: Try direct city-to-city route ────────────────────────────

    const direct = await this.routeRepo.findOne({
      where: {
        originCity:      params.originCity,
        destinationCity: params.destinationCity,
        isActive:        true,
      },
    });

    if (direct) {
      const base     = Number(direct.baseShippingFee);
      const perKg    = Number(direct.perKgFee);
      const extraKg  = Math.max(weight - 1, 0);
      const total    = this.round500(base + extraKg * perKg);

      return {
        basePrice:      base,
        districtFee:    0,
        totalPrice:     total,
        perKgFee:       perKg,
        estimatedDays:  direct.estimatedDays,
        transitCity:    direct.transitCity,
        confidence:     'exact',
        routeType:      'direct',
        via:            direct.transitCity ? `via ${direct.transitCity}` : null,
        providerName:   direct.providerName || null,
        isPartnerPrice: direct.isPartnerRoute,
        displayPrice:   `TZS ${total.toLocaleString()}`,
        displayNote:    direct.isPartnerRoute
                          ? `Bei halisi ya ${direct.providerName}`
                          : 'Bei halisi ya njia hii',
      };
    }

    // ── Step 2: Resolve regions ─────────────────────────────────────────

    const originRegionName = params.originRegion || params.originCity;
    let destRegionName     = params.destRegion   || params.destinationCity;
    let destDistrict: TzDistrict | null = null;

    // If destination is a district name, look up its region
    if (params.destDistrictId) {
      destDistrict = await this.districtRepo.findOne({
        where: { id: params.destDistrictId },
        relations: { region: true },
      });
      if (destDistrict?.region) {
        destRegionName = (destDistrict.region as any).name;
      }
    } else if (params.destDistrictName) {
      destDistrict = await this.districtRepo.findOne({
        where: { name: ILike(`%${params.destDistrictName}%`) },
        relations: { region: true },
      });
      if (destDistrict?.region) {
        destRegionName = (destDistrict.region as any).name;
      }
    } else {
      // Try to find destination as a district
      destDistrict = await this.districtRepo.findOne({
        where: { name: ILike(`%${params.destinationCity}%`) },
        relations: { region: true },
      });
      if (destDistrict?.region) {
        destRegionName = (destDistrict.region as any).name;
      }
    }

    // ── Step 2.5: Direct lookup using resolved capital city ─────────────────
    // After resolving region, try direct city→capital route
    // e.g. "Dar es Salaam" → "Moshi" (when user selected Kilimanjaro district)
    const earlyCapital = this.REGION_CAPITALS[destRegionName] || destRegionName;
    if (earlyCapital !== params.destinationCity) {
      const capitalRoute = await this.routeRepo
        .createQueryBuilder('r')
        .where('LOWER(r.originCity) LIKE LOWER(:origin)', { origin: `%${params.originCity}%` })
        .andWhere('LOWER(r.destinationCity) LIKE LOWER(:cap)', { cap: `%${earlyCapital}%` })
        .andWhere('r.isActive = true')
        .orderBy('r.isPartnerRoute', 'DESC')
        .addOrderBy('r.baseShippingFee', 'ASC')
        .getOne();
      if (capitalRoute) {
        const base    = Number(capitalRoute.baseShippingFee);
        const perKg   = Number(capitalRoute.perKgFee);
        const extraKg = Math.max(weight - 1, 0);
        const mult    = this.districtMultiplier(destDistrict, capitalRoute);
        const total   = this.round500((base + extraKg * perKg) * mult);
        const fee     = mult > 1 ? this.round500(base * (mult - 1)) : 0;
        return {
          basePrice:      base,
          districtFee:    fee,
          totalPrice:     total,
          perKgFee:       perKg,
          estimatedDays:  capitalRoute.estimatedDays + 1,
          transitCity:    capitalRoute.transitCity,
          confidence:     'estimated',
          routeType:      'district',
          via:            capitalRoute.transitCity ? `via ${capitalRoute.transitCity}` : null,
          providerName:   capitalRoute.providerName || null,
          isPartnerPrice: capitalRoute.isPartnerRoute,
          displayPrice:   `~TZS ${total.toLocaleString()}`,
          displayNote:    `Makisio — ${params.destinationCity} iko katika mkoa wa ${destRegionName}`,
        };
      }
    }

    // ── Step 3: Region-to-region route ──────────────────────────────────────
    // KEY FIX: routes store CITY names not REGION names
    // Kilimanjaro region → capital = Moshi
    // Must query destinationCity='Moshi', not destinationCity='Kilimanjaro'
    const destCapital   = this.REGION_CAPITALS[destRegionName]   || destRegionName;
    const originCapital = this.REGION_CAPITALS[originRegionName] || originRegionName;

    const regionRoute = await this.routeRepo
      .createQueryBuilder('r')
      .where(
        '(LOWER(r.originCity) = LOWER(:origin) OR LOWER(r.originCity) = LOWER(:originCap))',
        { origin: originRegionName, originCap: originCapital }
      )
      .andWhere('r.isActive = true')
      .andWhere(
        `(LOWER(r.destinationCity) = LOWER(:destCap)
          OR LOWER(r.destinationCity) = LOWER(:destRegion)
          OR LOWER(r.destinationRegion) = LOWER(:destRegion)
          OR LOWER(r.destinationRegion) = LOWER(:destCap))`,
        { destCap: destCapital, destRegion: destRegionName }
      )
      .orderBy('r.isPartnerRoute', 'DESC')
      .addOrderBy('r.baseShippingFee', 'ASC')
      .getOne();

    if (regionRoute) {
      const base        = Number(regionRoute.baseShippingFee);
      const perKg       = Number(regionRoute.perKgFee);
      const extraKg     = Math.max(weight - 1, 0);
      const multiplier  = this.districtMultiplier(destDistrict, regionRoute);
      const districtFee = this.round500(base * multiplier) - base;
      const total       = this.round500((base + extraKg * perKg) * multiplier);
      const isDifferent = params.destinationCity !== regionRoute.destinationCity;
      const via         = isDifferent
                            ? `via ${regionRoute.destinationCity}`
                            : regionRoute.transitCity
                            ? `via ${regionRoute.transitCity}`
                            : null;

      return {
        basePrice:      base,
        districtFee,
        totalPrice:     total,
        perKgFee:       perKg,
        estimatedDays:  regionRoute.estimatedDays + (isDifferent ? 1 : 0),
        transitCity:    regionRoute.transitCity || (isDifferent ? regionRoute.destinationCity : null),
        confidence:     isDifferent ? 'estimated' : 'exact',
        routeType:      isDifferent ? 'region_to_region' : 'direct',
        via,
        providerName:   regionRoute.providerName || null,
        isPartnerPrice: regionRoute.isPartnerRoute,
        displayPrice:   `~TZS ${total.toLocaleString()}`,
        displayNote:    isDifferent
                          ? `Makisio — ${params.destinationCity} iko katika mkoa wa ${destRegionName}`
                          : `Bei halisi ya njia hii`,
      };
    }

    // ── Step 4: Reverse lookup ─────────────────────────────────────────
    // Try from any origin that we have routes for

    const anyRoute = await this.routeRepo.findOne({
      where: {
        destinationCity: originRegionName,
        isActive:        true,
      },
    });

    if (anyRoute) {
      // We know rough distance from the reverse route
      const base      = Number(anyRoute.baseShippingFee);
      const perKg     = Number(anyRoute.perKgFee);
      const extraKg   = Math.max(weight - 1, 0);
      const total     = this.round500((base + extraKg * perKg) * 1.10);

      return {
        basePrice:      base,
        districtFee:    this.round500(base * 0.10),
        totalPrice:     total,
        perKgFee:       perKg,
        estimatedDays:  anyRoute.estimatedDays,
        transitCity:    null,
        confidence:     'estimated',
        routeType:      'fallback',
        via:            null,
        providerName:   null,
        isPartnerPrice: false,
        displayPrice:   `~TZS ${total.toLocaleString()}`,
        displayNote:    'Makisio tu — bei halisi itajulikana baadaye',
      };
    }

    // ── Step 5: Unknown route ────────────────────────────────────────────

    return {
      basePrice:      0,
      districtFee:    0,
      totalPrice:     0,
      perKgFee:       0,
      estimatedDays:  3,
      transitCity:    null,
      confidence:     'unknown',
      routeType:      'fallback',
      via:            null,
      providerName:   null,
      isPartnerPrice: false,
      displayPrice:   'Bei haijulikani',
      displayNote:    'Wasiliana nasi kwa bei',
    };
  }

  // ── Multi-provider estimate ──────────────────────────────────────────────
  // Returns ALL available providers for this route (for future comparison UI)

  async estimateAllProviders(params: {
    originCity:      string;
    destinationCity: string;
    weightKg?:       number;
  }): Promise<{
    providers: Array<PriceEstimate & { providerName: string }>;
    recommended: PriceEstimate;
  }> {
    const routes = await this.routeRepo.find({
      where: {
        originCity:      params.originCity,
        destinationCity: params.destinationCity,
        isActive:        true,
      },
      order: { baseShippingFee: 'ASC' },
    });

    if (routes.length === 0) {
      const estimate = await this.estimate(params);
      return {
        providers:   [{ ...estimate, providerName: 'KenteXa (Makisio)' }],
        recommended: estimate,
      };
    }

    const providers = await Promise.all(
      routes.map(async r => {
        const est = await this.estimate({ ...params, originCity: r.originCity, destinationCity: r.destinationCity });
        return { ...est, providerName: r.providerName || 'KenteXa' };
      })
    );

    return {
      providers,
      recommended: providers[0], // cheapest first
    };
  }
}