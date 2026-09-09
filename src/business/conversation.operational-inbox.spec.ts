import { ForbiddenException } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { ParticipantKind } from './entities/conversation-participant.entity';
import { AccountRoleType, AccountRoleStatus, RoleProfileType } from '../role-context/entities/account-role.entity';

/**
 * Communication follow-up (Phase B): the smallest safe Super Agent/
 * Transport Provider/Agent inbox/reply surface, reusing the existing
 * scoped participant-graph architecture rather than a parallel system.
 * Also covers the cross-role reply/read denial this phase specifically
 * requires, and the participantKindForRoleType fix (dualWriteMarkRead used
 * to hardcode every non-SELLER roleType to ParticipantKind.BUYER).
 */
describe('ConversationService -- operational inbox/reply surface (Communication follow-up Phase B)', () => {
  const KENED_USER_ID = 2;
  const BOB_USER_ID = 3;

  const sellerRole = { id: 38, userId: KENED_USER_ID, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.SELLER_PROFILE, profileId: 1, contextVersion: 1 };
  const superAgentRole = { id: 41, userId: KENED_USER_ID, roleType: AccountRoleType.SUPER_AGENT, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.SUPER_AGENT, profileId: 1, contextVersion: 1 };

  const sellerConvo = { id: 5, sellerId: KENED_USER_ID, customerId: 3, ownerWorkspaceType: 'seller_profile', ownerWorkspaceId: 1, customer: { userId: BOB_USER_ID } };
  const superAgentConvo = { id: 35, sellerId: KENED_USER_ID, customerId: 3, ownerWorkspaceType: 'super_agent', ownerWorkspaceId: 1, customer: { userId: BOB_USER_ID } };

  const superAgentRoleContext = {
    userId: KENED_USER_ID, accountRoleId: 41, roleType: AccountRoleType.SUPER_AGENT,
    profileType: RoleProfileType.SUPER_AGENT, profileId: 1, capabilities: [], sessionId: 's1', contextVersion: 1,
  };
  const sellerRoleContext = {
    userId: KENED_USER_ID, accountRoleId: 38, roleType: AccountRoleType.SELLER,
    profileType: RoleProfileType.SELLER_PROFILE, profileId: 1, capabilities: [], sessionId: 's2', contextVersion: 1,
  };

  const mockQueryBuilder = (result: [any[], number]) => {
    const calls: { method: string; args: any[] }[] = [];
    const qb: any = {};
    ['leftJoinAndSelect', 'leftJoin', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take'].forEach((m) => {
      qb[m] = jest.fn((...args: any[]) => { calls.push({ method: m, args }); return qb; });
    });
    qb.getManyAndCount = jest.fn().mockResolvedValue(result);
    qb.getCount = jest.fn().mockResolvedValue(result[1]);
    return { qb, calls };
  };

  const build = (flagOverride: Record<string, boolean> = {}) => {
    const convoRepo: any = { createQueryBuilder: jest.fn(), findOne: jest.fn(), update: jest.fn() };
    const msgRepo: any = { find: jest.fn().mockResolvedValue([]), create: jest.fn((d: any) => ({ id: 900, ...d })), save: jest.fn((d: any) => Promise.resolve(d)), update: jest.fn() };
    const customerRepo: any = { findOne: jest.fn() };
    const accountRoleRepo: any = {
      findOne: jest.fn(({ where }: any) => {
        if (where.id === 41) return Promise.resolve(superAgentRole);
        if (where.id === 38) return Promise.resolve(sellerRole);
        if (where.userId === KENED_USER_ID && where.roleType === AccountRoleType.SELLER) return Promise.resolve(sellerRole);
        if (where.userId === KENED_USER_ID && where.roleType === AccountRoleType.SUPER_AGENT) return Promise.resolve(superAgentRole);
        if (where.userId === BOB_USER_ID && where.roleType === AccountRoleType.BUYER) return Promise.resolve({ id: 10, userId: BOB_USER_ID, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.USER, profileId: BOB_USER_ID });
        return Promise.resolve(null);
      }),
      // Multi-Business Authority Stage 1B: the unhinted branch of
      // resolveAccountRoleFor uses .find() (to fail closed on ambiguity),
      // not .findOne() -- wraps whatever findOne above would have matched.
      find: jest.fn(async (query: any) => {
        const r = await accountRoleRepo.findOne(query);
        return r ? [r] : [];
      }),
    };
    const participantRepo: any = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    const participantStateRepo: any = { find: jest.fn().mockResolvedValue([]), update: jest.fn() };
    const customerService: any = {};
    const notifService: any = { notify: jest.fn().mockResolvedValue(undefined), markReadByAction: jest.fn().mockResolvedValue(undefined) };
    const commerceProfiles: any = { findById: jest.fn() };
    const gateway: any = { emitNewMessage: jest.fn() };
    const participants: any = {
      ensureAccountRoleParticipant: jest.fn((conversationId: number, accountRoleId: number, kind: string) => Promise.resolve({ id: accountRoleId * 100, conversationId, accountRoleId, participantKind: kind })),
      markRead: jest.fn().mockResolvedValue(undefined),
    };
    const defaultsOn = new Set(['LEGACY_COMMUNICATION_READ_FALLBACK', 'SCOPED_CONVERSATION_DUAL_WRITE']);
    const flags: any = { isEnabled: jest.fn((f: string) => (f in flagOverride ? flagOverride[f] : defaultsOn.has(f))) };
    const service = new ConversationService(
      convoRepo, msgRepo, customerRepo, {} as any, {} as any, {} as any, {} as any,
      accountRoleRepo, participantRepo, participantStateRepo,
      customerService, notifService, commerceProfiles, gateway, participants, flags,
    );
    return { service, convoRepo, msgRepo, accountRoleRepo, participants, flags, gateway, notifService };
  };

  describe('visibility: getScopedConversationsForActiveRole routes operational roles to the participant-scoped query', () => {
    it('SUPER_AGENT active role no longer hits the old hardcoded empty state', async () => {
      const { service, convoRepo } = build();
      const { qb } = mockQueryBuilder([[superAgentConvo as any], 1]);
      convoRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getScopedConversationsForActiveRole(superAgentRoleContext as any, {});
      expect(result.total).toBe(1);
      expect(result.conversations[0].id).toBe(35);
    });

    it('the operational query never applies the LEGACY_UNSCOPED fallback clause, even when the flag is on', async () => {
      const { service, convoRepo } = build({ LEGACY_COMMUNICATION_READ_FALLBACK: true });
      const { qb, calls } = mockQueryBuilder([[], 0]);
      convoRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getScopedConversationsForActiveRole(superAgentRoleContext as any, {});
      const whereCall = calls.find((c) => c.method === 'where');
      expect(whereCall?.args[0]).toBe('cp.id IS NOT NULL'); // no OR legacyStatus clause
    });

    it('Seller and Buyer routing is unaffected by the new operational branch', async () => {
      const { service, convoRepo } = build();
      const { qb } = mockQueryBuilder([[sellerConvo as any], 1]);
      convoRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getScopedConversationsForActiveRole(sellerRoleContext as any, {});
      expect(result.total).toBe(1);
      expect(result.conversations[0].id).toBe(5);
    });
  });

  describe('reply denial: cross-role attribution is never possible', () => {
    it('sendMessage (Seller path) 403s when the conversation is Super-Agent-owned', async () => {
      const { service, convoRepo } = build();
      convoRepo.findOne.mockResolvedValue(superAgentConvo);
      await expect(service.sendMessage(KENED_USER_ID, 35, { content: 'hi' }, { id: KENED_USER_ID } as any))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('getMessages (Seller path) 403s when the conversation is Super-Agent-owned', async () => {
      const { service, convoRepo } = build();
      convoRepo.findOne.mockResolvedValue(superAgentConvo);
      await expect(service.getMessages(KENED_USER_ID, 35)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('sendMessageAsOperationalRole 403s when a Super Agent context targets a Seller-owned conversation', async () => {
      const { service, convoRepo } = build();
      convoRepo.findOne.mockResolvedValue(sellerConvo);
      await expect(
        service.sendMessageAsOperationalRole(superAgentRoleContext as any, 5, { content: 'hi' }, { id: KENED_USER_ID } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('getMessagesAsOperationalRole 403s when a Super Agent context targets a Seller-owned conversation', async () => {
      const { service, convoRepo } = build();
      convoRepo.findOne.mockResolvedValue(sellerConvo);
      await expect(
        service.getMessagesAsOperationalRole(superAgentRoleContext as any, 5),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('sendMessage still succeeds normally for an ordinary Seller-owned/legacy conversation', async () => {
      const { service, convoRepo } = build();
      convoRepo.findOne.mockResolvedValue(sellerConvo);
      const msg = await service.sendMessage(KENED_USER_ID, 5, { content: 'hi' }, { id: KENED_USER_ID } as any);
      expect(msg).toBeDefined();
    });
  });

  describe('correct reply attribution for the matching operational role', () => {
    it('sendMessageAsOperationalRole succeeds and attributes to the Super Agent AccountRole, not Seller', async () => {
      const { service, convoRepo, participants } = build();
      convoRepo.findOne.mockResolvedValue(superAgentConvo);

      await service.sendMessageAsOperationalRole(superAgentRoleContext as any, 35, { content: 'hi' }, { id: KENED_USER_ID } as any);

      expect(participants.ensureAccountRoleParticipant).toHaveBeenCalledWith(35, superAgentRole.id, ParticipantKind.SUPER_AGENT);
      expect(participants.ensureAccountRoleParticipant).not.toHaveBeenCalledWith(35, sellerRole.id, expect.anything());
    });
  });

  describe('participantKindForRoleType fix (was hardcoded SELLER-or-BUYER)', () => {
    it('dualWriteMarkRead resolves SUPER_AGENT to ParticipantKind.SUPER_AGENT, not BUYER', async () => {
      const { service, participants } = build();
      await (service as any).dualWriteMarkRead(35, KENED_USER_ID, AccountRoleType.SUPER_AGENT);
      expect(participants.ensureAccountRoleParticipant).toHaveBeenCalledWith(35, superAgentRole.id, ParticipantKind.SUPER_AGENT);
    });

    it('dualWriteMarkRead still resolves SELLER/BUYER exactly as before (no regression)', async () => {
      const { service, participants } = build();
      await (service as any).dualWriteMarkRead(5, KENED_USER_ID, AccountRoleType.SELLER);
      expect(participants.ensureAccountRoleParticipant).toHaveBeenCalledWith(5, sellerRole.id, ParticipantKind.SELLER);
    });
  });

  describe('getMessagesAsOperationalRole marks read via the correct role', () => {
    it('calls dualWriteMarkRead with the Super Agent roleType, not a hardcoded BUYER', async () => {
      const { service, convoRepo, participants } = build();
      convoRepo.findOne.mockResolvedValue(superAgentConvo);

      await service.getMessagesAsOperationalRole(superAgentRoleContext as any, 35);

      expect(participants.ensureAccountRoleParticipant).toHaveBeenCalledWith(35, superAgentRole.id, ParticipantKind.SUPER_AGENT);
    });
  });
});
