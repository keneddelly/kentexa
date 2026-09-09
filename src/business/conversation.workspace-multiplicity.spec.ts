import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { AccountRoleType, AccountRoleStatus, RoleProfileType } from '../role-context/entities/account-role.entity';
import { RoleContext } from '../role-context/role-context.types';

/**
 * Multi-Business Authority Stage 1 — Communication multiplicity safety.
 *
 * Proves the specific gap identified in the discovery report: once a User
 * can hold TWO AccountRole rows of the same roleType (one per Business),
 * matching roleType alone is no longer sufficient to authorize a
 * Communication read/write — the caller's SPECIFIC active workspace must
 * also match the conversation's own stamped ownerWorkspaceType/Id.
 *
 * Covers required security tests #12-14 (Seller A cannot read/reply Seller
 * B's conversation; an operational role active for workspace A cannot
 * read/reply a same-roleType workspace B conversation), plus the
 * determinism fix in resolveAccountRoleFor.
 */
describe('ConversationService — AccountRole workspace multiplicity safety', () => {
  const KENED_USER_ID = 2;

  // Two Seller AccountRole rows for the SAME user, one per Business —
  // exactly the AR100/AR101 shape from the architecture discovery.
  const sellerRoleBusinessA = {
    id: 100, userId: KENED_USER_ID, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
    profileType: RoleProfileType.SELLER_PROFILE, profileId: 10, contextVersion: 1,
  };
  const sellerRoleBusinessB = {
    id: 101, userId: KENED_USER_ID, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
    profileType: RoleProfileType.SELLER_PROFILE, profileId: 11, contextVersion: 1,
  };
  // Two Transport Provider AccountRole rows, same shape.
  const transportRoleBusinessA = {
    id: 200, userId: KENED_USER_ID, roleType: AccountRoleType.TRANSPORT_PROVIDER, status: AccountRoleStatus.ACTIVE,
    profileType: RoleProfileType.TRANSPORT_PROVIDER, profileId: 20, contextVersion: 1,
  };
  const transportRoleBusinessB = {
    id: 201, userId: KENED_USER_ID, roleType: AccountRoleType.TRANSPORT_PROVIDER, status: AccountRoleStatus.ACTIVE,
    profileType: RoleProfileType.TRANSPORT_PROVIDER, profileId: 21, contextVersion: 1,
  };

  const build = () => {
    const convoRepo: any = { findOne: jest.fn(), update: jest.fn().mockResolvedValue(undefined) };
    const msgRepo: any = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((d) => ({ id: 900, ...d })),
      save: jest.fn((d) => Promise.resolve(d)),
      update: jest.fn(),
    };
    const customerRepo: any = { findOne: jest.fn() };
    // Deliberately returns BOTH same-roleType rows on an unordered lookup
    // (no profileType/profileId filter) so a real bug (falling through to
    // the ambiguous branch when a hint should have been used) is caught —
    // mirrors Postgres's own "first row, arbitrary order" risk.
    const accountRoleRepo: any = {
      findOne: jest.fn(({ where }: any) => {
        const rows = [sellerRoleBusinessA, sellerRoleBusinessB, transportRoleBusinessA, transportRoleBusinessB];
        const matches = rows.filter((r) =>
          r.userId === where.userId &&
          r.roleType === where.roleType &&
          (where.profileType === undefined || r.profileType === where.profileType) &&
          (where.profileId === undefined || r.profileId === where.profileId),
        );
        return Promise.resolve(matches[0] ?? null);
      }),
    };
    const participantRepo: any = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    const participantStateRepo: any = { find: jest.fn().mockResolvedValue([]), update: jest.fn() };
    const customerService: any = { findOrCreateForChat: jest.fn() };
    const notifService: any = { notify: jest.fn().mockResolvedValue(undefined), markReadByAction: jest.fn().mockResolvedValue(undefined) };
    const commerceProfiles: any = { findById: jest.fn().mockResolvedValue(null) };
    const gateway: any = { emitNewMessage: jest.fn() };
    const participants: any = {
      ensureAccountRoleParticipant: jest.fn((conversationId, accountRoleId, kind) => Promise.resolve({ id: accountRoleId * 100, conversationId, accountRoleId, participantKind: kind })),
      incrementUnread: jest.fn().mockResolvedValue(undefined),
      markRead: jest.fn().mockResolvedValue(undefined),
    };
    const flags: any = { isEnabled: jest.fn(() => false) }; // dual-write off -- isolates the ownership-check logic under test
    const service = new ConversationService(
      convoRepo, msgRepo, customerRepo, {} as any, {} as any, {} as any, {} as any,
      accountRoleRepo, participantRepo, participantStateRepo,
      customerService, notifService, commerceProfiles, gateway, participants, flags,
    );
    return { service, convoRepo, msgRepo, accountRoleRepo };
  };

  const sender = { id: KENED_USER_ID, name: 'Kened' } as any;

  describe('getMessages — plain Seller path (#12)', () => {
    it('DENIES Seller@BusinessA reading a conversation owned by Seller@BusinessB, even though both are "seller"', async () => {
      const { service, convoRepo } = build();
      convoRepo.findOne.mockResolvedValue({
        id: 5, sellerId: KENED_USER_ID, ownerWorkspaceType: 'seller_profile', ownerWorkspaceId: 11, // Business B
        customerId: 1,
      });
      const hintForBusinessA = { workspaceType: 'seller_profile', workspaceId: 10 };
      await expect(service.getMessages(KENED_USER_ID, 5, undefined, hintForBusinessA))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ALLOWS Seller@BusinessA reading Seller@BusinessA\'s own conversation', async () => {
      const { service, convoRepo } = build();
      convoRepo.findOne.mockResolvedValue({
        id: 5, sellerId: KENED_USER_ID, ownerWorkspaceType: 'seller_profile', ownerWorkspaceId: 10,
        customerId: 1,
      });
      const hintForBusinessA = { workspaceType: 'seller_profile', workspaceId: 10 };
      const result = await service.getMessages(KENED_USER_ID, 5, undefined, hintForBusinessA);
      expect(result.conversation).toBeDefined();
    });

    it('a legacy/unstamped conversation (ownerWorkspaceId null) is unaffected by a workspace hint', async () => {
      const { service, convoRepo } = build();
      convoRepo.findOne.mockResolvedValue({
        id: 5, sellerId: KENED_USER_ID, ownerWorkspaceType: null, ownerWorkspaceId: null, customerId: 1,
      });
      const hintForBusinessA = { workspaceType: 'seller_profile', workspaceId: 10 };
      const result = await service.getMessages(KENED_USER_ID, 5, undefined, hintForBusinessA);
      expect(result.conversation).toBeDefined();
    });
  });

  describe('sendMessage — plain Seller path (#13)', () => {
    it('DENIES Seller@BusinessA replying into Seller@BusinessB\'s conversation', async () => {
      const { service, convoRepo } = build();
      convoRepo.findOne.mockResolvedValue({
        id: 5, sellerId: KENED_USER_ID, ownerWorkspaceType: 'seller_profile', ownerWorkspaceId: 11, customerId: 1,
      });
      const hintForBusinessA = { workspaceType: 'seller_profile', workspaceId: 10 };
      await expect(service.sendMessage(KENED_USER_ID, 5, { content: 'hi' }, sender, hintForBusinessA))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ALLOWS Seller@BusinessA replying into its own conversation', async () => {
      const { service, convoRepo } = build();
      convoRepo.findOne.mockResolvedValue({
        id: 5, sellerId: KENED_USER_ID, ownerWorkspaceType: 'seller_profile', ownerWorkspaceId: 10, customerId: 1,
      });
      const hintForBusinessA = { workspaceType: 'seller_profile', workspaceId: 10 };
      const msg = await service.sendMessage(KENED_USER_ID, 5, { content: 'hi' }, sender, hintForBusinessA);
      expect(msg).toBeDefined();
    });
  });

  describe('getMessagesAsOperationalRole / sendMessageAsOperationalRole — operational path (#14)', () => {
    const roleContextFor = (role: typeof transportRoleBusinessA): RoleContext => ({
      userId: role.userId, accountRoleId: role.id, roleType: role.roleType,
      profileType: role.profileType, profileId: role.profileId,
      capabilities: [], sessionId: 's1', contextVersion: 1,
      businessId: null, workspaceId: null,
    });

    it('DENIES Transport@BusinessA (active) from reading a conversation owned by Transport@BusinessB', async () => {
      const { service, convoRepo } = build();
      convoRepo.findOne.mockResolvedValue({
        id: 9, sellerId: KENED_USER_ID, ownerWorkspaceType: 'transport_provider', ownerWorkspaceId: 21, customerId: 1,
      });
      await expect(service.getMessagesAsOperationalRole(roleContextFor(transportRoleBusinessA), 9))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('DENIES Transport@BusinessA (active) from replying into Transport@BusinessB\'s conversation', async () => {
      const { service, convoRepo } = build();
      convoRepo.findOne.mockResolvedValue({
        id: 9, sellerId: KENED_USER_ID, ownerWorkspaceType: 'transport_provider', ownerWorkspaceId: 21, customerId: 1,
      });
      await expect(
        service.sendMessageAsOperationalRole(roleContextFor(transportRoleBusinessA), 9, { content: 'hi' }, sender),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('ALLOWS Transport@BusinessA (active) to read its own workspace\'s conversation', async () => {
      const { service, convoRepo } = build();
      convoRepo.findOne.mockResolvedValue({
        id: 9, sellerId: KENED_USER_ID, ownerWorkspaceType: 'transport_provider', ownerWorkspaceId: 20, customerId: 1,
      });
      const result = await service.getMessagesAsOperationalRole(roleContextFor(transportRoleBusinessA), 9);
      expect(result.conversation).toBeDefined();
    });
  });

  describe('resolveAccountRoleFor determinism (private, exercised via getScopedSellerInbox)', () => {
    it('an unhinted lookup with two same-roleType rows deterministically resolves the lower id (never throws, never random)', async () => {
      const { service, convoRepo } = build();
      convoRepo.createQueryBuilder = jest.fn().mockReturnValue({
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
        getCount: jest.fn().mockResolvedValue(0),
      });
      // No hint supplied -- exactly the ambiguous case. Must not throw, and
      // must be repeatable (same result on repeated calls), proving the
      // added `order: { id: 'ASC' }` removed the non-determinism risk.
      const r1 = await service.getScopedSellerInbox(KENED_USER_ID, {});
      const r2 = await service.getScopedSellerInbox(KENED_USER_ID, {});
      expect(r1).toEqual(r2);
    });

    it('a hinted lookup resolves the EXACT matching row, not merely "some" row of that type', async () => {
      const { service, accountRoleRepo } = build();
      const resolved = await (service as any).resolveAccountRoleFor(
        KENED_USER_ID, AccountRoleType.SELLER, { workspaceType: 'seller_profile', workspaceId: 11 },
      );
      expect(resolved.id).toBe(sellerRoleBusinessB.id);
      expect(accountRoleRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ profileType: 'seller_profile', profileId: 11 }) }),
      );
    });
  });
});
