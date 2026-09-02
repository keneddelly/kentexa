import { BadRequestException } from '@nestjs/common';
import { SuperAgentsService } from './super-agents.service';
import { ParcelStatus } from './entities/parcel.entity';

// Regression test for the claimParcel() TOCTOU race: two agents reading the
// same unclaimed parcel and both passing the initial checks used to both
// succeed, since the update that followed wasn't conditioned on the parcel
// still being unclaimed. The fix moved the claim into a single conditional
// UPDATE ... WHERE localAgentId IS NULL, so this suite drives the query
// builder mock down both branches (0 rows affected vs 1) rather than
// re-deriving SQL semantics from scratch.
describe('SuperAgentsService.claimParcel() atomicity', () => {
  let service: SuperAgentsService;
  let parcelRepo: any;
  let agentRepo: any;
  let trackingRepo: any;
  let queryBuilder: any;

  beforeEach(() => {
    queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(),
    };
    parcelRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    agentRepo = { findOne: jest.fn().mockResolvedValue(null) };
    trackingRepo = {
      create: jest.fn((x) => x),
      save: jest.fn().mockResolvedValue(undefined),
    };

    const noop = {} as any;
    service = new SuperAgentsService(
      noop, // superAgentRepo
      noop, // transportAssignmentRepo
      parcelRepo,
      trackingRepo,
      noop, // rateRepo
      noop, // bulkRepo
      noop, // routeRepo
      noop, // orderRepo
      agentRepo,
      noop, // agentTransactionRepo
      noop, // batchParcelRepo
      noop, // userRepo
      noop, // paymentRepo
      noop, // sellerProfileRepo
      noop, // saleRepo
      { sendSms: jest.fn() }, // smsService
      noop, // dataSource
      noop, // businessCustomerService
      { create: jest.fn() }, // inAppNotif
      noop, // commerceProfiles
      noop, // profileScope
      noop, // invoicesService
      noop, // auditLog
      noop, // verification
      noop, // activityEvents
      noop, // walletService
    );
  });

  const baseParcel = () => ({
    id: 10,
    trackingNumber: 'KTX-DAR-MZA-000001',
    status: ParcelStatus.ARRIVED_AT_HUB,
    localAgentId: null,
    destinationCity: 'Mwanza',
  });

  it('throws when the conditional update loses the race (already claimed)', async () => {
    parcelRepo.findOne.mockResolvedValue(baseParcel());
    queryBuilder.execute.mockResolvedValue({ affected: 0 });

    await expect(
      service.claimParcel({ id: 1, name: 'Agent A' } as any, 'KTX-DAR-MZA-000001'),
    ).rejects.toThrow(BadRequestException);

    // The WHERE clause is what actually prevents the double-claim — assert
    // it's still wired to both conditions, not just that we handled 0 rows.
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '"localAgentId" IS NULL',
    );
  });

  it('succeeds when the conditional update wins the race', async () => {
    parcelRepo.findOne.mockResolvedValue(baseParcel());
    queryBuilder.execute.mockResolvedValue({ affected: 1 });

    const result = await service.claimParcel(
      { id: 1, name: 'Agent A' } as any,
      'KTX-DAR-MZA-000001',
    );

    expect(result).toEqual({
      message: 'Parcel claimed',
      trackingNumber: 'KTX-DAR-MZA-000001',
    });
  });
});
