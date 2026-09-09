import { ForbiddenException } from '@nestjs/common';
import { ConversationService, AmbiguousAccountRoleError } from './conversation.service';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { AccountRoleType, AccountRoleStatus, RoleProfileType } from '../role-context/entities/account-role.entity';

/**
 * Multi-Business Authority Stage 1B — abuse tests #7 and #8 (Communication
 * / Notification ambiguity fails closed, never arbitrarily choosing one of
 * several same-roleType AccountRoles). Complements the Stage 1 fixtures in
 * business.service.spec.ts (Seller/Transport A+B coexistence) and
 * conversation.workspace-multiplicity.spec.ts (cross-workspace read/reply
 * denial) — this file covers the NEW fail-closed-on-ambiguity behavior
 * added in Stage 1B specifically.
 */
describe('Multi-Business Authority Stage 1B — ambiguity fails closed', () => {
  const KENED_USER_ID = 2;
  const sellerRoleA = {
    id: 100, userId: KENED_USER_ID, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
    profileType: RoleProfileType.SELLER_PROFILE, profileId: 10, contextVersion: 1,
  };
  const sellerRoleB = {
    id: 101, userId: KENED_USER_ID, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
    profileType: RoleProfileType.SELLER_PROFILE, profileId: 11, contextVersion: 1,
  };

  describe('#7 — ConversationService: ambiguous role-only context fails closed', () => {
    const build = () => {
      const convoRepo: any = { findOne: jest.fn(), createQueryBuilder: jest.fn() };
      const msgRepo: any = { find: jest.fn().mockResolvedValue([]) };
      const customerRepo: any = {};
      // Both rows returned for an unhinted (userId, roleType) query -- the
      // genuinely-ambiguous case this whole fix exists for.
      const accountRoleRepo: any = {
        find: jest.fn(({ where }: any) =>
          Promise.resolve(where.userId === KENED_USER_ID && where.roleType === AccountRoleType.SELLER ? [sellerRoleA, sellerRoleB] : []),
        ),
        findOne: jest.fn().mockResolvedValue(null),
      };
      const participantRepo: any = {};
      const participantStateRepo: any = {};
      const customerService: any = {};
      const notifService: any = {};
      const commerceProfiles: any = {};
      const gateway: any = {};
      const participants: any = {};
      const flags: any = { isEnabled: jest.fn(() => false) };
      const service = new ConversationService(
        convoRepo, msgRepo, customerRepo, {} as any, {} as any, {} as any, {} as any,
        accountRoleRepo, participantRepo, participantStateRepo,
        customerService, notifService, commerceProfiles, gateway, participants, flags,
      );
      return { service, accountRoleRepo };
    };

    it('resolveAccountRoleFor throws AmbiguousAccountRoleError with no hint and 2+ matches', async () => {
      const { service } = build();
      await expect((service as any).resolveAccountRoleFor(KENED_USER_ID, AccountRoleType.SELLER))
        .rejects.toBeInstanceOf(AmbiguousAccountRoleError);
    });

    it('getScopedSellerInbox fails closed to an EMPTY result on ambiguity -- never falls back to the wide-open legacy query', async () => {
      const { service } = build();
      const result = await service.getScopedSellerInbox(KENED_USER_ID, {});
      expect(result).toEqual({ conversations: [], total: 0, page: 1, unread: 0 });
    });

    it('getScopedUnreadCountForSeller fails closed to 0 on ambiguity', async () => {
      const { service } = build();
      const unread = await service.getScopedUnreadCountForSeller(KENED_USER_ID);
      expect(unread).toBe(0);
    });

    it('a workspace-hinted call is NEVER ambiguous (exact match by profileId, not affected by other rows existing)', async () => {
      const { service, accountRoleRepo } = build();
      accountRoleRepo.findOne.mockImplementation(({ where }: any) =>
        Promise.resolve(where.profileId === 11 ? sellerRoleB : null),
      );
      const resolved = await (service as any).resolveAccountRoleFor(
        KENED_USER_ID, AccountRoleType.SELLER, { workspaceType: 'seller_profile', workspaceId: 11 },
      );
      expect(resolved.id).toBe(sellerRoleB.id);
    });
  });

  describe('#8 — InAppNotificationService: ambiguous audience omits operational scope, never picks A or B', () => {
    const build = () => {
      const repo: any = { save: jest.fn((d) => Promise.resolve(d)), create: jest.fn((d) => d) };
      const accountRoleRepo: any = {
        find: jest.fn(({ where }: any) =>
          Promise.resolve(where.userId === KENED_USER_ID && where.roleType === AccountRoleType.SELLER ? [sellerRoleA, sellerRoleB] : []),
        ),
        findOne: jest.fn().mockResolvedValue(null),
      };
      const push: any = { sendToUser: jest.fn().mockResolvedValue(undefined) };
      const flags: any = { isEnabled: jest.fn(() => false) };
      const service = new InAppNotificationService(repo, accountRoleRepo, push, flags);
      return { service, repo };
    };

    it('resolveRoleAudience returns {} (omits ROLE scope) when 2+ Seller AccountRoles exist and no disambiguator is supplied', async () => {
      const { service } = build();
      const audience = await (service as any).resolveRoleAudience(KENED_USER_ID, AccountRoleType.SELLER);
      expect(audience).toEqual({});
    });

    it('notify() called with the omitted (ambiguous) audience falls back to ACCOUNT scope, never A or B', async () => {
      const { service, repo } = build();
      const audience = await (service as any).resolveRoleAudience(KENED_USER_ID, AccountRoleType.SELLER);
      await service.notify({ userId: KENED_USER_ID, type: 'order_paid', title: 't', body: 'b', ...audience });
      const saved = repo.create.mock.calls[0][0];
      expect(saved.audienceScope).toBe('ACCOUNT'); // NotificationAudienceScope.ACCOUNT's own default
      expect(saved.recipientAccountRoleId).toBeNull();
    });

    it('resolves the correct, single role when exactly one exists (unaffected by the ambiguity guard)', async () => {
      const { service } = build();
      const solo = { id: 200, userId: 5, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.SELLER_PROFILE, profileId: 20 };
      (service as any).accountRoleRepo = { find: jest.fn().mockResolvedValue([solo]), findOne: jest.fn().mockResolvedValue(null) };
      const audience = await (service as any).resolveRoleAudience(5, AccountRoleType.SELLER);
      expect(audience.recipientAccountRoleId).toBe(200);
      expect(audience.recipientWorkspaceId).toBe(20);
    });
  });
});
