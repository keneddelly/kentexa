import { ConversationClassifierService } from './conversation-classifier.service';
import { ConversationClassificationStatus } from './entities/conversation.entity';
import { AccountRoleStatus, AccountRoleType } from '../role-context/entities/account-role.entity';
import { ParticipantKind } from './entities/conversation-participant.entity';

/**
 * Stage 2 item 22: the historical classifier must be purely deterministic
 * -- never guess an ambiguous legacy conversation's ownership. Only
 * RESOLVED records may be auto-backfilled; everything else is quarantined.
 */
describe('ConversationClassifierService', () => {
  const sellerRole = { id: 10, userId: 1, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE };
  const buyerRole = { id: 20, userId: 2, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE };

  const build = () => {
    const convoRepo: any = { find: jest.fn(), update: jest.fn() };
    const customerRepo: any = { findOne: jest.fn() };
    const accountRoleRepo: any = {
      findOne: jest.fn(({ where }: any) => {
        if (where.userId === 1 && where.roleType === AccountRoleType.SELLER) return Promise.resolve(sellerRole);
        if (where.userId === 2 && where.roleType === AccountRoleType.BUYER) return Promise.resolve(buyerRole);
        return Promise.resolve(null);
      }),
    };
    const participants: any = {
      ensureAccountRoleParticipant: jest.fn().mockResolvedValue({ id: 100 }),
      ensureExternalContactParticipant: jest.fn().mockResolvedValue({ id: 200 }),
    };
    return { service: new ConversationClassifierService(convoRepo, customerRepo, accountRoleRepo, participants), convoRepo, customerRepo, accountRoleRepo, participants };
  };

  describe('classify', () => {
    it('resolves a conversation whose seller and buyer both have an active AccountRole', async () => {
      const { service, customerRepo } = build();
      customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: 1, userId: 2 });
      const result = await service.classify({ id: 1, sellerId: 1, customerId: 55 } as any);
      expect(result.status).toBe(ConversationClassificationStatus.RESOLVED);
    });

    it('classifies a WhatsApp/manual customer (no linked user account) as EXTERNAL_CONTACT, not ambiguous', async () => {
      const { service, customerRepo } = build();
      customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: 1, userId: null });
      const result = await service.classify({ id: 1, sellerId: 1, customerId: 55 } as any);
      expect(result.status).toBe(ConversationClassificationStatus.EXTERNAL_CONTACT);
    });

    it('never guesses -- a seller with no active AccountRole (never synced, suspended, rejected) is AMBIGUOUS, not RESOLVED-with-a-guess', async () => {
      const { service } = build();
      const result = await service.classify({ id: 1, sellerId: 999, customerId: 55 } as any);
      expect(result.status).toBe(ConversationClassificationStatus.AMBIGUOUS);
      expect(result.reason).toBe('no_active_seller_account_role');
    });

    it('a buyer with no active AccountRole is AMBIGUOUS', async () => {
      const { service, customerRepo } = build();
      customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: 1, userId: 999 });
      const result = await service.classify({ id: 1, sellerId: 1, customerId: 55 } as any);
      expect(result.status).toBe(ConversationClassificationStatus.AMBIGUOUS);
      expect(result.reason).toBe('no_active_buyer_account_role');
    });

    it('a missing sellerId is AMBIGUOUS, never defaulted to anything', async () => {
      const { service } = build();
      const result = await service.classify({ id: 1, sellerId: null, customerId: 55 } as any);
      expect(result.status).toBe(ConversationClassificationStatus.AMBIGUOUS);
    });
  });

  describe('classifyAndBackfillBatch', () => {
    it('RESOLVED creates BOTH the seller and buyer AccountRole participants', async () => {
      const { service, convoRepo, customerRepo, participants } = build();
      convoRepo.find.mockResolvedValue([
        { id: 1, sellerId: 1, customerId: 55, customer: { userId: 2 } },
      ]);
      customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: 1, userId: 2 });

      const report = await service.classifyAndBackfillBatch(10, 0);

      expect(report.resolved).toBe(1);
      expect(convoRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({ classificationStatus: ConversationClassificationStatus.RESOLVED }));
      expect(participants.ensureAccountRoleParticipant).toHaveBeenCalledWith(1, sellerRole.id, ParticipantKind.SELLER);
      expect(participants.ensureAccountRoleParticipant).toHaveBeenCalledWith(1, buyerRole.id, ParticipantKind.BUYER);
      expect(participants.ensureAccountRoleParticipant).toHaveBeenCalledTimes(2);
      expect(participants.ensureExternalContactParticipant).not.toHaveBeenCalled();
    });

    it('EXTERNAL_CONTACT creates BOTH the seller AccountRole participant and the external-contact participant (regression: previously only the external-contact side was created, leaving the seller unable to pass isEntitled() on their own conversation once scoped reads are enabled)', async () => {
      const { service, convoRepo, customerRepo, participants } = build();
      convoRepo.find.mockResolvedValue([
        { id: 4, sellerId: 1, customerId: 9, customer: { id: 9, sellerId: 1, userId: null } },
      ]);
      customerRepo.findOne.mockResolvedValue({ id: 9, sellerId: 1, userId: null });

      const report = await service.classifyAndBackfillBatch(10, 0);

      expect(report.externalContact).toBe(1);
      expect(convoRepo.update).toHaveBeenCalledWith(4, expect.objectContaining({ classificationStatus: ConversationClassificationStatus.EXTERNAL_CONTACT }));
      expect(participants.ensureAccountRoleParticipant).toHaveBeenCalledWith(4, sellerRole.id, ParticipantKind.SELLER);
      expect(participants.ensureExternalContactParticipant).toHaveBeenCalledWith(4, 9);
      // Never invents a buyer participant for a contact with no linked user account.
      expect(participants.ensureAccountRoleParticipant).not.toHaveBeenCalledWith(4, expect.anything(), ParticipantKind.BUYER);
    });

    it('production-equivalent conversation #4 shape: active seller role + BusinessCustomer with userId=NULL -> classificationStatus=EXTERNAL_CONTACT with exactly two participants created (seller ACCOUNT_ROLE + customer EXTERNAL_CONTACT)', async () => {
      const { service, convoRepo, customerRepo, participants } = build();
      convoRepo.find.mockResolvedValue([
        { id: 4, sellerId: 1, customerId: 9, customer: { id: 9, sellerId: 1, userId: null } },
      ]);
      customerRepo.findOne.mockResolvedValue({ id: 9, sellerId: 1, userId: null });

      const report = await service.classifyAndBackfillBatch(10, 0);

      expect(report.byReason['customer_has_no_linked_user_account']).toBe(1);
      expect(participants.ensureAccountRoleParticipant).toHaveBeenCalledTimes(1);
      expect(participants.ensureExternalContactParticipant).toHaveBeenCalledTimes(1);
    });

    it('fail-closed: no participants of any kind (seller, buyer, or external-contact) are ever created for an AMBIGUOUS row', async () => {
      const { service, convoRepo, customerRepo, participants } = build();
      convoRepo.find.mockResolvedValue([
        { id: 1, sellerId: 1, customerId: 55, customer: { userId: 2 } }, // resolves
        { id: 2, sellerId: 999, customerId: 56, customer: { userId: 2 } }, // ambiguous (bad seller)
      ]);
      customerRepo.findOne.mockImplementation(({ where }: any) =>
        Promise.resolve(where.id === 55 ? { id: 55, sellerId: 1, userId: 2 } : { id: 56, sellerId: 999, userId: 2 }),
      );

      const report = await service.classifyAndBackfillBatch(10, 0);

      expect(report.resolved).toBe(1);
      expect(report.ambiguous).toBe(1);
      expect(convoRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({ classificationStatus: ConversationClassificationStatus.RESOLVED }));
      expect(convoRepo.update).toHaveBeenCalledWith(2, expect.objectContaining({ classificationStatus: ConversationClassificationStatus.AMBIGUOUS }));
      // Only the resolved conversation (id 1) gets participants ensured.
      expect(participants.ensureAccountRoleParticipant).not.toHaveBeenCalledWith(2, expect.anything(), expect.anything());
      expect(participants.ensureExternalContactParticipant).not.toHaveBeenCalledWith(2, expect.anything());
    });

    it('fail-closed: EXTERNAL_CONTACT is never produced (nor is any participant created) when the seller AccountRole itself is missing/inactive -- the seller check happens before the customer-side check', async () => {
      const { service, convoRepo, customerRepo, participants } = build();
      convoRepo.find.mockResolvedValue([
        { id: 7, sellerId: 999, customerId: 9, customer: { id: 9, sellerId: 999, userId: null } },
      ]);
      customerRepo.findOne.mockResolvedValue({ id: 9, sellerId: 999, userId: null });

      const report = await service.classifyAndBackfillBatch(10, 0);

      expect(report.ambiguous).toBe(1);
      expect(report.externalContact).toBe(0);
      expect(participants.ensureAccountRoleParticipant).not.toHaveBeenCalled();
      expect(participants.ensureExternalContactParticipant).not.toHaveBeenCalled();
    });

    it('repeated execution over the same row is idempotent at the call layer -- identical (conversationId, accountRoleId/externalCustomerId) arguments both times, relying on ParticipantResolutionService.ensure*Participant\'s own upsert semantics (see participant-resolution.service.spec.ts) to avoid duplicating the underlying row', async () => {
      const { service, convoRepo, customerRepo, participants } = build();
      convoRepo.find.mockResolvedValue([
        { id: 4, sellerId: 1, customerId: 9, customer: { id: 9, sellerId: 1, userId: null } },
      ]);
      customerRepo.findOne.mockResolvedValue({ id: 9, sellerId: 1, userId: null });

      await service.classifyAndBackfillBatch(10, 0);
      await service.classifyAndBackfillBatch(10, 0);

      expect(participants.ensureAccountRoleParticipant).toHaveBeenNthCalledWith(1, 4, sellerRole.id, ParticipantKind.SELLER);
      expect(participants.ensureAccountRoleParticipant).toHaveBeenNthCalledWith(2, 4, sellerRole.id, ParticipantKind.SELLER);
      expect(participants.ensureExternalContactParticipant).toHaveBeenNthCalledWith(1, 4, 9);
      expect(participants.ensureExternalContactParticipant).toHaveBeenNthCalledWith(2, 4, 9);
    });

    it('a per-row failure is caught and counted, never aborts the whole batch', async () => {
      const { service, convoRepo, customerRepo } = build();
      convoRepo.find.mockResolvedValue([
        { id: 1, sellerId: 1, customerId: 55, customer: { userId: 2 } },
        { id: 2, sellerId: 1, customerId: 999, customer: null },
      ]);
      customerRepo.findOne.mockImplementation(({ where }: any) => {
        if (where.id === 55) return Promise.resolve({ id: 55, sellerId: 1, userId: 2 });
        throw new Error('db exploded');
      });

      const report = await service.classifyAndBackfillBatch(10, 0);

      expect(report.scanned).toBe(2);
      expect(report.errors).toBe(1);
      expect(report.resolved).toBe(1);
    });
  });

  describe('batching / resumability', () => {
    // classifyAndBackfillBatch queries WHERE classificationStatus =
    // LEGACY_UNSCOPED -- once a row is classified it drops out of that
    // result set. Repeated calls MUST use offset=0 every time (the
    // shrinking filter does the bookkeeping); an incrementing offset would
    // skip rows, because the underlying result set shrinks between calls.
    const buildStatefulRepo = (rows: any[]) => {
      let remaining = rows;
      const { service, convoRepo, customerRepo, participants } = build();
      convoRepo.find.mockImplementation(({ take, skip }: any) => Promise.resolve(remaining.slice(skip, skip + take)));
      convoRepo.update.mockImplementation((id: number) => {
        remaining = remaining.filter((r) => r.id !== id);
        return Promise.resolve();
      });
      customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: 1, userId: 2 });
      return { service, convoRepo, customerRepo, participants };
    };

    it('repeated calls with offset=0 converge to zero scanned rows once everything is classified', async () => {
      const rows = [
        { id: 1, sellerId: 1, customerId: 55, customer: { userId: 2 } },
        { id: 2, sellerId: 1, customerId: 55, customer: { userId: 2 } },
        { id: 3, sellerId: 1, customerId: 55, customer: { userId: 2 } },
      ];
      const { service } = buildStatefulRepo(rows);

      const r1 = await service.classifyAndBackfillBatch(1, 0);
      const r2 = await service.classifyAndBackfillBatch(1, 0);
      const r3 = await service.classifyAndBackfillBatch(1, 0);
      const r4 = await service.classifyAndBackfillBatch(1, 0);

      expect([r1.scanned, r2.scanned, r3.scanned]).toEqual([1, 1, 1]);
      expect(r4.scanned).toBe(0); // nothing LEGACY_UNSCOPED left
    });

    it('an incrementing offset incorrectly skips rows once earlier ones are classified -- documents why offset must stay 0', async () => {
      const rows = [
        { id: 1, sellerId: 1, customerId: 55, customer: { userId: 2 } },
        { id: 2, sellerId: 1, customerId: 55, customer: { userId: 2 } },
      ];
      const { service } = buildStatefulRepo(rows);

      const first = await service.classifyAndBackfillBatch(1, 0); // classifies row 1; remaining = [row 2]
      const wrong = await service.classifyAndBackfillBatch(1, 1); // WRONG: offset=1 on a now-1-row result set skips row 2 entirely

      expect(first.scanned).toBe(1);
      expect(wrong.scanned).toBe(0); // row 2 was never processed -- the pitfall this test documents
    });
  });

  describe('classifyBatchDryRun', () => {
    it('never writes anything', async () => {
      const { service, convoRepo, customerRepo, participants } = build();
      convoRepo.find.mockResolvedValue([{ id: 1, sellerId: 1, customerId: 55 }]);
      customerRepo.findOne.mockResolvedValue({ id: 55, sellerId: 1, userId: 2 });

      await service.classifyBatchDryRun(10, 0);

      expect(convoRepo.update).not.toHaveBeenCalled();
      expect(participants.ensureAccountRoleParticipant).not.toHaveBeenCalled();
    });
  });
});
