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
      // Multi-Business Authority Stage 1B: the unhinted branch of
      // resolveAccountRoleFor uses .find() (to fail closed on ambiguity),
      // not .findOne() -- single-match-in/single-match-out wrapper over
      // the same rows findOne matches above.
      find: jest.fn(({ where }: any) => {
        if (where.userId === 1 && where.roleType === AccountRoleType.SELLER) return Promise.resolve([sellerAccountRole]);
        if (where.userId === 2 && where.roleType === AccountRoleType.BUYER) return Promise.resolve([buyerAccountRole]);
        return Promise.resolve([]);
      }),
    };
    const participantRepo: any = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    const participantStateRepo: any = { find: jest.fn().mockResolvedValue([]), update: jest.fn() };
    const customerService: any = { findOrCreateForChat: jest.fn() };
    const notifService: any = {
      notify: jest.fn().mockResolvedValue(undefined),
      markReadByAction: jest.fn().mockResolvedValue(undefined),
    };
    const commerceProfiles: any = { findById: jest.fn() };
    const gateway: any = { emitNewMessage: jest.fn() };
    const participants: any = {
      ensureAccountRoleParticipant: jest.fn((conversationId, accountRoleId, kind) =>
        Promise.resolve({ id: accountRoleId === 10 ? 1000 : 2000, conversationId, accountRoleId, participantKind: kind }),
      ),
      ensureExternalContactParticipant: jest.fn(),
      incrementUnread: jest.fn().mockResolvedValue(undefined),
      markRead: jest.fn().mockResolvedValue(undefined),
      getOrInitState: jest.fn().mockResolvedValue({ pinned: false, muted: false }),
    };
    const defaultsOn = new Set(['SCOPED_CONVERSATION_DUAL_WRITE', 'SCOPED_NOTIFICATION_DUAL_WRITE']);
    const flags: any = {
      isEnabled: jest.fn((flag: string) => (flag in flagsOverride ? flagsOverride[flag] : defaultsOn.has(flag))),
    };
    const service = new ConversationService(
      convoRepo, msgRepo, customerRepo, teamMemberRepo, productRepo, classifiedRepo, serviceAdRepo,
      accountRoleRepo, participantRepo, participantStateRepo,
      customerService, notifService, commerceProfiles, gateway, participants, flags,
    );
    return { service, convoRepo, msgRepo, customerRepo, accountRoleRepo, participantRepo, participantStateRepo, participants, flags, gateway, notifService };
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

    // Legacy-conversation dual-write escape hatch (production conversation
    // #5): getOrCreateConversation's initial lookup only matches
    // status=OPEN. A real historical conversation sitting in a different
    // status (e.g. 'pending') is invisible to it, so an insert attempt
    // against the exact same (sellerId, customerId, commerceProfileId)
    // collides with the partial unique index (23505), and the recovery
    // path re-fetches that pre-existing row as the "winner" -- which must
    // never be treated as newly created merely because this call's own
    // insert didn't survive.
    describe('23505 recovery must not run new-conversation initialization on a recovered pre-existing conversation', () => {
      it('production conversation #5 equivalent: a pre-existing LEGACY_UNSCOPED conversation recovered after 23505 keeps its classification untouched and gains no synthesized participants', async () => {
        const { service, convoRepo, customerRepo, participants } = build();
        const preExistingWinner = {
          id: 5, sellerId: 1, customerId: 55, status: 'pending', // NOT 'open' -- invisible to the initial lookup
          classificationStatus: ConversationClassificationStatus.LEGACY_UNSCOPED,
          customer: { id: 55, userId: 2 },
        };
        convoRepo.findOne
          .mockResolvedValueOnce(null) // initial OPEN-only lookup: not found
          .mockResolvedValueOnce(preExistingWinner); // 23505 recovery re-fetch: the real pre-existing row
        customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: 1, userId: 2, seller: { id: 1 } });
        const conflict: any = new Error('duplicate key value violates unique constraint');
        conflict.code = '23505';
        convoRepo.save.mockRejectedValueOnce(conflict);

        const result = await service.getOrCreateConversation(1, 55, null);

        expect(result).toBe(preExistingWinner);
        // The decisive assertions: no new-conversation initialization ran
        // against the recovered row.
        expect(convoRepo.update).not.toHaveBeenCalled();
        expect(participants.ensureAccountRoleParticipant).not.toHaveBeenCalled();
        expect(participants.ensureExternalContactParticipant).not.toHaveBeenCalled();
      });

      it('a 23505-recovered conversation that is ALREADY a modern, fully-scoped RESOLVED conversation also does not rerun initialization (idempotent, not merely lucky on legacy rows)', async () => {
        const { service, convoRepo, customerRepo, participants } = build();
        const alreadyScopedWinner = {
          id: 900, sellerId: 1, customerId: 55, status: 'open',
          classificationStatus: ConversationClassificationStatus.RESOLVED,
          classificationReason: 'seller_and_buyer_account_roles_resolved',
          customer: { id: 55, userId: 2 },
        };
        convoRepo.findOne
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(alreadyScopedWinner);
        customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: 1, userId: 2, seller: { id: 1 } });
        const conflict: any = new Error('duplicate key value violates unique constraint');
        conflict.code = '23505';
        convoRepo.save.mockRejectedValueOnce(conflict);

        const result = await service.getOrCreateConversation(1, 55, null);

        expect(result).toBe(alreadyScopedWinner);
        expect(convoRepo.update).not.toHaveBeenCalled();
        expect(participants.ensureAccountRoleParticipant).not.toHaveBeenCalled();
      });

      it('retry/concurrency idempotency: a genuine 23505 double-tap still resolves to a single real conversation, with initialization attributed to exactly one of the two calls, never both, never a recovered row', async () => {
        const { service, convoRepo, customerRepo, participants } = build();
        customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: 1, userId: 2, seller: { id: 1 } });

        // First call: genuinely creates the row.
        convoRepo.findOne.mockResolvedValueOnce(null);
        convoRepo.save.mockResolvedValueOnce({ id: 501, sellerId: 1, customerId: 55, status: 'open' });
        const first = await service.getOrCreateConversation(1, 55, null);
        expect(first.id).toBe(501);
        expect(convoRepo.update).toHaveBeenCalledTimes(1); // exactly one initialization

        // Second call (the "double-tap"): the row now exists but this
        // call's own OPEN lookup finds it directly (the normal case once
        // status=open) -- no 23505 involved, no re-initialization.
        convoRepo.findOne.mockResolvedValueOnce({ id: 501, sellerId: 1, customerId: 55, status: 'open' });
        const second = await service.getOrCreateConversation(1, 55, null);
        expect(second.id).toBe(501);
        expect(convoRepo.update).toHaveBeenCalledTimes(1); // still exactly one -- not re-run
        expect(participants.ensureAccountRoleParticipant).toHaveBeenCalledTimes(2); // seller + buyer, from the FIRST call only
      });

      it('a genuinely NEW conversation (no prior row at all) still receives full initialization through the 23505 branch\'s sibling success path -- confirms the fix did not disable dual-write globally', async () => {
        const { service, convoRepo, customerRepo, participants } = build();
        convoRepo.findOne.mockResolvedValueOnce(null);
        customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: 1, userId: 2, seller: { id: 1 } });
        // save() succeeds outright -- no 23505 at all.

        await service.getOrCreateConversation(1, 55, null);

        expect(convoRepo.update).toHaveBeenCalledWith(500, expect.objectContaining({ classificationStatus: ConversationClassificationStatus.RESOLVED }));
        expect(participants.ensureAccountRoleParticipant).toHaveBeenCalledWith(500, 10, ParticipantKind.SELLER);
        expect(participants.ensureAccountRoleParticipant).toHaveBeenCalledWith(500, 20, ParticipantKind.BUYER);
      });

      it('a genuine unique-violation with no recoverable winner (should be impossible, but the original error must still surface rather than being swallowed) still throws', async () => {
        const { service, convoRepo, customerRepo } = build();
        convoRepo.findOne
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null); // recovery re-fetch also finds nothing -- genuinely anomalous
        customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: 1, userId: 2, seller: { id: 1 } });
        const conflict: any = new Error('duplicate key value violates unique constraint');
        conflict.code = '23505';
        convoRepo.save.mockRejectedValueOnce(conflict);

        await expect(service.getOrCreateConversation(1, 55, null)).rejects.toThrow(conflict);
      });
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

  describe('emitSystemMessage (Stage 2B item 8: addOrderMessage/addInvoiceMessage)', () => {
    it('resolves and passes both seller and buyer AccountRole ids, never falling back to a generic user room', async () => {
      const { service, convoRepo, msgRepo, gateway } = build();
      convoRepo.findOne.mockResolvedValue({ id: 501, sellerId: 1, customerId: 55, customer: { id: 55, userId: 2 } });
      msgRepo.save.mockResolvedValue({ id: 900 });

      await service.addOrderMessage(501, { id: 42, trackingNumber: 'KTX-1', totalAmount: 1000, status: 'paid' });

      expect(gateway.emitNewMessage).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 501, sellerAccountRoleId: 10, buyerAccountRoleId: 20 }),
      );
    });

    it('resolution failure for a side is caught, never throws, never blocks the message being persisted', async () => {
      const { service, convoRepo, msgRepo, accountRoleRepo, gateway } = build();
      convoRepo.findOne.mockResolvedValue({ id: 501, sellerId: 1, customerId: 55, customer: { id: 55, userId: 2 } });
      msgRepo.save.mockResolvedValue({ id: 900 });
      // Multi-Business Authority Stage 1B: resolveAccountRoleFor's unhinted
      // branch (the one this scenario exercises -- no ownerWorkspaceHint
      // on this convo) now queries via .find(), not .findOne() -- both
      // must be made to fail here to still simulate "resolution blew up".
      accountRoleRepo.findOne.mockRejectedValue(new Error('db exploded'));
      accountRoleRepo.find.mockRejectedValue(new Error('db exploded'));

      await expect(
        service.addOrderMessage(501, { id: 42, trackingNumber: 'KTX-1', totalAmount: 1000, status: 'paid' }),
      ).resolves.toBeUndefined();
      expect(gateway.emitNewMessage).not.toHaveBeenCalled(); // caught by emitSystemMessage's own try/catch
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
