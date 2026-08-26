import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  CommerceProfile,
  CommerceProfileType,
  CommerceProfileStatus,
} from './entities/commerce-profile.entity';
import { CommerceProfileFollow } from './entities/commerce-profile-follow.entity';
import { CommerceProfileMember } from './entities/commerce-profile-member.entity';
import { User } from '../users/entities/user.entity';
import { Review } from '../store/review.entity';
import { Follow } from '../store/follow.entity';
import { ProductReview } from '../products/entities/product-review.entity';
import { SearchIndexService } from '../search/search-index.service';
import { normalizeSearchQuery } from '../search/search-term-normalizer.util';
import { buildMultiTermLikeClause } from '../search/search-query.util';
import { AiSellerEnrichmentService } from '../ai/ai-seller-enrichment.service';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';

const RESERVED_USERNAMES = new Set([
  'admin',
  'api',
  'app',
  'help',
  'support',
  'kentexa',
  'about',
  'contact',
  'login',
  'register',
  'settings',
  'null',
  'undefined',
]);

@Injectable()
export class CommerceProfilesService {
  constructor(
    @InjectRepository(CommerceProfile)
    private repo: Repository<CommerceProfile>,
    @InjectRepository(CommerceProfileFollow)
    private followRepo: Repository<CommerceProfileFollow>,
    @InjectRepository(CommerceProfileMember)
    private memberRepo: Repository<CommerceProfileMember>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Review)
    private reviewRepo: Repository<Review>,
    @InjectRepository(ProductReview)
    private productReviewRepo: Repository<ProductReview>,
    @InjectRepository(Follow)
    private legacyFollowRepo: Repository<Follow>,
    private readonly searchIndex: SearchIndexService,
    private readonly aiEnrichment: AiSellerEnrichmentService,
    private readonly notifService: InAppNotificationService,
    private readonly activityEvents: ActivityEventService,
  ) {}

  // Shared by createProfile()/updatePublicFields() — runs the AI enrichment
  // task, stores the result on the profile, and folds its keywords into the
  // same text that gets embedded, so semantic search benefits too. Entirely
  // non-fatal: an enrichment failure never blocks the profile save it's
  // triggered from (same convention as the embedding upsert beside it).
  private async enrichAndIndex(profile: CommerceProfile): Promise<void> {
    try {
      const enrichment = await this.aiEnrichment.enrich({
        bio: profile.bio,
        category: profile.category,
      });
      const aiKeywords = enrichment ? JSON.stringify(enrichment) : null;
      if (aiKeywords) await this.repo.update(profile.id, { aiKeywords });

      const embedText = [
        profile.displayName,
        profile.bio,
        profile.category,
        profile.location,
        enrichment?.keywords?.join(' '),
        enrichment?.useCases?.join(' '),
      ]
        .filter(Boolean)
        .join(' \n ');
      await this.searchIndex.upsert('profile', profile.id, embedText);
    } catch {
      /* non-fatal — the profile save already succeeded */
    }
  }

  // Slugifies `seed` and appends a numeric suffix until it's free. Never
  // throws on collision — always returns something usable, since this
  // runs both at interactive signup time and inside the unattended
  // backfill script.
  async generateUniqueUsername(seed: string): Promise<string> {
    const base =
      seed
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 24) || 'user';

    let candidate = base;
    let suffix = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (
        !RESERVED_USERNAMES.has(candidate) &&
        !(await this.repo.findOne({ where: { username: candidate } }))
      ) {
        return candidate;
      }
      suffix += 1;
      candidate = `${base}${suffix}`;
    }
  }

  async findByUsername(username: string): Promise<CommerceProfile | null> {
    return this.repo.findOne({
      where: { username: username.toLowerCase() },
    });
  }

  // Public — backs unified search's People/Businesses results. Same LIKE-
  // match shape as products/classifieds/services search; this is the piece
  // that was missing entirely (only an exact-username lookup existed
  // before), which is why searching a person's or business's name used to
  // return nothing no matter how the query was classified.
  //
  // Also matches category/bio/aiKeywords (not just name) — the fix for
  // "camera shop" / "duka la kamera" finding nothing: a shop-intent query
  // is never going to literally match a business's displayName, but
  // AiSellerEnrichmentService already writes exactly this kind of term
  // into aiKeywords on every profile save (enrichAndIndex() above). Reuses
  // the same normalizeSearchQuery + buildMultiTermLikeClause pipeline
  // products/classifieds search already use, so "kamera"/"camera" synonym
  // expansion and shop/duka/seller stopword-stripping (see
  // search-term-normalizer.util.ts) apply here too.
  async search(q: string, limit = 15): Promise<CommerceProfile[]> {
    const query = q?.trim();
    if (!query) return [];
    const { patterns } = normalizeSearchQuery(query);
    const { clause: keywordClause, params: keywordParams } =
      buildMultiTermLikeClause(
        ['LOWER(p.category)', 'LOWER(p.bio)', 'LOWER(p.aiKeywords)'],
        patterns,
        'kw',
      );
    return this.repo
      .createQueryBuilder('p')
      .where('p.status = :status', { status: CommerceProfileStatus.ACTIVE })
      .andWhere(
        `((LOWER(p.displayName) LIKE :q OR LOWER(p.username) LIKE :q) OR ${keywordClause})`,
        { q: `%${query.toLowerCase()}%`, ...keywordParams },
      )
      .orderBy('p.isVerified', 'DESC')
      .addOrderBy('p.followersCount', 'DESC')
      .take(limit)
      .getMany();
  }

  async findById(id: number): Promise<CommerceProfile> {
    const profile = await this.repo.findOne({ where: { id } });
    if (!profile) throw new NotFoundException('Commerce profile not found');
    return profile;
  }

  // Every profile a user owns — the personal one they got at signup, plus
  // whichever business/agent/transport/hub profiles they've had approved.
  async findForUser(ownerId: number): Promise<CommerceProfile[]> {
    return this.repo.find({
      where: { ownerId },
      order: { createdAt: 'ASC' },
    });
  }

  // Every profile a user can ACT AS — their own, plus any profile they're
  // an active CommerceProfileMember of. This is what the profile switcher
  // uses (GET /profiles/mine): a hub's staff needs to see and switch into
  // that hub even though they don't own it. findForUser() above stays
  // owned-only — it backs public "which profiles does this account run"
  // lookups where membership shouldn't leak.
  async findAccessibleForUser(userId: number): Promise<CommerceProfile[]> {
    const owned = await this.findForUser(userId);
    const memberships = await this.memberRepo.find({
      where: { userId, isActive: true },
    });
    const memberProfileIds = memberships
      .map((m) => m.commerceProfileId)
      .filter((id) => !owned.some((p) => p.id === id));
    if (memberProfileIds.length === 0) return owned;
    const memberProfiles = await this.repo.find({
      where: { id: In(memberProfileIds) },
    });
    return [...owned, ...memberProfiles].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }

  async findForUserByType(
    ownerId: number,
    type: CommerceProfileType,
  ): Promise<CommerceProfile | null> {
    return this.repo.findOne({ where: { ownerId, type } });
  }

  // Batch version of findForUserByType — for list endpoints (search
  // results, trending rails, discover feed) that need to attach each row's
  // own commerceProfileId without an N+1 query per row. Returns a Map
  // keyed by ownerId for easy lookup; owners with no profile of this type
  // are simply absent from the map.
  async findMapForOwnersByType(
    ownerIds: number[],
    type: CommerceProfileType,
  ): Promise<Map<number, CommerceProfile>> {
    if (ownerIds.length === 0) return new Map();
    const profiles = await this.repo.find({
      where: { ownerId: In(ownerIds), type },
    });
    return new Map(profiles.map((p) => [p.ownerId, p]));
  }

  // Idempotent by design: if this owner already has a profile of this type
  // (checked by the caller passing a stable linkField/linkId), callers
  // should look it up first — this always creates. Used both by the live
  // approval flows and the one-time backfill script.
  async createProfile(params: {
    ownerId: number;
    type: CommerceProfileType;
    displayName: string;
    usernameSeed: string;
    photoUrl?: string | null;
    bio?: string | null;
    location?: string | null;
    category?: string | null;
    status?: CommerceProfileStatus;
    sellerProfileId?: number;
    businessId?: number;
    transportProviderId?: number;
    agentId?: number;
    superAgentId?: number;
  }): Promise<CommerceProfile> {
    const username = await this.generateUniqueUsername(params.usernameSeed);
    const saved = await this.repo.save(
      this.repo.create({
        ownerId: params.ownerId,
        type: params.type,
        username,
        displayName: params.displayName,
        photoUrl: params.photoUrl || null,
        bio: params.bio || null,
        location: params.location || null,
        category: params.category || null,
        status: params.status || CommerceProfileStatus.ACTIVE,
        sellerProfileId: params.sellerProfileId ?? null,
        businessId: params.businessId ?? null,
        transportProviderId: params.transportProviderId ?? null,
        agentId: params.agentId ?? null,
        superAgentId: params.superAgentId ?? null,
      }),
    );
    // This is the literal fix for bios never being searchable — e.g. a
    // business's declared "Seller of Hidden Camera, Voice Recorder and GPS"
    // now becomes part of what semantic search can actually match against.
    this.enrichAndIndex(saved).catch(() => {});
    this.activityEvents.record({
      eventType: 'PROFILE_CREATED',
      category: ActivityCategory.BUSINESS,
      actorId: params.ownerId,
      actorType: 'user',
      businessId: saved.id,
      targetType: 'commerce_profile',
      targetId: saved.id,
      metadata: { profileType: params.type },
    });
    return saved;
  }

  async updateStatus(
    id: number,
    status: CommerceProfileStatus,
  ): Promise<void> {
    await this.repo.update(id, { status });
  }

  // Used by every approve/reject/suspend flow (seller, transport, agent,
  // super-agent) to keep the linked CommerceProfile's status mirroring the
  // operational entity's own status, without each service needing to know
  // the CommerceProfile's own id — just the id of the record they already
  // approved. Silently no-ops if no linked profile exists yet (e.g. this
  // ran before the backfill caught up an old record).
  async syncStatusByLink(
    linkField:
      | 'sellerProfileId'
      | 'transportProviderId'
      | 'agentId'
      | 'superAgentId',
    linkId: number,
    status: CommerceProfileStatus,
  ): Promise<void> {
    await this.repo.update({ [linkField]: linkId } as any, { status });
  }

  // ── Following a specific profile ────────────────────────────────────────
  // Separate from every other CommerceProfile identity — Kened following
  // his own hub, or a buyer following Bishoo Intelligence Systems without
  // ever following Kened personally, has to be representable. followerId
  // is a User id (whoever's logged in), commerceProfileId is the exact
  // profile being followed, never the owning account.
  async isFollowing(
    followerId: number | undefined,
    commerceProfileId: number,
  ): Promise<boolean> {
    if (!followerId) return false;
    const row = await this.followRepo.findOne({
      where: { followerId, commerceProfileId },
    });
    return !!row;
  }

  async toggleFollow(
    followerId: number,
    commerceProfileId: number,
  ): Promise<{ following: boolean; followersCount: number }> {
    const profileBefore = await this.findById(commerceProfileId);
    // The account-level self-follow guard on the legacy path
    // (StoreService.toggleFollow) never covered this profile-scoped path —
    // hitting POST /profiles/:id/follow directly on your own profile
    // silently created a real self-follow relationship (just skipped the
    // notification, which only masked it).
    if (profileBefore.ownerId === followerId) {
      throw new BadRequestException('Cannot follow your own profile');
    }

    const existing = await this.followRepo.findOne({
      where: { followerId, commerceProfileId },
    });
    if (existing) {
      await this.followRepo.remove(existing);
      await this.repo.decrement({ id: commerceProfileId }, 'followersCount', 1);
    } else {
      await this.followRepo.save(
        this.followRepo.create({ followerId, commerceProfileId }),
      );
      await this.repo.increment({ id: commerceProfileId }, 'followersCount', 1);
    }
    const profile = await this.findById(commerceProfileId);

    // Notify on a genuine new follow only, never on unfollow. Distinguish a
    // reciprocal follow-back (the profile owner already followed this
    // person first) from a cold new follow — same event, different
    // message, since "followed you back" is the thing that actually closes
    // the engagement loop for the ORIGINAL follower.
    if (!existing && profile.ownerId) {
      const follower = await this.userRepo.findOne({ where: { id: followerId } });
      const followerName = follower?.name || follower?.storeName || 'Mtumiaji';
      const alreadyFollowedBack = await this.isFollowingSeller(profile.ownerId, followerId);
      const notify = alreadyFollowedBack
        ? this.notifService.followedBack(profile.ownerId, followerName, followerId)
        : this.notifService.newFollower(profile.ownerId, followerName, followerId);
      notify.catch(() => {});
    }

    this.activityEvents.record({
      eventType: existing ? 'PROFILE_UNFOLLOWED' : 'PROFILE_FOLLOWED',
      category: ActivityCategory.SOCIAL,
      actorId: followerId,
      actorType: 'user',
      businessId: commerceProfileId,
      relatedUserId: profile.ownerId ?? null,
      targetType: 'commerce_profile',
      targetId: commerceProfileId,
    });

    return { following: !existing, followersCount: profile.followersCount };
  }

  // Does this profile's owner already follow `viewerId` back (through
  // either follow system)? Powers the Follow/Following/Follow Back button
  // state — without this the frontend has no way to distinguish "no
  // relationship" from "they follow me but I haven't followed back",
  // which are two different buttons.
  async isFollowedBy(commerceProfileId: number, viewerId?: number): Promise<boolean> {
    if (!viewerId) return false;
    const profile = await this.findById(commerceProfileId);
    if (!profile.ownerId || profile.ownerId === viewerId) return false;
    return this.isFollowingSeller(profile.ownerId, viewerId);
  }

  // ── Cross-system follow resolution (legacy `follow` ∪ CommerceProfileFollow) ──
  // Two follow systems exist side by side by design (see toggleFollow()
  // above vs. StoreService.toggleFollow(), which still writes to the legacy
  // account-level `follow` table for sellers with no BUSINESS profile).
  // Everything that needs "is X following seller Y" or "who follows seller
  // Y" goes through these so both systems stay readable without merging
  // their underlying rows.

  // True if `followerId` follows seller `sellerId` through EITHER system.
  async isFollowingSeller(
    followerId: number | undefined,
    sellerId: number,
  ): Promise<boolean> {
    if (!followerId) return false;
    const legacy = await this.legacyFollowRepo.findOne({
      where: { follower: { id: followerId }, seller: { id: sellerId } },
    });
    if (legacy) return true;
    const businessProfile = await this.findForUserByType(
      sellerId,
      CommerceProfileType.BUSINESS,
    );
    if (!businessProfile) return false;
    return this.isFollowing(followerId, businessProfile.id);
  }

  // Seller (account) ids that `followerId` follows through EITHER system —
  // legacy account-level follows, plus the owning account of any profile
  // they follow directly.
  //
  // Kept for callers that only need "does this account's content show up
  // at all" (e.g. isFollowingSeller's legacy branch) — NOT for filtering
  // feed content by profile identity. Use getFollowedProfiles() for that;
  // this method collapses profile-level follows down to the owning
  // account id, which is exactly the bug profile-architecture-audit-2026-08
  // found: following only someone's Personal profile still surfaced their
  // Business Moments in the Following feed, since the profile distinction
  // was discarded here before feed.service.ts ever saw it.
  async getFollowedSellerIds(followerId: number): Promise<number[]> {
    const [legacyRows, profileFollowRows] = await Promise.all([
      this.legacyFollowRepo.find({
        where: { follower: { id: followerId } },
        relations: { seller: true },
      }),
      this.followRepo.find({ where: { followerId } }),
    ]);
    const legacyIds = legacyRows.map((r) => r.seller.id);
    const profileIds = profileFollowRows.map((r) => r.commerceProfileId);
    let profileOwnerIds: number[] = [];
    if (profileIds.length > 0) {
      const profiles = await this.repo.find({ where: { id: In(profileIds) } });
      profileOwnerIds = profiles
        .map((p) => p.ownerId)
        .filter((id): id is number => !!id);
    }
    return [...new Set([...legacyIds, ...profileOwnerIds])];
  }

  // Profile-granular version for feed filtering — mirrors
  // getPostNotificationAudience()'s existing rule instead of discarding it:
  // a legacy account-level follow, or a direct follow of the account's
  // BUSINESS profile, means "show me everything this business posts"
  // (businessScopedIds, matched against BusinessFeedItem.businessId alone,
  // same as before — including legacy posts with no commerceProfileId).
  // Following any OTHER specific profile (e.g. Personal) means "show me
  // only that exact profile's posts" (profileScopedIds, matched against
  // BusinessFeedItem.commerceProfileId alone) — it must never also surface
  // that same account's Business Moments just because they share an owner.
  async getFollowedProfiles(
    followerId: number,
  ): Promise<{ businessScopedIds: number[]; profileScopedIds: number[] }> {
    const [legacyRows, profileFollowRows] = await Promise.all([
      this.legacyFollowRepo.find({
        where: { follower: { id: followerId } },
        relations: { seller: true },
      }),
      this.followRepo.find({ where: { followerId } }),
    ]);
    const legacyIds = legacyRows.map((r) => r.seller.id);

    const profileIds = profileFollowRows.map((r) => r.commerceProfileId);
    const businessScopedIds = new Set<number>(legacyIds);
    const profileScopedIds = new Set<number>();
    if (profileIds.length > 0) {
      const profiles = await this.repo.find({ where: { id: In(profileIds) } });
      for (const p of profiles) {
        if (p.type === CommerceProfileType.BUSINESS && p.ownerId) {
          businessScopedIds.add(p.ownerId);
        } else {
          profileScopedIds.add(p.id);
        }
      }
    }
    return {
      businessScopedIds: [...businessScopedIds],
      profileScopedIds: [...profileScopedIds],
    };
  }

  // Audience (User ids) for a new post published under `postCommerceProfileId`
  // by account `sellerId`. Profile-scoped followers of that exact profile
  // always get notified. Legacy account-level followers only get notified
  // when the post was published under the account's own BUSINESS profile —
  // legacy follows predate multi-profile support and are treated as
  // "following the business", never as "following everything this account
  // does" (e.g. its owner's personal moments).
  async getPostNotificationAudience(
    sellerId: number,
    postCommerceProfileId: number | null | undefined,
  ): Promise<number[]> {
    if (!postCommerceProfileId) return [];

    const profileFollowRows = await this.followRepo.find({
      where: { commerceProfileId: postCommerceProfileId },
    });
    const profileFollowerIds = profileFollowRows.map((r) => r.followerId);

    let legacyFollowerIds: number[] = [];
    const businessProfile = await this.findForUserByType(
      sellerId,
      CommerceProfileType.BUSINESS,
    );
    if (businessProfile && businessProfile.id === postCommerceProfileId) {
      const legacyRows = await this.legacyFollowRepo.find({
        where: { seller: { id: sellerId } },
        relations: { follower: true },
      });
      legacyFollowerIds = legacyRows.map((r) => r.follower.id);
    }

    return [...new Set([...profileFollowerIds, ...legacyFollowerIds])];
  }

  // Detailed "stores I follow" list, merging both systems — used by
  // StoreService.getMyFollowedStores(). Without this, a follow that
  // toggleFollow() redirected onto CommerceProfileFollow (any seller with a
  // BUSINESS profile, i.e. most of them post-redirect) would silently stop
  // appearing in "who I follow" the moment it happened.
  async getFollowedStoresDetailed(followerId: number): Promise<
    { id: number; storeName: string; logo: string | null; followedAt: Date }[]
  > {
    const [legacyRows, profileFollowRows] = await Promise.all([
      this.legacyFollowRepo.find({
        where: { follower: { id: followerId } },
        relations: { seller: true },
      }),
      this.followRepo.find({ where: { followerId } }),
    ]);

    const legacy = legacyRows.map((f) => ({
      id: f.seller.id,
      storeName: f.seller.storeName || f.seller.name || 'Muuzaji',
      logo: f.seller.logo,
      followedAt: f.createdAt,
    }));

    let profileEntries: typeof legacy = [];
    if (profileFollowRows.length > 0) {
      const profileIds = profileFollowRows.map((r) => r.commerceProfileId);
      const profiles = await this.repo.find({ where: { id: In(profileIds) } });
      const rowByProfileId = new Map(
        profileFollowRows.map((r) => [r.commerceProfileId, r]),
      );
      profileEntries = profiles
        .filter((p) => !!p.ownerId)
        .map((p) => ({
          id: p.ownerId as number,
          storeName: p.displayName,
          logo: p.photoUrl,
          followedAt: rowByProfileId.get(p.id)?.createdAt || new Date(),
        }));
    }

    const merged = new Map<number, (typeof legacy)[number]>();
    for (const entry of [...legacy, ...profileEntries]) {
      const existing = merged.get(entry.id);
      if (!existing || entry.followedAt > existing.followedAt) {
        merged.set(entry.id, entry);
      }
    }
    return [...merged.values()].sort(
      (a, b) => b.followedAt.getTime() - a.followedAt.getTime(),
    );
  }

  // Detailed "who follows me" list, merging both systems — used by
  // StoreService.getMyFollowers(). Same reasoning as getFollowedStoresDetailed
  // above, mirrored for the seller's own side of the relationship.
  async getSellerFollowersDetailed(sellerId: number): Promise<
    {
      id: number;
      name: string;
      logo: string | null;
      role: string;
      followedAt: Date;
    }[]
  > {
    const legacyRows = await this.legacyFollowRepo.find({
      where: { seller: { id: sellerId } },
      relations: { follower: true },
      order: { createdAt: 'DESC' },
    });
    const legacy = legacyRows
      .filter((f) => f.follower)
      .map((f) => ({
        id: f.follower.id,
        name: f.follower.storeName || f.follower.name || 'KenteXa user',
        logo: f.follower.logo,
        role: f.follower.role,
        followedAt: f.createdAt,
      }));

    let profileEntries: typeof legacy = [];
    const businessProfile = await this.findForUserByType(
      sellerId,
      CommerceProfileType.BUSINESS,
    );
    if (businessProfile) {
      const rows = await this.followRepo.find({
        where: { commerceProfileId: businessProfile.id },
      });
      if (rows.length > 0) {
        const followerUsers = await this.userRepo.find({
          where: { id: In(rows.map((r) => r.followerId)) },
        });
        const rowByFollowerId = new Map(rows.map((r) => [r.followerId, r]));
        profileEntries = followerUsers.map((u) => ({
          id: u.id,
          name: u.storeName || u.name || 'KenteXa user',
          logo: u.logo,
          role: u.role,
          followedAt: rowByFollowerId.get(u.id)?.createdAt || new Date(),
        }));
      }
    }

    const merged = new Map<number, (typeof legacy)[number]>();
    for (const entry of [...legacy, ...profileEntries]) {
      const existing = merged.get(entry.id);
      if (!existing || entry.followedAt > existing.followedAt) {
        merged.set(entry.id, entry);
      }
    }
    return [...merged.values()].sort(
      (a, b) => b.followedAt.getTime() - a.followedAt.getTime(),
    );
  }

  // Rolling-average rating + count, called once per new review (Review or
  // ProductReview) that gets a commerceProfileId stamped on it. Same
  // "denormalized, kept in sync by the services that own Follow/Review
  // writes" contract the entity's own comment describes — this is the
  // Review half of that (toggleFollow above is the Follow half).
  async recordReview(commerceProfileId: number, rating: number): Promise<void> {
    const profile = await this.findById(commerceProfileId);
    const newCount = profile.reviewsCount + 1;
    const newAverage =
      (Number(profile.rating) * profile.reviewsCount + rating) / newCount;
    await this.repo.update(commerceProfileId, {
      reviewsCount: newCount,
      rating: Number(newAverage.toFixed(2)),
    });
  }

  // Reviews scoped to THIS profile — merges the two separate review tables
  // (Review, keyed to a seller account's storefront checkout; ProductReview,
  // keyed to an individual product) into one normalized, newest-first list.
  // Only rows with commerceProfileId set are returned — reviews written
  // before this feature existed have no profile to correctly attribute to,
  // so they're omitted here rather than guessed at (same rule Stage 3 used
  // for feed posts, just inverted: there, untagged posts stayed visible
  // everywhere; here, untagged reviews aren't scoped to any one profile so
  // they can't appear on this profile-specific list at all).
  async getReviews(commerceProfileId: number, limit = 30) {
    const [storeReviews, productReviews] = await Promise.all([
      this.reviewRepo.find({
        where: { commerceProfileId },
        relations: { buyer: true },
        order: { createdAt: 'DESC' },
        take: limit,
      }),
      this.productReviewRepo.find({
        where: { commerceProfileId },
        order: { createdAt: 'DESC' },
        take: limit,
      }),
    ]);

    const normalized = [
      ...storeReviews.map((r) => ({
        id: `store-${r.id}`,
        rating: r.rating,
        comment: r.comment,
        reviewerName: r.buyer?.name || 'Kentexa user',
        reviewerPhoto: r.buyer?.avatarUrl || null,
        createdAt: r.createdAt,
      })),
      ...productReviews.map((r) => ({
        id: `product-${r.id}`,
        rating: r.rating,
        comment: r.comment,
        reviewerName: r.reviewer?.name || 'Kentexa user',
        reviewerPhoto: r.reviewer?.avatarUrl || null,
        createdAt: r.createdAt,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return normalized.slice(0, limit);
  }

  // ── Team management ────────────────────────────────────────────────────
  // Direct generalization of SellerService's getTeamMembers/inviteTeamMember/
  // updateTeamMember/removeTeamMember (src/seller/seller.service.ts) — same
  // shape, keyed by commerceProfileId instead of sellerId so it works for
  // any profile type (hub staff, transport company staff), not just sellers.
  async getMembers(commerceProfileId: number): Promise<CommerceProfileMember[]> {
    return this.memberRepo.find({
      where: { commerceProfileId, isActive: true },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
  }

  async inviteMember(
    commerceProfileId: number,
    dto: { phone: string; role: string; permissions: Record<string, boolean> },
  ): Promise<CommerceProfileMember> {
    const profile = await this.findById(commerceProfileId);
    const user = await this.userRepo.findOne({ where: { phone: dto.phone } });
    if (!user) {
      throw new NotFoundException(
        `No user found with phone ${dto.phone}. Ask them to register first.`,
      );
    }
    if (user.id === profile.ownerId) {
      throw new BadRequestException("You can't add yourself.");
    }
    const existing = await this.memberRepo.findOne({
      where: { commerceProfileId, userId: user.id, isActive: true },
    });
    if (existing) {
      throw new BadRequestException(
        'This person is already on the team.',
      );
    }
    return this.memberRepo.save(
      this.memberRepo.create({
        commerceProfileId,
        userId: user.id,
        role: dto.role || 'staff',
        permissions: dto.permissions || {},
      }),
    );
  }

  async updateMember(
    commerceProfileId: number,
    memberId: number,
    dto: { role?: string; permissions?: Record<string, boolean>; isActive?: boolean },
  ): Promise<CommerceProfileMember> {
    const member = await this.memberRepo.findOne({
      where: { id: memberId, commerceProfileId },
    });
    if (!member) throw new NotFoundException('Team member not found');
    if (dto.role !== undefined) member.role = dto.role;
    if (dto.permissions !== undefined) member.permissions = dto.permissions;
    if (dto.isActive !== undefined) member.isActive = dto.isActive;
    return this.memberRepo.save(member);
  }

  async removeMember(commerceProfileId: number, memberId: number): Promise<void> {
    const member = await this.memberRepo.findOne({
      where: { id: memberId, commerceProfileId },
    });
    if (!member) throw new NotFoundException('Team member not found');
    member.isActive = false;
    await this.memberRepo.save(member);
  }

  async updatePublicFields(
    id: number,
    dto: Partial<
      Pick<
        CommerceProfile,
        'displayName' | 'photoUrl' | 'coverImage' | 'bio' | 'location'
      >
    >,
  ): Promise<CommerceProfile> {
    await this.repo.update(id, dto);
    const updated = await this.findById(id);
    this.enrichAndIndex(updated).catch(() => {});
    return updated;
  }
}
