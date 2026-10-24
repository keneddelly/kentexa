import { BadRequestException, ForbiddenException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { SuperAgent, SuperAgentStatus } from './entities/super-agent.entity';
import { ShippingRate } from './entities/shipping-rate.entity';
import { SuperAgentPriceRule } from './entities/super-agent-price-rule.entity';
import { OfficeBodaFeeService } from './office-boda-fee.service';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import type { RoleContext } from '../role-context/role-context.types';
import type { User } from '../users/entities/user.entity';
import {
  ChargeMode, DEFAULT_COUNTRY, DEFAULT_CURRENCY, OfficePriceQuote, OfficePriceRuleInput,
  defaultRule, isDarEsSalaam, quoteOfficePrice,
} from './office-price';
import { OFFICE_PICKUP_MESSAGES, officePickupTableReady, officeSameCityColumnReady, readOfficePickupInput } from '../transport/office-offers';

export const OFFICE_PRICE_MESSAGES = {
  activeOfficeOnly: 'Ofisi hai (Super Agent) pekee inaweza kuweka au kuona bei.',
  badMode: 'Chagua kutoza kwa thamani au kwa kilo.',
  badPercent: 'Asilimia iwe zaidi ya 0 na isizidi 100.',
  badMinimum: 'Kiwango cha chini kiwe 0 au zaidi.',
  badValue: 'Thamani ya mzigo inahitajika na lazima iwe zaidi ya sifuri',
} as const;

export interface OfficeQuoteRequest {
  destinationCity?: string;
  declaredValue: number;
  weightKg?: number | null;
  /** Counter delivery type: 'local_agent' (agent delivery) | 'van' | 'intercity'. */
  servicePath?: string;
  deliveryAddress?: string | null;
  /** Only when an agent picks the parcel up (not at the counter). */
  pickupAddress?: string | null;
}

/**
 * The office price rule: read and save it (the "Bei" page) and quote a parcel with it
 * (the counter preview and the walk-in save use the same quote). See office-price.ts.
 */
@Injectable()
export class OfficePriceService {
  constructor(
    @InjectRepository(SuperAgentPriceRule) private readonly rules: Repository<SuperAgentPriceRule>,
    @InjectRepository(ShippingRate) private readonly rates: Repository<ShippingRate>,
    @InjectRepository(SuperAgent) private readonly offices: Repository<SuperAgent>,
    private readonly boda: OfficeBodaFeeService,
  ) {}

  /** The caller's own ACTIVE office, from the active Super Agent role context. */
  async activeOffice(user: User, roleContext: RoleContext | undefined): Promise<SuperAgent> {
    if (!user || !roleContext || roleContext.roleType !== AccountRoleType.SUPER_AGENT || roleContext.userId !== user.id) {
      throw new ForbiddenException(OFFICE_PRICE_MESSAGES.activeOfficeOnly);
    }
    const office = await this.offices.findOne({ where: { id: roleContext.profileId, userId: user.id, status: SuperAgentStatus.ACTIVE } as any });
    if (!office || (office.workspaceId != null && office.workspaceId !== roleContext.workspaceId)) {
      throw new ForbiddenException(OFFICE_PRICE_MESSAGES.activeOfficeOnly);
    }
    return office;
  }

  private toInput(row: SuperAgentPriceRule | null): OfficePriceRuleInput | null {
    return row ? { chargeMode: row.chargeMode, valuePercent: Number(row.valuePercent), valueMinimum: Number(row.valueMinimum), currency: row.currency } : null;
  }

  async ruleFor(officeId: number): Promise<OfficePriceRuleInput | null> {
    return this.toInput(await this.rules.findOne({ where: { superAgentId: officeId } }));
  }

  async getMyRule(user: User, roleContext: RoleContext | undefined) {
    const office = await this.activeOffice(user, roleContext);
    const [rule, rates] = await Promise.all([this.ruleFor(office.id), this.myRates(office)]);
    return { ...(rule ?? defaultRule()), source: rule ? 'office' : 'default', isDarEsSalaam: isDarEsSalaam(office.city), rates };
  }

  /** This office's own active per-destination rates: the rows a by-kg quote reads (read-only here). */
  private async myRates(office: SuperAgent) {
    const rows = await this.rates.find({ where: { superAgent: { id: office.id }, isActive: true } as any, order: { destinationCity: 'ASC' } });
    return rows.map((r) => ({
      destinationCity: r.destinationCity, ratePerKg: Number(r.ratePerKg), minimumCharge: Number(r.minimumCharge), estimatedDays: r.estimatedDays,
    }));
  }

  async setMyRule(user: User, roleContext: RoleContext | undefined, dto: { chargeMode?: string; valuePercent?: unknown; valueMinimum?: unknown }) {
    const office = await this.activeOffice(user, roleContext);
    const chargeMode = dto?.chargeMode as ChargeMode;
    if (chargeMode !== 'value' && chargeMode !== 'kg') throw new BadRequestException(OFFICE_PRICE_MESSAGES.badMode);
    const valuePercent = Number(dto?.valuePercent);
    if (!Number.isFinite(valuePercent) || valuePercent <= 0 || valuePercent > 100) throw new BadRequestException(OFFICE_PRICE_MESSAGES.badPercent);
    const valueMinimum = Number(dto?.valueMinimum);
    if (!Number.isFinite(valueMinimum) || valueMinimum < 0 || valueMinimum > 100_000_000) throw new BadRequestException(OFFICE_PRICE_MESSAGES.badMinimum);

    const existing = await this.rules.findOne({ where: { superAgentId: office.id } });
    const row = existing ?? this.rules.create({ superAgentId: office.id, currency: DEFAULT_CURRENCY, country: DEFAULT_COUNTRY });
    Object.assign(row, { chargeMode, valuePercent, valueMinimum, updatedByUserId: user.id });
    await this.rules.save(row);
    return this.getMyRule(user, roleContext);
  }

  /** The office's own by-kg rate for this destination, if any. */
  private async kgRateFor(office: SuperAgent, destinationCity?: string) {
    const city = typeof destinationCity === 'string' ? destinationCity.trim() : '';
    if (!city) return null;
    const rate = await this.rates.findOne({
      where: { superAgent: { id: office.id }, destinationCity: ILike(city), isActive: true } as any,
    });
    return rate ? { ratePerKg: Number(rate.ratePerKg), minimumCharge: Number(rate.minimumCharge) } : null;
  }

  /** One quote for a parcel at this office. The counter preview and the walk-in save both use it. */
  async quoteFor(office: SuperAgent, req: OfficeQuoteRequest): Promise<OfficePriceQuote> {
    const declaredValue = Number(req?.declaredValue);
    if (!Number.isFinite(declaredValue) || declaredValue <= 0) throw new BadRequestException(OFFICE_PRICE_MESSAGES.badValue);
    const [rule, kgRate] = await Promise.all([this.ruleFor(office.id), this.kgRateFor(office, req.destinationCity)]);

    // Dar es Salaam: an agent pickup / door delivery is the boda boda fee. Elsewhere it is
    // not part of this price (agent or van fees stay as they are today).
    const inDar = isDarEsSalaam(office.city);
    const officePlace = office.address || office.city;
    const deliveryBodaFee = inDar && req.servicePath === 'local_agent'
      ? await this.boda.feeBetween(officePlace, req.deliveryAddress || null) : null;
    const pickupBodaFee = inDar && req.pickupAddress
      ? await this.boda.feeBetween(req.pickupAddress, officePlace) : null;

    // Same-city parcel in Dar (agent delivery from a Dar office): only the boda fee.
    const sameCityDar = inDar && req.servicePath === 'local_agent';
    return quoteOfficePrice({ rule, kgRate, declaredValue, weightKg: req.weightKg ?? null, pickupBodaFee, deliveryBodaFee, sameCityDar });
  }

  // ── Pickup offer: does this office collect from senders, free or for a fee? ──
  async getMyPickup(user: User, roleContext: RoleContext | undefined) {
    const office = await this.activeOffice(user, roleContext);
    if (!(await officePickupTableReady(this.rules.manager, true))) throw new ServiceUnavailableException(OFFICE_PICKUP_MESSAGES.notReady);
    const sameCityOn = await officeSameCityColumnReady(this.rules.manager, true);
    const rows: any[] = await this.rules.manager.query(
      `SELECT mode, fee, "maxKm"${sameCityOn ? ', "sameCityDelivery"' : ''} FROM public.office_pickup_offer WHERE "superAgentId" = $1`, [office.id]);
    const r = rows[0];
    return {
      mode: r?.mode ?? 'none', fee: r?.fee == null ? null : Number(r.fee), maxKm: r?.maxKm == null ? null : Number(r.maxKm),
      // Delivers inside its own city too (null = setting not switched on yet on the server).
      sameCityDelivery: sameCityOn ? r?.sameCityDelivery === true : null,
      // A distance limit needs the office's own point on the map.
      officePointSet: office.latitude != null && office.longitude != null,
    };
  }

  async setMyPickup(user: User, roleContext: RoleContext | undefined, dto: any) {
    const office = await this.activeOffice(user, roleContext);
    if (!(await officePickupTableReady(this.rules.manager, true))) throw new ServiceUnavailableException(OFFICE_PICKUP_MESSAGES.notReady);
    let offer;
    try { offer = readOfficePickupInput(dto); } catch (e: any) {
      throw new BadRequestException((OFFICE_PICKUP_MESSAGES as any)[e?.message] || OFFICE_PICKUP_MESSAGES.badMode);
    }
    await this.rules.manager.query(`INSERT INTO public.office_pickup_offer ("superAgentId", mode, fee, "maxKm", "updatedByUserId", "updatedAt")
      VALUES ($1, $2, $3, $4, $5, now())
      ON CONFLICT ("superAgentId") DO UPDATE SET mode = EXCLUDED.mode, fee = EXCLUDED.fee, "maxKm" = EXCLUDED."maxKm",
        "updatedByUserId" = EXCLUDED."updatedByUserId", "updatedAt" = now()`,
    [office.id, offer.mode, offer.fee, offer.maxKm, user.id]);
    // Same-city delivery: changed only when sent, and only once the column exists.
    if (typeof dto?.sameCityDelivery === 'boolean' && await officeSameCityColumnReady(this.rules.manager, true)) {
      await this.rules.manager.query(`UPDATE public.office_pickup_offer SET "sameCityDelivery" = $2, "updatedAt" = now()
        WHERE "superAgentId" = $1`, [office.id, dto.sameCityDelivery]);
    }
    return this.getMyPickup(user, roleContext);
  }

  async previewMine(user: User, roleContext: RoleContext | undefined, req: OfficeQuoteRequest) {
    const office = await this.activeOffice(user, roleContext);
    return this.quoteFor(office, req);
  }
}
