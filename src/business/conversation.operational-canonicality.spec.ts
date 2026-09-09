import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { ConversationClassificationStatus } from './entities/conversation.entity';
import { ParticipantKind } from './entities/conversation-participant.entity';
import { AccountRoleType, AccountRoleStatus, RoleProfileType } from '../role-context/entities/account-role.entity';
import { CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';

/**
 * Communication canonicality fix -- proves a buyer messaging two different
 * operational identities of the SAME person (Seller vs Super Agent vs
 * Transport Provider vs Agent) never collapses onto one Conversation row,
 * that the API contract's targetId (a CommerceProfile.id) is resolved
 * SERVER-SIDE via the trusted CommerceProfile -> AccountRole chain rather
 * than trusted from the client, and that reply identity (who a message is
 * attributed/authorized as) follows the conversation's actual operational
 * owner rather than always defaulting to Seller.
 */
describe('ConversationService -- operational conversation canonicality (migration AddConversationOperationalOwnerUniqueness)', () => {
  const KENED_USER_ID = 2;
  const BOB_USER_ID = 5;

  const sellerRole = {
    id: 38, userId: KENED_USER_ID, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
    profileType: RoleProfileType.SELLER_PROFILE, profileId: 1, contextVersion: 1,
  };
  const superAgentRole = {
    id: 41, userId: KENED_USER_ID, roleType: AccountRoleType.SUPER_AGENT, status: AccountRoleStatus.ACTIVE,
    profileType: RoleProfileType.SUPER_AGENT, profileId: 7, contextVersion: 1,
  };
  const transportRole = {
    id: 42, userId: KENED_USER_ID, roleType: AccountRoleType.TRANSPORT_PROVIDER, status: AccountRoleStatus.ACTIVE,
    profileType: RoleProfileType.TRANSPORT_PROVIDER, profileId: 9, contextVersion: 1,
  };
  const agentRole = {
    id: 39, userId: KENED_USER_ID, roleType: AccountRoleType.AGENT, status: AccountRoleStatus.ACTIVE,
    profileType: RoleProfileType.AGENT, profileId: 11, contextVersion: 1,
  };
  const bobBuyerRole = {
    id: 26, userId: BOB_USER_ID, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE,
    profileType: RoleProfileType.USER, profileId: BOB_USER_ID, contextVersion: 1,
  };

  const sellerCommerceProfile = { id: 100, ownerId: KENED_USER_ID, type: CommerceProfileType.BUSINESS, superAgentId: null, transportProviderId: null, agentId: null };
  const superAgentCommerceProfile = { id: 101, ownerId: KENED_USER_ID, type: CommerceProfileType.HUB, superAgentId: 7, transportProviderId: null, agentId: null };
  const transportCommerceProfile = { id: 102, ownerId: KENED_USER_ID, type: CommerceProfileType.TRANSPORT_PROVIDER, superAgentId: null, transportProviderId: 9, agentId: null };
  const agentCommerceProfile = { id: 103, ownerId: KENED_USER_ID, type: CommerceProfileType.AGENT, superAgentId: null, transportProviderId: null, agentId: 11 };

  const build = () => {
    const convoRepo: any = {
      findOne: jest.fn(),
      create: jest.fn((data) => ({ id: 500, ...data })),
      save: jest.fn((data) => Promise.resolve(data)),
      update: jest.fn(),
    };
    const msgRepo: any = { find: jest.fn().mockResolvedValue([]), create: jest.fn((d) => ({ id: 900, ...d })), save: jest.fn((d) => Promise.resolve(d)), update: jest.fn() };
    const customerRepo: any = { findOne: jest.fn() };
    const accountRoleRepo: any = {
      findOne: jest.fn(({ where }: any) => {
        if (where.userId === KENED_USER_ID && where.roleType === AccountRoleType.SELLER) return Promise.resolve(sellerRole);
        if (where.userId === KENED_USER_ID && where.roleType === AccountRoleType.SUPER_AGENT) return Promise.resolve(superAgentRole);
        if (where.userId === KENED_USER_ID && where.roleType === AccountRoleType.TRANSPORT_PROVIDER) return Promise.resolve(transportRole);
        if (where.userId === KENED_USER_ID && where.roleType === AccountRoleType.AGENT) return Promise.resolve(agentRole);
        if (where.userId === BOB_USER_ID && where.roleType === AccountRoleType.BUYER) return Promise.resolve(bobBuyerRole);
        if (where.profileType === RoleProfileType.SUPER_AGENT && where.profileId === 7) return Promise.resolve(superAgentRole);
        if (where.profileType === RoleProfileType.TRANSPORT_PROVIDER && where.profileId === 9) return Promise.resolve(transportRole);
        if (where.profileType === RoleProfileType.AGENT && where.profileId === 11) return Promise.resolve(agentRole);
        return Promise.resolve(null);
      }),
      // Multi-Business Authority Stage 1B: the unhinted branch of
      // resolveAccountRoleFor uses .find() (to fail closed on ambiguity),
      // not .findOne() -- wraps whatever findOne above would have matched
      // into a single-element array (or empty).
      find: jest.fn(async (query: any) => {
        const r = await accountRoleRepo.findOne(query);
        return r ? [r] : [];
      }),
    };
    const participantRepo: any = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    const participantStateRepo: any = { find: jest.fn().mockResolvedValue([]), update: jest.fn() };
    const customerService: any = {
      findOrCreateForChat: jest.fn((sellerId: number) => Promise.resolve({ id: 55, sellerId, userId: BOB_USER_ID, seller: { id: sellerId } })),
    };
    const notifService: any = { notify: jest.fn().mockResolvedValue(undefined), markReadByAction: jest.fn().mockResolvedValue(undefined) };
    const commerceProfiles: any = {
      findById: jest.fn((id: number) => {
        const byId: Record<number, any> = {
          100: sellerCommerceProfile, 101: superAgentCommerceProfile, 102: transportCommerceProfile, 103: agentCommerceProfile,
        };
        return byId[id] ? Promise.resolve(byId[id]) : Promise.reject(new NotFoundException());
      }),
    };
    const gateway: any = { emitNewMessage: jest.fn() };
    const participants: any = {
      ensureAccountRoleParticipant: jest.fn((conversationId, accountRoleId, kind) => Promise.resolve({ id: accountRoleId * 100, conversationId, accountRoleId, participantKind: kind })),
      ensureExternalContactParticipant: jest.fn(),
      incrementUnread: jest.fn().mockResolvedValue(undefined),
      markRead: jest.fn().mockResolvedValue(undefined),
      getOrInitState: jest.fn().mockResolvedValue({ pinned: false, muted: false }),
    };
    const flags: any = { isEnabled: jest.fn(() => true) };
    const service = new ConversationService(
      convoRepo, msgRepo, customerRepo, {} as any, {} as any, {} as any, {} as any,
      accountRoleRepo, participantRepo, participantStateRepo,
      customerService, notifService, commerceProfiles, gateway, participants, flags,
    );
    return { service, convoRepo, msgRepo, customerRepo, accountRoleRepo, participantRepo, participants, commerceProfiles, customerService };
  };

  const bob = { id: BOB_USER_ID, name: 'Bob' } as any;

  describe('resolveOperationalTarget (server-side, never trusts the client)', () => {
    it('resolves a Super Agent target from a CommerceProfile id, ignoring any client claim about ownerWorkspaceType/Id directly', async () => {
      const { service, convoRepo, customerRepo } = build();
      convoRepo.findOne.mockResolvedValue(null);
      customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: KENED_USER_ID, seller: { id: KENED_USER_ID } });

      await service.getOrCreateOperationalConversationAsBuyer(bob, 'super_agent', 101, null);

      expect(convoRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ ownerWorkspaceType: 'super_agent', ownerWorkspaceId: 7 }),
      );
    });

    it('fails closed (404) when the CommerceProfile does not exist', async () => {
      const { service } = build();
      await expect(service.getOrCreateOperationalConversationAsBuyer(bob, 'super_agent', 999999, null))
        .rejects.toBeInstanceOf(NotFoundException);
    });

    it('fails closed when targetType does not match the CommerceProfile\'s actual type (e.g. claiming super_agent for an agent profile)', async () => {
      const { service } = build();
      await expect(service.getOrCreateOperationalConversationAsBuyer(bob, 'super_agent', 103, null))
        .rejects.toBeInstanceOf(NotFoundException);
    });

    it('fails closed when the resolved operational identity has no active AccountRole', async () => {
      const { service, accountRoleRepo } = build();
      accountRoleRepo.findOne.mockImplementation(({ where }: any) =>
        where.profileType === RoleProfileType.SUPER_AGENT ? Promise.resolve(null) : Promise.resolve(null),
      );
      await expect(service.getOrCreateOperationalConversationAsBuyer(bob, 'super_agent', 101, null))
        .rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to let a user message their own operational identity', async () => {
      const { service, convoRepo } = build();
      convoRepo.findOne.mockResolvedValue(null);
      const kenedAsBuyer = { id: KENED_USER_ID, name: 'Kened' } as any;
      await expect(service.getOrCreateOperationalConversationAsBuyer(kenedAsBuyer, 'super_agent', 101, null))
        .rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('canonicality across operational targets for the same (buyer, person) pair', () => {
    it('Seller and Super Agent targets produce DIFFERENT lookup keys, never colliding on a shared row', async () => {
      const { service, convoRepo, customerRepo } = build();
      customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: KENED_USER_ID, seller: { id: KENED_USER_ID } });

      // Seller path: no existing row -> new row with ownerWorkspaceType 'seller_profile'.
      convoRepo.findOne.mockResolvedValueOnce(null);
      await service.getOrCreateConversationAsBuyer(bob, KENED_USER_ID, null, null);
      expect(convoRepo.create).toHaveBeenCalledWith(expect.objectContaining({ ownerWorkspaceType: RoleProfileType.SELLER_PROFILE, ownerWorkspaceId: 1 }));

      // Super Agent path: lookup is called with a DIFFERENT ownerWorkspaceType/Id -- confirmed by asserting the findOne call args distinguish it from the seller lookup above.
      convoRepo.findOne.mockResolvedValueOnce(null);
      await service.getOrCreateOperationalConversationAsBuyer(bob, 'super_agent', 101, null);
      const lastFindOneCall = convoRepo.findOne.mock.calls[convoRepo.findOne.mock.calls.length - 1][0];
      expect(lastFindOneCall.where.ownerWorkspaceType).toBe('super_agent');
      expect(lastFindOneCall.where.ownerWorkspaceId).toBe(7);
    });

    it('messaging Super Agent then Transport then Agent all resolve to distinct lookup keys', async () => {
      const { service, convoRepo, customerRepo } = build();
      customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: KENED_USER_ID, seller: { id: KENED_USER_ID } });
      convoRepo.findOne.mockResolvedValue(null);

      await service.getOrCreateOperationalConversationAsBuyer(bob, 'super_agent', 101, null);
      await service.getOrCreateOperationalConversationAsBuyer(bob, 'transport_provider', 102, null);
      await service.getOrCreateOperationalConversationAsBuyer(bob, 'agent', 103, null);

      const keys = convoRepo.findOne.mock.calls.map((c: any) => `${c[0].where.ownerWorkspaceType}:${c[0].where.ownerWorkspaceId}`);
      expect(new Set(keys).size).toBe(keys.length); // every lookup key was unique
      expect(keys).toEqual(['super_agent:7', 'transport_provider:9', 'agent:11']);
    });

    it('repeating the SAME operational target reuses the existing conversation (no new row created)', async () => {
      const { service, convoRepo } = build();
      const existing = { id: 777, sellerId: KENED_USER_ID, customerId: 55, ownerWorkspaceType: 'super_agent', ownerWorkspaceId: 7 };
      convoRepo.findOne.mockResolvedValue(existing);

      const result = await service.getOrCreateOperationalConversationAsBuyer(bob, 'super_agent', 101, null);
      expect(result.id).toBe(777);
      expect(convoRepo.create).not.toHaveBeenCalled();
      expect(convoRepo.save).not.toHaveBeenCalled();
    });

    it('creates the correct owner participant (Super Agent AccountRole, not Seller) for an operational target conversation', async () => {
      const { service, convoRepo, customerRepo, participants } = build();
      convoRepo.findOne.mockResolvedValue(null);
      customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: KENED_USER_ID, seller: { id: KENED_USER_ID } });

      await service.getOrCreateOperationalConversationAsBuyer(bob, 'super_agent', 101, null);

      expect(participants.ensureAccountRoleParticipant).toHaveBeenCalledWith(500, superAgentRole.id, ParticipantKind.SUPER_AGENT);
      expect(participants.ensureAccountRoleParticipant).not.toHaveBeenCalledWith(500, sellerRole.id, expect.anything());
    });

    it('stamps operational classification (scopeType/sourceType) distinct from the legacy seller_buyer shape', async () => {
      const { service, convoRepo, customerRepo } = build();
      convoRepo.findOne.mockResolvedValue(null);
      customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: KENED_USER_ID, seller: { id: KENED_USER_ID } });

      await service.getOrCreateOperationalConversationAsBuyer(bob, 'transport_provider', 102, null);

      expect(convoRepo.update).toHaveBeenCalledWith(500, expect.objectContaining({
        scopeType: 'transport_provider_buyer',
        sourceType: 'message_transport_provider',
        classificationStatus: ConversationClassificationStatus.RESOLVED,
      }));
    });
  });

  describe('23505 concurrent-creation recovery uses the SAME workspace-aware key', () => {
    it('re-fetches by (sellerId, customerId, ownerWorkspaceType, ownerWorkspaceId) on a unique-violation, not just sellerId/customerId', async () => {
      const { service, convoRepo, customerRepo } = build();
      customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: KENED_USER_ID, seller: { id: KENED_USER_ID } });
      convoRepo.findOne
        .mockResolvedValueOnce(null) // initial lookup: not found
        .mockResolvedValueOnce({ id: 888, sellerId: KENED_USER_ID, customerId: 55, ownerWorkspaceType: 'super_agent', ownerWorkspaceId: 7 }); // 23505 recovery winner
      convoRepo.save.mockRejectedValueOnce({ code: '23505' });

      const result = await service.getOrCreateOperationalConversationAsBuyer(bob, 'super_agent', 101, null);

      expect(result.id).toBe(888);
      const recoveryCall = convoRepo.findOne.mock.calls[1][0];
      expect(recoveryCall.where.ownerWorkspaceType).toBe('super_agent');
      expect(recoveryCall.where.ownerWorkspaceId).toBe(7);
    });
  });

  describe('legacy Seller path unaffected (no ownerWorkspaceOverride argument)', () => {
    it('still resolves/creates using the seller\'s own seller_profile workspace, exactly as before', async () => {
      const { service, convoRepo, customerRepo } = build();
      convoRepo.findOne.mockResolvedValue(null);
      customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: KENED_USER_ID, seller: { id: KENED_USER_ID } });

      await service.getOrCreateConversation(KENED_USER_ID, 55, null);

      expect(convoRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        ownerWorkspaceType: RoleProfileType.SELLER_PROFILE, ownerWorkspaceId: 1,
      }));
    });

    it('a NULL-ownerWorkspace (legacy/personal) row keeps the original two-index lookup shape -- no ownerWorkspaceId filter added when the seller has no resolvable Seller AccountRole', async () => {
      const { service, convoRepo, customerRepo, accountRoleRepo } = build();
      accountRoleRepo.findOne.mockResolvedValue(null); // seller has no active Seller AccountRole
      convoRepo.findOne.mockResolvedValue(null);
      customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: KENED_USER_ID, seller: { id: KENED_USER_ID } });

      await service.getOrCreateConversation(KENED_USER_ID, 55, null);

      const lookupCall = convoRepo.findOne.mock.calls[0][0];
      expect(lookupCall.where.ownerWorkspaceId).toBeUndefined();
      expect(convoRepo.create).toHaveBeenCalledWith(expect.objectContaining({ ownerWorkspaceType: null, ownerWorkspaceId: null }));
    });
  });

  describe('reply identity follows the conversation\'s actual operational owner', () => {
    it('a message sent on the "seller" side of a Super-Agent-owned conversation is attributed to the Super Agent AccountRole, never the Seller one', async () => {
      const { service, convoRepo, msgRepo, participants } = build();
      const superAgentOwnedConvo = {
        id: 777, sellerId: KENED_USER_ID, customerId: 55, ownerWorkspaceType: 'super_agent', ownerWorkspaceId: 7,
        customer: { userId: BOB_USER_ID },
      };
      convoRepo.findOne.mockResolvedValue(superAgentOwnedConvo);
      const msg = { id: 900 };

      await (service as any).dualWriteMessageAttribution(superAgentOwnedConvo, msg, 'seller', false);

      expect(participants.ensureAccountRoleParticipant).toHaveBeenCalledWith(777, superAgentRole.id, ParticipantKind.SUPER_AGENT);
      expect(participants.ensureAccountRoleParticipant).not.toHaveBeenCalledWith(777, sellerRole.id, expect.anything());
      expect(msgRepo.update).toHaveBeenCalledWith(900, expect.objectContaining({
        senderAccountRoleId: superAgentRole.id,
        senderWorkspaceType: RoleProfileType.SUPER_AGENT,
        senderWorkspaceId: 7,
      }));
    });

    it('a message sent on the "seller" side of an ordinary (Seller-owned or legacy) conversation is still attributed to the Seller AccountRole, exactly as before', async () => {
      const { service, msgRepo, participants } = build();
      const sellerOwnedConvo = { id: 501, sellerId: KENED_USER_ID, customerId: 55, ownerWorkspaceType: null, customer: { userId: BOB_USER_ID } };
      const msg = { id: 901 };

      await (service as any).dualWriteMessageAttribution(sellerOwnedConvo, msg, 'seller', false);

      expect(participants.ensureAccountRoleParticipant).toHaveBeenCalledWith(501, sellerRole.id, ParticipantKind.SELLER);
      expect(msgRepo.update).toHaveBeenCalledWith(901, expect.objectContaining({ senderAccountRoleId: sellerRole.id }));
    });
  });
});
