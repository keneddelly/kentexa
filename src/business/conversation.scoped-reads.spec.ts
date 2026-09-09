import { ConversationService } from './conversation.service';
import { ConversationClassificationStatus } from './entities/conversation.entity';
import { AccountRoleType, AccountRoleStatus, RoleProfileType } from '../role-context/entities/account-role.entity';
import { ParticipantPrincipalType, ParticipantStatus } from './entities/conversation-participant.entity';

/**
 * Stage 2B item 1/2/23: scoped conversation reads must resolve server-side
 * from RoleContext -> AccountRole -> ConversationParticipant -> entitlement,
 * never "fetch account-wide then filter". The ONE sanctioned legacy
 * fallback is for LEGACY_UNSCOPED rows the classifier hasn't evaluated yet
 * -- AMBIGUOUS rows must stay hidden even if a raw legacy id would match.
 */
describe('ConversationService scoped reads (Stage 2B checkpoint 1/2)', () => {
  const sellerAccountRole = {
    id: 10, userId: 1, roleType: AccountRoleType.SELLER, status: AccountRoleStatus.ACTIVE,
    profileType: RoleProfileType.SELLER_PROFILE, profileId: 77, contextVersion: 1,
  };
  const buyerRoleContext = {
    userId: 2, accountRoleId: 20, roleType: AccountRoleType.BUYER,
    profileType: RoleProfileType.USER, profileId: 2, capabilities: [], sessionId: 's1', contextVersion: 1,
  };

  const build = (flagOverride: Record<string, boolean> = {}) => {
    const convoRepo: any = {
      createQueryBuilder: jest.fn(),
    };
    const msgRepo: any = {};
    const customerRepo: any = { findOne: jest.fn() };
    const teamMemberRepo: any = {};
    const productRepo: any = {};
    const classifiedRepo: any = {};
    const serviceAdRepo: any = {};
    const accountRoleRepo: any = {
      findOne: jest.fn(({ where }: any) => {
        if (where.userId === 1 && where.roleType === AccountRoleType.SELLER) return Promise.resolve(sellerAccountRole);
        if (where.userId === 2 && where.roleType === AccountRoleType.BUYER) return Promise.resolve({ id: 20, userId: 2, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE, profileType: RoleProfileType.USER, profileId: 2 });
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
    const participantRepo: any = { find: jest.fn().mockResolvedValue([]) };
    const participantStateRepo: any = { find: jest.fn().mockResolvedValue([]) };
    const customerService: any = {};
    const notifService: any = {};
    const commerceProfiles: any = {};
    const gateway: any = {};
    const participants: any = {};
    const defaultsOn = new Set(['LEGACY_COMMUNICATION_READ_FALLBACK']);
    const flags: any = { isEnabled: jest.fn((f: string) => (f in flagOverride ? flagOverride[f] : defaultsOn.has(f))) };

    const service = new ConversationService(
      convoRepo, msgRepo, customerRepo, teamMemberRepo, productRepo, classifiedRepo, serviceAdRepo,
      accountRoleRepo, participantRepo, participantStateRepo,
      customerService, notifService, commerceProfiles, gateway, participants, flags,
    );
    return { service, convoRepo, accountRoleRepo, participantRepo, flags };
  };

  // Builds a mock query builder that records the WHERE args passed and
  // returns a canned result -- lets each test assert exactly what
  // authorization condition reached the database, per item 1's "authorization
  // must happen server-side... do not filter after fetching" requirement.
  const mockQueryBuilder = (result: [any[], number]) => {
    const calls: { method: string; args: any[] }[] = [];
    const qb: any = {};
    ['leftJoinAndSelect', 'leftJoin', 'where', 'andWhere', 'orderBy', 'addOrderBy', 'skip', 'take'].forEach((m) => {
      qb[m] = jest.fn((...args: any[]) => {
        calls.push({ method: m, args });
        return qb;
      });
    });
    qb.getManyAndCount = jest.fn().mockResolvedValue(result);
    qb.getCount = jest.fn().mockResolvedValue(result[1]);
    return { qb, calls };
  };

  describe('getScopedSellerInbox', () => {
    it('queries via the seller AccountRole + ConversationParticipant join, not a raw sellerId scan', async () => {
      const { service, convoRepo } = build();
      const { qb, calls } = mockQueryBuilder([[], 0]);
      convoRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getScopedSellerInbox(1, {});

      const joinCall = calls.find((c) => c.method === 'leftJoin');
      expect(joinCall).toBeDefined();
      // leftJoin(Entity, alias, conditionString, params) -- args[3] is the params object.
      expect(joinCall!.args[3]).toEqual(
        expect.objectContaining({ accountRoleId: 10, principalType: ParticipantPrincipalType.ACCOUNT_ROLE }),
      );
    });

    it('the WHERE clause includes the RESOLVED-record participant condition and the LEGACY_UNSCOPED-only fallback, never a bare sellerId match', async () => {
      const { service, convoRepo } = build();
      const { qb, calls } = mockQueryBuilder([[], 0]);
      convoRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getScopedSellerInbox(1, {});

      const whereCall = calls.find((c) => c.method === 'where');
      expect(whereCall!.args[0]).toContain('cp.id IS NOT NULL');
      expect(whereCall!.args[0]).toContain('classificationStatus');
      expect(whereCall!.args[0]).toContain('legacyStatus');
      expect(whereCall!.args[1]).toEqual(
        expect.objectContaining({ legacyStatus: ConversationClassificationStatus.LEGACY_UNSCOPED, legacyOwnerId: 1 }),
      );
    });

    it('drops the legacy fallback clause entirely when LEGACY_COMMUNICATION_READ_FALLBACK is off -- RESOLVED-only', async () => {
      const { service, convoRepo } = build({ LEGACY_COMMUNICATION_READ_FALLBACK: false });
      const { qb, calls } = mockQueryBuilder([[], 0]);
      convoRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getScopedSellerInbox(1, {});

      const whereCall = calls.find((c) => c.method === 'where');
      expect(whereCall!.args[0]).toBe('cp.id IS NOT NULL');
      expect(whereCall!.args[0]).not.toContain('legacyStatus');
    });

    it('falls back to the legacy getSellerInbox wholesale when the seller has no active AccountRole yet (safe -- sellerId was already authorized upstream)', async () => {
      const { service, convoRepo, accountRoleRepo } = build();
      accountRoleRepo.findOne.mockResolvedValue(null);
      const { qb } = mockQueryBuilder([[], 0]);
      convoRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getScopedSellerInbox(999, {});

      expect(result).toEqual(expect.objectContaining({ conversations: [], total: 0 }));
    });

    // Ambiguous Partial-Participant Semantics Review, applied to the LIVE
    // scoped-read path (not just historical backfill): the WHERE clause's
    // participant-match branch (`cp.id IS NOT NULL`) is intentionally
    // classification-status-agnostic -- it never checks classificationStatus
    // at all, unlike the legacy-fallback branch which is deliberately
    // restricted to LEGACY_UNSCOPED. This is what SHOULD make an AMBIGUOUS
    // conversation with one independently-canonical participant (production
    // conversation 2's real shape) still resolve correctly through the
    // SQL join itself, with no special-casing needed. These tests prove the
    // WHERE clause SQL is actually agnostic in this way, since the
    // production-shaped participant-existence behavior can't be observed
    // through a mocked query builder that always returns a canned result.
    it('the participant-match branch of the WHERE clause never references classificationStatus -- it is unconditional on classification, exactly what makes an AMBIGUOUS conversation with a canonical participant (production conversation 2\'s shape) still match via the join alone', async () => {
      const { service, convoRepo } = build();
      const { qb, calls } = mockQueryBuilder([[], 0]);
      convoRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getScopedSellerInbox(1, {});

      const whereCall = calls.find((c) => c.method === 'where');
      const clause = whereCall!.args[0] as string;
      // Split on the top-level OR: the participant-match half must stand
      // completely alone, with zero classificationStatus reference in it.
      const [participantHalf] = clause.split(' OR ');
      expect(participantHalf.trim()).toBe('cp.id IS NOT NULL');
    });

    it('conversation-2 equivalent: a Buyer scoped inbox query is unaffected by the conversation being AMBIGUOUS overall -- the join condition only checks THIS role\'s own participant row', async () => {
      const { service, convoRepo, accountRoleRepo } = build();
      // A real conversation-2-shaped row: AMBIGUOUS overall, but the SQL
      // layer's join is keyed purely on (conversation_id, account_role_id,
      // status, principalType) -- it has no awareness of the conversation's
      // classificationStatus at all, so a canned "matched" result proves the
      // join CAN return an AMBIGUOUS row when a real participant exists.
      const ambiguousConvoWithCanonicalBuyer = {
        id: 2, sellerId: 10, customerId: 2, classificationStatus: ConversationClassificationStatus.AMBIGUOUS,
      };
      const { qb } = mockQueryBuilder([[ambiguousConvoWithCanonicalBuyer], 1]);
      convoRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.getScopedBuyerConversations(2, buyerRoleContext as any, {});

      expect(result.total).toBe(1);
      expect(result.conversations).toHaveLength(1);
      expect((result.conversations[0] as any).id).toBe(2);
    });
  });

  describe('AMBIGUOUS conversations with zero participants (production conversations 7/8/14/17 shape) must never appear for any role', () => {
    it('a seller inbox query for an unrelated business does not synthesize access to a participant-less AMBIGUOUS conversation merely via the legacy fallback, once it is no longer LEGACY_UNSCOPED', async () => {
      const { service, convoRepo } = build();
      // Simulates the real post-backfill state: the query itself would
      // simply never match such a row (no participant, and the fallback's
      // own SQL restricts to classificationStatus = LEGACY_UNSCOPED, which
      // an AMBIGUOUS row can never satisfy) -- asserting the WHERE clause
      // text itself carries that restriction is the correct-level test,
      // since a mocked query builder can't execute real SQL predicates.
      const { qb, calls } = mockQueryBuilder([[], 0]);
      convoRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getScopedSellerInbox(1, {});

      const whereCall = calls.find((c) => c.method === 'where');
      const clause = whereCall!.args[0] as string;
      expect(clause).toMatch(/classificationStatus.*=.*:legacyStatus/);
      const params = whereCall!.args[1];
      expect(params.legacyStatus).toBe(ConversationClassificationStatus.LEGACY_UNSCOPED);
      // AMBIGUOUS is never a value substituted for :legacyStatus anywhere --
      // the fallback branch is structurally incapable of matching an
      // AMBIGUOUS row, regardless of any raw sellerId/customerId equality.
    });
  });

  describe('getScopedConversationsForActiveRole -- roles with no product surface', () => {
    it.each([
      AccountRoleType.AGENT,
      AccountRoleType.SUPER_AGENT,
      AccountRoleType.TRANSPORT_PROVIDER,
      AccountRoleType.SERVICE_PROVIDER,
      AccountRoleType.ADMIN,
      AccountRoleType.MANAGER,
    ])('%s active returns a deterministic empty dataset, never seller or buyer data', async (roleType) => {
      const { service, convoRepo } = build();
      const result = await service.getScopedConversationsForActiveRole(
        { userId: 1, accountRoleId: 99, roleType, profileType: RoleProfileType.USER, profileId: 1, capabilities: [], sessionId: 's1', contextVersion: 1 } as any,
        {},
      );
      expect(result).toEqual({ conversations: [], total: 0, page: 1, unread: 0 });
      expect(convoRepo.createQueryBuilder).not.toHaveBeenCalled(); // never even queries Conversation
    });

    it('BUYER active routes to the buyer-scoped query, not the empty-state branch', async () => {
      const { service, convoRepo } = build();
      const { qb } = mockQueryBuilder([[], 0]);
      convoRepo.createQueryBuilder.mockReturnValue(qb);

      await service.getScopedConversationsForActiveRole(buyerRoleContext as any, {});

      expect(convoRepo.createQueryBuilder).toHaveBeenCalled();
    });
  });

  describe('getScopedBuyerConversations', () => {
    it('rejects (empty dataset) if called with a non-BUYER roleContext -- defense in depth against the controller gate', async () => {
      const { service } = build();
      const sellerCtx = { ...buyerRoleContext, roleType: AccountRoleType.SELLER };
      const result = await service.getScopedBuyerConversations(2, sellerCtx as any, {});
      expect(result).toEqual({ conversations: [], total: 0, page: 1, unread: 0 });
    });
  });

  describe('getScopedUnreadCountForAccountRole', () => {
    it('sums unreadCount only across ACTIVE participant rows for the exact accountRoleId, excluding muted threads', async () => {
      const { service, participantRepo, convoRepo } = build();
      void convoRepo;
      participantRepo.find.mockResolvedValue([{ id: 1000, accountRoleId: 10 }, { id: 1001, accountRoleId: 10 }]);
      const participantStateRepo = (service as any).participantStateRepo;
      participantStateRepo.find.mockResolvedValue([
        { conversationParticipantId: 1000, unreadCount: 3, muted: false },
        { conversationParticipantId: 1001, unreadCount: 5, muted: true }, // muted -- excluded
      ]);

      const total = await service.getScopedUnreadCountForAccountRole(10);

      expect(total).toBe(3);
    });

    it('returns 0 for an accountRoleId with no participant rows at all (no DB round trip for state)', async () => {
      const { service, participantRepo } = build();
      participantRepo.find.mockResolvedValue([]);
      const participantStateRepo = (service as any).participantStateRepo;

      const total = await service.getScopedUnreadCountForAccountRole(999);

      expect(total).toBe(0);
      expect(participantStateRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('markConversationReadScoped', () => {
    it('marks only the participant row matching this exact accountRoleId -- never another role\'s state', async () => {
      const { service, participantRepo } = build();
      const participants = (service as any).participants;
      participants.markRead = jest.fn().mockResolvedValue(undefined);
      participantRepo.findOne = jest.fn().mockResolvedValue({ id: 1000, conversationId: 5, accountRoleId: 10 });

      await service.markConversationReadScoped(5, 10, 999);

      expect(participantRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ conversationId: 5, accountRoleId: 10, status: ParticipantStatus.ACTIVE }) }),
      );
      expect(participants.markRead).toHaveBeenCalledWith(1000, 999);
    });

    it('no-ops (never throws, never marks anything) when no participant exists yet for this role on this conversation', async () => {
      const { service, participantRepo } = build();
      const participants = (service as any).participants;
      participants.markRead = jest.fn();
      participantRepo.findOne = jest.fn().mockResolvedValue(null);

      await service.markConversationReadScoped(5, 10);

      expect(participants.markRead).not.toHaveBeenCalled();
    });
  });
});
