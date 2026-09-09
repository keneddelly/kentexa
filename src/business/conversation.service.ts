/**
 * ConversationService — Unified Commerce Inbox
 *
 * Converts conversations into transactions.
 * Seller can: view messages, reply, share products,
 * create orders/invoices directly from the chat.
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan } from 'typeorm';
import {
  Conversation,
  ConversationStatus,
} from './entities/conversation.entity';
import {
  ConversationMessage,
  MessageSenderType,
  MessageType,
} from './entities/conversation-message.entity';
import { BusinessCustomer } from './entities/business-customer.entity';
import { BusinessTeamMember } from './entities/business-team-member.entity';
import { BusinessCustomerService } from './business-customer.service';
import { User } from '../users/entities/user.entity';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import { ConversationGateway } from './conversation.gateway';
import { Product } from '../products/entities/products.entity';
import { Classified } from '../classifieds/entities/classified.entity';
import { ServiceAd } from '../services/entities/service-ad.entity';
import {
  ConversationClassificationStatus,
} from './entities/conversation.entity';
import { ParticipantResolutionService } from './participant-resolution.service';
import {
  ConversationParticipant,
  ParticipantKind,
  ParticipantPrincipalType,
  ParticipantStatus,
} from './entities/conversation-participant.entity';
import { ConversationParticipantState } from './entities/conversation-participant-state.entity';
import { CommunicationFeatureFlagsService } from '../communication/communication-feature-flags.service';
import { AccountRole, AccountRoleStatus, AccountRoleType, RoleProfileType } from '../role-context/entities/account-role.entity';
import { RoleContext } from '../role-context/role-context.types';

export interface ConversationContext {
  type: 'product' | 'classified' | 'service';
  id: number;
}

export interface ScopedInboxResult {
  conversations: any[];
  total: number;
  page: number;
  unread: number;
}

// Multi-Business Authority Stage 1. A caller-supplied disambiguator for
// "which of the user's possibly-several same-roleType AccountRole rows is
// the one this request actually concerns" -- mirrors Conversation.
// ownerWorkspaceType/ownerWorkspaceId's own vocabulary (RoleProfileType-
// shaped strings + the concrete profile id, e.g. a specific SellerProfile
// id), NEVER the Business-First OperationalWorkspace id (a different
// dimension entirely -- see SellerScopeService.SellerScope's own comment).
// Always resolved server-side (from an already-authoritative RoleContext or
// from the conversation's own already-stamped ownerWorkspace columns) --
// never accepted from a client directly.
export type WorkspaceHint = { workspaceType: string; workspaceId: number } | null;

// Multi-Business Authority Stage 1B. Thrown by resolveAccountRoleFor when
// a caller supplies no workspace hint and more than one ACTIVE AccountRole
// row of the requested roleType exists for the user -- i.e. genuinely
// unresolvable without more context, never something to guess at by
// picking "the first one". A dedicated type (rather than a generic Error)
// so callers can distinguish "ambiguous" from "genuinely has none" and
// react differently: dual-write helpers treat both the same (best-effort,
// already wrapped in `.catch()` at their call sites -- skip the step), but
// getScopedSellerInbox/getScopedBuyerConversations must NOT fall back to
// their wide-open legacy (unscoped) query on ambiguity the way they safely
// do on "genuinely has none".
export class AmbiguousAccountRoleError extends Error {
  constructor(public readonly userId: number, public readonly roleType: string, public readonly matchCount: number) {
    super(`Ambiguous AccountRole for user ${userId}, roleType ${roleType}: ${matchCount} active rows, no workspace hint supplied`);
  }
}

@Injectable()
export class ConversationService {
  constructor(
    @InjectRepository(Conversation)
    private convoRepo: Repository<Conversation>,
    @InjectRepository(ConversationMessage)
    private msgRepo: Repository<ConversationMessage>,
    @InjectRepository(BusinessCustomer)
    private customerRepo: Repository<BusinessCustomer>,
    @InjectRepository(BusinessTeamMember)
    private teamMemberRepo: Repository<BusinessTeamMember>,
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    @InjectRepository(Classified)
    private classifiedRepo: Repository<Classified>,
    @InjectRepository(ServiceAd)
    private serviceAdRepo: Repository<ServiceAd>,
    @InjectRepository(AccountRole)
    private accountRoleRepo: Repository<AccountRole>,
    @InjectRepository(ConversationParticipant)
    private participantRepo: Repository<ConversationParticipant>,
    @InjectRepository(ConversationParticipantState)
    private participantStateRepo: Repository<ConversationParticipantState>,
    private customerService: BusinessCustomerService,
    private notifService: InAppNotificationService,
    private commerceProfiles: CommerceProfilesService,
    private gateway: ConversationGateway,
    private participants: ParticipantResolutionService,
    private flags: CommunicationFeatureFlagsService,
  ) {}

  // ── Stage 2 dual-write helpers ───────────────────────────────────────────
  // A conversation side's workspace is a STRUCTURAL fact (which seller's
  // business, which buyer's account this thread belongs to) -- resolved by
  // server-side lookup keyed on the already-trusted sellerId/customer.userId,
  // never from a client-supplied accountRoleId. Returns null (never throws)
  // so dual-write can no-op cleanly for an account that somehow has no
  // matching AccountRole yet (should not happen post Stage-1 sync, but this
  // path must never be able to break the legacy send/create flow it rides
  // alongside).
  // Multi-Business Authority Stage 1B: fail-closed under ambiguity, never
  // guess. Previously an unordered .findOne() on bare (userId, roleType) --
  // correct as long as at most one AccountRole row of that roleType could
  // ever exist for a user, which is no longer guaranteed now that seller/
  // super_agent/transport_provider/service_provider roles may repeat (one
  // per WorkspaceAssignment).
  //  1. When `workspaceHint` is supplied (from an already-authoritative
  //     RoleContext, or from a conversation's own already-stamped
  //     ownerWorkspaceType/Id), resolve ONLY the exact matching row by
  //     (profileType, profileId). If no row matches that specific hint,
  //     return null -- never fall through to guessing a DIFFERENT role of
  //     the same type; a caller precise enough to supply a hint is precise
  //     enough that "no match" must mean "not this one", not "try another".
  //  2. Without a hint: 0 matches -> null (unchanged). Exactly 1 match ->
  //     that row (still fully safe -- no ambiguity exists). 2+ matches ->
  //     throws AmbiguousAccountRoleError rather than picking one via
  //     ordering. Ordering by id is useful for legacy determinism but is
  //     NOT a security boundary (per the mission's own explicit
  //     instruction) -- every caller of this method either already
  //     swallows a thrown/rejected promise as "treat as not found, skip
  //     this best-effort step" (the dual-write helpers below, all called
  //     with `.catch(...)` at their own call sites), or must explicitly
  //     handle ambiguity as a fail-closed empty result rather than an
  //     open-ended legacy fallback (getScopedSellerInbox/
  //     getScopedBuyerConversations, see their own comments).
  private async resolveAccountRoleFor(
    userId: number,
    roleType: AccountRoleType,
    workspaceHint?: WorkspaceHint,
  ): Promise<AccountRole | null> {
    if (workspaceHint) {
      return this.accountRoleRepo.findOne({
        where: {
          userId,
          roleType,
          status: AccountRoleStatus.ACTIVE,
          profileType: workspaceHint.workspaceType as RoleProfileType,
          profileId: workspaceHint.workspaceId,
        },
      });
    }
    const matches = await this.accountRoleRepo.find({
      where: { userId, roleType, status: AccountRoleStatus.ACTIVE },
      order: { id: 'ASC' },
    });
    if (matches.length > 1) {
      throw new AmbiguousAccountRoleError(userId, roleType, matches.length);
    }
    return matches[0] ?? null;
  }

  private workspaceOf(role: AccountRole | null): { workspaceType: string; workspaceId: number } | null {
    if (!role || role.profileType === RoleProfileType.USER || role.profileId == null) return null;
    return { workspaceType: role.profileType as string, workspaceId: role.profileId };
  }

  // Communication canonicality fix: the "owning side" of a conversation is
  // no longer always the Seller role -- ownerWorkspaceType (stamped at
  // creation, see getOrCreateConversation/resolveOperationalTarget below)
  // says which operational role actually owns it. null/seller_profile
  // (every pre-fix row, and every ordinary Seller conversation) keeps
  // resolving to AccountRoleType.SELLER exactly as before; a Super Agent/
  // Transport/Agent-owned conversation now resolves to ITS OWN role type,
  // so a reply is authored/attributed as that operational identity, never
  // silently as Seller or bare User just because the same person holds
  // both roles.
  private ownerRoleTypeFor(convo: Conversation): AccountRoleType {
    switch (convo.ownerWorkspaceType) {
      case RoleProfileType.SUPER_AGENT:
        return AccountRoleType.SUPER_AGENT;
      case RoleProfileType.TRANSPORT_PROVIDER:
        return AccountRoleType.TRANSPORT_PROVIDER;
      case RoleProfileType.AGENT:
        return AccountRoleType.AGENT;
      default:
        return AccountRoleType.SELLER;
    }
  }

  // Shared by dualWriteMarkRead/dualWriteMessageAttribution/the operational
  // send+read paths -- the ONE place that maps an AccountRoleType to its
  // ConversationParticipant kind, so a caller passing e.g. SUPER_AGENT
  // never silently collapses onto BUYER (the old hardcoded `=== SELLER ?
  // SELLER : BUYER` ternary this replaces did exactly that for any
  // non-Seller roleType, including Buyer's own -- harmless only because
  // Buyer was the only other value ever actually passed until now).
  private participantKindForRoleType(roleType: AccountRoleType): string {
    switch (roleType) {
      case AccountRoleType.SELLER:
        return ParticipantKind.SELLER;
      case AccountRoleType.SUPER_AGENT:
        return ParticipantKind.SUPER_AGENT;
      case AccountRoleType.TRANSPORT_PROVIDER:
        return ParticipantKind.TRANSPORT_PROVIDER;
      case AccountRoleType.AGENT:
        return ParticipantKind.AGENT;
      default:
        return ParticipantKind.BUYER;
    }
  }

  /**
   * Server-side, trusted resolution of a client-asserted operational
   * target -- never trusts a client-supplied ownerWorkspaceType/Id (or a
   * raw SuperAgent/TransportProvider/Agent id) directly. `targetId` is a
   * CommerceProfile.id (the same id the frontend already has as
   * activeProfile.id from GET /profiles/:id -- no new id needs to be
   * plumbed through the client at all). The linked operational entity id
   * (superAgentId/transportProviderId/agentId) is read from THAT trusted
   * row, not asserted by the caller, and `targetType` is cross-checked
   * against the profile's own `type` -- a client claiming targetType
   * 'super_agent' for a profile that is actually type 'agent' fails
   * closed rather than silently resolving the wrong identity. From there,
   * AccountRole's own (profileType, profileId) unique constraint
   * (UQ_account_role_operational_profile) is the final authority: no
   * active AccountRole of exactly that shape means no messageable
   * identity, full stop.
   */
  private async resolveOperationalTarget(
    targetType: 'super_agent' | 'transport_provider' | 'agent',
    targetId: number,
  ): Promise<{ userId: number; accountRoleId: number; operationalProfileId: number }> {
    const profile = await this.commerceProfiles.findById(targetId).catch(() => null);
    if (!profile) throw new NotFoundException('Target profile not found');

    // CommerceProfile.type uses its OWN vocabulary ('hub' for a Super
    // Agent, matching CommerceProfileType) -- distinct from targetType's
    // AccountRoleType/RoleProfileType-shaped strings. Mapping both the
    // expected profile type AND the linked entity id from a single lookup
    // table keeps the two vocabularies from ever being compared directly.
    const expectation: Record<string, { profileType: string; linkedId: number | null }> = {
      super_agent: { profileType: 'hub', linkedId: profile.superAgentId },
      transport_provider: { profileType: 'transport_provider', linkedId: profile.transportProviderId },
      agent: { profileType: 'agent', linkedId: profile.agentId },
    };
    const expected = expectation[targetType];
    if (profile.type !== expected.profileType || expected.linkedId == null) {
      throw new NotFoundException('Target profile is not that operational identity');
    }
    const operationalProfileId = expected.linkedId;

    const roleProfileType =
      targetType === 'super_agent'
        ? RoleProfileType.SUPER_AGENT
        : targetType === 'transport_provider'
          ? RoleProfileType.TRANSPORT_PROVIDER
          : RoleProfileType.AGENT;
    const role = await this.accountRoleRepo.findOne({
      where: { profileType: roleProfileType, profileId: operationalProfileId, status: AccountRoleStatus.ACTIVE },
    });
    if (!role) throw new NotFoundException('Operational identity not found or not active');
    return { userId: role.userId, accountRoleId: role.id, operationalProfileId };
  }

  /** Mirrors a legacy unreadCount/buyerUnreadCount reset onto ConversationParticipantState. */
  private async dualWriteMarkRead(
    conversationId: number,
    userId: number,
    roleType: AccountRoleType,
    workspaceHint?: WorkspaceHint,
  ): Promise<void> {
    const role = await this.resolveAccountRoleFor(userId, roleType, workspaceHint);
    if (!role) return;
    const participant = await this.participants.ensureAccountRoleParticipant(
      conversationId,
      role.id,
      this.participantKindForRoleType(roleType),
    );
    await this.participants.markRead(participant.id);
  }

  /**
   * Ensures the sending side's participant/message attribution AND bumps
   * the recipient side's ConversationParticipantState.unreadCount (mirroring
   * the legacy Conversation.unreadCount/buyerUnreadCount bump). Idempotent
   * ensure calls here also mean a legacy (pre-Stage-2) conversation
   * organically gains real participants the first time new activity
   * touches it, without any separate backfill step -- complementary to,
   * not a replacement for, the deliberate historical classifier.
   */
  private async dualWriteMessageAttribution(
    convo: Conversation,
    msg: ConversationMessage,
    side: 'seller' | 'buyer',
    isNote: boolean,
  ): Promise<{ senderRole: AccountRole | null; recipientRole: AccountRole | null }> {
    // "seller" here means "the owning side" -- ownerRoleTypeFor resolves
    // that to the conversation's ACTUAL operational owner (Seller by
    // default/legacy, or Super Agent/Transport/Agent for an operational
    // target conversation), never hardcoded to AccountRoleType.SELLER.
    // This is what makes reply identity correct: Kened replying in a
    // Super-Agent-owned thread is attributed/authorized as his Super Agent
    // AccountRole, never silently as his Seller AccountRole, even though
    // both belong to the same User.
    const ownerRoleType = this.ownerRoleTypeFor(convo);
    const ownerParticipantKind = this.participantKindForRoleType(ownerRoleType);
    // The conversation's own already-stamped owner-workspace columns are the
    // most authoritative hint available here -- they were resolved and
    // written once, server-side, when the conversation was created (see
    // getOrCreateConversation/getOrCreateOperationalConversationAsBuyer),
    // and never change afterward. Using them (rather than re-deriving via a
    // bare userId+roleType lookup) means attribution stays correct even if
    // the owning side later gains a second same-roleType AccountRole for a
    // DIFFERENT workspace/business.
    const ownerWorkspaceHint: WorkspaceHint = convo.ownerWorkspaceType
      ? { workspaceType: convo.ownerWorkspaceType, workspaceId: convo.ownerWorkspaceId! }
      : null;

    const senderRole =
      side === 'seller'
        ? await this.resolveAccountRoleFor(convo.sellerId, ownerRoleType, ownerWorkspaceHint)
        : convo.customer?.userId
          ? await this.resolveAccountRoleFor(convo.customer.userId, AccountRoleType.BUYER)
          : null;

    if (senderRole) {
      const senderParticipant = await this.participants.ensureAccountRoleParticipant(
        convo.id,
        senderRole.id,
        side === 'seller' ? ownerParticipantKind : ParticipantKind.BUYER,
      );
      const workspace = this.workspaceOf(senderRole);
      await this.msgRepo.update(msg.id, {
        senderParticipantId: senderParticipant.id,
        senderAccountRoleId: senderRole.id,
        senderWorkspaceType: workspace?.workspaceType ?? null,
        senderWorkspaceId: workspace?.workspaceId ?? null,
      });
    }

    if (isNote) return { senderRole, recipientRole: null }; // internal notes never reach the other side, so never bump its unread

    const recipientRole =
      side === 'seller'
        ? convo.customer?.userId
          ? await this.resolveAccountRoleFor(convo.customer.userId, AccountRoleType.BUYER)
          : null
        : await this.resolveAccountRoleFor(convo.sellerId, ownerRoleType, ownerWorkspaceHint);
    if (recipientRole) {
      const recipientParticipant = await this.participants.ensureAccountRoleParticipant(
        convo.id,
        recipientRole.id,
        side === 'seller' ? ParticipantKind.BUYER : ownerParticipantKind,
      );
      await this.participants.incrementUnread(recipientParticipant.id);
    }
    return { senderRole, recipientRole };
  }

  // Never trust a client-supplied contextId blindly — same posture as
  // verifiedProfileId in getOrCreateConversation below: the listing must
  // actually belong to this seller, or the context is silently dropped
  // (the conversation still opens, just without a tag) rather than
  // rejecting the whole "message seller" action over it.
  private async resolveContext(
    sellerId: number,
    context?: ConversationContext | null,
  ): Promise<{ type: string; id: number; title: string; image: string | null; price: number } | null> {
    if (!context?.type || !context?.id) return null;
    if (context.type === 'product') {
      const p = await this.productRepo.findOne({
        where: { id: context.id, seller: { id: sellerId } },
      });
      if (!p) return null;
      return { type: 'product', id: p.id, title: p.name, image: p.images?.[0] || null, price: Number(p.displayPrice || p.basePrice || 0) };
    }
    if (context.type === 'classified') {
      const c = await this.classifiedRepo.findOne({
        where: { id: context.id, seller: { id: sellerId } },
      });
      if (!c) return null;
      return { type: 'classified', id: c.id, title: c.title, image: c.images?.[0] || null, price: Number(c.price || 0) };
    }
    if (context.type === 'service') {
      const s = await this.serviceAdRepo.findOne({
        where: { id: context.id, providerId: sellerId },
      });
      if (!s) return null;
      return { type: 'service', id: s.id, title: s.title, image: s.images?.[0] || null, price: Number(s.price || 0) };
    }
    return null;
  }

  // Batched — resolves whatever distinct commerceProfileIds appear among a
  // page of conversations in parallel, not one lookup per row. Attaches
  // {displayName, photoUrl} so the inbox can show the actual identity a
  // conversation concerns instead of always the seller's raw account name.
  // Conversations that predate this column (commerceProfileId null) simply
  // get commerceProfile: null — the caller falls back to raw fields.
  private async attachCommerceProfiles<T extends { commerceProfileId: number | null }>(
    conversations: T[],
  ): Promise<(T & { commerceProfile: { id: number; displayName: string; photoUrl: string | null } | null })[]> {
    const ids = [
      ...new Set(
        conversations.map((c) => c.commerceProfileId).filter((id): id is number => !!id),
      ),
    ];
    const profiles = await Promise.all(
      ids.map((id) => this.commerceProfiles.findById(id).catch(() => null)),
    );
    const profileMap = new Map(
      profiles.filter(Boolean).map((p) => [p!.id, p!]),
    );
    return conversations.map((c) => ({
      ...c,
      commerceProfile: c.commerceProfileId
        ? (() => {
            const p = profileMap.get(c.commerceProfileId!);
            return p ? { id: p.id, displayName: p.displayName, photoUrl: p.photoUrl } : null;
          })()
        : null,
    }));
  }

  // ── Get all conversations for seller ─────────────────────────────────────

  async getSellerInbox(
    sellerId: number,
    params: {
      status?: string;
      search?: string;
      page?: number;
      limit?: number;
      assignedToId?: number;
    },
  ) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const query = this.convoRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.customer', 'customer')
      .leftJoinAndSelect('c.assignedTo', 'assignedTo')
      .where('c.seller_id = :sellerId', { sellerId });

    if (params.status) {
      query.andWhere('c.status = :status', { status: params.status });
    }
    if (params.search) {
      query.andWhere('LOWER(customer.name) LIKE :q OR customer.phone LIKE :q', {
        q: `%${params.search.toLowerCase()}%`,
      });
    }
    // "Assigned to me" — a team member's own working view of the shared
    // business inbox, not a separate inbox: same conversations, filtered.
    if (params.assignedToId) {
      // assignedToId's @Column has an explicit `name: 'assigned_to_id'`
      // override (unlike sellerPinned/buyerPinned above, which keep their
      // camelCase property name as the literal DB column) — raw
      // querybuilder conditions address the actual column, not the TS
      // property name, so this must use the snake_case form.
      query.andWhere('c.assigned_to_id = :assignedToId', {
        assignedToId: params.assignedToId,
      });
    }

    const [conversations, total] = await query
      .orderBy('c.sellerPinned', 'DESC')
      .addOrderBy('c.lastMessageAt', 'DESC', 'NULLS LAST')
      .addOrderBy('c.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    // Unread count
    const unread = await this.convoRepo
      .createQueryBuilder('c')
      .where('c.seller_id = :sellerId', { sellerId })
      .andWhere('c.unreadCount > 0')
      .getCount();

    return {
      conversations: await this.attachCommerceProfiles(conversations),
      total,
      page,
      unread,
    };
  }

  // ── Get all conversations for a buyer (as the customer, across sellers) ──

  async getMyConversations(
    userId: number,
    params: {
      search?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const query = this.convoRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.customer', 'customer')
      .leftJoinAndSelect('c.seller', 'seller')
      .where('customer.user_id = :userId', { userId });

    if (params.search) {
      query.andWhere(
        '(LOWER(seller.storeName) LIKE :q OR LOWER(seller.name) LIKE :q)',
        { q: `%${params.search.toLowerCase()}%` },
      );
    }

    const [conversations, total] = await query
      .orderBy('c.buyerPinned', 'DESC')
      .addOrderBy('c.lastMessageAt', 'DESC', 'NULLS LAST')
      .addOrderBy('c.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const unread = await this.convoRepo
      .createQueryBuilder('c')
      .leftJoin('c.customer', 'customer')
      .where('customer.user_id = :userId', { userId })
      .andWhere('c.buyerUnreadCount > 0')
      .getCount();

    return {
      conversations: await this.attachCommerceProfiles(conversations),
      total,
      page,
      unread,
    };
  }

  // ── Combined unread-conversation count (seller side + buyer side) ────────
  // The one number that should feed EVERY unread-inbox badge in the app
  // (bottom nav, header icon) — a user can be both a seller receiving
  // messages and a buyer messaging other sellers, and previously nothing
  // combined those two counts, let alone did it from conversation data at
  // all (existing badges read the unrelated generic Notification-unread
  // count instead, which drifts — see markReadByAction's own comment).
  // sellerActorId and buyerUserId are deliberately separate params — a team
  // member's "seller side" unread count belongs to the business they act
  // for (resolveSellerActorId's delegation), but their "buyer side" unread
  // count (messages they sent to OTHER sellers) is always their own raw
  // account, never the business they're delegated on.
  async getUnreadConversationCount(
    sellerActorId: number,
    buyerUserId: number,
  ): Promise<number> {
    // Muted threads keep their own per-conversation unread indicator (still
    // visible once inside the Inbox) but deliberately don't add to this
    // combined count — the one that drives the app-wide badge — matching
    // the whole point of muting a conversation.
    const [asSeller, asBuyer] = await Promise.all([
      this.convoRepo
        .createQueryBuilder('c')
        .where('c.seller_id = :sellerActorId', { sellerActorId })
        .andWhere('c.unreadCount > 0')
        .andWhere('c.sellerMuted = false')
        .getCount(),
      this.convoRepo
        .createQueryBuilder('c')
        .leftJoin('c.customer', 'customer')
        .where('customer.user_id = :buyerUserId', { buyerUserId })
        .andWhere('c.buyerUnreadCount > 0')
        .andWhere('c.buyerMuted = false')
        .getCount(),
    ]);
    return asSeller + asBuyer;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Stage 2B — SCOPED READS (gated by SCOPED_CONVERSATION_READ /
  // SCOPED_UNREAD_READ, default OFF). Authorization happens server-side, in
  // the query itself, never by fetching a wider dataset and filtering after
  // the fact. A conversation is included only when either (a) a real,
  // active ConversationParticipant row exists for the resolved AccountRole,
  // or (b) — the ONLY sanctioned fallback, see item 2 — the conversation is
  // still classificationStatus=LEGACY_UNSCOPED (the classifier hasn't
  // evaluated it yet) AND the raw legacy ownership column deterministically
  // matches. AMBIGUOUS/EXTERNAL_CONTACT-without-a-participant rows satisfy
  // neither condition and are correctly excluded -- "quarantined" is a
  // property of this WHERE clause, not a separate filter step.
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Seller-side scoped inbox. `sellerId` is the ALREADY-AUTHORIZED business
   * id (from SellerScopeService.resolve() via the controller -- covers the
   * seller-acting-as-themselves, admin-override, and team-member-delegation
   * cases, none of which this method re-derives). This method's own
   * contribution is HOW conversations for that business are found: via the
   * seller's AccountRole + ConversationParticipant graph, not a raw
   * seller_id column scan. If the business has no active SELLER AccountRole
   * at all yet (should not normally happen post Stage-1 sync, but a team
   * member could be delegated for an account mid-migration), falls back to
   * the legacy getSellerInbox() wholesale -- safe, since sellerId itself was
   * already properly authorized upstream; nothing here re-derives identity
   * from a client-supplied id.
   */
  async getScopedSellerInbox(
    sellerId: number,
    params: { status?: string; search?: string; page?: number; limit?: number; assignedToId?: number },
    workspaceHint?: WorkspaceHint,
  ): Promise<ScopedInboxResult> {
    // Multi-Business Authority Stage 1B: "no role resolved" (never had one,
    // or a hint was supplied and matched nothing) safely falls back to the
    // legacy unscoped query, exactly as before -- that fallback itself is
    // still correctly business-blind ONLY because, in that case, at most
    // one Seller AccountRole exists for this user at all. Genuine
    // AMBIGUITY (2+ rows, no hint) is different: falling back to the
    // wide-open unscoped query would show multiple businesses'
    // conversations mixed together. Fail closed instead -- an empty,
    // valid result, never a guess.
    let sellerRole: AccountRole | null;
    try {
      sellerRole = await this.resolveAccountRoleFor(sellerId, AccountRoleType.SELLER, workspaceHint);
    } catch (e) {
      if (e instanceof AmbiguousAccountRoleError) {
        return { conversations: [], total: 0, page: params.page || 1, unread: 0 };
      }
      throw e;
    }
    if (!sellerRole) {
      return this.getSellerInbox(sellerId, params);
    }
    return this.getScopedInboxByAccountRole(sellerRole, ParticipantKind.SELLER, sellerId, params);
  }

  /**
   * Buyer-side scoped conversations. userId/roleContext come straight from
   * the caller's own resolved RoleContext (Stage 1) -- no team-delegation
   * concept exists for buyers, so this is simpler than the seller path.
   */
  async getScopedBuyerConversations(
    userId: number,
    roleContext: RoleContext,
    params: { search?: string; page?: number; limit?: number },
  ): Promise<ScopedInboxResult> {
    if (roleContext.roleType !== AccountRoleType.BUYER) {
      // Defense in depth -- the controller's RequireActiveRole(BUYER) gate
      // is the real boundary; this never trusts being called correctly.
      return { conversations: [], total: 0, page: params.page || 1, unread: 0 };
    }
    // Buyer stays in AccountRole's SINGULAR bucket (UQ_account_role_singular
    // -- Migration 8), so ambiguity here should be structurally impossible.
    // Caught defensively anyway (fail closed, not a 500) rather than
    // trusting that invariant to hold forever.
    let buyerRole: AccountRole | null;
    try {
      buyerRole = await this.resolveAccountRoleFor(userId, AccountRoleType.BUYER);
    } catch (e) {
      if (e instanceof AmbiguousAccountRoleError) {
        return { conversations: [], total: 0, page: params.page || 1, unread: 0 };
      }
      throw e;
    }
    if (!buyerRole) {
      return this.getMyConversations(userId, params);
    }
    return this.getScopedInboxByAccountRole(buyerRole, ParticipantKind.BUYER, userId, params);
  }

  /**
   * Scoped read entry point for ANY active role, including ones with no
   * conversation product surface at all (agent/super_agent/transport_
   * provider/service_provider/admin/manager/customer_care/arbitrator) --
   * those deterministically return an empty, valid dataset rather than ever
   * reaching a seller/buyer query. Kept separate from
   * getScopedSellerInbox/getScopedBuyerConversations (which the existing,
   * already-authorized /business/inbox and /business/my-conversations
   * routes call directly) so a future unified "my communications" surface
   * has one obvious place to route through for whatever role is active.
   */
  // Communication canonicality fix: Super Agent/Transport Provider/Agent
  // conversations now genuinely exist (getOrCreateOperationalConversationAsBuyer),
  // each with a real ConversationParticipant of the matching kind -- the
  // "no participant of any of these kinds is ever created" premise this
  // switch used to rely on for its empty-state branch no longer holds.
  private static readonly OPERATIONAL_ROLE_KIND: Partial<Record<AccountRoleType, typeof ParticipantKind.SUPER_AGENT | typeof ParticipantKind.TRANSPORT_PROVIDER | typeof ParticipantKind.AGENT>> = {
    [AccountRoleType.SUPER_AGENT]: ParticipantKind.SUPER_AGENT,
    [AccountRoleType.TRANSPORT_PROVIDER]: ParticipantKind.TRANSPORT_PROVIDER,
    [AccountRoleType.AGENT]: ParticipantKind.AGENT,
  };

  async getScopedConversationsForActiveRole(
    roleContext: RoleContext,
    params: { status?: string; search?: string; page?: number; limit?: number },
  ): Promise<ScopedInboxResult> {
    if (roleContext.roleType === AccountRoleType.SELLER) {
      return this.getScopedSellerInbox(roleContext.userId, params);
    }
    if (roleContext.roleType === AccountRoleType.BUYER) {
      return this.getScopedBuyerConversations(roleContext.userId, roleContext, params);
    }
    const operationalKind = ConversationService.OPERATIONAL_ROLE_KIND[roleContext.roleType];
    if (operationalKind && roleContext.accountRoleId) {
      const role = await this.accountRoleRepo.findOne({ where: { id: roleContext.accountRoleId } });
      if (!role) return { conversations: [], total: 0, page: params.page || 1, unread: 0 };
      return this.getScopedInboxByAccountRole(role, operationalKind, roleContext.userId, params);
    }
    // Service Provider/staff roles: no ConversationParticipant of any of
    // their kinds is ever created (nothing in this codebase attaches a
    // conversation to those roles), so this is a real, permanent, valid
    // empty state -- not a placeholder for a future query never written.
    return { conversations: [], total: 0, page: params.page || 1, unread: 0 };
  }

  private async getScopedInboxByAccountRole(
    role: AccountRole,
    kind: typeof ParticipantKind.SELLER | typeof ParticipantKind.BUYER | typeof ParticipantKind.SUPER_AGENT | typeof ParticipantKind.TRANSPORT_PROVIDER | typeof ParticipantKind.AGENT,
    legacyOwnerId: number,
    params: { status?: string; search?: string; page?: number; limit?: number; assignedToId?: number },
  ): Promise<ScopedInboxResult> {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;
    const isSeller = kind === ParticipantKind.SELLER;
    const isBuyer = kind === ParticipantKind.BUYER;
    // Super Agent/Transport Provider/Agent sit on the "owning side" of a
    // conversation the same way Seller does (the other side is always the
    // buyer/customer), but unlike Seller they have no pre-Stage-2 history
    // -- no LEGACY_UNSCOPED row could ever have correctly represented one
    // of these roles, since the concept didn't exist yet. The legacy
    // fallback below is therefore intentionally restricted to Seller/Buyer
    // only, never these, regardless of the flag: participant-only match.
    const owningSide = isSeller || !isBuyer; // seller or any operational kind
    const legacyFallback = (isSeller || isBuyer) && this.flags.isEnabled('LEGACY_COMMUNICATION_READ_FALLBACK');

    const qb = this.convoRepo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.customer', 'customer')
      .leftJoinAndSelect('c.seller', 'seller')
      .leftJoinAndSelect('c.assignedTo', 'assignedTo')
      .leftJoin(
        ConversationParticipant,
        'cp',
        'cp.conversation_id = c.id AND cp.account_role_id = :accountRoleId AND cp.status = :active AND cp."principalType" = :principalType',
        { accountRoleId: role.id, active: ParticipantStatus.ACTIVE, principalType: ParticipantPrincipalType.ACCOUNT_ROLE },
      );

    // The one sanctioned fallback (item 2): ONLY for rows the classifier
    // has never evaluated (LEGACY_UNSCOPED) AND whose raw legacy ownership
    // column deterministically matches. A RESOLVED row always has a real
    // participant already (dual-write/classifier both guarantee this), so
    // it's covered by the cp.id IS NOT NULL branch, never by this one. An
    // AMBIGUOUS row satisfies neither branch -- excluded, not "shown unless
    // proven unsafe".
    if (legacyFallback) {
      qb.where(
        isSeller
          ? `cp.id IS NOT NULL OR (c."classificationStatus" = :legacyStatus AND c.seller_id = :legacyOwnerId)`
          : `cp.id IS NOT NULL OR (c."classificationStatus" = :legacyStatus AND customer.user_id = :legacyOwnerId)`,
        { legacyStatus: ConversationClassificationStatus.LEGACY_UNSCOPED, legacyOwnerId },
      );
    } else {
      qb.where('cp.id IS NOT NULL');
    }

    if (params.status) qb.andWhere('c.status = :status', { status: params.status });
    if (owningSide && params.search) {
      qb.andWhere('(LOWER(customer.name) LIKE :q OR customer.phone LIKE :q)', { q: `%${params.search.toLowerCase()}%` });
    } else if (isBuyer && params.search) {
      qb.andWhere('(LOWER(seller.storeName) LIKE :q OR LOWER(seller.name) LIKE :q)', { q: `%${params.search.toLowerCase()}%` });
    }
    if (isSeller && params.assignedToId) {
      qb.andWhere('c.assigned_to_id = :assignedToId', { assignedToId: params.assignedToId });
    }

    const pinCol = owningSide ? 'c.sellerPinned' : 'c.buyerPinned';
    const [conversations, total] = await qb
      .orderBy(pinCol, 'DESC')
      .addOrderBy('c.lastMessageAt', 'DESC', 'NULLS LAST')
      .addOrderBy('c.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    // Operational (non-Seller, non-Buyer) kinds have no legacy unread
    // concept to fall back to -- always the scoped, per-participant count.
    const unread = (!isSeller && !isBuyer) || this.flags.isEnabled('SCOPED_UNREAD_READ')
      ? await this.getScopedUnreadCountForAccountRole(role.id)
      : isSeller
        ? await this.legacySellerUnread(legacyOwnerId)
        : await this.legacyBuyerUnread(legacyOwnerId);

    return { conversations: await this.attachCommerceProfiles(conversations), total, page, unread };
  }

  private async legacySellerUnread(sellerId: number): Promise<number> {
    return this.convoRepo
      .createQueryBuilder('c')
      .where('c.seller_id = :sellerId', { sellerId })
      .andWhere('c.unreadCount > 0')
      .getCount();
  }

  private async legacyBuyerUnread(userId: number): Promise<number> {
    return this.convoRepo
      .createQueryBuilder('c')
      .leftJoin('c.customer', 'customer')
      .where('customer.user_id = :userId', { userId })
      .andWhere('c.buyerUnreadCount > 0')
      .getCount();
  }

  /** Efficient standalone count for a seller (already-authorized business id), without fetching a page of conversations. */
  async getScopedUnreadCountForSeller(sellerId: number, workspaceHint?: WorkspaceHint): Promise<number> {
    let role: AccountRole | null;
    try {
      role = await this.resolveAccountRoleFor(sellerId, AccountRoleType.SELLER, workspaceHint);
    } catch (e) {
      if (e instanceof AmbiguousAccountRoleError) return 0; // fail closed, not the wide-open legacy count
      throw e;
    }
    if (!role) return this.legacySellerUnread(sellerId);
    return this.getScopedUnreadCountForAccountRole(role.id);
  }

  /**
   * ConversationParticipantState as the sole authority (item 3): sums
   * unreadCount across every ACTIVE participant row for this exact
   * accountRoleId. A Seller's read-all/mark-read can only ever touch ITS
   * OWN participant rows (see markConversationReadScoped below) -- there is
   * no code path here that can read or mutate a different accountRoleId's
   * state.
   */
  async getScopedUnreadCountForAccountRole(accountRoleId: number): Promise<number> {
    const rows = await this.participantRepo.find({
      where: { accountRoleId, principalType: ParticipantPrincipalType.ACCOUNT_ROLE, status: ParticipantStatus.ACTIVE },
    });
    if (!rows.length) return 0;
    const states = await this.participantStateRepo.find({
      where: rows.map((r) => ({ conversationParticipantId: r.id })),
    });
    // Muted conversations keep their own indicator but don't count toward
    // the combined badge, matching legacy getUnreadConversationCount's
    // exact behavior. pinned/muted live on the participant STATE now, not
    // the legacy Conversation row, for a scoped-read caller.
    const participantById = new Map(rows.map((r) => [r.id, r]));
    let total = 0;
    for (const state of states) {
      const participant = participantById.get(state.conversationParticipantId);
      if (!participant) continue;
      if (state.muted) continue;
      total += state.unreadCount || 0;
    }
    return total;
  }

  /**
   * Scoped mark-read (item 3): resolves the CALLER's own participant for
   * this conversation via their own accountRoleId and marks only that row.
   * A Seller marking a thread read can never touch the Buyer's (or any
   * other role's) ConversationParticipantState row for the same
   * conversation -- there are two separate participant rows, and this only
   * ever looks up the one matching `accountRoleId`.
   */
  async markConversationReadScoped(conversationId: number, accountRoleId: number, lastReadMessageId?: number): Promise<void> {
    const participant = await this.participantRepo.findOne({
      where: {
        conversationId,
        accountRoleId,
        principalType: ParticipantPrincipalType.ACCOUNT_ROLE,
        status: ParticipantStatus.ACTIVE,
      },
    });
    if (!participant) return; // no participant yet for this role on this thread -- nothing to mark
    await this.participants.markRead(participant.id, lastReadMessageId);
  }

  // Note: there is deliberately no separate "scoped pin/mute" entry point.
  // togglePin/toggleMute/togglePinAsBuyer/toggleMuteAsBuyer (below) already
  // do the real ownership check (a raw conversationId+sellerId/customer.
  // userId lookup) AND dual-write the result onto ConversationParticipantState
  // via dualWriteParticipantFlag -- legacy stays authoritative for the
  // returned value, participant state is kept in lockstep. An earlier draft
  // of this method added a second, independently-toggleable participant-
  // state path with NO ownership check of its own (only a bare
  // conversationId+accountRoleId lookup, which a caller could reach for
  // ANY conversation once a participant row exists) -- removed as a real
  // authorization gap, not shipped.

  // ── Get or create conversation ────────────────────────────────────────────

  // `ownerWorkspaceOverride`: undefined (the default, every pre-existing
  // caller) means "resolve the seller's own seller_profile workspace and
  // use it for both lookup and creation" -- the legacy behavior, now made
  // internally workspace-aware so it keeps correctly finding/creating the
  // ONE seller_profile-owned thread even though other operational owners
  // can now exist for the same (sellerId, customerId) pair. Pass an
  // explicit override (even `null`, meaning "no operational owner") only
  // from a caller that has already resolved a DIFFERENT trusted owner --
  // see getOrCreateOperationalConversationAsBuyer below, which is the only
  // other caller. Never accept ownerWorkspaceType/Id from a client directly.
  async getOrCreateConversation(
    sellerId: number,
    customerId: number,
    commerceProfileId?: number | null,
    ownerWorkspaceOverride?: { ownerWorkspaceType: string; ownerWorkspaceId: number } | null,
    // Multi-Business Authority Stage 1 (additive). When the caller already
    // has an authoritative disambiguator for "which of the seller's
    // possibly-several Seller AccountRoles this request concerns" (e.g.
    // from SellerScopeService.resolveScope()), pass it here so the legacy
    // (ownerWorkspaceOverride === undefined) branch resolves the EXACT
    // matching role instead of an unordered fallback. Ignored when
    // ownerWorkspaceOverride is explicitly provided (that caller has
    // already resolved its own, different, trusted owner).
    callerWorkspaceHint?: WorkspaceHint,
  ): Promise<Conversation> {
    // Never trust a client-supplied commerceProfileId blindly — must
    // actually belong to this seller, same authorization posture as
    // FeedService.publish()/ClassifiedsService.create(). An id that
    // doesn't check out is silently dropped rather than rejecting the
    // whole message — the conversation still opens, just without a
    // specific identity attached (same as messaging with no context).
    // Verified up front (not just at creation time) because the lookup
    // below must key on the same verified value, or a caller could smuggle
    // an unverified id into matching/creating a thread it shouldn't.
    let verifiedProfileId: number | null = null;
    if (commerceProfileId) {
      const profile = await this.commerceProfiles
        .findById(commerceProfileId)
        .catch(() => null);
      if (profile && profile.ownerId === sellerId) {
        verifiedProfileId = commerceProfileId;
      }
    }

    const isLegacyCall = ownerWorkspaceOverride === undefined;
    // Multi-Business Authority Stage 1B: a buyer-initiated "message seller"
    // call (getOrCreateConversationAsBuyer) has no seller-side hint to
    // offer at all -- if the target seller genuinely had 2+ Seller
    // AccountRoles (unreachable today; every creation guard still blocks
    // it), resolveAccountRoleFor would throw AmbiguousAccountRoleError.
    // That must never surface as a 500 that blocks a buyer from messaging
    // a seller at all -- caught here and treated as "no workspace resolved
    // yet", the same legitimate null state every pre-Stage-1 conversation
    // already has, never a security grant either way.
    let legacySellerWorkspace: { workspaceType: string; workspaceId: number } | null = null;
    if (isLegacyCall) {
      try {
        legacySellerWorkspace = this.workspaceOf(await this.resolveAccountRoleFor(sellerId, AccountRoleType.SELLER, callerWorkspaceHint));
      } catch (e) {
        if (!(e instanceof AmbiguousAccountRoleError)) throw e;
      }
    }
    const ownerWorkspace = isLegacyCall
      ? (legacySellerWorkspace
          ? { ownerWorkspaceType: legacySellerWorkspace.workspaceType, ownerWorkspaceId: legacySellerWorkspace.workspaceId }
          : null)
      : ownerWorkspaceOverride;

    // Communication canonicality fix: lookup, insert, and the 23505-
    // recovery re-fetch below all key on the SAME (sellerId, customerId,
    // commerceProfileId, ownerWorkspaceType, ownerWorkspaceId) tuple that
    // migration AddConversationOperationalOwnerUniqueness's four partial
    // indexes now enforce -- a Seller conversation and a Super Agent
    // conversation for the very same (sellerId, customerId) pair are
    // different rows because ownerWorkspaceType/Id differ, never collapsed
    // just because both belong to the same underlying User.
    //
    // Was missing commerceProfileId here — the entity's own comment already
    // documents the intent ("must land in two conversations that each show
    // the correct identity"), but this lookup ignored it, so a buyer
    // messaging the seller's personal profile and, separately, their
    // business profile got silently merged into whichever conversation was
    // already OPEN: messages meant for one identity showed up under the
    // other's inbox.
    let convo = await this.convoRepo.findOne({
      where: {
        sellerId,
        customerId,
        status: ConversationStatus.OPEN,
        commerceProfileId: verifiedProfileId === null ? IsNull() : verifiedProfileId,
        ownerWorkspaceType: ownerWorkspace ? ownerWorkspace.ownerWorkspaceType : IsNull(),
        ...(ownerWorkspace ? { ownerWorkspaceId: ownerWorkspace.ownerWorkspaceId } : {}),
      },
      // "seller" is needed so the buyer-side chat header can show the real
      // business name instead of a generic placeholder on first load.
      relations: { customer: true, seller: true },
    });

    if (!convo) {
      const customer = await this.customerRepo.findOne({
        where: { id: customerId, sellerId },
        relations: { seller: true },
      });
      if (!customer) throw new NotFoundException('Customer not found');

      convo = this.convoRepo.create({
        sellerId,
        customerId,
        status: ConversationStatus.OPEN,
        channel: customer.channel || 'kentexa',
        subject: `Mazungumzo na ${customer.name}`,
        commerceProfileId: verifiedProfileId,
        ownerWorkspaceType: ownerWorkspace?.ownerWorkspaceType ?? null,
        ownerWorkspaceId: ownerWorkspace?.ownerWorkspaceId ?? null,
      });
      // Explicit creation provenance -- never inferred from status,
      // timestamps, id, or classificationReason. `createdNow` is true only
      // when THIS call's own insert actually succeeded; it stays false on
      // the 23505 recovery path below, even though `convo` still ends up
      // holding a real row by the end of this block. This distinction
      // matters because the "not found by the OPEN-only lookup above" case
      // is not the same as "genuinely new": a real historical conversation
      // sitting in a non-OPEN status (e.g. `pending`) is invisible to that
      // lookup, so a fresh insert attempt against it lands on this exact
      // 23505 path and recovers that pre-existing row as the "winner" --
      // which must never be treated as if it had just been created.
      let createdNow = false;
      try {
        convo = await this.convoRepo.save(convo);
        convo.customer = customer;
        convo.seller = customer.seller;
        createdNow = true;
      } catch (err: any) {
        // 23505 = unique_violation on the partial indexes above -- either a
        // concurrent request (double-tap, retry-on-timeout) won the race
        // and already created the matching conversation, OR (see comment
        // above) a real pre-existing conversation in a non-OPEN status was
        // invisible to the initial lookup. Either way, not an error from
        // the caller's point of view: re-fetch and hand back that row
        // instead of throwing, exactly like a normal find-or-create result
        // -- but `createdNow` stays false, since this call did not create it.
        if (err?.code !== '23505') throw err;
        const winner = await this.convoRepo.findOne({
          where: {
            sellerId,
            customerId,
            commerceProfileId: verifiedProfileId === null ? IsNull() : verifiedProfileId,
            ownerWorkspaceType: ownerWorkspace ? ownerWorkspace.ownerWorkspaceType : IsNull(),
            ...(ownerWorkspace ? { ownerWorkspaceId: ownerWorkspace.ownerWorkspaceId } : {}),
          },
          relations: { customer: true, seller: true },
        });
        if (!winner) throw err;
        convo = winner;
      }

      // Dual-write, new conversations only (checkpoint B) -- a pre-existing
      // legacy conversation found above is NOT retroactively touched here;
      // that's the separate, deliberately-manual classifier/backfill path.
      // Gated on createdNow, not merely on reaching this branch: recovering
      // an existing conversation via the 23505 path above must never run
      // new-conversation initialization against it, regardless of that
      // conversation's own classificationStatus. Best-effort: a Stage 2
      // resolver hiccup must never break opening a conversation, which the
      // legacy write above already completed.
      //
      // Also gated on isLegacyCall: dualWriteNewConversation unconditionally
      // resolves+stamps the SELLER role's workspace -- correct for every
      // pre-existing (legacy) call site, but it would silently overwrite a
      // deliberately different ownerWorkspace (e.g. super_agent) that
      // getOrCreateOperationalConversationAsBuyer already stamped above.
      // That caller sets up its own participants/classification instead.
      if (createdNow && isLegacyCall && this.flags.isEnabled('SCOPED_CONVERSATION_DUAL_WRITE')) {
        await this.dualWriteNewConversation(convo).catch(() => {});
      }
    }

    return convo;
  }

  private async dualWriteNewConversation(convo: Conversation): Promise<void> {
    // isLegacyCall's own resolution (getOrCreateConversation, above) already
    // stamped convo.ownerWorkspaceType/Id onto this row before this method
    // runs -- reuse that exact value as the hint rather than re-deriving it
    // a second time via an independent (and, under multiplicity, possibly
    // different) unordered lookup.
    const hint: WorkspaceHint = convo.ownerWorkspaceType
      ? { workspaceType: convo.ownerWorkspaceType, workspaceId: convo.ownerWorkspaceId! }
      : null;
    const sellerRole = await this.resolveAccountRoleFor(convo.sellerId, AccountRoleType.SELLER, hint);
    const sellerWorkspace = this.workspaceOf(sellerRole);
    await this.convoRepo.update(convo.id, {
      scopeType: 'seller_buyer',
      sourceType: 'message_seller',
      ownerWorkspaceType: sellerWorkspace?.workspaceType ?? null,
      ownerWorkspaceId: sellerWorkspace?.workspaceId ?? null,
      classificationStatus: ConversationClassificationStatus.RESOLVED,
      classificationReason: 'created_by_conversation_service',
      classifiedAt: new Date(),
    });
    if (sellerRole) {
      await this.participants.ensureAccountRoleParticipant(convo.id, sellerRole.id, ParticipantKind.SELLER);
    }

    if (convo.customerId) {
      const customer = convo.customer ?? (await this.customerRepo.findOne({ where: { id: convo.customerId } }));
      if (customer?.userId) {
        const buyerRole = await this.resolveAccountRoleFor(customer.userId, AccountRoleType.BUYER);
        if (buyerRole) {
          await this.participants.ensureAccountRoleParticipant(convo.id, buyerRole.id, ParticipantKind.BUYER);
        }
      } else if (customer) {
        // No linked User account -- a WhatsApp/manual contact.
        await this.participants.ensureExternalContactParticipant(convo.id, customer.id);
      }
    }
  }

  // ── Get or create conversation, targeting a SPECIFIC operational
  // identity of the seller-side person (Super Agent / Transport Provider /
  // Agent) rather than their Seller identity ──────────────────────────────
  // Communication canonicality fix. `targetType`/`targetId` are resolved
  // server-side via resolveOperationalTarget (AccountRole's own
  // (profileType, profileId) unique constraint) -- a client can never
  // assert ownerWorkspaceType/Id directly, only reference an id, which
  // either resolves to a real active operational identity or fails closed.
  async getOrCreateOperationalConversationAsBuyer(
    buyer: User,
    targetType: 'super_agent' | 'transport_provider' | 'agent',
    targetId: number,
    context?: ConversationContext | null,
  ): Promise<Conversation> {
    const target = await this.resolveOperationalTarget(targetType, targetId);
    if (target.userId === buyer.id) {
      throw new BadRequestException('Cannot message yourself');
    }

    const customer = await this.customerService.findOrCreateForChat(target.userId, {
      id: buyer.id,
      name: buyer.name || buyer.storeName || 'Mnunuzi',
      phone: buyer.phone,
      email: buyer.email,
    });

    const convo = await this.getOrCreateConversation(target.userId, customer.id, null, {
      ownerWorkspaceType: targetType,
      ownerWorkspaceId: target.operationalProfileId,
    });

    // Mirrors dualWriteNewConversation's own classification/participant
    // stamping, which getOrCreateConversation deliberately skipped for this
    // (non-legacy) call -- idempotent, safe to run even when `convo` was
    // found rather than just created (ensureAccountRoleParticipant is a
    // reactivating upsert, update() below is a no-op re-write of the same
    // already-correct values on a reused row).
    await this.convoRepo.update(convo.id, {
      scopeType: `${targetType}_buyer`,
      sourceType: `message_${targetType}`,
      classificationStatus: ConversationClassificationStatus.RESOLVED,
      classificationReason: 'created_by_conversation_service',
      classifiedAt: new Date(),
    });
    const ownerParticipantKind =
      targetType === 'super_agent'
        ? ParticipantKind.SUPER_AGENT
        : targetType === 'transport_provider'
          ? ParticipantKind.TRANSPORT_PROVIDER
          : ParticipantKind.AGENT;
    await this.participants.ensureAccountRoleParticipant(convo.id, target.accountRoleId, ownerParticipantKind);
    const buyerRole = await this.resolveAccountRoleFor(buyer.id, AccountRoleType.BUYER);
    if (buyerRole) {
      await this.participants.ensureAccountRoleParticipant(convo.id, buyerRole.id, ParticipantKind.BUYER);
    }

    return convo;
  }

  // ── Get or create conversation, initiated by a BUYER ──────────────────────
  // No BusinessCustomer row is required up front — auto-created on first
  // contact, same as when an order comes in, just without the order stats.

  async getOrCreateConversationAsBuyer(
    buyer: User,
    sellerId: number,
    commerceProfileId?: number | null,
    context?: ConversationContext | null,
  ): Promise<Conversation> {
    if (sellerId === buyer.id) {
      throw new BadRequestException('Cannot message yourself');
    }

    const customer = await this.customerService.findOrCreateForChat(sellerId, {
      id: buyer.id,
      name: buyer.name || buyer.storeName || 'Mnunuzi',
      phone: buyer.phone,
      email: buyer.email,
    });

    const convo = await this.getOrCreateConversation(sellerId, customer.id, commerceProfileId);

    // Tag the thread with the listing this "Message Seller" tap came from
    // (ProductDetail.js/ClassifiedDetail.js/ServiceDetail.js) — see
    // resolveContext()'s own comment for why this is fetched fresh rather
    // than trusted from the client. Always overwritten to the latest
    // listing messaged about; a resolution failure (deleted/not-owned
    // listing) never blocks opening the conversation itself, only skips
    // the tag.
    const resolved = await this.resolveContext(sellerId, context);
    if (resolved) {
      await this.convoRepo.update(convo.id, {
        linkedContextType: resolved.type as any,
        linkedContextId: resolved.id,
        linkedContextTitle: resolved.title,
        linkedContextImage: resolved.image,
      });
      convo.linkedContextType = resolved.type as any;
      convo.linkedContextId = resolved.id;
      convo.linkedContextTitle = resolved.title;
      convo.linkedContextImage = resolved.image;

      // A real first message, not just a silent tag — reuses the exact
      // product-card rendering SellerInbox.js already has for
      // shareProduct() (MessageType.PRODUCT + productName/Image/Price
      // metadata keys), so classified/service context renders with zero
      // frontend changes to the message bubble itself.
      await this.sendMessageAsBuyer(
        buyer.id,
        convo.id,
        {
          content: `${resolved.type === 'service' ? 'Huduma' : resolved.type === 'classified' ? 'Tangazo' : 'Bidhaa'}: ${resolved.title}${resolved.price ? ` — TZS ${resolved.price.toLocaleString()}` : ''}`,
          type: MessageType.PRODUCT,
          metadata: {
            contextType: resolved.type,
            contextId: resolved.id,
            productName: resolved.title,
            productPrice: resolved.price,
            productImage: resolved.image,
          },
        },
        buyer,
      );
    }

    return convo;
  }

  // ── Get messages in a conversation ───────────────────────────────────────
  // Cursor-paginated on message id (monotonic, no timestamp-collision risk):
  // no `before` = the most recent page (what opening a conversation wants);
  // `before` = the id of the oldest message currently on screen, for
  // "load older" scrolling up. Was a flat `take: 100` with no way to reach
  // anything before it — any conversation past 100 messages had its entire
  // earlier history permanently unreachable through this endpoint.

  private static readonly MESSAGE_PAGE_SIZE = 50;

  private async fetchMessagePage(
    conversationId: number,
    before?: number,
    extraWhere: Record<string, any> = {},
  ): Promise<{ messages: ConversationMessage[]; hasMore: boolean }> {
    const limit = ConversationService.MESSAGE_PAGE_SIZE;
    const rows = await this.msgRepo.find({
      where: before
        ? { conversationId, id: LessThan(before), ...extraWhere }
        : { conversationId, ...extraWhere },
      order: { id: 'DESC' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit).reverse(); // oldest-first for display
    return { messages: page, hasMore };
  }

  async getMessages(
    sellerId: number,
    conversationId: number,
    before?: number,
    workspaceHint?: WorkspaceHint,
  ) {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId, sellerId },
      relations: { customer: true, assignedTo: true },
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    if (convo.ownerWorkspaceType && this.ownerRoleTypeFor(convo) !== AccountRoleType.SELLER) {
      throw new ForbiddenException('This conversation does not belong to your Seller identity');
    }
    // Multi-Business Authority Stage 1: same roleType is not sufficient once
    // a User can hold two Seller AccountRoles for two different businesses.
    // When the caller supplied a specific workspace disambiguator (their own
    // currently-active Seller identity's profile id) AND the conversation
    // itself is workspace-stamped, the two must match -- Seller@BusinessA
    // must never read Seller@BusinessB's conversation just because both are
    // "Seller" and share the same underlying sellerId (User.id). A
    // conversation with no ownerWorkspaceId (pre-Stage-2/legacy) is
    // unaffected, matching today's behavior exactly.
    if (
      workspaceHint &&
      convo.ownerWorkspaceId != null &&
      (convo.ownerWorkspaceType !== workspaceHint.workspaceType || convo.ownerWorkspaceId !== workspaceHint.workspaceId)
    ) {
      throw new ForbiddenException('This conversation does not belong to your active Seller workspace');
    }

    const { messages, hasMore } = await this.fetchMessagePage(
      conversationId,
      before,
    );

    // Mark as read — only on the initial (most-recent) page; paging further
    // back into history isn't a new "read" action and shouldn't re-fire the
    // notification bridge below on every scroll-up.
    if (!before) {
      await this.convoRepo.update(conversationId, { unreadCount: 0 });
      if (convo.customerId) {
        this.notifService
          .markReadByAction(sellerId, 'SellerInbox', String(convo.customerId))
          .catch(() => {});
      }
      if (this.flags.isEnabled('SCOPED_CONVERSATION_DUAL_WRITE')) {
        this.dualWriteMarkRead(conversationId, sellerId, AccountRoleType.SELLER, workspaceHint).catch(() => {});
      }
    }

    const [conversation] = await this.attachCommerceProfiles([convo]);
    return { conversation, messages, hasMore };
  }

  // ── Get messages in a conversation, as an OPERATIONAL role (Super Agent /
  // Transport Provider / Agent) ──────────────────────────────────────────
  async getMessagesAsOperationalRole(
    roleContext: RoleContext,
    conversationId: number,
    before?: number,
  ) {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId, sellerId: roleContext.userId },
      relations: { customer: true, assignedTo: true },
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    if (this.ownerRoleTypeFor(convo) !== roleContext.roleType) {
      throw new ForbiddenException('This conversation does not belong to your current active role');
    }
    // Multi-Business Authority Stage 1: roleContext already carries the
    // caller's SPECIFIC active workspace (profileType/profileId, resolved
    // server-side from their session's own AccountRole -- never trusted
    // from the client). Matching roleType alone used to be sufficient
    // because at most one AccountRole of a given type could ever exist;
    // now that e.g. two Transport Provider AccountRoles (one per business)
    // can coexist for the same user, the active role must also match the
    // SPECIFIC workspace this conversation is owned by, or a caller
    // currently active as Transport@BusinessA could read Transport@
    // BusinessB's conversation just because both resolve to roleType
    // transport_provider.
    if (convo.ownerWorkspaceId != null && convo.ownerWorkspaceId !== roleContext.profileId) {
      throw new ForbiddenException('This conversation does not belong to your current active workspace');
    }

    const { messages, hasMore } = await this.fetchMessagePage(conversationId, before);

    if (!before) {
      await this.convoRepo.update(conversationId, { unreadCount: 0 });
      if (this.flags.isEnabled('SCOPED_CONVERSATION_DUAL_WRITE')) {
        const hint: WorkspaceHint = roleContext.profileType && roleContext.profileId != null
          ? { workspaceType: roleContext.profileType, workspaceId: roleContext.profileId }
          : null;
        this.dualWriteMarkRead(conversationId, roleContext.userId, roleContext.roleType, hint).catch(() => {});
      }
    }

    const [conversation] = await this.attachCommerceProfiles([convo]);
    return { conversation, messages, hasMore };
  }

  // ── Get messages in a conversation, as the BUYER ──────────────────────────

  async getMessagesAsBuyer(
    userId: number,
    conversationId: number,
    before?: number,
  ) {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId },
      relations: { customer: true, seller: true },
    });
    if (!convo || convo.customer?.userId !== userId) {
      throw new NotFoundException('Conversation not found');
    }

    const { messages, hasMore } = await this.fetchMessagePage(
      conversationId,
      before,
      { isNote: false },
    );

    if (!before) {
      await this.convoRepo.update(conversationId, { buyerUnreadCount: 0 });
      // Bridge to the bell/profile-badge notification count — see
      // InAppNotificationService.markReadByAction's own comment for why.
      this.notifService
        .markReadByAction(userId, 'MessageSeller', String(convo.sellerId))
        .catch(() => {});
      if (this.flags.isEnabled('SCOPED_CONVERSATION_DUAL_WRITE')) {
        this.dualWriteMarkRead(conversationId, userId, AccountRoleType.BUYER).catch(() => {});
      }
    }

    const [conversation] = await this.attachCommerceProfiles([convo]);
    return { conversation, messages, hasMore };
  }

  // ── Send a message ────────────────────────────────────────────────────────

  async sendMessage(
    sellerId: number,
    conversationId: number,
    dto: {
      content?: string;
      imageUrl?: string;
      isNote?: boolean; // internal note
      type?: string;
      metadata?: any;
    },
    sender: User,
    workspaceHint?: WorkspaceHint,
  ): Promise<ConversationMessage> {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId, sellerId },
      relations: { customer: true },
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    // Communication canonicality fix: sellerId (User.id) alone no longer
    // proves this is a SELLER conversation -- a Super Agent/Transport/Agent
    // conversation shares the same sellerId. This is the Seller-facing send
    // path specifically (senderType hardcoded below), so any conversation
    // whose resolved owner isn't the Seller identity (null/legacy rows are
    // still Seller-shaped by construction) is out of bounds here, full stop
    // -- no fallback, matching the same posture as ProductsService/
    // ClassifiedsService's cross-workspace denial.
    if (convo.ownerWorkspaceType && this.ownerRoleTypeFor(convo) !== AccountRoleType.SELLER) {
      throw new ForbiddenException('This conversation does not belong to your Seller identity');
    }
    // Multi-Business Authority Stage 1: see getMessages's identical check --
    // same roleType is not sufficient once two Seller AccountRoles can exist
    // for the same sellerId. Seller@BusinessA must never be able to REPLY
    // into Seller@BusinessB's conversation either.
    if (
      workspaceHint &&
      convo.ownerWorkspaceId != null &&
      (convo.ownerWorkspaceType !== workspaceHint.workspaceType || convo.ownerWorkspaceId !== workspaceHint.workspaceId)
    ) {
      throw new ForbiddenException('This conversation does not belong to your active Seller workspace');
    }

    const msg = this.msgRepo.create({
      conversationId,
      senderType: MessageSenderType.SELLER,
      senderId: sender.id,
      type: dto.type || MessageType.TEXT,
      content: dto.content || null,
      imageUrl: dto.imageUrl || null,
      metadata: dto.metadata || null,
      isNote: dto.isNote || false,
    });
    await this.msgRepo.save(msg);

    // Update conversation — internal notes aren't visible to the buyer, so
    // they don't touch lastMessage*/buyerUnreadCount, only messageCount.
    await this.convoRepo.update(
      conversationId,
      dto.isNote
        ? {
            messageCount: () => '"messageCount" + 1',
          }
        : {
            lastMessageAt: new Date(),
            lastMessagePreview: dto.content?.slice(0, 100) || '[Picha]',
            status: ConversationStatus.PENDING,
            messageCount: () => '"messageCount" + 1',
            buyerUnreadCount: () => '"buyerUnreadCount" + 1',
          },
    );

    // Dual-write (checkpoint B): attribute the message to the seller's
    // workspace (not the live sender's own active role -- a delegated team
    // member sending on the seller's behalf must attribute to the seller's
    // workspace, not their own personal role, see resolveAccountRoleFor's
    // comment) and mirror the buyer-side unread bump onto
    // ConversationParticipantState. Best-effort: never blocks sending,
    // which the legacy writes above already completed.
    let buyerRecipientRole: AccountRole | null = null;
    let sellerSenderRole: AccountRole | null = null;
    if (this.flags.isEnabled('SCOPED_CONVERSATION_DUAL_WRITE')) {
      const attribution = await this.dualWriteMessageAttribution(convo, msg, 'seller', !!dto.isNote).catch(
        () => ({ senderRole: null, recipientRole: null }) as { senderRole: AccountRole | null; recipientRole: AccountRole | null },
      );
      buyerRecipientRole = attribution.recipientRole;
      sellerSenderRole = attribution.senderRole;
    }

    // Notify the buyer — internal notes are seller-only, never surfaced.
    // "MessageSeller-{sellerId}" is the exact route SellerInbox.js already
    // uses to open this conversation as the buyer. The conversation's own
    // commerceProfileId (the identity this thread concerns) wins over the
    // seller's raw account fields when set — a personal-profile classified
    // conversation shouldn't show the business brand, or vice versa.
    if (!dto.isNote && convo.customer?.userId) {
      const senderProfile = convo.commerceProfileId
        ? await this.commerceProfiles.findById(convo.commerceProfileId).catch(() => null)
        : null;
      this.notifService
        .notify({
          userId: convo.customer.userId,
          type: 'message',
          title: `💬 ${senderProfile?.displayName || sender.storeName || sender.name || 'Muuzaji'}`,
          body: dto.content?.slice(0, 80) || '📷 Picha',
          icon: '💬',
          actionPage: 'MessageSeller',
          actionParam: String(sellerId),
          ...(this.flags.isEnabled('SCOPED_NOTIFICATION_DUAL_WRITE') && buyerRecipientRole
            ? {
                audienceScope: 'ROLE',
                recipientAccountRoleId: buyerRecipientRole.id,
                sourceType: 'conversation_message',
                sourceId: convo.id,
                actionRouteKey: 'inbox.buyer.conversation',
                actionParams: { sellerId, conversationId },
              }
            : {}),
        })
        .catch(() => {});
    }

    // Live push — purely additive, the message is already durably
    // persisted above regardless of whether anyone is connected to receive
    // this. Never awaited/blocking: a socket hiccup must never affect the
    // REST response the caller is waiting on.
    try {
      this.gateway.emitNewMessage({
        conversationId,
        sellerId,
        buyerUserId: convo.customer?.userId ?? null,
        message: msg,
        isNote: !!dto.isNote,
        sellerAccountRoleId: sellerSenderRole?.id ?? null,
        buyerAccountRoleId: buyerRecipientRole?.id ?? null,
      });
    } catch {
      // Non-critical — the message is already durably persisted above.
    }

    return msg;
  }

  // ── Send a message, as an OPERATIONAL role (Super Agent / Transport
  // Provider / Agent) ────────────────────────────────────────────────────
  // Communication canonicality fix. roleContext is the caller's own
  // server-resolved active context (RoleContextGuard) -- authority never
  // comes from a client-supplied sellerId/accountRoleId. The conversation
  // must both belong to this User (sellerId column) AND be owned by
  // EXACTLY this active role (ownerRoleTypeFor) -- a Super Agent active
  // context can never reply into that same person's Seller (or Transport,
  // or Agent) conversation, and vice versa. No legacy sellerId-only
  // fallback exists for this path, matching resolveOperationalTarget's own
  // fail-closed posture.
  async sendMessageAsOperationalRole(
    roleContext: RoleContext,
    conversationId: number,
    dto: { content?: string; imageUrl?: string; isNote?: boolean; type?: string; metadata?: any },
    sender: User,
  ): Promise<ConversationMessage> {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId, sellerId: roleContext.userId },
      relations: { customer: true },
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    if (this.ownerRoleTypeFor(convo) !== roleContext.roleType) {
      throw new ForbiddenException('This conversation does not belong to your current active role');
    }
    // Multi-Business Authority Stage 1: see getMessagesAsOperationalRole's
    // identical check -- same roleType is not sufficient once two
    // operational AccountRoles of that type can coexist for one user.
    if (convo.ownerWorkspaceId != null && convo.ownerWorkspaceId !== roleContext.profileId) {
      throw new ForbiddenException('This conversation does not belong to your current active workspace');
    }

    const msg = this.msgRepo.create({
      conversationId,
      senderType: MessageSenderType.SELLER, // legacy owning-side marker; real attribution is senderParticipantId/senderWorkspaceType below
      senderId: sender.id,
      type: dto.type || MessageType.TEXT,
      content: dto.content || null,
      imageUrl: dto.imageUrl || null,
      metadata: dto.metadata || null,
      isNote: dto.isNote || false,
    });
    await this.msgRepo.save(msg);

    await this.convoRepo.update(
      conversationId,
      dto.isNote
        ? { messageCount: () => '"messageCount" + 1' }
        : {
            lastMessageAt: new Date(),
            lastMessagePreview: dto.content?.slice(0, 100) || '[Picha]',
            status: ConversationStatus.PENDING,
            messageCount: () => '"messageCount" + 1',
            buyerUnreadCount: () => '"buyerUnreadCount" + 1',
          },
    );

    let buyerRecipientRole: AccountRole | null = null;
    let ownerSenderRole: AccountRole | null = null;
    if (this.flags.isEnabled('SCOPED_CONVERSATION_DUAL_WRITE')) {
      const attribution = await this.dualWriteMessageAttribution(convo, msg, 'seller', !!dto.isNote).catch(
        () => ({ senderRole: null, recipientRole: null }) as { senderRole: AccountRole | null; recipientRole: AccountRole | null },
      );
      buyerRecipientRole = attribution.recipientRole;
      ownerSenderRole = attribution.senderRole;
    }

    if (!dto.isNote && convo.customer?.userId) {
      this.notifService
        .notify({
          userId: convo.customer.userId,
          type: 'message',
          title: `💬 ${sender.storeName || sender.name || 'Muuzaji'}`,
          body: dto.content?.slice(0, 80) || '📷 Picha',
          icon: '💬',
          // Conversation-id-precise route -- this thread is not the
          // person's Seller conversation, so the legacy MessageSeller-
          // {sellerId} deep link would silently reopen the wrong thread.
          ...(this.flags.isEnabled('SCOPED_NOTIFICATION_DUAL_WRITE') && buyerRecipientRole
            ? {
                audienceScope: 'ROLE',
                recipientAccountRoleId: buyerRecipientRole.id,
                sourceType: 'conversation_message',
                sourceId: convo.id,
                actionRouteKey: 'inbox.buyer.conversation',
                actionParams: { sellerId: roleContext.userId, conversationId },
              }
            : {}),
        })
        .catch(() => {});
    }

    try {
      this.gateway.emitNewMessage({
        conversationId,
        sellerId: roleContext.userId,
        buyerUserId: convo.customer?.userId ?? null,
        message: msg,
        isNote: !!dto.isNote,
        sellerAccountRoleId: ownerSenderRole?.id ?? null,
        buyerAccountRoleId: buyerRecipientRole?.id ?? null,
      });
    } catch {
      // Non-critical -- the message is already durably persisted above.
    }

    return msg;
  }

  // ── Send a message, as the BUYER ──────────────────────────────────────────

  async sendMessageAsBuyer(
    userId: number,
    conversationId: number,
    dto: {
      content?: string;
      imageUrl?: string;
      type?: string;
      metadata?: any;
    },
    sender: User,
  ): Promise<ConversationMessage> {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId },
      relations: { customer: true },
    });
    if (!convo || convo.customer?.userId !== userId) {
      throw new NotFoundException('Conversation not found');
    }

    const msg = this.msgRepo.create({
      conversationId,
      senderType: MessageSenderType.CUSTOMER,
      senderId: sender.id,
      type: dto.type || MessageType.TEXT,
      content: dto.content || null,
      imageUrl: dto.imageUrl || null,
      metadata: dto.metadata || null,
    });
    await this.msgRepo.save(msg);

    await this.convoRepo.update(conversationId, {
      lastMessageAt: new Date(),
      lastMessagePreview: dto.content?.slice(0, 100) || '[Picha]',
      status: ConversationStatus.OPEN, // seller needs to respond
      messageCount: () => '"messageCount" + 1',
      unreadCount: () => '"unreadCount" + 1',
    });

    let sellerRecipientRole: AccountRole | null = null;
    let buyerSenderRole: AccountRole | null = null;
    if (this.flags.isEnabled('SCOPED_CONVERSATION_DUAL_WRITE')) {
      const attribution = await this.dualWriteMessageAttribution(convo, msg, 'buyer', false).catch(
        () => ({ senderRole: null, recipientRole: null }) as { senderRole: AccountRole | null; recipientRole: AccountRole | null },
      );
      sellerRecipientRole = attribution.recipientRole;
      buyerSenderRole = attribution.senderRole;
    }

    // Notify the seller — "SellerInbox-{customerId}" is the exact route
    // SellerInbox.js already uses to auto-open this conversation.
    this.notifService
      .notify({
        userId: convo.sellerId,
        type: 'message',
        title: `💬 ${sender.name || sender.storeName || 'Mnunuzi'}`,
        body: dto.content?.slice(0, 80) || '📷 Picha',
        icon: '💬',
        actionPage: 'SellerInbox',
        actionParam: String(convo.customer.id),
        ...(this.flags.isEnabled('SCOPED_NOTIFICATION_DUAL_WRITE') && sellerRecipientRole
          ? {
              audienceScope: 'ROLE',
              recipientAccountRoleId: sellerRecipientRole.id,
              sourceType: 'conversation_message',
              sourceId: convo.id,
              actionRouteKey: 'inbox.seller.conversation',
              actionParams: { customerId: convo.customer.id, conversationId },
            }
          : {}),
      })
      .catch(() => {});

    try {
      this.gateway.emitNewMessage({
        conversationId,
        sellerId: convo.sellerId,
        buyerUserId: userId,
        message: msg,
        isNote: false,
        sellerAccountRoleId: sellerRecipientRole?.id ?? null,
        buyerAccountRoleId: buyerSenderRole?.id ?? null,
      });
    } catch {
      // Non-critical — the message is already durably persisted above.
    }

    return msg;
  }

  // ── Share product in chat ─────────────────────────────────────────────────

  async shareProduct(
    sellerId: number,
    conversationId: number,
    product: {
      id: number;
      name: string;
      price: number;
      image?: string;
      itemType?: 'product' | 'classified';
    },
    sender: User,
  ): Promise<ConversationMessage> {
    return this.sendMessage(
      sellerId,
      conversationId,
      {
        type: MessageType.PRODUCT,
        content: `Bidhaa: ${product.name} — TZS ${product.price.toLocaleString()}`,
        metadata: {
          productId: product.id,
          productName: product.name,
          productPrice: product.price,
          productImage: product.image,
          // Products and classifieds are two different entities sharing
          // this one card shape (see SellerInbox.js's products+classifieds
          // fetch) — without this, productId is ambiguous as to which
          // table it points into. Defaults to 'product' for messages sent
          // before classifieds became shareable here too.
          itemType: product.itemType || 'product',
        },
      },
      sender,
    );
  }

  // ── System messages (order/invoice cards) — shared real-time push ─────────
  // Both addOrderMessage and addInvoiceMessage are called from OUTSIDE any
  // request that already has the conversation loaded (order-creation,
  // payment webhooks), so unlike sendMessage/sendMessageAsBuyer they need to
  // fetch sellerId/buyerUserId themselves before they can push live. Kept as
  // one helper so this fetch-and-emit logic isn't duplicated per card type.
  // Stage 2B item 8: previously emitted with no accountRoleId at all, so
  // the gateway's "operational events must route to scoped rooms, never a
  // generic user room" rule (item 17) meant this nudge was silently
  // dropped entirely whenever ROLE_CONTEXT_SOCKET_ROOMS was on -- the
  // message itself still arrived via the conversation:{id} room (delivery
  // was never broken), only the inbox-list "you have new activity" nudge
  // was missing. Now resolves the same seller/buyer AccountRole ids every
  // other send path resolves, server-side, before emitting -- if
  // resolution fails for either side, that side's nudge is skipped (never
  // falls back to a generic user:{id} room; see emitNewMessage's own
  // comment for why that's the correct failure mode here).
  private async emitSystemMessage(
    conversationId: number,
    msg: ConversationMessage,
  ): Promise<void> {
    try {
      const convo = await this.convoRepo.findOne({
        where: { id: conversationId },
        relations: { customer: true },
      });
      if (!convo) return;
      const [sellerRole, buyerRole] = await Promise.all([
        this.resolveAccountRoleFor(convo.sellerId, AccountRoleType.SELLER),
        convo.customer?.userId
          ? this.resolveAccountRoleFor(convo.customer.userId, AccountRoleType.BUYER)
          : Promise.resolve(null),
      ]);
      this.gateway.emitNewMessage({
        conversationId,
        sellerId: convo.sellerId,
        buyerUserId: convo.customer?.userId ?? null,
        message: msg,
        isNote: false,
        sellerAccountRoleId: sellerRole?.id ?? null,
        buyerAccountRoleId: buyerRole?.id ?? null,
      });
    } catch {
      // Non-critical — the message is already durably persisted above.
    }
  }

  // ── Create order from chat ────────────────────────────────────────────────
  // Adds a system message to the conversation after order is created

  async addOrderMessage(
    conversationId: number,
    order: {
      id: number;
      trackingNumber: string;
      totalAmount: number;
      status: string;
    },
  ): Promise<void> {
    const msg = await this.msgRepo.save(
      this.msgRepo.create({
        conversationId,
        senderType: MessageSenderType.SYSTEM,
        type: MessageType.ORDER,
        content: `Agizo #${order.id} limeundwa — TZS ${order.totalAmount.toLocaleString()}`,
        metadata: {
          orderId: order.id,
          trackingNumber: order.trackingNumber,
          orderStatus: order.status,
        },
      }),
    );

    await this.convoRepo.update(conversationId, {
      linkedOrderId: order.id,
      lastMessageAt: new Date(),
      lastMessagePreview: `📦 Agizo limeundwa — TZS ${order.totalAmount.toLocaleString()}`,
      messageCount: () => '"messageCount" + 1',
    });

    await this.emitSystemMessage(conversationId, msg);
  }

  // ── Invoice created / paid — narrates the rest of the commerce loop
  // (order → invoice → payment) inside the same thread, so "did you pay?"
  // never needs to leave the chat. One method for both states since they
  // share every field except the message text.
  async addInvoiceMessage(
    conversationId: number,
    invoice: { invoiceNumber: string; amount: number; paid: boolean; orderId?: number },
  ): Promise<void> {
    const content = invoice.paid
      ? `Malipo yamepokelewa ✅ — Ankara #${invoice.invoiceNumber}`
      : `Ankara mpya #${invoice.invoiceNumber} — TZS ${invoice.amount.toLocaleString()}`;

    const msg = await this.msgRepo.save(
      this.msgRepo.create({
        conversationId,
        senderType: MessageSenderType.SYSTEM,
        type: MessageType.INVOICE,
        content,
        metadata: {
          invoiceNumber: invoice.invoiceNumber,
          invoiceAmount: invoice.amount,
          invoicePaid: invoice.paid,
          // Lets the frontend deep-link the card straight to this Order in
          // MyOrders/SellerOrders instead of just a generic "go find it"
          // navigation — only set for the Order-linked invoice path
          // (orders.service.ts/payments.service.ts); the chat quick-invoice
          // path (createManualInvoice, no buyer account yet) has no Order
          // to link to and omits it.
          orderId: invoice.orderId,
        },
      }),
    );

    await this.convoRepo.update(conversationId, {
      lastMessageAt: new Date(),
      lastMessagePreview: invoice.paid
        ? `✅ Malipo yamepokelewa — Ankara #${invoice.invoiceNumber}`
        : `🧾 Ankara #${invoice.invoiceNumber}`,
      messageCount: () => '"messageCount" + 1',
    });

    await this.emitSystemMessage(conversationId, msg);
  }

  // ── Update conversation status ────────────────────────────────────────────

  async updateStatus(
    sellerId: number,
    conversationId: number,
    status: string,
  ): Promise<Conversation> {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId, sellerId },
    });
    if (!convo) throw new NotFoundException('Conversation not found');
    convo.status = status;
    return this.convoRepo.save(convo);
  }

  // ── Pin / mute — personal to each side, see the entity's own comment ─────

  async togglePin(sellerId: number, conversationId: number): Promise<{ pinned: boolean }> {
    const convo = await this.convoRepo.findOne({ where: { id: conversationId, sellerId } });
    if (!convo) throw new NotFoundException('Conversation not found');
    convo.sellerPinned = !convo.sellerPinned;
    await this.convoRepo.save(convo);
    await this.dualWriteParticipantFlag(conversationId, sellerId, AccountRoleType.SELLER, 'pinned', convo.sellerPinned);
    return { pinned: convo.sellerPinned };
  }

  async toggleMute(sellerId: number, conversationId: number): Promise<{ muted: boolean }> {
    const convo = await this.convoRepo.findOne({ where: { id: conversationId, sellerId } });
    if (!convo) throw new NotFoundException('Conversation not found');
    convo.sellerMuted = !convo.sellerMuted;
    await this.convoRepo.save(convo);
    await this.dualWriteParticipantFlag(conversationId, sellerId, AccountRoleType.SELLER, 'muted', convo.sellerMuted);
    return { muted: convo.sellerMuted };
  }

  async togglePinAsBuyer(userId: number, conversationId: number): Promise<{ pinned: boolean }> {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId },
      relations: { customer: true },
    });
    if (!convo || convo.customer?.userId !== userId) {
      throw new NotFoundException('Conversation not found');
    }
    convo.buyerPinned = !convo.buyerPinned;
    await this.convoRepo.save(convo);
    await this.dualWriteParticipantFlag(conversationId, userId, AccountRoleType.BUYER, 'pinned', convo.buyerPinned);
    return { pinned: convo.buyerPinned };
  }

  async toggleMuteAsBuyer(userId: number, conversationId: number): Promise<{ muted: boolean }> {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId },
      relations: { customer: true },
    });
    if (!convo || convo.customer?.userId !== userId) {
      throw new NotFoundException('Conversation not found');
    }
    convo.buyerMuted = !convo.buyerMuted;
    await this.convoRepo.save(convo);
    await this.dualWriteParticipantFlag(conversationId, userId, AccountRoleType.BUYER, 'muted', convo.buyerMuted);
    return { muted: convo.buyerMuted };
  }

  /**
   * Mirrors a legacy sellerPinned/sellerMuted/buyerPinned/buyerMuted toggle
   * onto ConversationParticipantState -- legacy stays authoritative for the
   * RETURN value (avoids the two systems being independently toggle-able
   * and drifting out of sync), the participant row is just kept in lockstep
   * so a future cutover to reading pin/mute from participant state has
   * correct data already. Best-effort, wrapped so a resolver hiccup never
   * breaks the legacy toggle that already succeeded.
   */
  private async dualWriteParticipantFlag(
    conversationId: number,
    userId: number,
    roleType: AccountRoleType,
    flag: 'pinned' | 'muted',
    value: boolean,
  ): Promise<void> {
    if (!this.flags.isEnabled('SCOPED_CONVERSATION_DUAL_WRITE')) return;
    try {
      const role = await this.resolveAccountRoleFor(userId, roleType);
      if (!role) return;
      const participant = await this.participants.ensureAccountRoleParticipant(
        conversationId,
        role.id,
        roleType === AccountRoleType.SELLER ? ParticipantKind.SELLER : ParticipantKind.BUYER,
      );
      await this.participants.getOrInitState(participant.id);
      await this.participantStateRepo.update({ conversationParticipantId: participant.id }, { [flag]: value });
    } catch {
      // Non-critical -- the legacy toggle above already succeeded and is
      // still the source of truth for the response.
    }
  }

  // ── Assign conversation to team member ────────────────────────────────────

  async assignTo(
    sellerId: number,
    conversationId: number,
    assignedToId: number,
  ): Promise<Conversation> {
    const convo = await this.convoRepo.findOne({
      where: { id: conversationId, sellerId },
    });
    if (!convo) throw new NotFoundException('Conversation not found');

    // Previously accepted any user ID with no check it was actually part
    // of this seller's team.
    const isTeamMember = await this.teamMemberRepo.findOne({
      where: { sellerId, userId: assignedToId, isActive: true },
    });
    if (!isTeamMember) {
      throw new BadRequestException(
        'That user is not an active member of your team',
      );
    }

    convo.assignedToId = assignedToId;

    // System message
    await this.msgRepo.save(
      this.msgRepo.create({
        conversationId,
        senderType: MessageSenderType.SYSTEM,
        type: MessageType.TEXT,
        content: `Mazungumzo yamepewa mwanachama wa timu.`,
      }),
    );

    return this.convoRepo.save(convo);
  }
}
