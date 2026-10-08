import { BadRequestException, ConflictException } from '@nestjs/common';
import { JourneyComposerService } from './journey-composer.service';

// Gate 2: the options a journey is composed from are open, future Transport
// Runs (TransportService.discoverSupply) -- never provider_availability slots.
describe('JourneyComposerService', () => {
  const transport: any = {
    discoverSupply: jest.fn(),
    findBookableRun: jest.fn(),
    assertRunBookable: jest.fn(),
    assertRunServes: jest.fn(),
    getEffectiveRoutePrice: jest.fn(),
    assertEligibleProvider: jest.fn(),
  };
  const selections: any = { select: jest.fn() };
  const service = new JourneyComposerService(transport, selections);
  const run = (extra: Record<string, unknown> = {}) => ({
    runId: 7, providerId: 2, routeId: 3, date: '2026-10-07', departureTime: '06:00',
    departureAt: new Date('2026-10-07T03:00:00.000Z'), loadLabel: 'Kariakoo', unloadLabel: 'Bunju',
    loadRunStopId: 70, unloadRunStopId: 71, loadRouteStopId: 30, unloadRouteStopId: 31, slotsAvailable: 4, ...extra,
  });

  beforeEach(() => jest.resetAllMocks());

  it('composes server-authored options from Transport Runs, with the canonical price', async () => {
    transport.discoverSupply.mockResolvedValue({ trips: [run()], providers: [] });
    transport.getEffectiveRoutePrice.mockResolvedValue({ pricePerKg: 1000, fixedFee: 5000 });
    const result = await service.compose({
      originSnapshot: { city: 'Kariakoo' },
      destinationSnapshot: { city: 'Bunju' },
      cargoRequirements: { description: 'Box', quantity: 1, weightKg: 3 } as any,
    });
    expect(result.options).toHaveLength(1);
    expect(result.options[0]).toMatchObject({
      runId: 7, providerId: 2, routeId: 3, transportBase: 5000, commitmentLevel: 'run_confirmed',
      date: '2026-10-07', departureTime: '06:00', loadStop: 'Kariakoo', unloadStop: 'Bunju',
    });
    expect((result.options[0] as any).availabilityId).toBeUndefined();
    expect(result.requiresManualPlanning).toBe(false);
  });

  it('does not fabricate a route when no Run is on sale', async () => {
    transport.discoverSupply.mockResolvedValue({ trips: [], providers: [] });
    const result = await service.compose({
      originSnapshot: { city: 'Kariakoo' },
      destinationSnapshot: { city: 'Bunju' },
      cargoRequirements: { description: 'Box', quantity: 1 } as any,
    });
    expect(result.options).toEqual([]);
    expect(result.requiresManualPlanning).toBe(true);
  });

  it('binds a selected Transport Run while preserving first/last-mile outcomes', async () => {
    transport.assertRunServes.mockResolvedValue(run());
    selections.select.mockResolvedValue({ id: 12 });
    await service.selectService(9, {
      providerId: 2, routeId: 3, runId: 7,
      originSnapshot: { city: 'Dar es Salaam' },
      destinationSnapshot: { city: 'Mwanza' },
      cargoRequirements: { description: 'Box', quantity: 1, weightKg: 2 } as any,
      paymentMethod: 'cash', pickup: 'door', delivery: 'door',
    });
    expect(transport.assertRunServes).toHaveBeenCalledWith(
      7, 'Dar es Salaam', 'Mwanza', 2, { providerId: 2, routeId: 3 },
    );
    expect(transport.discoverServiceRoutes).toBeUndefined();
    expect(selections.select).toHaveBeenCalledWith(9, expect.objectContaining({
      legs: [
        expect.objectContaining({ type: 'first_mile', requiredActorCapability: 'local_agent' }),
        expect.objectContaining({
          type: 'transport', providerId: 2, routeId: 3, runId: 7,
          loadRouteStopId: 30, unloadRouteStopId: 31,
          commitmentLevel: 'run_confirmed',
          executionRequirements: expect.objectContaining({
            runResolutionRequired: false,
            loadRunStopId: 70,
            unloadRunStopId: 71,
          }),
        }),
        expect.objectContaining({ type: 'last_mile', requiredActorCapability: 'local_agent' }),
      ],
    }));
  });

  it.each([[undefined], [0], ['x'], [1.5]])('selectService rejects missing/invalid runId %p instead of falling back to route discovery', async (runId) => {
    await expect(service.selectService(9, {
      providerId: 2, routeId: 3, runId,
      originSnapshot: { city: 'Dar es Salaam' },
      destinationSnapshot: { city: 'Mwanza' },
      cargoRequirements: { description: 'Box', quantity: 1, weightKg: 2 } as any,
      paymentMethod: 'cash', pickup: 'point', delivery: 'collect',
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(transport.assertRunServes).not.toHaveBeenCalled();
  });

  it('re-proves the selected Run on the server and writes the leg itself', async () => {
    transport.assertRunBookable.mockResolvedValue(undefined);
    transport.findBookableRun.mockResolvedValue(run());
    transport.assertEligibleProvider.mockResolvedValue({ id: 2 });
    selections.select.mockResolvedValue({ id: 11 });
    await service.selectComposed(9, {
      runId: 7,
      originSnapshot: { city: 'Kariakoo' },
      destinationSnapshot: { city: 'Bunju' },
      cargoRequirements: { description: 'Box', quantity: 1, weightKg: 2 } as any,
      paymentMethod: 'cash',
    });
    expect(transport.assertRunBookable).toHaveBeenCalledWith(7, 2, {});
    expect(transport.findBookableRun).toHaveBeenCalledWith(7, 'Kariakoo', 'Bunju', 2);
    expect(selections.select).toHaveBeenCalledWith(9, expect.objectContaining({
      legs: [expect.objectContaining({
        type: 'transport', providerId: 2, routeId: 3, runId: 7, loadRouteStopId: 30, unloadRouteStopId: 31,
        commitmentLevel: 'run_confirmed',
        executionRequirements: expect.objectContaining({ composedByServer: true, loadRunStopId: 70, unloadRunStopId: 71 }),
      })],
    }));
    const leg = selections.select.mock.calls[0][1].legs[0];
    expect(leg.availabilityId).toBeUndefined();
    expect(leg.agentId).toBeUndefined();
    expect(leg.superAgentId).toBeUndefined();
  });

  it('a Run that does not serve the journey is a 400 and nothing is selected', async () => {
    transport.assertRunBookable.mockResolvedValue(undefined);
    transport.findBookableRun.mockResolvedValue(null);
    await expect(service.selectComposed(9, {
      runId: 7, originSnapshot: { city: 'Kariakoo' }, destinationSnapshot: { city: 'Mwanza' },
      cargoRequirements: { description: 'Box', quantity: 1, weightKg: 2 } as any,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(selections.select).not.toHaveBeenCalled();
  });

  it('a full or departed Run keeps its own error', async () => {
    transport.assertRunBookable.mockRejectedValue(new ConflictException('That trip is full'));
    await expect(service.selectComposed(9, {
      runId: 7, originSnapshot: { city: 'Kariakoo' }, destinationSnapshot: { city: 'Bunju' },
      cargoRequirements: { description: 'Box', quantity: 1, weightKg: 2 } as any,
    })).rejects.toBeInstanceOf(ConflictException);
    expect(selections.select).not.toHaveBeenCalled();
  });

  it.each([[undefined], [0], ['x'], [1.5]])('runId %p is a 400 (a pre-Gate-2 availabilityId is not a trip)', async (runId) => {
    await expect(service.selectComposed(9, {
      runId, availabilityId: 7, originSnapshot: { city: 'Kariakoo' }, destinationSnapshot: { city: 'Bunju' },
      cargoRequirements: { description: 'Box', quantity: 1, weightKg: 2 } as any,
    } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(transport.assertRunBookable).not.toHaveBeenCalled();
  });

  it('rejects snapshots without a routable city or label', async () => {
    await expect(service.compose({
      originSnapshot: {},
      destinationSnapshot: { city: 'Bunju' },
      cargoRequirements: { description: 'Box', quantity: 1 } as any,
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});
