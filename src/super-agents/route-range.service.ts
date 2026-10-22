import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { ShippingRate } from './entities/shipping-rate.entity';
import { SuperAgentStatus } from './entities/super-agent.entity';
import { OfficePriceService } from './office-price.service';
import { computeRouteRange, RouteRange } from './route-range';
import type { RoleContext } from '../role-context/role-context.types';
import type { User } from '../users/entities/user.entity';

/**
 * The anonymous route range for the caller's own active office (see route-range.ts).
 * Reads every active office's per-destination rate on the route and returns only the
 * rounded range and this office's position: no office name, id or exact price leaves here.
 */
@Injectable()
export class RouteRangeService {
  constructor(
    @InjectRepository(ShippingRate) private readonly rates: Repository<ShippingRate>,
    private readonly offices: OfficePriceService,
  ) {}

  async mine(user: User, roleContext: RoleContext | undefined, q: { destinationCity?: string; weightKg?: unknown }): Promise<RouteRange & { destinationCity: string }> {
    const office = await this.offices.activeOffice(user, roleContext);
    const destinationCity = typeof q?.destinationCity === 'string' ? q.destinationCity.trim() : '';
    const weightKg = Number(q?.weightKg) > 0 ? Number(q.weightKg) : 1;
    if (!destinationCity || !office.city) return { destinationCity, ...computeRouteRange([], office.id, weightKg) };

    const rows = await this.rates.find({
      where: { originCity: ILike(office.city), destinationCity: ILike(destinationCity), isActive: true } as any,
      relations: { superAgent: true },
      order: { updatedAt: 'DESC' },
    });
    // Live offices only: no training office, nothing suspended or still pending.
    const live = rows.filter((r) => r.superAgent && r.superAgent.status === SuperAgentStatus.ACTIVE && !r.superAgent.isTrainingOffice);
    const range = computeRouteRange(
      live.map((r) => ({ officeId: r.superAgent.id, ratePerKg: Number(r.ratePerKg), minimumCharge: Number(r.minimumCharge) })),
      office.id, weightKg,
    );
    return { destinationCity, ...range };
  }
}
