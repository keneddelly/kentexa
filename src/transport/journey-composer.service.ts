import { BadRequestException, Injectable } from '@nestjs/common';
import { CargoRequirements, normalizeCargoRequirements } from './journey/cargo-requirements';
import { JourneyLegType } from './entities/journey-selection.entity';
import { JourneySelectionService } from './journey-selection.service';
import { TransportService, DiscoverySortBy } from './transport.service';

export interface ComposeJourneyDto {
  originSnapshot: Record<string, unknown>;
  destinationSnapshot: Record<string, unknown>;
  cargoRequirements: CargoRequirements;
  paymentMethod?: 'cash' | 'prepaid';
  sortBy?: DiscoverySortBy;
}

export interface SelectComposedJourneyDto extends ComposeJourneyDto {
  availabilityId: number;
}

@Injectable()
export class JourneyComposerService {
  constructor(
    private readonly transport: TransportService,
    private readonly selections: JourneySelectionService,
  ) {}

  private nodeLabel(snapshot: Record<string, unknown>, side: string): string {
    const value = snapshot?.city ?? snapshot?.label ?? snapshot?.locality ?? snapshot?.name;
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text) throw new BadRequestException(`${side} must contain a server-resolvable city or label`);
    return text;
  }

  async compose(dto: ComposeJourneyDto) {
    const cargo = normalizeCargoRequirements(dto.cargoRequirements);
    const from = this.nodeLabel(dto.originSnapshot, 'Origin');
    const to = this.nodeLabel(dto.destinationSnapshot, 'Destination');
    const weightKg = Number(cargo.weightKg) || 0;
    const { published } = await this.transport.findAvailableForRoute(from, to, weightKg, {
      sortBy: dto.sortBy,
    });

    const options = await Promise.all(
      published
        .filter((slot) => slot.routeId != null)
        .map(async (slot) => {
          const price = await this.transport.getEffectiveRoutePrice(slot.routeId!);
          const transportBase = Math.max(price.pricePerKg * weightKg, price.fixedFee || 0);
          return {
            optionType: 'DIRECT_TRANSPORT' as const,
            availabilityId: slot.id,
            providerId: slot.providerId,
            routeId: slot.routeId,
            date: slot.date,
            departureTime: slot.departureTime,
            arrivalEstimate: slot.arrivalEstimate,
            transportBase,
            currency: 'TZS' as const,
            commitmentLevel: 'service_confirmed' as const,
          };
        }),
    );

    return {
      origin: dto.originSnapshot,
      destination: dto.destinationSnapshot,
      cargoRequirements: cargo,
      options,
      requiresManualPlanning: options.length === 0,
    };
  }

  async selectComposed(userId: number, dto: SelectComposedJourneyDto) {
    if (!Number.isInteger(dto.availabilityId) || dto.availabilityId <= 0) {
      throw new BadRequestException('A valid availabilityId is required');
    }
    const cargo = normalizeCargoRequirements(dto.cargoRequirements);
    const from = this.nodeLabel(dto.originSnapshot, 'Origin');
    const to = this.nodeLabel(dto.destinationSnapshot, 'Destination');
    const slot = await this.transport.assertAvailabilityIsDiscoverable(
      dto.availabilityId,
      Number(cargo.weightKg) || 0,
    );
    if (slot.routeId == null) {
      throw new BadRequestException('This availability cannot be composed into a canonical journey');
    }
    await this.transport.assertEligibleProvider(slot.providerId);
    await this.transport.assertRouteServesJourney(slot.routeId, from, to);

    return this.selections.select(userId, {
      originSnapshot: dto.originSnapshot,
      destinationSnapshot: dto.destinationSnapshot,
      cargoRequirements: cargo,
      paymentMethod: dto.paymentMethod,
      legs: [{
        type: JourneyLegType.TRANSPORT,
        fromNode: dto.originSnapshot,
        toNode: dto.destinationSnapshot,
        providerId: slot.providerId,
        routeId: slot.routeId,
        availabilityId: slot.id,
        executionRequirements: { composedByServer: true },
      }],
    });
  }
}
