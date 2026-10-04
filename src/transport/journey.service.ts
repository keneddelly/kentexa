import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Agent, AgentStatus } from '../agents/entities/agent.entity';
import { TransportProvider, ProviderStatus } from './entities/transport-provider.entity';
import { TransportRoute } from './entities/transport-route.entity';
import { ProviderAvailability, AvailabilityStatus } from './entities/provider-availability.entity';
import { JourneyLeg } from './entities/journey-leg.entity';
import { JourneySelection, JourneySelectionStatus } from './entities/journey-selection.entity';
import {
  CargoEvidenceLevel,
  CargoRequirements,
  CompatibilityStatus,
  JourneyActorType,
  JourneyCommitmentLevel,
  JourneyLegType,
} from './journey-contract';
import { JourneyCompatibilityService } from './journey-compatibility.service';
import { cityMatchParams, cityMatchSql, normalizeDiscoveryCity } from './city-match';

export interface DiscoverJourneyDto {
  originLabel: string;
  destinationLabel: string;
  originCity: string;
  destinationCity: string;
  originWardId?: number;
  originRegionId?: number;
  originLatitude?: number;
  originLongitude?: number;
  destinationWardId?: number;
  destinationRegionId?: number;
  destinationLatitude?: number;
  destinationLongitude?: number;
  cargo: CargoRequirements;
  requestAgentPickup?: boolean;
  requestAgentDelivery?: boolean;
}

export interface JourneyPlan {
  planId: string;
  compatibility: CompatibilityStatus;
  requiresConfirmation: boolean;
  summary: string;
  legs: Array<{
    sequence: number;
    legType: JourneyLegType;
    actorType: JourneyActorType;
    fromLabel: string;
    toLabel: string;
    providerId?: number;
    routeId?: number;
    availabilityId?: number;
    agentId?: number;
    compatibility: any;
  }>;
}

@Injectable()
export class JourneyService {
  constructor(
    @InjectRepository(TransportRoute) private readonly routeRepo: Repository<TransportRoute>,
    @InjectRepository(TransportProvider) private readonly providerRepo: Repository<TransportProvider>,
    @InjectRepository(ProviderAvailability) private readonly availabilityRepo: Repository<ProviderAvailability>,
    @InjectRepository(Agent) private readonly agentRepo: Repository<Agent>,
    @InjectRepository(JourneySelection) private readonly selectionRepo: Repository<JourneySelection>,
    @InjectRepository(JourneyLeg) private readonly legRepo: Repository<JourneyLeg>,
    private readonly compatibility: JourneyCompatibilityService,
    private readonly dataSource: DataSource,
  ) {}

  private validate(dto: DiscoverJourneyDto) {
    const originCity = normalizeDiscoveryCity(dto.originCity)!;
    const destinationCity = normalizeDiscoveryCity(dto.destinationCity)!;
    if (!dto.originLabel?.trim() || !dto.destinationLabel?.trim()) {
      throw new BadRequestException('Origin and destination are required');
    }
    if (!dto.cargo?.description?.trim() || !dto.cargo?.cargoClass) {
      throw new BadRequestException('Cargo description and cargoClass are required');
    }
    if (!dto.cargo.evidenceLevel) dto.cargo.evidenceLevel = CargoEvidenceLevel.DECLARED;
    for (const [name, value] of Object.entries({
      weightKg: dto.cargo.weightKg,
      lengthCm: dto.cargo.lengthCm,
      widthCm: dto.cargo.widthCm,
      heightCm: dto.cargo.heightCm,
      volumeM3: dto.cargo.volumeM3,
    })) {
      if (value != null && (!Number.isFinite(value) || value < 0)) {
        throw new BadRequestException(`${name} must be a non-negative number`);
      }
    }
    return { originCity, destinationCity };
  }

  async discover(dto: DiscoverJourneyDto): Promise<JourneyPlan[]> {
    const { originCity, destinationCity } = this.validate(dto);
    const qb = this.routeRepo.createQueryBuilder('r')
      .where('r."isActive" = true')
      .andWhere(cityMatchSql('r."originCity"', 'origin'))
      .andWhere(cityMatchSql('r."destinationCity"', 'destination'))
      .setParameters({ ...cityMatchParams('origin', originCity), ...cityMatchParams('destination', destinationCity) });
    const routes = await qb.getMany();
    if (!routes.length) return [];

    const providers = await this.providerRepo.find({
      where: { id: In([...new Set(routes.map(r => r.providerId))]) },
    });
    const providerById = new Map(providers
      .filter(p => [ProviderStatus.VERIFIED, ProviderStatus.ACTIVE].includes(p.status))
      .map(p => [p.id, p]));
    const eligibleRoutes = routes.filter(r => providerById.has(r.providerId));
    if (!eligibleRoutes.length) return [];

    const availabilities = await this.availabilityRepo.find({
      where: { routeId: In(eligibleRoutes.map(r => r.id)), status: AvailabilityStatus.OPEN },
      order: { date: 'ASC', departureTime: 'ASC' },
    });
    const availabilityByRoute = new Map<number, ProviderAvailability>();
    for (const a of availabilities) if (a.routeId != null && !availabilityByRoute.has(a.routeId)) availabilityByRoute.set(a.routeId, a);

    const originAgents = dto.requestAgentPickup ? await this.findAgents(originCity, dto.cargo) : [];
    const destinationAgents = dto.requestAgentDelivery ? await this.findAgents(destinationCity, dto.cargo) : [];

    const plans: JourneyPlan[] = [];
    for (const route of eligibleRoutes) {
      const provider = providerById.get(route.providerId)!;
      const availability = availabilityByRoute.get(route.id);
      const transportCompatibility = this.compatibility.evaluate(dto.cargo, {
        maxWeightKg: provider.defaultMaxWeightKg > 0 ? Number(provider.defaultMaxWeightKg) : null,
        acceptedCargoClasses: provider.acceptedCargoClasses,
      });
      if (transportCompatibility.status === CompatibilityStatus.INCOMPATIBLE) continue;

      const pickup = originAgents[0];
      const delivery = destinationAgents[0];
      const legs: JourneyPlan['legs'] = [];
      if (dto.requestAgentPickup) {
        if (!pickup) continue;
        legs.push({
          sequence: legs.length,
          legType: JourneyLegType.FIRST_MILE,
          actorType: JourneyActorType.AGENT,
          fromLabel: dto.originLabel,
          toLabel: route.originCity || originCity,
          agentId: pickup.agent.id,
          compatibility: pickup.result,
        });
      }
      legs.push({
        sequence: legs.length,
        legType: JourneyLegType.TRANSPORT,
        actorType: JourneyActorType.TRANSPORT_PROVIDER,
        fromLabel: route.originCity || originCity,
        toLabel: route.destinationCity || destinationCity,
        providerId: provider.id,
        routeId: route.id,
        availabilityId: availability?.id,
        compatibility: transportCompatibility,
      });
      if (dto.requestAgentDelivery) {
        if (!delivery) continue;
        legs.push({
          sequence: legs.length,
          legType: JourneyLegType.LAST_MILE,
          actorType: JourneyActorType.AGENT,
          fromLabel: route.destinationCity || destinationCity,
          toLabel: dto.destinationLabel,
          agentId: delivery.agent.id,
          compatibility: delivery.result,
        });
      }
      const requiresConfirmation = legs.some(l => l.compatibility.status === CompatibilityStatus.REQUIRES_CONFIRMATION);
      plans.push({
        planId: [route.id, availability?.id || 0, pickup?.agent.id || 0, delivery?.agent.id || 0].join(':'),
        compatibility: requiresConfirmation ? CompatibilityStatus.REQUIRES_CONFIRMATION : CompatibilityStatus.COMPATIBLE,
        requiresConfirmation,
        summary: legs.map(l => l.actorType === JourneyActorType.AGENT ? 'Agent' : provider.name).join(' → '),
        legs,
      });
    }
    return plans;
  }

  private async findAgents(city: string, cargo: CargoRequirements) {
    const agents = await this.agentRepo.createQueryBuilder('a')
      .where('a.status = :status', { status: AgentStatus.APPROVED })
      .andWhere('a."isOnline" = true')
      .andWhere('LOWER(a.city) = LOWER(:city)', { city })
      .orderBy('a.rating', 'DESC')
      .limit(20)
      .getMany();
    return agents.map(agent => ({
      agent,
      result: this.compatibility.evaluate(cargo, {
        maxWeightKg: Number(agent.maxWeightKg),
        maxVolumeM3: agent.maxVolumeM3 == null ? null : Number(agent.maxVolumeM3),
        maxLengthCm: agent.maxCargoLengthCm == null ? null : Number(agent.maxCargoLengthCm),
        maxWidthCm: agent.maxCargoWidthCm == null ? null : Number(agent.maxCargoWidthCm),
        maxHeightCm: agent.maxCargoHeightCm == null ? null : Number(agent.maxCargoHeightCm),
        acceptedCargoClasses: agent.acceptedCargoClasses,
        supportsLoadingAssistance: agent.supportsLoadingAssistance,
        supportsUnloadingAssistance: agent.supportsUnloadingAssistance,
        supportsLiftingEquipment: agent.supportsLiftingEquipment,
      }),
    })).filter(x => x.result.status !== CompatibilityStatus.INCOMPATIBLE);
  }

  async select(user: User, dto: DiscoverJourneyDto, planId: string, paymentMethod?: string) {
    const plans = await this.discover(dto);
    const plan = plans.find(p => p.planId === planId);
    if (!plan) throw new NotFoundException('Journey plan is no longer available');

    return this.dataSource.transaction(async manager => {
      const selectionRepo = manager.getRepository(JourneySelection);
      const legRepo = manager.getRepository(JourneyLeg);
      const firstCustody = plan.legs.find(l =>
        [JourneyActorType.AGENT, JourneyActorType.SUPER_AGENT, JourneyActorType.TRANSPORT_PROVIDER].includes(l.actorType),
      );
      const selection = await selectionRepo.save(selectionRepo.create({
        requestedByUserId: user.id,
        version: 1,
        supersedesSelectionId: null,
        supersededBySelectionId: null,
        originLabel: dto.originLabel.trim(),
        originWardId: dto.originWardId ?? null,
        originRegionId: dto.originRegionId ?? null,
        originLatitude: dto.originLatitude ?? null,
        originLongitude: dto.originLongitude ?? null,
        destinationLabel: dto.destinationLabel.trim(),
        destinationWardId: dto.destinationWardId ?? null,
        destinationRegionId: dto.destinationRegionId ?? null,
        destinationLatitude: dto.destinationLatitude ?? null,
        destinationLongitude: dto.destinationLongitude ?? null,
        cargoRequirements: dto.cargo,
        status: JourneySelectionStatus.SELECTED,
        expectedCashCollectorType: paymentMethod?.toLowerCase() === 'cash' ? firstCustody?.actorType ?? null : null,
        expectedCashCollectionLegSequence: paymentMethod?.toLowerCase() === 'cash' ? firstCustody?.sequence ?? null : null,
      }));
      await legRepo.save(plan.legs.map(l => legRepo.create({
        journeySelectionId: selection.id,
        sequence: l.sequence,
        legType: l.legType,
        actorType: l.actorType,
        fromLabel: l.fromLabel,
        toLabel: l.toLabel,
        providerId: l.providerId ?? null,
        routeId: l.routeId ?? null,
        availabilityId: l.availabilityId ?? null,
        runId: null,
        vehicleId: null,
        fromRouteStopId: null,
        toRouteStopId: null,
        agentId: l.agentId ?? null,
        superAgentId: null,
        commitmentLevel: JourneyCommitmentLevel.SERVICE_CONFIRMED,
        compatibility: l.compatibility,
      })));
      return { ...selection, legs: await legRepo.find({ where: { journeySelectionId: selection.id }, order: { sequence: 'ASC' } }) };
    });
  }

  async getSelection(user: User, id: number) {
    const selection = await this.selectionRepo.findOne({ where: { id, requestedByUserId: user.id } });
    if (!selection) throw new NotFoundException('Journey selection not found');
    const legs = await this.legRepo.find({ where: { journeySelectionId: id }, order: { sequence: 'ASC' } });
    return { ...selection, legs };
  }
}
