import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In, IsNull } from 'typeorm';
import { Business, BusinessStatus } from './entities/business.entity';
import { OperationalWorkspace, OperationalWorkspaceStatus } from './entities/operational-workspace.entity';
import { BusinessMembership, BusinessMembershipRoleTemplate, BusinessMembershipStatus } from './entities/business-membership.entity';
import { WorkspaceAssignment, WorkspaceAssignmentStatus } from './entities/workspace-assignment.entity';
import { BusinessCapability, BusinessCapabilityStatus } from './entities/business-capability.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType } from '../role-context/entities/account-role.entity';
import { User } from '../users/entities/user.entity';
import { SellerProfile, SellerStatus } from '../seller/entities/seller-profile.entity';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import {
  CommerceProfileType,
  CommerceProfileStatus,
} from '../commerce-profiles/entities/commerce-profile.entity';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';
import { Invoice, InvoiceStatus } from '../invoices/entities/invoice.entity';
import { Product } from '../products/entities/products.entity';
import { AnalyticsService } from '../analytics/analytics.service';
import { AiBusinessInsightService } from '../ai/ai-business-insight.service';

// Phase 1 of the multi-role architecture: Business as a real entity,
// independent of Seller. See seller.service.ts's apply() for the existing
// (unchanged) individual-or-business seller application flow -- this
// service is the newer "I just want a Business profile, not to sell"
// path, plus the bridge that lets an existing Business activate Seller
// later without duplicating its own data.
@Injectable()
export class BusinessService {
  constructor(
    @InjectRepository(Business) private businessRepo: Repository<Business>,
    @InjectRepository(SellerProfile) private sellerProfileRepo: Repository<SellerProfile>,
    @InjectRepository(Invoice) private invoiceRepo: Repository<Invoice>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(OperationalWorkspace) private workspaceRepo: Repository<OperationalWorkspace>,
    @InjectRepository(WorkspaceAssignment) private assignmentRepo: Repository<WorkspaceAssignment>,
    @InjectRepository(BusinessCapability) private capabilityRepo: Repository<BusinessCapability>,
    @InjectRepository(AccountRole) private accountRoleRepo: Repository<AccountRole>,
    private dataSource: DataSource,
    private commerceProfiles: CommerceProfilesService,
    private activityEvents: ActivityEventService,
    private analytics: AnalyticsService,
    private aiInsight: AiBusinessInsightService,
  ) {}

  // Multi-Business Authority Stage 1: kept as the single-object shape every
  // existing client (BusinessDashboard.js/BecomeBusiness.js, GET
  // /business/mine) already expects -- deliberately NOT silently turned
  // into an array response, per the mission's own "do not break existing
  // clients" instruction. Now backed by findAllMine() so its notion of
  // "mine" (oldest Business first) stays consistent with the new list
  // endpoint rather than being a second, independently-ordered query.
  async findMine(userId: number): Promise<Business | null> {
    const all = await this.findAllMine(userId);
    return all[0] ?? null;
  }

  // New in Multi-Business Authority Stage 1 -- every Business the user owns
  // (Business.user, unchanged compatibility metadata; BusinessMembership is
  // the real authority table but ownership display here intentionally
  // mirrors findMine()'s own existing resolution, not a redesign of it).
  // Ordered oldest-first for a stable, deterministic list.
  async findAllMine(userId: number): Promise<Business[]> {
    return this.businessRepo.find({
      where: { user: { id: userId } },
      order: { id: 'ASC' },
    });
  }

  // New in Multi-Business Authority Stage 1 -- the smallest read-only API
  // the next frontend stage needs: My Businesses -> Workspaces -> active
  // BusinessCapabilities -> the caller's own corresponding authorized
  // AccountRole, where one exists. Everything here is server-derived from
  // `businessId` (ownership-checked, same posture as getDashboard/update
  // above) and `user.id` -- the caller never supplies a workspaceId or
  // accountRoleId of their own to gain visibility into anything.
  //
  // "myAccountRole" is resolved via the caller's own BusinessMembership on
  // THIS business (not merely "any AccountRole this user has of that
  // type") -- correct under multiplicity: a user who owns/joins two
  // Businesses has two independent WorkspaceAssignment chains, and this
  // only ever surfaces the one that actually belongs to the workspace
  // being listed.
  async listWorkspaces(businessId: number, user: User): Promise<Array<{
    id: number;
    name: string;
    isDefault: boolean;
    status: OperationalWorkspaceStatus;
    capabilities: BusinessCapability['capabilityCode'][];
    myAccountRole: { accountRoleId: number; roleType: AccountRoleType } | null;
  }>> {
    const business = await this.findById(businessId);
    if (business.user.id !== user.id) {
      throw new NotFoundException('Business not found');
    }

    const workspaces = await this.workspaceRepo.find({
      where: { businessId },
      order: { id: 'ASC' },
    });
    if (!workspaces.length) return [];
    const workspaceIds = workspaces.map((w) => w.id);

    const capabilities = await this.capabilityRepo.find({
      where: { workspaceId: In(workspaceIds), status: BusinessCapabilityStatus.ACTIVE },
    });

    // This caller's own active WorkspaceAssignments across these
    // workspaces, resolved via THEIR OWN active BusinessMembership on this
    // Business -- never another member's.
    const myAssignments = await this.assignmentRepo
      .createQueryBuilder('wa')
      .innerJoin(
        BusinessMembership,
        'bm',
        'bm.id = wa."businessMembershipId" AND bm."userId" = :userId AND bm.status = :bmActive',
        { userId: user.id, bmActive: BusinessMembershipStatus.ACTIVE },
      )
      .where('wa."workspaceId" IN (:...workspaceIds)', { workspaceIds })
      .andWhere('wa.status = :waActive', { waActive: WorkspaceAssignmentStatus.ACTIVE })
      .select(['wa.id AS "assignmentId"', 'wa."workspaceId" AS "workspaceId"'])
      .getRawMany<{ assignmentId: number; workspaceId: number }>();

    const assignmentIdByWorkspace = new Map(myAssignments.map((a) => [a.workspaceId, a.assignmentId]));
    const assignmentIds = myAssignments.map((a) => a.assignmentId);
    const myRoles = assignmentIds.length
      ? await this.accountRoleRepo.find({
          where: { userId: user.id, workspaceAssignmentId: In(assignmentIds), status: AccountRoleStatus.ACTIVE },
        })
      : [];
    const roleByAssignmentId = new Map(myRoles.map((r) => [r.workspaceAssignmentId as number, r]));

    return workspaces.map((ws) => {
      const assignmentId = assignmentIdByWorkspace.get(ws.id) ?? null;
      const myRole = assignmentId != null ? roleByAssignmentId.get(assignmentId) : undefined;
      return {
        id: ws.id,
        name: ws.name,
        isDefault: ws.isDefault,
        status: ws.status,
        capabilities: capabilities.filter((c) => c.workspaceId === ws.id).map((c) => c.capabilityCode),
        myAccountRole: myRole ? { accountRoleId: myRole.id, roleType: myRole.roleType } : null,
      };
    });
  }

  // Multi-Business Authority Stage 1 helper for getDashboard() above.
  private async resolveDashboardSellerProfile(userId: number, businessId: number): Promise<SellerProfile | null> {
    const linked = await this.sellerProfileRepo.findOne({ where: { user: { id: userId }, businessId } });
    if (linked) return linked;
    return this.sellerProfileRepo.findOne({ where: { user: { id: userId }, businessId: IsNull() } });
  }

  async findById(id: number): Promise<Business> {
    const business = await this.businessRepo.findOne({ where: { id } });
    if (!business) throw new NotFoundException('Business not found');
    return business;
  }

  // Own dashboard stats -- only what this Business genuinely has data for
  // today. Leads/Messages are honest empty placeholders, not real backing
  // data yet (see Phase 2 plan's "explicitly not in this phase").
  async getDashboard(businessId: number, user: User) {
    const business = await this.findById(businessId);
    if (business.user.id !== user.id) {
      throw new NotFoundException('Business not found');
    }
    const [sellerProfile, commerceProfile] = await Promise.all([
      // Multi-Business Authority Stage 1: prefer the SellerProfile actually
      // linked to THIS business (businessId) -- the correct, disambiguated
      // answer once a user may have more than one SellerProfile (one per
      // Business, see AddAccountRoleWorkspaceMultiplicity's own migration
      // comment). Falls back to a legacy, not-yet-linked profile
      // (businessId IS NULL) ONLY when no businessId-matched one exists --
      // preserves the original documented behavior exactly for every
      // pre-Stage-1 seller whose SellerProfile predates this Business
      // record and was never backfilled with a businessId (an ambiguous
      // case that could not be deterministically resolved at migration
      // time -- see the migration's own backfill comment).
      this.resolveDashboardSellerProfile(user.id, businessId),
      // By businessId link, not just "the account's business profile" — an
      // account running more than one Business must each show their own
      // followers/rating/reputation, not whichever business profile
      // findForUserByType happens to resolve first (profile-architecture-
      // audit-2026-08 Stage 6).
      this.commerceProfiles.findByBusinessId(user.id, businessId),
    ]);
    return {
      business,
      hasSeller: !!sellerProfile,
      followersCount: commerceProfile?.followersCount || 0,
      rating: commerceProfile?.rating || 0,
      reviewsCount: commerceProfile?.reviewsCount || 0,
      reputationScore: commerceProfile?.reputationScore || 0,
      leadsCount: 0,
      unreadMessagesCount: 0,
    };
  }

  // ── Layer 2 of CLAUDE.md's Internal AI Intelligence architecture:
  // deterministic analytics over the ActivityEvent bus (Phase 1), no AI
  // reasoning here. "Current state" (pending invoices) is read straight
  // from Invoice, never derived from the event log — the event log stays
  // an honest record of things that happened, not a shadow copy of state
  // that could drift from it. Only genuinely time-boxed activity ("how
  // many orders came in today") is read from ActivityEvent/AnalyticsEvent.
  // No Moments/engagement section — that feature doesn't exist yet, and
  // fabricating it would violate CLAUDE.md's "never invent activity" rule.
  async getTodayIntelligence(businessId: number, user: User) {
    const business = await this.findById(businessId);
    if (business.user.id !== user.id) {
      throw new NotFoundException('Business not found');
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Resolved by the businessId link, not just "the account's business
    // profile" — an account running more than one Business must never have
    // their stats merged (profile-architecture-audit-2026-08 Stage 6).
    const profile = await this.commerceProfiles.findByBusinessId(
      user.id,
      businessId,
    );
    const profileId = profile?.id ?? null;

    const countToday = (eventType: string) =>
      profileId
        ? this.activityEvents.countSince(profileId, eventType, startOfToday)
        : Promise.resolve(0);

    const [
      ordersToday,
      paymentsCompletedToday,
      newFollowersToday,
      reviewsToday,
      pendingInvoicesCount,
      myProducts,
    ] = await Promise.all([
      countToday('ORDER_CREATED'),
      countToday('INVOICE_PAID'),
      countToday('PROFILE_FOLLOWED'),
      countToday('REVIEW_CREATED'),
      profileId
        ? this.invoiceRepo
            .createQueryBuilder('i')
            .leftJoin('i.order', 'o')
            .where('o."sellerId" = :sid', { sid: user.id })
            .andWhere(
              '(o."commerceProfileId" = :pid OR o."commerceProfileId" IS NULL)',
              { pid: profileId },
            )
            .andWhere('i.status IN (:...statuses)', {
              statuses: [
                InvoiceStatus.AWAITING_PAYMENT,
                InvoiceStatus.PAYMENT_PROCESSING,
              ],
            })
            .getCount()
        : this.invoiceRepo.count({
            where: {
              order: { seller: { id: user.id } },
              status: In([
                InvoiceStatus.AWAITING_PAYMENT,
                InvoiceStatus.PAYMENT_PROCESSING,
              ]),
            },
          }),
      profileId
        ? this.productRepo
            .createQueryBuilder('p')
            .select('p.id')
            .where('p."sellerId" = :sid', { sid: user.id })
            .andWhere(
              '(p."commerceProfileId" = :pid OR p."commerceProfileId" IS NULL)',
              { pid: profileId },
            )
            .getMany()
        : this.productRepo.find({
            where: { seller: { id: user.id } },
            select: { id: true },
          }),
    ]);

    const productIds = myProducts.map((p) => String(p.id));
    const [profileVisitsToday, productViewsToday] = await Promise.all([
      profileId
        ? this.analytics.countEventsSince({
            eventType: 'profile_view',
            targetType: 'profile',
            targetId: String(profileId),
            since: startOfToday,
          })
        : 0,
      this.analytics.countEventsSince({
        eventType: 'product_view',
        targetIdIn: productIds,
        since: startOfToday,
      }),
    ]);

    return {
      commerce: { ordersToday, paymentsCompletedToday, pendingInvoicesCount },
      customerActivity: {
        profileVisitsToday,
        productViewsToday,
        newFollowersToday,
        reviewsToday,
      },
    };
  }

  // Layer 4 — real AI reasoning on top of getTodayIntelligence()'s Layer 2
  // counts, called separately by the frontend AFTER that deterministic
  // report already rendered (never a dependency of it). `today` is the
  // exact object the frontend already got back from getTodayIntelligence()
  // — passed in rather than refetched, same reasoning AiSearchExplainerService
  // takes an already-fetched resultSummary instead of re-running search.
  // Fails open: an AI outage must never break or block the report itself.
  async getTodayInsight(
    businessId: number,
    user: User,
    today: Record<string, any>,
    language: string,
  ): Promise<{ insight: string; recommendation: string | null }> {
    const business = await this.findById(businessId);
    if (business.user.id !== user.id) {
      throw new NotFoundException('Business not found');
    }
    let result: {
      insight: string;
      recommendation: string | null;
      confidence?: number;
    };
    try {
      result = await this.aiInsight.generate(today, language || 'en');
    } catch {
      return { insight: '', recommendation: null };
    }

    // AI audit trail (CLAUDE.md section 14) — every AI-generated
    // recommendation logs its own AI_EVENT, same accountability as any
    // other actor on the platform. Never blocks the response above:
    // record() already fails open (Phase 1), and this runs after result
    // is already computed, so a logging failure here can't lose the
    // insight the user is waiting on.
    // Multi-Business Authority Stage 1: businessId-scoped (see update()'s
    // identical fix above) -- this AI-audit-trail event must attribute to
    // THIS business's CommerceProfile, not an arbitrary one of the user's
    // several BUSINESS-type profiles.
    const profile = await this.commerceProfiles
      .findByBusinessId(user.id, businessId)
      .catch(() => null);
    if (profile) {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const sourceEventIds = await this.activityEvents
        .idsSince(
          profile.id,
          ['ORDER_CREATED', 'INVOICE_PAID', 'PROFILE_FOLLOWED', 'REVIEW_CREATED'],
          startOfToday,
        )
        .catch(() => []);
      this.activityEvents.record({
        eventType: 'AI_RECOMMENDATION_GENERATED',
        category: ActivityCategory.AI,
        businessId: profile.id,
        targetType: 'business_insight',
        targetId: businessId,
        visibility: 'system',
        metadata: {
          type: 'RECOMMENDATION',
          sourceEventIds,
          reason: result.insight,
          confidence: result.confidence ?? null,
          action: result.recommendation,
          status: 'PENDING',
        },
      });
    }

    return { insight: result.insight, recommendation: result.recommendation };
  }

  // ── Create a Business with no Seller (spec section 7: a manufacturer
  // that only wants a digital presence) ─────────────────────────────────
  async create(
    user: User,
    dto: {
      legalName: string;
      tradingName?: string;
      description?: string;
      category?: string;
      address?: string;
      phone?: string;
      email?: string;
      regionId?: number;
      region?: string;
      districtId?: number;
      district?: string;
      wardId?: number;
      ward?: string;
      responsiblePersonName?: string;
      tinNumber?: string;
      registrationNumber?: string;
      businessLicenseNumber?: string;
    },
  ): Promise<Business> {
    // Multi-Business Authority Stage 1: the blanket "You already have a
    // Business" guard that used to sit here is removed -- Business.user
    // itself never had a uniqueness constraint (only this application-level
    // check enforced singularity), and BusinessMembership/WorkspaceAssignment
    // already correctly support one User holding independent membership in
    // many Businesses (UNIQUE(userId, businessId) on membership, not
    // UNIQUE(userId) alone). Per the mission: Business creation may allow
    // another Business once all bootstrap rows below are created
    // transactionally, which they always were -- nothing else about this
    // method changes except removing this one now-unnecessary guard.

    // Business-First Stage 1 foundation: every Business created from here
    // on is bootstrapped with its default OperationalWorkspace + Owner
    // BusinessMembership + the explicit WorkspaceAssignment that grants the
    // Owner active operating authority over it, all in one transaction --
    // so no Business created after this point ever needs the standalone
    // backfill tool (backfill-business-first-foundation.ts) to catch up.
    // Per the approved design, Owner access is never implicit: this is the
    // one real WorkspaceAssignment row the Owner needs to operate their
    // default workspace at all; a second workspace later would need its
    // own explicit assignment the same way.
    const saved = await this.dataSource.transaction(async (manager) => {
      const business = manager.getRepository(Business).create({
        ...dto,
        user,
        status: BusinessStatus.ACTIVE,
      });
      const savedBusiness = await manager.getRepository(Business).save(business);

      const membership = await manager.getRepository(BusinessMembership).save(
        manager.getRepository(BusinessMembership).create({
          businessId: savedBusiness.id,
          userId: user.id,
          roleTemplate: BusinessMembershipRoleTemplate.OWNER,
          status: BusinessMembershipStatus.ACTIVE,
        }),
      );
      const workspace = await manager.getRepository(OperationalWorkspace).save(
        manager.getRepository(OperationalWorkspace).create({
          businessId: savedBusiness.id,
          name: 'Default Operations',
          isDefault: true,
          status: OperationalWorkspaceStatus.ACTIVE,
        }),
      );
      const assignment = await manager.getRepository(WorkspaceAssignment).save(
        manager.getRepository(WorkspaceAssignment).create({
          businessMembershipId: membership.id,
          workspaceId: workspace.id,
          status: WorkspaceAssignmentStatus.ACTIVE,
          permissions: {},
        }),
      );

      // Business Capability Activation Stage B1: this method used to also
      // auto-bind an existing ACTIVE, unbound Seller AccountRole to this
      // new Business's default workspace (a Business-First Stage 1
      // convenience, so a self-service Business never depended on the
      // standalone backfill tool to become organizationally resolvable).
      // Removed: it silently granted an already-approved legacy/personal
      // Seller's authority to a brand-new Business's workspace with zero
      // application, review, or BusinessCapability -- exactly the implicit
      // grant the capability-application lifecycle exists to prevent. It
      // had also become a live regression risk under Stage A's own
      // enforcement: binding that role to a workspace with no COMMERCE
      // BusinessCapability would make it immediately fail closed
      // (ROLE_CONTEXT_CAPABILITY_INACTIVE) on its very next resolution --
      // Business creation would have silently broken a previously-working
      // unbound Seller's authority. Creating a Business now bootstraps only
      // identity/organizational rows; a legacy Seller stays exactly as
      // unbound as before, and remains fully operable (its unbound
      // resolution path never runs a capability check at all -- see
      // RoleContextService.resolveOrganizationalContext). Attaching it to a
      // Business is deferred to an explicit, independently-authorized
      // future flow (see the Stage B architecture discovery's "Attach to
      // Business" recommendation), never an automatic side effect of
      // creating an unrelated new Business.
      return savedBusiness;
    });

    // Public presence alongside the operational record, same pattern
    // SellerService.apply() and CommerceProfilesBackfillService already
    // use for every other role type. Non-fatal.
    let profileId: number | null = null;
    try {
      const profile = await this.commerceProfiles.createProfile({
        ownerId: user.id,
        type: CommerceProfileType.BUSINESS,
        displayName: saved.tradingName || saved.legalName,
        usernameSeed: saved.tradingName || saved.legalName,
        photoUrl: user.logo || saved.logo,
        bio: saved.description,
        location: saved.address,
        status: CommerceProfileStatus.ACTIVE,
        businessId: saved.id,
      });
      profileId = profile.id;
    } catch {}

    // createProfile() above already emits its own PROFILE_CREATED event;
    // this is the more specific BUSINESS_CREATED event, distinct because
    // Business (spec section 7: a Business with no Seller) is its own
    // identity concept, not just "a profile got created".
    this.activityEvents.record({
      eventType: 'BUSINESS_CREATED',
      category: ActivityCategory.BUSINESS,
      actorId: user.id,
      actorType: 'user',
      businessId: profileId,
      targetType: 'business',
      targetId: saved.id,
    });

    return saved;
  }

  async update(
    businessId: number,
    user: User,
    dto: Partial<{
      legalName: string;
      tradingName: string;
      description: string;
      category: string;
      logo: string;
      coverImage: string;
      address: string;
      phone: string;
      email: string;
    }>,
  ): Promise<Business> {
    const business = await this.findById(businessId);
    if (business.user.id !== user.id) {
      throw new NotFoundException('Business not found');
    }
    await this.businessRepo.update(businessId, dto);
    const saved = await this.findById(businessId);

    // Keep the public CommerceProfile in sync -- same fields it was
    // seeded from at create() time. Best-effort: never blocks the save.
    // Multi-Business Authority Stage 1: was findForUserByType(user.id,
    // BUSINESS) -- resolves "the account's" BUSINESS-type CommerceProfile
    // with no businessId disambiguator, so updating Business B could sync
    // Business A's public profile instead once a user has more than one.
    // findByBusinessId already exists (getDashboard/getTodayIntelligence
    // use it below) and is the correct, businessId-scoped resolver.
    const commerceProfile = await this.commerceProfiles.findByBusinessId(
      user.id,
      businessId,
    );
    if (commerceProfile) {
      await this.commerceProfiles
        .updatePublicFields(commerceProfile.id, {
          displayName: saved.tradingName || saved.legalName,
          photoUrl: saved.logo,
          coverImage: saved.coverImage,
          bio: saved.description,
        })
        .catch(() => {});
    }

    return saved;
  }

  // ── Activate Seller on an existing Business (spec section 9: "a
  // business can activate Seller later") ─────────────────────────────────
  async activateSeller(businessId: number, user: User): Promise<SellerProfile> {
    const business = await this.findById(businessId);
    if (business.user.id !== user.id) {
      throw new NotFoundException('Business not found');
    }
    const existingSeller = await this.sellerProfileRepo.findOne({
      where: { user: { id: user.id } },
    });
    if (existingSeller) {
      throw new ConflictException('You already have a seller application');
    }

    const sellerProfile = this.sellerProfileRepo.create({
      user,
      businessId: business.id,
      businessName: business.tradingName || business.legalName,
      businessDescription: business.description,
      businessCategory: business.category,
      address: business.address,
      phone: business.phone,
      regionId: business.regionId,
      businessRegion: business.region,
      districtId: business.districtId,
      businessDistrict: business.district,
      wardId: business.wardId,
      businessCity: business.ward,
      registrationNumber: business.registrationNumber,
      tinNumber: business.tinNumber,
      businessLicenseNumber: business.businessLicenseNumber,
      sellerType: 'business',
      status: SellerStatus.PENDING,
    });
    return this.sellerProfileRepo.save(sellerProfile);
  }
}
