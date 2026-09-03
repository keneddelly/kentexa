import { ConversationService } from './conversation.service';
import { ConversationStatus, ConversationClassificationStatus } from './entities/conversation.entity';
import { ParticipantKind } from './entities/conversation-participant.entity';
import { AccountRoleType, AccountRoleStatus, RoleProfileType } from '../role-context/entities/account-role.entity';

/**
 * Checkpoint E: dual-write parity tests. Proves every conversation/message
 * write introduced by Stage 2 keeps writing the legacy columns UNCHANGED
 * (the existing behavior the rest of the app still reads) while ALSO
 * populating the new participant/attribution columns -- and that a Stage 2
 * resolver failure never breaks the legacy write path it rides alongside.
 */
describe('ConversationService dual-write (Stage 2 checkpoint B/E)', () => {
  const sellerAccountRole = {
    id: 10, userId: 1, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
    profileType: RoleProfileType.SELLER_PROFILE, profileId: 77, contextVersion: 1,
  };
  const buyerAccountRole = {
    id: 20, userId: 2, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE,
    profileType: RoleProfileType.USER, profileId: 2, contextVersion: 1,
  };

  const build = (flagsOverride: Record<string, boolean> = {}) => {
    const convoRepo: any = {
      findOne: jest.fn(),
      create: jest.fn((data) => ({ id: 500, ...data })),
      save: jest.fn((data) => Promise.resolve(data)),
      update: jest.fn(),
    };
    const msgRepo: any = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((data) => ({ id: 900, ...data })),
      save: jest.fn((data) => Promise.resolve(data)),
      update: jest.fn(),
    };
    const customerRepo: any = { findOne: jest.fn() };
    const teamMemberRepo: any = {};
    const productRepo: any = {};
    const classifiedRepo: any = {};
    const serviceAdRepo: any = {};
    const accountRoleRepo: any = {
      findOne: jest.fn(({ where }: any) => {
        if (where.userId === 1 && where.roleType === AccountRoleType.SELLER) return Promise.resolve(sellerAccountRole);
        if (where.userId === 2 && where.roleType === AccountRoleType.BUYER) return Promise.resolve(buyerAccountRole);
        return Promise.resolve(null);
      }),
    };
    const customerService: any = { findOrCreateForChat: jest.fn() };
    const notifService: any = { notify: jest.fn().mockResolvedValue(undefined), markReadByAction: jest.fn().mockResolvedValue(undefined) };
    const commerceProfiles: any = { findById: jest.fn() };
    const gateway: any = { emitNewMessage: jest.fn() };
    const participants: any = {
      ensureAccountRoleParticipant: jest.fn((conversationId, accountRoleId, kind) =>
        Promise.resolve({ id: accountRoleId === 10 ? 1000 : 2000, conversationId, accountRoleId, participantKind: kind }),
      ),
      ensureExternalContactParticipant: jest.fn(),
      incrementUnread: jest.fn().mockResolvedValue(undefined),
      markRead: jest.fn().mockResolvedValue(undefined),
    };
    const defaultsOn = new Set(['SCOPED_CONVERSATION_DUAL_WRITE', 'SCOPED_NOTIFICATION_DUAL_WRITE']);
    const flags: any = {
      isEnabled: jest.fn((flag: string) => (flag in flagsOverride ? flagsOverride[flag] : defaultsOn.has(flag))),
    };
    const service = new ConversationService(
      convoRepo, msgRepo, customerRepo, teamMemberRepo, productRepo, classifiedRepo, serviceAdRepo,
      accountRoleRepo, customerService, notifService, commerceProfiles, gateway, participants, flags,
    );
    return { service, convoRepo, msgRepo, customerRepo, accountRoleRepo, participants, flags, gateway, notifService };
  };

  describe('getOrCreateConversation', () => {
    it('dual-writes seller participant + conversation classification for a NEW conversation, alongside the unchanged legacy insert', async () => {
      const { service, convoRepo, customerRepo, participants } = build();
      convoRepo.findOne.mockResolvedValueOnce(null); // no existing OPEN conversation
      customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: 1, userId: 2, seller: { id: 1 } });

      const convo = await service.getOrCreateConversation(1, 55, null);

      // Legacy write unchanged.
      expect(convoRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ sellerId: 1, customerId: 55, status: ConversationStatus.OPEN }),
      );
      expect(convo.sellerId).toBe(1);

      // New dual-write.
      expect(convoRepo.update).toHaveBeenCalledWith(
        500,
        expect.objectContaining({
          classificationStatus: ConversationClassificationStatus.RESOLVED,
          ownerWorkspaceType: RoleProfileType.SELLER_PROFILE,
          ownerWorkspaceId: 77,
        }),
      );
      expect(participants.ensureAccountRoleParticipant).toHaveBeenCalledWith(500, 10, ParticipantKind.SELLER);
      expect(participants.ensureAccountRoleParticipant).toHaveBeenCalledWith(500, 20, ParticipantKind.BUYER);
    });

    it('does not touch participants/classification for a pre-existing (found) conversation', async () => {
      const { service, convoRepo, participants } = build();
      convoRepo.findOne.mockResolvedValueOnce({ id: 501, sellerId: 1, customerId: 55 });

      await service.getOrCreateConversation(1, 55, null);

      expect(convoRepo.create).not.toHaveBeenCalled();
      expect(participants.ensureAccountRoleParticipant).not.toHaveBeenCalled();
    });

    it('a dual-write failure never breaks conversation creation (legacy write already succeeded)', async () => {
      const { service, convoRepo, customerRepo, participants } = build();
      convoRepo.findOne.mockResolvedValueOnce(null);
      customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: 1, userId: 2, seller: { id: 1 } });
      participants.ensureAccountRoleParticipant.mockRejectedValueOnce(new Error('boom'));

      await expect(service.getOrCreateConversation(1, 55, null)).resolves.toEqual(
        expect.objectContaining({ sellerId: 1, customerId: 55 }),
      );
    });

    it('is a no-op entirely when SCOPED_CONVERSATION_DUAL_WRITE is disabled', async () => {
      const { service, convoRepo, customerRepo, participants } = build({ SCOPED_CONVERSATION_DUAL_WRITE: false });
      convoRepo.findOne.mockResolvedValueOnce(null);
      customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: 1, userId: 2, seller: { id: 1 } });

      await service.getOrCreateConversation(1, 55, null);

      expect(participants.ensureAccountRoleParticipant).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage (seller side)', () => {
    it('attributes the message to the SELLER workspace, not any live sender role, and bumps the buyer participant unread', async () => {
      const { service, convoRepo, msgRepo, participants } = build();
      convoRepo.findOne.mockResolvedValue({ id: 501, sellerId: 1, customerId: 55, customer: { id: 55, userId: 2 } });

      const sender = { id: 999, name: 'Team Member' } as any; // NOT the seller's own userId=1
      const msg = await service.sendMessage(1, 501, { content: 'hi' }, sender);

      // Legacy write unchanged: senderId is the literal human who clicked send.
      expect(msgRepo.create).toHaveBeenCalledWith(expect.objectContaining({ senderId: 999 }));

      // Attribution goes to the seller's workspace (accountRoleId 10), not sender 999's own role.
      expect(msgRepo.update).toHaveBeenCalledWith(
        900,
        expect.objectContaining({ senderAccountRoleId: 10, senderWorkspaceType: RoleProfileType.SELLER_PROFILE, senderWorkspaceId: 77 }),
      );
      expect(participants.incrementUnread).toHaveBeenCalledWith(2000); // buyer's participant id
      expect(msg).toBeDefined();
    });

    it('does not bump unread for an internal note', async () => {
      const { service, convoRepo, participants } = build();
      convoRepo.findOne.mockResolvedValue({ id: 501, sellerId: 1, customerId: 55, customer: { id: 55, userId: 2 } });

      await service.sendMessage(1, 501, { content: 'internal', isNote: true }, { id: 1 } as any);

      expect(participants.incrementUnread).not.toHaveBeenCalled();
    });

    it('passes the resolved buyer AccountRole as the notification audience (checkpoint C)', async () => {
      const { service, convoRepo, notifService } = build();
      convoRepo.findOne.mockResolvedValue({ id: 501, sellerId: 1, customerId: 55, customer: { id: 55, userId: 2 } });

      await service.sendMessage(1, 501, { content: 'hi' }, { id: 1, name: 'Seller' } as any);

      expect(notifService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 2,
          audienceScope: 'ROLE',
          recipientAccountRoleId: 20, // buyer's AccountRole id
          sourceType: 'conversation_message',
          sourceId: 501,
        }),
      );
    });

    it('never attaches an audience when SCOPED_NOTIFICATION_DUAL_WRITE is disabled', async () => {
      const { service, convoRepo, notifService } = build({ SCOPED_NOTIFICATION_DUAL_WRITE: false });
      convoRepo.findOne.mockResolvedValue({ id: 501, sellerId: 1, customerId: 55, customer: { id: 55, userId: 2 } });

      await service.sendMessage(1, 501, { content: 'hi' }, { id: 1, name: 'Seller' } as any);

      const call = notifService.notify.mock.calls[0][0];
      expect(call.recipientAccountRoleId).toBeUndefined();
      expect(call.audienceScope).toBeUndefined();
    });
  });

  describe('sendMessageAsBuyer', () => {
    it('attributes the message to the BUYER role and bumps the seller participant unread', async () => {
      const { service, convoRepo, msgRepo, participants } = build();
      convoRepo.findOne.mockResolvedValue({ id: 501, sellerId: 1, customerId: 55, customer: { id: 55, userId: 2 } });

      await service.sendMessageAsBuyer(2, 501, { content: 'hello' }, { id: 2, name: 'Buyer' } as any);

      expect(msgRepo.update).toHaveBeenCalledWith(
        900,
        expect.objectContaining({ senderAccountRoleId: 20, senderWorkspaceType: null, senderWorkspaceId: null }),
      );
      expect(participants.incrementUnread).toHaveBeenCalledWith(1000); // seller's participant id
    });
  });

  describe('getMessages / getMessagesAsBuyer mark-read parity', () => {
    it('mirrors a seller-side mark-read reset onto ConversationParticipantState', async () => {
      const { service, convoRepo, participants } = build();
      convoRepo.findOne.mockResolvedValue({ id: 501, sellerId: 1, customerId: 55, customer: { id: 55 } });
      convoRepo.update.mockResolvedValue(undefined);

      await service.getMessages(1, 501);

      // Fire-and-forget (not awaited in the service) -- flush microtasks.
      await new Promise((r) => setImmediate(r));
      expect(participants.markRead).toHaveBeenCalledWith(1000);
    });
  });
});
