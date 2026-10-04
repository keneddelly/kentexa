import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JourneyLeg, JourneyLegType, JourneySelection, JourneySelectionStatus } from './entities/journey-selection.entity';
import { CargoRequirements, normalizeCargoRequirements } from './journey/cargo-requirements';

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

@Injectable()
export class JourneySelectionService {
  constructor(
    @InjectRepository(JourneySelection) private readonly selections: Repository<JourneySelection>,
    private readonly dataSource: DataSource,
  ) {}

  private cashCollector(legs: SelectJourneyLegDto[], paymentMethod?: string): { type: string | null; sequence: number | null } {
    if (paymentMethod !== 'cash') return { type: null, sequence: null };
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i];
      if (leg.agentId != null) return { type: 'agent', sequence: i + 1 };
      if (leg.superAgentId != null) return { type: 'super_agent', sequence: i + 1 };
      if (leg.providerId != null) return { type: 'transport_provider', sequence: i + 1 };
    }
    throw new BadRequestException('Cash journey has no authorized first physical custodian');
  }

  async select(requestedByUserId: number, dto: SelectJourneyDto): Promise<JourneySelection> {
    if (!dto.legs?.length) throw new BadRequestException('A journey must contain at least one leg');
    const cargo = normalizeCargoRequirements(dto.cargoRequirements);
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
      const cargo = normalizeCargoRequirements(dto.cargoRequirements);
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
