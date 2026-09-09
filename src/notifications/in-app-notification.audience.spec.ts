import { InAppNotificationService } from './in-app-notification.service';
import { AccountRoleType, AccountRoleStatus, RoleProfileType } from '../role-context/entities/account-role.entity';

/**
 * Stage 2B item 6: the live event-helper methods (the ones orders.service.ts/
 * super-agents.service.ts/store.service.ts actually call -- confirmed via
 * grep, NOT the unused NotifyTarget-based orderPlaced/orderPaid/orderCompleted/
 * shipmentCreated/payoutReleased/disputeRaised, which are dead code) must
 * resolve and attach ROLE-scoped audience automatically, with zero caller
 * changes required.
 */
describe('InAppNotificationService event-helper audience resolution (Stage 2B item 6)', () => {
  const sellerRole = { id: 10, userId: 5, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.SELLER_PROFILE, profileId: 77 };
  const buyerRole = { id: 20, userId: 6, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.USER, profileId: 6 };

  const build = () => {
    const repo: any = { save: jest.fn((d) => Promise.resolve(d)), create: jest.fn((d) => d) };
    const accountRoleRepo: any = {
      findOne: jest.fn(({ where }: any) => {
        if (where.userId === 5 && where.roleType === AccountRoleType.SELLER) return Promise.resolve(sellerRole);
        if (where.userId === 6 && where.roleType === AccountRoleType.BUYER) return Promise.resolve(buyerRole);
        return Promise.resolve(null);
      }),
      // Multi-Business Authority Stage 1B: the unhinted branch of
      // resolveRoleAudience uses .find() (to fail closed on ambiguity),
      // not .findOne() -- wraps whatever findOne above would have matched.
      find: jest.fn(async (query: any) => {
        const r = await accountRoleRepo.findOne(query);
        return r ? [r] : [];
      }),
    };
    const push: any = { sendToUser: jest.fn().mockResolvedValue(undefined) };
    const flags: any = { isEnabled: jest.fn() };
    const service = new InAppNotificationService(repo, accountRoleRepo, push, flags);
    return { service, repo };
  };

  it('orderPlacedById (real caller: orders.service.ts) attaches ROLE audience for the seller', async () => {
    const { service, repo } = build();
    await service.orderPlacedById(5, 100, 'KTX-1', 'Widget');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 5, audienceScope: 'ROLE', recipientAccountRoleId: 10, recipientWorkspaceType: RoleProfileType.SELLER_PROFILE, recipientWorkspaceId: 77 }),
    );
  });

  it('orderConfirmed (real caller: orders.service.ts) attaches ROLE audience for the seller', async () => {
    const { service, repo } = build();
    await service.orderConfirmed(5, 100, 'Widget', 5, 'nice');
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ audienceScope: 'ROLE', recipientAccountRoleId: 10 }));
  });

  it('payoutReleasedById (real caller: orders.service.ts) attaches ROLE audience for the seller', async () => {
    const { service, repo } = build();
    await service.payoutReleasedById(5, 5000, 100);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ audienceScope: 'ROLE', recipientAccountRoleId: 10 }));
  });

  it('reviewReceived (real caller: orders.service.ts + store.service.ts) attaches ROLE audience for the seller', async () => {
    const { service, repo } = build();
    await service.reviewReceived(5, 5, 'Widget');
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ audienceScope: 'ROLE', recipientAccountRoleId: 10 }));
  });

  it('disputeRaisedById (real caller: orders.service.ts) attaches ROLE audience for the seller', async () => {
    const { service, repo } = build();
    await service.disputeRaisedById(5, 100, 'KTX-1');
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ audienceScope: 'ROLE', recipientAccountRoleId: 10 }));
  });

  it('shipmentCreatedById (real caller: super-agents.service.ts) attaches ROLE audience for the buyer', async () => {
    const { service, repo } = build();
    await service.shipmentCreatedById(6, 'KTX-1', 'desc', 'Dar');
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ audienceScope: 'ROLE', recipientAccountRoleId: 20 }));
  });

  it('shipmentCreatedById is a no-op for a null buyerId -- no crash, no notification, no lookup', async () => {
    const { service, repo } = build();
    await service.shipmentCreatedById(null, 'KTX-1');
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('falls back to ACCOUNT/legacy_unscoped (never throws, never blocks the notification) when the recipient has no active AccountRole of that type yet', async () => {
    const { service, repo } = build();
    await service.orderPlacedById(999, 100, 'KTX-1', 'Widget'); // 999 has no synced AccountRole in this mock
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 999, audienceScope: 'ACCOUNT', recipientAccountRoleId: null }),
    );
  });
});
