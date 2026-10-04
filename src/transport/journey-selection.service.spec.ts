import { BadRequestException } from '@nestjs/common';
import { JourneyLegType, JourneySelectionStatus } from './entities/journey-selection.entity';
import { JourneySelectionService } from './journey-selection.service';

describe('JourneySelectionService commercial lifecycle', () => {
  it('ignores non-custody customer pickup when deriving the cash collector', async () => {
    const saved: any[] = [];
    const selectionRepo: any = { save: jest.fn(async (x: any) => ({ id: 1, ...x })) };
    const legRepo: any = { save: jest.fn(async (x: any) => x) };
    const manager: any = { getRepository: (entity: any) => entity.name === 'JourneySelection' ? selectionRepo : legRepo };
    const dataSource: any = { transaction: (fn: any) => fn(manager), getRepository: () => legRepo };
    const transport: any = {
      assertEligibleProvider: jest.fn(),
      assertRouteServesJourney: jest.fn(),
      assertAvailabilityIsDiscoverable: jest.fn(),
    };
    const service: any = new JourneySelectionService(selectionRepo, dataSource, transport);
    await expect(service.select(5, {
      originSnapshot: { city: 'A' }, destinationSnapshot: { city: 'B' },
      cargoRequirements: { description: 'Box', quantity: 1 },
      paymentMethod: 'cash',
      legs: [{ type: JourneyLegType.CUSTOMER_PICKUP, fromNode: { city: 'A' }, toNode: { city: 'A' }, providerId: 9 }],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('moves selected to quoted and quoted to committed', async () => {
    const row: any = { id: 4, requestedByUserId: 7, status: JourneySelectionStatus.SELECTED };
    const repo: any = { findOne: jest.fn(async () => row), save: jest.fn(async (x: any) => x) };
    const service = new JourneySelectionService(repo, {} as any, {} as any);
    await service.markQuoted(7, 4);
    expect(row.status).toBe(JourneySelectionStatus.QUOTED);
    await service.markCommitted(7, 4);
    expect(row.status).toBe(JourneySelectionStatus.COMMITTED);
  });

  it('refuses commit before quote', async () => {
    const row: any = { id: 4, requestedByUserId: 7, status: JourneySelectionStatus.SELECTED };
    const repo: any = { findOne: jest.fn(async () => row), save: jest.fn() };
    const service = new JourneySelectionService(repo, {} as any, {} as any);
    await expect(service.markCommitted(7, 4)).rejects.toBeInstanceOf(BadRequestException);
  });
});
