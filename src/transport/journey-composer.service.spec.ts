import { BadRequestException } from '@nestjs/common';
import { JourneyComposerService } from './journey-composer.service';

describe('JourneyComposerService', () => {
  const transport: any = {
    findAvailableForRoute: jest.fn(),
    getEffectiveRoutePrice: jest.fn(),
    assertAvailabilityIsDiscoverable: jest.fn(),
    assertEligibleProvider: jest.fn(),
    assertRouteServesJourney: jest.fn(),
  };
  const selections: any = { select: jest.fn() };
  const service = new JourneyComposerService(transport, selections);

  beforeEach(() => jest.clearAllMocks());

  it('composes server-authored direct transport options and canonical price', async () => {
    transport.findAvailableForRoute.mockResolvedValue({
      published: [{ id: 7, providerId: 2, routeId: 3, date: '2026-10-05', departureTime: '10:00', arrivalEstimate: '12:00' }],
      providers: [],
    });
    transport.getEffectiveRoutePrice.mockResolvedValue({ pricePerKg: 1000, fixedFee: 5000 });
    const result = await service.compose({
      originSnapshot: { city: 'Kariakoo' },
      destinationSnapshot: { city: 'Bunju' },
      cargoRequirements: { description: 'Box', quantity: 1, weightKg: 3 } as any,
    });
    expect(result.options).toHaveLength(1);
    expect(result.options[0]).toMatchObject({ availabilityId: 7, providerId: 2, routeId: 3, transportBase: 5000 });
    expect(result.requiresManualPlanning).toBe(false);
  });

  it('does not fabricate a route when no canonical availability exists', async () => {
    transport.findAvailableForRoute.mockResolvedValue({ published: [], providers: [] });
    const result = await service.compose({
      originSnapshot: { city: 'Kariakoo' },
      destinationSnapshot: { city: 'Bunju' },
      cargoRequirements: { description: 'Box', quantity: 1 } as any,
    });
    expect(result.options).toEqual([]);
    expect(result.requiresManualPlanning).toBe(true);
  });

  it('re-resolves a selected availability on the server before selection', async () => {
    transport.assertAvailabilityIsDiscoverable.mockResolvedValue({ id: 7, providerId: 2, routeId: 3 });
    transport.assertEligibleProvider.mockResolvedValue({ id: 2 });
    transport.assertRouteServesJourney.mockResolvedValue(undefined);
    selections.select.mockResolvedValue({ id: 11 });
    await service.selectComposed(9, {
      availabilityId: 7,
      originSnapshot: { city: 'Kariakoo' },
      destinationSnapshot: { city: 'Bunju' },
      cargoRequirements: { description: 'Box', quantity: 1, weightKg: 2 } as any,
      paymentMethod: 'cash',
    });
    expect(transport.assertRouteServesJourney).toHaveBeenCalledWith(3, 'Kariakoo', 'Bunju');
    expect(selections.select).toHaveBeenCalledWith(9, expect.objectContaining({
      legs: [expect.objectContaining({ providerId: 2, routeId: 3, availabilityId: 7 })],
    }));
  });

  it('rejects snapshots without a routable city or label', async () => {
    await expect(service.compose({
      originSnapshot: {},
      destinationSnapshot: { city: 'Bunju' },
      cargoRequirements: { description: 'Box', quantity: 1 } as any,
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
