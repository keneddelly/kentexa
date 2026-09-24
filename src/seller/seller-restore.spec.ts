import { SellerApprovalBridgeService } from './seller-approval-bridge.service';
import { SellerStatus } from './entities/seller-profile.entity';
import { BusinessCapabilityApplicationStatus } from '../business/entities/business-capability-application.entity';

describe('legacy Business-linked Seller restoration', () => {
  const profile = { id: 1, businessId: 2, user: { id: 2 }, status: SellerStatus.SUSPENDED };
  const findOne = jest.fn();
  const query = jest.fn();
  const audit = jest.fn();
  const findApplications = jest.fn();
  const approve = jest.fn();
  const bridge = new SellerApprovalBridgeService(
    { findOne, manager: { query, getRepository: () => ({ save: audit }) } } as any,
    { find: findApplications } as any,
    { approve } as any,
    {} as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    findOne.mockResolvedValue({ ...profile });
    query.mockResolvedValue([{ id: 38 }]);
    findApplications.mockResolvedValue([]);
    approve.mockResolvedValue({ ...profile, status: SellerStatus.APPROVED });
    audit.mockResolvedValue({});
  });

  it('restores a suspended migrated Seller with an exact active chain despite no application history', async () => {
    await expect(bridge.restore(1, { id: 9 } as any, 'Temporary hold cleared')).resolves.toMatchObject({ status: SellerStatus.APPROVED });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ar.status = \'suspended\''), [2, 1, 2]);
    expect(approve).toHaveBeenCalledWith(1);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ actorId: 9, action: 'seller.restore', entityId: 1 }));
  });

  it('fails closed when role or commerce entitlement chain is inactive', async () => {
    query.mockResolvedValue([]);
    await expect(bridge.restore(1, { id: 9 } as any, 'Temporary hold cleared'))
      .rejects.toMatchObject({ response: { code: 'SELLER_RESTORE_AUTHORITY_INACTIVE' } });
    expect(approve).not.toHaveBeenCalled();
  });

  it('never replays a pending application as a restore', async () => {
    findApplications.mockResolvedValue([{ status: BusinessCapabilityApplicationStatus.PENDING }]);
    await expect(bridge.restore(1, { id: 9 } as any, 'Temporary hold cleared'))
      .rejects.toMatchObject({ response: { code: 'SELLER_RESTORE_APPLICATION_NOT_APPROVED' } });
    expect(approve).not.toHaveBeenCalled();
  });

  it('does not restore a profile that was not suspended', async () => {
    findOne.mockResolvedValue({ ...profile, status: SellerStatus.PENDING });
    await expect(bridge.restore(1, { id: 9 } as any, 'Temporary hold cleared'))
      .rejects.toMatchObject({ response: { code: 'SELLER_NOT_SUSPENDED' } });
    expect(query).not.toHaveBeenCalled();
  });
});
