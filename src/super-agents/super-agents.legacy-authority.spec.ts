import { ForbiddenException } from '@nestjs/common';
import { SuperAgentsService } from './super-agents.service';

/**
 * Legacy authority security closure: the ADMIN cross-hub override on
 * parcel/shipment ownership checks must come from the caller's CURRENTLY
 * ACTIVE RoleContext, never the legacy user.role/activeRoles fields.
 */
describe('SuperAgentsService legacy authority closure', () => {
  const buildService = () => {
    const superAgentRepo: any = { findOne: jest.fn() };
    const parcelRepo: any = { findOne: jest.fn() };
    const invoicesService: any = { findByOrderId: jest.fn().mockResolvedValue(null) };
    const smsService: any = { sendSms: jest.fn().mockResolvedValue(true) };
    const auditLog: any = { record: jest.fn().mockResolvedValue(undefined) };
    const noop: any = {};
    const service = new SuperAgentsService(
      superAgentRepo,
      noop, // transportAssignmentRepo
      parcelRepo,
      noop, // trackingRepo
      noop, // rateRepo
      noop, // bulkRepo
      noop, // routeRepo
      noop, // orderRepo
      noop, // agentRepo
      noop, // agentTransactionRepo
      noop, // batchParcelRepo
      noop, // userRepo
      noop, // paymentRepo
      noop, // sellerProfileRepo
      noop, // saleRepo
      smsService,
      noop, // dataSource
      noop, // businessCustomerService
      noop, // inAppNotif
      noop, // commerceProfiles
      noop, // profileScope
      invoicesService,
      auditLog,
      noop, // verification
      noop, // activityEvents
      noop, // walletService
      noop, // roleContextService
    );
    return { service, superAgentRepo, parcelRepo };
  };

  const buildParcel = () => ({
    id: 1,
    superAgent: { id: 200 },
    senderPhone: '+255700000000',
    senderName: 'Test',
    actualShippingFee: 1000,
  });

  describe('resendSenderSms() — own-hub-only, admin authority from active RoleContext', () => {
    it('a staff account active as BUYER cannot act on another hub\'s parcel via admin override', async () => {
      const { service, superAgentRepo, parcelRepo } = buildService();
      parcelRepo.findOne.mockResolvedValue(buildParcel());
      superAgentRepo.findOne.mockResolvedValue({ id: 999 }); // different hub
      await expect(
        service.resendSenderSms({ id: 999 } as any, 'TRK-1', { roleType: 'buyer' } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('a staff account active as ADMIN can act on any hub\'s parcel', async () => {
      const { service, superAgentRepo, parcelRepo } = buildService();
      parcelRepo.findOne.mockResolvedValue(buildParcel());
      superAgentRepo.findOne.mockResolvedValue({ id: 999 }); // different hub
      await expect(
        service.resendSenderSms({ id: 999 } as any, 'TRK-1', { roleType: 'admin' } as any),
      ).resolves.toBeDefined();
    });

    it('the actual owning hub agent can always act on their own hub\'s parcel', async () => {
      const { service, superAgentRepo, parcelRepo } = buildService();
      parcelRepo.findOne.mockResolvedValue(buildParcel());
      superAgentRepo.findOne.mockResolvedValue({ id: 200 }); // same hub
      await expect(
        service.resendSenderSms({ id: 999 } as any, 'TRK-1', { roleType: 'super_agent' } as any),
      ).resolves.toBeDefined();
    });
  });
});
