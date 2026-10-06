import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JourneyCommitmentLevel, JourneyLeg, JourneyLegType, JourneySelection, JourneySelectionStatus } from './entities/journey-selection.entity';
import { CargoRequirements, normalizeCargoRequirements } from './journey/cargo-requirements';
import { TransportService } from './transport.service';

export interface SelectJourneyLegDto {
  type: JourneyLegType;
  fromNode: Record<string, unknown>;
  toNode: Record<string, unknown>;
  providerId?: number | null;
  routeId?: number | null;
  loadRouteStopId?: number | null;
  unloadRouteStopId?: number | null;
  availabilityId?: number | null;
  runId?: number | null;
  agentId?: number | null;
  superAgentId?: number | null;
  commitmentLevel?: JourneyCommitmentLevel;
  requiredActorCapability?: string | null;
  executionRequirements?: Record<string, unknown>;
}

export interface SelectJourneyDto {
  originSnapshot: Record<string, unknown>;
  destinationSnapshot: Record<string, unknown>;
  cargoRequirements: CargoRequirements;
  legs: SelectJourneyLegDto[];
  paymentMethod?: 'cash' | 'prepaid';
}

/**
 * Gate 1 (audit finding 13). POST /transport/journeys and .../replan take
 * legs written by the client. select() below only re-validates TRANSPORT
 * legs (provider eligible, route serves the journey, slot discoverable); an
 * agentId or superAgentId on any leg was stored as given, and cashCollector()
 * then derived the AUTHORIZED cash collector from it. A caller could
 * therefore name any Agent or Super Agent as the party entitled to collect
 * money for their parcel.
 *
 * Until first-mile, hub and last-mile legs are composed and validated by the
 * server, a client-written journey may contain transport legs only, and may
 * not name an Agent or a Super Agent. Server-side callers (the composer)
 * call select() directly and are unaffected.
 */
export function assertClientAuthoredJourney(dto: SelectJourneyDto | undefined | null): void {
  if (!dto || typeof dto !== 'object') throw new BadRequestException('A journey is required');
  if (!Array.isArray(dto.legs) || dto.legs.length === 0) {
    throw new BadRequestException('A journey must contain at least one leg');
  }
  for (const leg of dto.legs) {
    if (!leg || typeof leg !== 'object' || leg.type !== JourneyLegType.TRANSPORT) {
      throw new BadRequestException('Only transport legs can be selected directly; other legs are composed by Kentexa');
    }
    if (leg.agentId != null || leg.superAgentId != null) {
      throw new BadRequestException('A journey request cannot name an Agent or a Super Agent');
    }
    // Gate 2: which Run, which of its stops and how firmly it is committed
    // are decided by the server (POST /transport/journeys/select-composed).
    if (leg.runId != null || leg.loadRouteStopId != null || leg.unloadRouteStopId != null || leg.commitmentLevel != null) {
      throw new BadRequestException('A trip is selected through journeys/select-composed, not written into a journey request');
    }
  }
}

@Injectable()
export class JourneySelectionService {
  constructor(
    @InjectRepository(JourneySelection) private readonly selections: Repository<JourneySelection>,
    private readonly dataSource: DataSource,
    private readonly transport: TransportService,
  ) {}

  private cashCollector(legs: SelectJourneyLegDto[], paymentMethod?: string): { type: string | null; sequence: number | null } {
    if (paymentMethod !== 'cash') return { type: null, sequence: null };
    // Cash follows physical custody, not merely the first actor id appearing
    // anywhere in the plan. CUSTOMER_PICKUP never authorizes collection and a
    // future informational leg cannot accidentally become a cash desk.
    const custodyTypes = new Set<JourneyLegType>([
      JourneyLegType.FIRST_MILE,
      JourneyLegType.HUB_INTAKE,
      JourneyLegType.TRANSPORT,
      JourneyLegType.TRANSFER,
      JourneyLegType.LAST_MILE,
    ]);
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      if (!custodyTypes.has(leg.type)) continue;
      if (leg.agentId != null) return { type: 'agent', sequence: i + 1 };
      if (leg.superAgentId != null) return { type: 'super_agent', sequence: i + 1 };
      if (leg.providerId != null) return { type: 'transport_provider', sequence: i + 1 };
    }
    throw new BadRequestException('Cash journey has no authorized first physical custodian');
  }

  async markQuoted(userId: number, id: number, manager?: any): Promise<void> {
    const repo = manager ? manager.getRepository(JourneySelection) : this.selections;
    const journey = await repo.findOne({ where: { id, requestedByUserId: userId } });
    if (!journey) throw new NotFoundException('Journey selection not found');
    if (journey.status === JourneySelectionStatus.SUPERSEDED || journey.status === JourneySelectionStatus.CANCELLED) {
      throw new BadRequestException('Journey selection is not available for quoting');
    }
    if (journey.status === JourneySelectionStatus.SELECTED) {
      journey.status = JourneySelectionStatus.QUOTED;
      await repo.save(journey);
    }
  }

  async markCommitted(userId: number, id: number, manager?: any): Promise<void> {
    const repo = manager ? manager.getRepository(JourneySelection) : this.selections;
    const journey = await repo.findOne({ where: { id, requestedByUserId: userId } });
    if (!journey) throw new NotFoundException('Journey selection not found');
    if (journey.status === JourneySelectionStatus.COMMITTED) return;
    if (journey.status !== JourneySelectionStatus.QUOTED) {
      throw new BadRequestException('Journey must be quoted before it can be committed');
    }
    journey.status = JourneySelectionStatus.COMMITTED;
    await repo.save(journey);
  }

  private async revalidateLegs(legs: SelectJourneyLegDto[], cargo: CargoRequirements): Promise<void> {
    for (const leg of legs) {
      if (leg.type !== JourneyLegType.TRANSPORT) continue;
      if (leg.providerId == null || leg.routeId == null) throw new BadRequestException('Transport leg requires providerId and routeId');
      await this.transport.assertEligibleProvider(leg.providerId);
      const from = String((leg.fromNode as any)?.city ?? (leg.fromNode as any)?.label ?? '').trim();
      const to = String((leg.toNode as any)?.city ?? (leg.toNode as any)?.label ?? '').trim();
      if (!from || !to) throw new BadRequestException('Transport leg requires server-resolvable from/to nodes');
      if (leg.runId != null) {
        // Gate 2: a leg on a Transport Run is proved against the Run itself
        // (open, not departed, room, this provider/route, and a stop pair
        // that serves from -> to) -- not against the route's summary columns.
        await this.transport.assertRunServes(leg.runId, from, to, Number(cargo.weightKg) || 0, {
          providerId: leg.providerId, routeId: leg.routeId,
        });
        continue;
      }
      await this.transport.assertRouteServesJourney(leg.routeId, from, to);
      if (leg.availabilityId != null) await this.transport.assertAvailabilityIsDiscoverable(leg.availabilityId, Number(cargo.weightKg) || 0);
    }
  }

  async select(requestedByUserId: number, dto: SelectJourneyDto): Promise<JourneySelection> {
    if (!dto || !Array.isArray(dto.legs) || !dto.legs.length) {
      throw new BadRequestException('A journey must contain at least one leg');
    }
    if (!dto.originSnapshot || typeof dto.originSnapshot !== 'object' ||
        !dto.destinationSnapshot || typeof dto.destinationSnapshot !== 'object') {
      throw new BadRequestException('A journey needs an origin and a destination');
    }
    const cargo = normalizeCargoRequirements(dto.cargoRequirements);
    await this.revalidateLegs(dto.legs, cargo);
    const collector = this.cashCollector(dto.legs, dto.paymentMethod);
    return this.dataSource.transaction(async manager => {
      const selection = await manager.getRepository(JourneySelection).save(manager.getRepository(JourneySelection).create({
        requestedByUserId,
        version: 1,
        supersedesSelectionId: null,
        supersededBySelectionId: null,
        status: JourneySelectionStatus.SELECTED,
        originSnapshot: dto.originSnapshot,
        destinationSnapshot: dto.destinationSnapshot,
        cargoRequirements: cargo,
        expectedCashCollectorType: collector.type,
        expectedCashCollectionLegSequence: collector.sequence,
      }));
      await manager.getRepository(JourneyLeg).save(dto.legs.map((leg, i) => manager.getRepository(JourneyLeg).create({
        ...leg,
        journeySelectionId: selection.id,
        sequence: i + 1,
      })));
      return selection;
    });
  }

  async getOwned(userId: number, id: number): Promise<{ selection: JourneySelection; legs: JourneyLeg[] }> {
    const selection = await this.selections.findOne({ where: { id, requestedByUserId: userId } });
    if (!selection) throw new NotFoundException('Journey selection not found');
    const legs = await this.dataSource.getRepository(JourneyLeg).find({ where: { journeySelectionId: id }, order: { sequence: 'ASC' } });
    return { selection, legs };
  }

  async replan(userId: number, previousId: number, dto: SelectJourneyDto): Promise<JourneySelection> {
    return this.dataSource.transaction(async manager => {
      const repo = manager.getRepository(JourneySelection);
      const previous = await repo.findOne({ where: { id: previousId }, lock: { mode: 'pessimistic_write' } });
      if (!previous || previous.requestedByUserId !== userId) throw new NotFoundException('Journey selection not found');
      if (previous.status === JourneySelectionStatus.COMMITTED) throw new BadRequestException('Committed journey requires an execution exception flow');
      if (previous.status === JourneySelectionStatus.SUPERSEDED) throw new BadRequestException('Journey is already superseded');
      if (!dto || !Array.isArray(dto.legs) || !dto.legs.length) {
        throw new BadRequestException('A journey must contain at least one leg');
      }
      const cargo = normalizeCargoRequirements(dto.cargoRequirements);
      await this.revalidateLegs(dto.legs, cargo);
      const collector = this.cashCollector(dto.legs, dto.paymentMethod);
      const next = await repo.save(repo.create({
        requestedByUserId: userId,
        version: previous.version + 1,
        supersedesSelectionId: previous.id,
        supersededBySelectionId: null,
        status: JourneySelectionStatus.SELECTED,
        originSnapshot: dto.originSnapshot,
        destinationSnapshot: dto.destinationSnapshot,
        cargoRequirements: cargo,
        expectedCashCollectorType: collector.type,
        expectedCashCollectionLegSequence: collector.sequence,
      }));
      await manager.getRepository(JourneyLeg).save(dto.legs.map((leg, i) => manager.getRepository(JourneyLeg).create({ ...leg, journeySelectionId: next.id, sequence: i + 1 })));
      previous.status = JourneySelectionStatus.SUPERSEDED;
      previous.supersededBySelectionId = next.id;
      await repo.save(previous);
      return next;
    });
  }
}
