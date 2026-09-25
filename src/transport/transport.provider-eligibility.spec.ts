import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TransportService } from './transport.service';
import { ProviderStatus } from './entities/transport-provider.entity';

// Focused unit coverage for TransportService.assertEligibleProvider() —
// the single source of truth Stage 1's ShipmentsService.confirmShipment()
// now delegates to, so it must not silently drift from createAssignment()'s
// own long-established provider-eligibility policy.
describe('TransportService.assertEligibleProvider', () => {
  let providerRepo: any;
  let service: TransportService;

  beforeEach(() => {
    providerRepo = { findOne: jest.fn() };
    const stub = {} as any;
    service = new TransportService(
      providerRepo,
      stub, // routeRepo
      stub, // availabilityRepo
      stub, // assignmentRepo
      stub, // serviceAdRepo
      stub, // userRepo
      stub, // parcelRepo
      stub, // parcelTrackingRepo
      stub, // superAgentRepo
      stub, // shipmentRepo
      stub, // reputationService
      stub, // commerceProfiles
      stub, // tzLocation
      stub, // roleContextService
      stub, // dataSource
    );
  });

  it('throws NotFoundException when the provider id does not exist', async () => {
    providerRepo.findOne.mockResolvedValue(null);
    await expect(service.assertEligibleProvider(999)).rejects.toThrow(NotFoundException);
  });

  it.each([ProviderStatus.PENDING, ProviderStatus.SUSPENDED, ProviderStatus.REJECTED, ProviderStatus.TESTING])(
    'throws BadRequestException when the provider status is %s',
    async (status) => {
      providerRepo.findOne.mockResolvedValue({ id: 1, status });
      await expect(service.assertEligibleProvider(1)).rejects.toThrow(BadRequestException);
    },
  );

  it.each([ProviderStatus.VERIFIED, ProviderStatus.ACTIVE])(
    'resolves with the provider when status is %s',
    async (status) => {
      const provider = { id: 1, status };
      providerRepo.findOne.mockResolvedValue(provider);
      await expect(service.assertEligibleProvider(1)).resolves.toBe(provider);
    },
  );
});
