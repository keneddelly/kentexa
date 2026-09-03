import { ConversationClassifierService } from './conversation-classifier.service';
import { ConversationClassificationStatus } from './entities/conversation.entity';
import { AccountRoleStatus, AccountRoleType } from '../role-context/entities/account-role.entity';

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
    it('creates real participants ONLY for RESOLVED rows, never for AMBIGUOUS ones', async () => {
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
      expect(participants.ensureAccountRoleParticipant).toHaveBeenCalledWith(1, 10, expect.anything());
      expect(participants.ensureAccountRoleParticipant).not.toHaveBeenCalledWith(2, expect.anything(), expect.anything());
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
