/**
 * FeedService — Commerce feed with CVS algorithm
 * Place at: src/feed/feed.service.ts
 */
import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { BusinessFeedItem } from '../business/entities/business-feed-item.entity';
import {
  PostEngagement,
  EngagementType,
  CVS_WEIGHTS,
} from './entities/post-engagement.entity';
import { PostComment } from './entities/post-comment.entity';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { User } from '../users/entities/user.entity';
import { Classified } from '../classifieds/entities/classified.entity';
import { ServiceAd } from '../services/entities/service-ad.entity';
import { Product } from '../products/entities/products.entity';
import { TransportRoute } from '../transport/entities/transport-route.entity';
import { ProviderAvailability } from '../transport/entities/provider-availability.entity';
import { CommerceProfile, CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';
import { CommerceProfileScopeService } from '../commerce-profiles/commerce-profile-scope.service';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import { ProviderStatus } from '../transport/entities/transport-provider.entity';
import { SellerStatus } from '../seller/entities/seller-profile.entity';

export type FeedFilter =
  | 'for_you'
  | 'following'
  | 'nearby'
  | 'products'
  | 'services'
  | 'transport'
  | 'businesses'
  | 'trending';

@Injectable()
export class FeedService {
  private readonly logger = new Logger(FeedService.name);

  constructor(
    @InjectRepository(BusinessFeedItem)
    private feedRepo: Repository<BusinessFeedItem>,
    @InjectRepository(PostEngagement)
    private engageRepo: Repository<PostEngagement>,
    @InjectRepository(PostComment) private commentRepo: Repository<PostComment>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Classified)
    private classifiedRepo: Repository<Classified>,
    @InjectRepository(ServiceAd) private serviceAdRepo: Repository<ServiceAd>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(TransportRoute)
    private routeRepo: Repository<TransportRoute>,
    @InjectRepository(ProviderAvailability)
    private availabilityRepo: Repository<ProviderAvailability>,
    @InjectRepository(CommerceProfile)
    private commerceProfileRepo: Repository<CommerceProfile>,
    private readonly notifService: InAppNotificationService,
    private readonly profileScope: CommerceProfileScopeService,
    private readonly commerceProfiles: CommerceProfilesService,
  ) {}

  // ── Publish a post ────────────────────────────────────────────────────────
  async publish(
    sellerId: number,
    dto: {
      type: string;
      title: string;
      body?: string;
      imageUrl?: string;
      linkedEntityType?: string;
      linkedEntityId?: number;
      ctaLabel?: string;
      expiresAt?: string;
      category?: string;
      commerceProfileId?: number;
    },
  ): Promise<BusinessFeedItem> {
    // Attributes the post to whichever profile was active when it was
    // published, so Kened's personal posts and Bishoo Intelligence
    // Systems' posts stop sharing one feed. Authorization is never
    // trusted from the client — owner or an active team member with
    // canManageProducts (posting on a business's behalf is presentation,
    // the same bucket product listings live in).
    let commerceProfileId: number | null = null;
    if (dto.commerceProfileId) {
      const authorized = await this.profileScope.isAuthorizedFor(
        sellerId,
        dto.commerceProfileId,
        'canManageProducts',
      );
      if (!authorized) {
        throw new ForbiddenException(
          'You do not manage this commerce profile',
        );
      }
      commerceProfileId = dto.commerceProfileId;
    }

    const item = await this.feedRepo.save(
      this.feedRepo.create({
        businessId: sellerId,
        commerceProfileId,
        type: dto.type as any,
        title: dto.title,
        body: dto.body || null,
        imageUrl: dto.imageUrl || null,
        linkedEntityType: dto.linkedEntityType || null,
        linkedEntityId: dto.linkedEntityId || null,
        ctaLabel: dto.ctaLabel || null,
        category: dto.category || null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        isActive: true,
        cvsScore: 0,
      }),
    );

    // Notify followers — fire-and-forget
    this.notifyFollowers(sellerId, item).catch((err) =>
      this.logger.warn('Feed notify failed:' + err),
    );
    return item;
  }

  // ── Record engagement + update CVS ───────────────────────────────────────
  async recordEngagement(
    userId: number,
    postId: number,
    type: EngagementType,
  ): Promise<{
    toggled: boolean;
    cvsScore: number;
  }> {
    const existing = await this.engageRepo.findOne({
      where: { userId, postId, type },
    });

    const post = await this.feedRepo.findOne({ where: { id: postId } });
    if (!post) return { toggled: false, cvsScore: 0 };

    const weight = CVS_WEIGHTS[type];
    let toggled = false;

    if (
      existing &&
      (type === EngagementType.SAVE || type === EngagementType.SHARE)
    ) {
      // Toggle off saves and shares
      await this.engageRepo.remove(existing);
      post.cvsScore = Math.max(0, Number(post.cvsScore) - weight);
      if (type === EngagementType.SAVE)
        post.saveCount = Math.max(0, post.saveCount - 1);
      if (type === EngagementType.SHARE)
        post.shareCount = Math.max(0, post.shareCount - 1);
      toggled = false;
    } else if (!existing) {
      await this.engageRepo.save(
        this.engageRepo.create({ userId, postId, type }),
      );
      post.cvsScore = Number(post.cvsScore) + weight;
      if (type === EngagementType.SAVE) post.saveCount++;
      if (type === EngagementType.COMMENT) post.commentCount++;
      if (type === EngagementType.SHARE) post.shareCount++;
      if (type === EngagementType.PURCHASE) post.purchaseCount++;
      if (type === EngagementType.SHIPMENT) post.shipmentCount++;
      toggled = true;
    }

    await this.feedRepo.save(post);

    // Notify on a genuine new save only, never on un-save/toggle-off, and
    // never to yourself. The virtual-entity save path (EngagementsController,
    // for products/classifieds/services) already notified on save — real
    // feed posts (Moments) never got the same treatment, so saving someone
    // else's Moment silently did nothing they'd ever see.
    if (toggled && type === EngagementType.SAVE && post.businessId !== userId) {
      const saver = await this.userRepo.findOne({ where: { id: userId } });
      this.notifService
        .notify({
          userId: post.businessId,
          type: 'save' as any,
          title: '❤️ New like',
          body: `${saver?.name || saver?.storeName || 'Someone'} liked your post`,
          icon: '❤️',
          actionPage: 'CommerceProfile',
          actionParam: `${post.businessId}-feed-${postId}`,
          actionCommerceProfileId: (post as any).commerceProfileId || undefined,
        })
        .catch(() => {});
    }

    return { toggled, cvsScore: Number(post.cvsScore) };
  }

  // ── Get user's saved posts ────────────────────────────────────────────────
  async getMySaves(userId: number): Promise<BusinessFeedItem[]> {
    const saves = await this.engageRepo.find({
      where: { userId, type: EngagementType.SAVE },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    const postIds = saves.map((s) => s.postId);
    if (!postIds.length) return [];
    return this.feedRepo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.business', 'b')
      .where('f.id IN (:...ids)', { ids: postIds })
      .getMany();
  }

  // ── Story ring — who has a fresh Moment (last 48h), one per seller ────────
  async getMomentStories(viewerId?: number): Promise<any[]> {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const moments = await this.feedRepo
      .createQueryBuilder('f')
      .leftJoinAndSelect('f.business', 'b')
      .where('f.type IN (:...types)', { types: ['moment', 'looking_for'] })
      .andWhere('f.isActive = true')
      .andWhere('f.createdAt > :since', { since })
      .orderBy('f.createdAt', 'DESC')
      .getMany();

    // One story per user — keep their most recent post (either flavor) only
    const seen = new Set<number>();
    const unique = moments.filter((m) => {
      if (seen.has(m.businessId)) return false;
      seen.add(m.businessId);
      return true;
    });

    let followedIds = new Set<number>();
    if (viewerId) {
      const ids = await this.commerceProfiles
        .getFollowedSellerIds(viewerId)
        .catch(() => []);
      followedIds = new Set(ids);
    }

    // Same fix as CvsService.getFilteredFeed: a story ring circle must show
    // WHICH profile the moment was actually posted as, not always the
    // owner's personal identity — this is the story ring specifically, the
    // most visible surface for a freshly-posted Moment.
    const profileIds = [
      ...new Set(
        unique
          .map((m) => (m as any).commerceProfileId)
          .filter((id): id is number => !!id),
      ),
    ];
    const profiles = profileIds.length
      ? await this.commerceProfileRepo.find({ where: { id: In(profileIds) } })
      : [];
    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    return unique.map((m) => {
      const profile = (m as any).commerceProfileId
        ? profileMap.get((m as any).commerceProfileId)
        : null;
      return {
        momentId: m.id,
        postType: m.type, // 'moment' | 'looking_for'
        imageUrl: m.imageUrl,
        caption: m.body,
        category: m.category,
        createdAt: m.createdAt,
        linkedEntityType: m.linkedEntityType,
        linkedEntityId: m.linkedEntityId,
        business: {
          id: m.business?.id,
          commerceProfileId: profile?.id || null,
          name: profile?.displayName || m.business?.name,
          storeName: profile?.displayName || m.business?.storeName,
          logo: profile?.photoUrl || m.business?.logo,
          businessLocation: (m.business as any)?.businessLocation,
          isVerified: profile?.isVerified ?? (m.business as any)?.isVerified,
          isFollowing: m.business ? followedIds.has(m.business.id) : false,
        },
      };
    });
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  async addComment(
    userId: number,
    postId: number,
    body: string,
    parentId?: number,
  ): Promise<PostComment> {
    const comment = await this.commentRepo.save(
      this.commentRepo.create({
        postId,
        authorId: userId,
        body: body.trim(),
        parentId: parentId || null,
      }),
    );

    // Award CVS for comment engagement
    await this.recordEngagement(userId, postId, EngagementType.COMMENT);

    // Notify post author
    const post = await this.feedRepo.findOne({ where: { id: postId } });
    if (post && post.businessId !== userId) {
      const commenter = await this.userRepo.findOne({ where: { id: userId } });
      // actionParam carries "{businessId}-feed-{postId}" so Activity.js/App.js/
      // CommerceProfile.js land the tap on the Posts/Feed tab and scroll to/
      // highlight this exact post, instead of the default Products tab.
      // See CommerceProfile.js's pageParam parsing.
      this.notifService
        .notify({
          userId: post.businessId,
          type: 'comment' as any,
          title: `💬 New question on your listing`,
          body: `${commenter?.name || 'A user'}: "${body.slice(0, 60)}${body.length > 60 ? '...' : ''}"`,
          actionPage: 'CommerceProfile',
          actionParam: `${post.businessId}-feed-${postId}`,
          // Without this, a comment on a post published under a BUSINESS
          // profile still landed the owner on their PERSONAL profile when
          // they tapped the notification — CommerceProfile.js's resolver
          // only lands on the right identity when this is set explicitly.
          actionCommerceProfileId: (post as any).commerceProfileId || undefined,
          icon: '💬',
        })
        .catch(() => {});
    }

    return comment;
  }

  async getComments(postId: number): Promise<PostComment[]> {
    return this.commentRepo.find({
      where: { postId, isDeleted: false, parentId: IsNull() },
      relations: { author: true },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async getReplies(commentId: number): Promise<PostComment[]> {
    return this.commentRepo.find({
      where: { parentId: commentId, isDeleted: false },
      relations: { author: true },
      order: { createdAt: 'ASC' },
    });
  }

  async deleteComment(userId: number, commentId: number): Promise<void> {
    await this.commentRepo.update(
      { id: commentId, authorId: userId },
      { isDeleted: true },
    );
  }

  // ── Main feed — filtered ──────────────────────────────────────────────────
  async getFeed(
    userId: number | null,
    filter: FeedFilter = 'for_you',
    page = 1,
  ): Promise<{
    items: any[];
    total: number;
  }> {
    const limit = 15;
    const offset = (page - 1) * limit;
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    switch (filter) {
      case 'trending': {
        // Posts ranked by CVS in last 7 days
        const posts = await this.feedRepo
          .createQueryBuilder('f')
          .leftJoinAndSelect('f.business', 'b')
          .where('f.isActive = true')
          .andWhere('f.createdAt > :cutoff', { cutoff: cutoff7d })
          .andWhere('(f.expiresAt IS NULL OR f.expiresAt > NOW())')
          .orderBy('f.cvsScore', 'DESC')
          .addOrderBy('f.purchaseCount', 'DESC')
          .skip(offset)
          .take(limit)
          .getMany();
        return {
          items: await this.formatPosts(posts, 'trending'),
          total: posts.length,
        };
      }

      case 'following': {
        if (!userId) return { items: [], total: 0 };
        const followedSellerIds = await this.commerceProfiles
          .getFollowedSellerIds(userId)
          .catch(() => []);
        if (followedSellerIds.length === 0) return { items: [], total: 0 };
        const posts = await this.feedRepo
          .createQueryBuilder('f')
          .leftJoinAndSelect('f.business', 'b')
          .where('f.isActive = true')
          .andWhere('f."businessId" IN (:...ids)', { ids: followedSellerIds })
          .andWhere('(f.expiresAt IS NULL OR f.expiresAt > NOW())')
          .orderBy('f.createdAt', 'DESC')
          .skip(offset)
          .take(limit)
          .getMany();
        return {
          items: await this.formatPosts(posts, 'following'),
          total: posts.length,
        };
      }

      case 'nearby': {
        let city = 'Dar es Salaam';
        if (userId) {
          const u = await this.userRepo.findOne({ where: { id: userId } });
          city =
            (u as any)?.city ||
            u?.businessLocation?.split(',')[0]?.trim() ||
            city;
        }
        const listings = await this.classifiedRepo
          .createQueryBuilder('c')
          .leftJoinAndSelect('c.seller', 's')
          .where("c.status = 'active'")
          .andWhere('LOWER(c.location) LIKE LOWER(:city)', {
            city: `%${city.split(' ')[0]}%`,
          })
          .andWhere('c.createdAt > :cutoff', { cutoff: cutoff48h })
          .orderBy('s.reputationScore', 'DESC')
          .addOrderBy('c.createdAt', 'DESC')
          .skip(offset)
          .take(limit)
          .getMany();
        return {
          items: this.formatClassifieds(listings),
          total: listings.length,
        };
      }

      case 'products': {
        const listings = await this.classifiedRepo
          .createQueryBuilder('c')
          .leftJoinAndSelect('c.seller', 's')
          .where("c.status = 'active'")
          .orderBy('s.reputationScore', 'DESC')
          .addOrderBy('c.createdAt', 'DESC')
          .skip(offset)
          .take(limit)
          .getMany();
        return {
          items: this.formatClassifieds(listings),
          total: listings.length,
        };
      }

      case 'services': {
        const services = await this.serviceAdRepo
          .createQueryBuilder('s')
          .leftJoinAndSelect('s.provider', 'u')
          .where("s.status = 'active'")
          .orderBy('s.rating', 'DESC')
          .addOrderBy('s.createdAt', 'DESC')
          .skip(offset)
          .take(limit)
          .getMany();
        return { items: this.formatServices(services), total: services.length };
      }

      case 'businesses': {
        const businesses = await this.userRepo
          .createQueryBuilder('u')
          .where("u.role = 'seller'")
          .andWhere('u."storeName" IS NOT NULL')
          .orderBy('u.reputationScore', 'DESC')
          .addOrderBy('u.followersCount', 'DESC')
          .skip(offset)
          .take(limit)
          .getMany();
        return {
          items: this.formatBusinesses(businesses),
          total: businesses.length,
        };
      }

      case 'for_you':
      default: {
        // Mix: followed posts + nearby + trending + recent
        const forYouFollowedSellerIds = userId
          ? await this.commerceProfiles.getFollowedSellerIds(userId).catch(() => [])
          : [];
        const [followed, trending, recent] = await Promise.all([
          forYouFollowedSellerIds.length > 0
            ? this.feedRepo
                .createQueryBuilder('f')
                .leftJoinAndSelect('f.business', 'b')
                .where('f.isActive = true')
                .andWhere('f."businessId" IN (:...ids)', {
                  ids: forYouFollowedSellerIds,
                })
                .orderBy('f.createdAt', 'DESC')
                .take(6)
                .getMany()
            : Promise.resolve([]),
          this.feedRepo
            .createQueryBuilder('f')
            .leftJoinAndSelect('f.business', 'b')
            .where('f.isActive = true')
            .andWhere('f.createdAt > :cutoff', { cutoff: cutoff7d })
            .orderBy('f.cvsScore', 'DESC')
            .take(5)
            .getMany(),
          this.classifiedRepo
            .createQueryBuilder('c')
            .leftJoinAndSelect('c.seller', 's')
            .where("c.status = 'active'")
            .andWhere('c.createdAt > :cutoff', { cutoff: cutoff48h })
            .orderBy('s.reputationScore', 'DESC')
            .take(6)
            .getMany(),
        ]);

        const [followedFormatted, trendingFormatted] = await Promise.all([
          this.formatPosts(followed, 'following'),
          this.formatPosts(trending, 'trending'),
        ]);
        const items = [
          ...followedFormatted,
          ...trendingFormatted,
          ...this.formatClassifieds(recent),
        ];

        // Deduplicate by id
        const seen = new Set<string>();
        const unique = items.filter((i) => {
          if (seen.has(i.id)) return false;
          seen.add(i.id);
          return true;
        });

        return {
          items: unique.slice(offset, offset + limit),
          total: unique.length,
        };
      }
    }
  }

  // ── Rail item shapers ──────────────────────────────────────────────────────
  // Flat {id, entityId, title, imageUrl, price, category} shape — what
  // DiscoveryRail's card and TrendingCard actually read. The previous
  // getTrending() sourced topProducts/topServices from BusinessFeedItem
  // posts wrapped as {id, data, business, ...} with no top-level title/
  // imageUrl/price/entityId at all, so both the interleaved rail and the
  // "trending now" bar silently rendered empty/icon-only cards and (via
  // DiscoveryRail's goTo()) linked to `ProductDetail-undefined`. These
  // query the real listing entities directly instead.
  private toRailProduct(p: Product): any {
    return {
      id: 'product-' + p.id,
      entityId: p.id,
      title: (p as any).name,
      imageUrl: (p as any).images?.[0] || null,
      price: (p as any).displayPrice ?? (p as any).basePrice ?? null,
      category: (p as any).category || null,
    };
  }

  private toRailClassified(c: Classified): any {
    return {
      id: 'classified-' + c.id,
      entityId: c.id,
      title: c.title,
      imageUrl: (c as any).images?.[0] || null,
      price: (c as any).flashSalePrice || (c as any).price || null,
      category: (c as any).category || null,
    };
  }

  private toRailService(s: ServiceAd): any {
    const provider = (s as any).provider;
    return {
      id: 'service-' + s.id,
      entityId: s.id,
      title: s.title,
      imageUrl: (s as any).images?.[0] || null,
      price: (s as any).price ?? null,
      category: (s as any).category || null,
      business: provider
        ? { id: provider.id, storeName: provider.storeName || provider.name, isFollowing: false }
        : null,
    };
  }

  // ── Trending summary ──────────────────────────────────────────────────────
  async getTrending(): Promise<{
    topProducts: any[];
    topClassifieds: any[];
    topBusinesses: any[];
    topServices: any[];
    topRoutes: any[];
    fastestGrowing: any[];
  }> {
    const [fastGrowing, topBiz, products, classifieds, topSvc, routes] =
      await Promise.all([
        // Fastest growing (CVS gained most in 6h) — real feed posts, unlike
        // the rail queries below which read the listing entities directly.
        this.feedRepo
          .createQueryBuilder('f')
          .leftJoinAndSelect('f.business', 'b')
          .where('f.isActive = true')
          .andWhere('f.createdAt > :cutoff', {
            cutoff: new Date(Date.now() - 6 * 60 * 60 * 1000),
          })
          .orderBy('f.cvsScore', 'DESC')
          .take(5)
          .getMany(),
        // Trending businesses (most new followers). Was `role = 'seller'
        // AND storeName IS NOT NULL` — broke for any multi-role account
        // (User.role only ever holds one value, so a seller who later
        // becomes e.g. a transport provider drops out) and for anyone who
        // applied through the normal seller flow, who only ever gets
        // businessName on SellerProfile, never User.storeName. Widened to
        // match anyone with an approved SellerProfile too, and the
        // storeName requirement dropped (formatBusinesses/the frontend
        // already fall back to the account name when storeName is null).
        this.userRepo
          .createQueryBuilder('u')
          .where(
            `(u.role = :sellerRole OR EXISTS (SELECT 1 FROM seller_profile sp WHERE sp."userId" = u.id AND sp.status = :approved))`,
            { sellerRole: 'seller', approved: SellerStatus.APPROVED },
          )
          .orderBy('u.followersCount', 'DESC')
          .take(10)
          .getMany(),
        // Recent products
        this.productRepo
          .createQueryBuilder('p')
          .where('p.isAvailable = true')
          .orderBy('p.createdAt', 'DESC')
          .take(10)
          .getMany(),
        // Recent classifieds
        this.classifiedRepo
          .createQueryBuilder('c')
          .where("c.status = 'active'")
          .orderBy('c.createdAt', 'DESC')
          .take(10)
          .getMany(),
        // Popular services
        this.serviceAdRepo
          .createQueryBuilder('s')
          .leftJoinAndSelect('s.provider', 'u')
          .where("s.status = 'active'")
          .orderBy('s.rating', 'DESC')
          .take(10)
          .getMany(),
        // Verified providers' active routes — ACTIVE is the legacy status
        // for already-onboarded Phase 2 API-integrated providers and is
        // treated as equally good-to-show everywhere else in the codebase
        // (see TransportService's own isVerified check); this query alone
        // only matched VERIFIED, which is why the transport rail was empty.
        this.routeRepo
          .createQueryBuilder('r')
          .leftJoinAndSelect('r.provider', 'p')
          .where('r.isActive = true')
          .andWhere('p.status IN (:...statuses)', {
            statuses: [ProviderStatus.VERIFIED, ProviderStatus.ACTIVE],
          })
          .orderBy('r.createdAt', 'DESC')
          .take(10)
          .getMany(),
      ]);

    const fastestGrowingFormatted = await this.formatPosts(fastGrowing, 'trending');

    // Today's published trip capacity for the shown routes — best-effort;
    // a route with nothing published today just omits the slot count
    // rather than showing a fabricated one.
    const today = new Date().toISOString().slice(0, 10);
    const routeIds = routes.map((r) => r.id);
    const availabilityByRouteId = new Map<number, number>();
    if (routeIds.length) {
      const todaysAvailability = await this.availabilityRepo.find({
        where: { routeId: In(routeIds), date: today },
      });
      for (const a of todaysAvailability) {
        if (a.routeId == null) continue;
        availabilityByRouteId.set(a.routeId, Math.max(0, a.totalSlots - a.usedSlots));
      }
    }

    const topRoutes = routes.map((r) => {
      const routeLabel =
        r.routeType === 'intercity' && r.originCity && r.destinationCity
          ? `${r.originCity} → ${r.destinationCity}`
          : r.routeType === 'local_loop' && r.loopStops?.length
            ? r.loopStops.join(' → ')
            : r.coverageCity || r.coverageWards?.join(', ') || '';
      return {
        id: 'route-' + r.id,
        entityId: r.id,
        routeType: r.routeType,
        routeLabel,
        location: r.originCity || r.coverageCity || null,
        pricePerKg: r.pricePerKg || null,
        fixedFee: r.fixedFee || null,
        maxWeightKg: r.provider?.defaultMaxWeightKg || null,
        slotsAvailable: availabilityByRouteId.get(r.id) ?? null,
        provider: {
          id: r.provider?.userId,
          name: r.provider?.name,
          logoUrl: r.provider?.logoUrl || null,
        },
      };
    });

    return {
      topProducts: products.map((p) => this.toRailProduct(p)),
      topClassifieds: classifieds.map((c) => this.toRailClassified(c)),
      fastestGrowing: fastestGrowingFormatted,
      topBusinesses: this.formatBusinesses(topBiz),
      topServices: topSvc.map((s) => this.toRailService(s)),
      topRoutes,
    };
  }

  // ── Discover feed (for homepage) ─────────────────────────────────────────
  async getDiscoverFeed(userId?: number): Promise<{
    suggestedSellers: any[];
    suggestedServices: any[];
    nearbyListings: any[];
    followedFeed: any[];
    hasFollows: boolean;
  }> {
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const [sellers, services, listings] = await Promise.all([
      // Same widening this session already applied elsewhere: role-only
      // matching breaks for multi-role accounts, and storeName-only
      // matching excludes anyone who applied through the normal seller
      // flow (businessName lives on SellerProfile, not User.storeName).
      this.userRepo
        .createQueryBuilder('u')
        .where(
          `(u.role IN ('seller', 'admin', 'manager') OR EXISTS (SELECT 1 FROM seller_profile sp WHERE sp."userId" = u.id AND sp.status = 'approved'))`,
        )
        .orderBy('u.createdAt', 'DESC')
        .take(12)
        .getMany(),
      this.serviceAdRepo
        .createQueryBuilder('s')
        .leftJoinAndSelect('s.provider', 'u')
        .where("s.status = 'active'")
        .orderBy('s.rating', 'DESC')
        .take(6)
        .getMany(),
      this.classifiedRepo
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.seller', 's')
        .where("c.status = 'active'")
        .andWhere('c.createdAt > :cutoff', { cutoff: cutoff48h })
        .orderBy('s.reputationScore', 'DESC')
        .take(8)
        .getMany(),
    ]);

    let followedFeed: any[] = [];
    let followedSellerIds = new Set<number>();

    if (userId) {
      const ids = await this.commerceProfiles
        .getFollowedSellerIds(userId)
        .catch(() => []);
      followedSellerIds = new Set(ids);

      if (followedSellerIds.size > 0) {
        const followed = await this.feedRepo
          .createQueryBuilder('f')
          .leftJoinAndSelect('f.business', 'b')
          .where('f.isActive = true')
          .andWhere('f."businessId" IN (:...ids)', { ids })
          .andWhere('(f.expiresAt IS NULL OR f.expiresAt > NOW())')
          .orderBy('f.createdAt', 'DESC')
          .take(20)
          .getMany();

        followedFeed = await this.formatPosts(followed, 'business_post');
      }
    }

    // Each suggested seller's own BUSINESS commerceProfileId — without
    // this, Story/seller cards on HomeFeed link through the bare account
    // id, which the profile page defaults to resolving as the PERSONAL
    // profile instead of the business actually shown on the card.
    const sellerProfileByOwnerId = await this.commerceProfiles
      .findMapForOwnersByType(
        sellers.map((u) => u.id),
        CommerceProfileType.BUSINESS,
      )
      .catch(() => new Map());

    return {
      suggestedSellers: sellers.map((u) => ({
        id: u.id,
        userId: u.id,
        commerceProfileId: sellerProfileByOwnerId.get(u.id)?.id || null,
        storeName: u.storeName,
        name: u.name,
        logo: u.logo,
        coverImage: u.coverImage,
        businessLocation: u.businessLocation,
        reputationScore: (u as any).reputationScore || 0,
        completedOrders: (u as any).completedOrders || 0,
        rating: u.rating || 0,
        followersCount: u.followersCount || 0,
        isFollowing: followedSellerIds.has(u.id),
      })),
      suggestedServices: services,
      nearbyListings: listings,
      followedFeed,
      hasFollows: followedSellerIds.size > 0,
    };
  }

  // ── Business feed (for profile page) ─────────────────────────────────────
  // When commerceProfileId is given, scopes to posts published as THAT
  // profile, plus any pre-existing untagged posts (commerceProfileId
  // null) — old posts never disappear, they just aren't scoped to one
  // profile the way anything published after this feature is.
  async getBusinessFeed(
    sellerId: number,
    commerceProfileId?: number,
  ): Promise<BusinessFeedItem[]> {
    return this.feedRepo.find({
      where: commerceProfileId
        ? [
            { businessId: sellerId, isActive: true, commerceProfileId },
            { businessId: sellerId, isActive: true, commerceProfileId: IsNull() },
          ]
        : { businessId: sellerId, isActive: true },
      order: { cvsScore: 'DESC', createdAt: 'DESC' },
      take: 20,
    });
  }

  async deletePost(sellerId: number, postId: number): Promise<void> {
    await this.feedRepo.update(
      { id: postId, businessId: sellerId },
      { isActive: false },
    );
  }

  // ── Format helpers ────────────────────────────────────────────────────────
  // Resolves each post's commerceProfileId to the actual CommerceProfile it
  // was published as, so the card shows and links to THAT identity (e.g. a
  // business profile) instead of the owning account's raw User record,
  // which is always what f.business resolves to and always what a bare
  // account-id link falls back to. Same fix already applied in CvsService's
  // main feed path and the story-ring moments query — this was the one
  // remaining spot (trending/following tabs, discover's followedFeed) still
  // returning the unresolved account, which is why a post published as a
  // business profile still opened the owner's personal profile on click.
  private async formatPosts(posts: BusinessFeedItem[], feedType: string) {
    const profileIds = [
      ...new Set(
        posts
          .map((f) => f.commerceProfileId)
          .filter((id): id is number => !!id),
      ),
    ];
    const profiles = profileIds.length
      ? await this.commerceProfileRepo.find({ where: { id: In(profileIds) } })
      : [];
    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    return posts.map((f) => {
      const rawBiz = (f as any).business;
      const profile = f.commerceProfileId
        ? profileMap.get(f.commerceProfileId)
        : null;
      const business = rawBiz
        ? {
            ...rawBiz,
            ...(profile
              ? {
                  commerceProfileId: profile.id,
                  name: profile.displayName,
                  storeName: profile.displayName,
                  logo: profile.photoUrl || rawBiz.logo,
                  followersCount: profile.followersCount,
                  isVerified: profile.isVerified,
                }
              : {}),
          }
        : rawBiz;
      return {
        id: 'feed-' + f.id,
        feedType,
        createdAt: f.createdAt,
        data: f,
        business,
        cvsScore: f.cvsScore,
        saveCount: f.saveCount,
        commentCount: f.commentCount,
        purchaseCount: f.purchaseCount,
      };
    });
  }

  private formatClassifieds(items: any[]) {
    return items.map((c) => ({
      id: 'classified-' + c.id,
      feedType: 'product',
      createdAt: c.createdAt,
      data: c,
      business: c.seller,
    }));
  }

  private formatServices(items: any[]) {
    return items.map((s) => ({
      id: 'service-' + s.id,
      feedType: 'service',
      createdAt: s.createdAt,
      data: s,
      business: s.provider,
    }));
  }

  private formatBusinesses(items: any[]) {
    return items.map((u) => ({
      id: 'biz-' + u.id,
      feedType: 'business',
      createdAt: u.createdAt,
      data: u,
      business: u,
    }));
  }

  // ── Notify followers ──────────────────────────────────────────────────────
  private async notifyFollowers(
    sellerId: number,
    item: BusinessFeedItem,
  ): Promise<void> {
    // The post's own commerceProfileId (which identity it was actually
    // published as) wins over the account's raw User fields — otherwise a
    // moment shared while the PERSONAL profile was active still announces
    // itself under the account's business storeName. actionCommerceProfileId
    // below already correctly used item.commerceProfileId; this was the one
    // place still pulling the display name from a completely different,
    // profile-agnostic source.
    const itemCommerceProfileId = (item as any).commerceProfileId as
      | number
      | null
      | undefined;
    const commerceProfile = itemCommerceProfileId
      ? await this.commerceProfileRepo
          .findOne({ where: { id: itemCommerceProfileId } })
          .catch(() => null)
      : null;
    const business = await this.userRepo.findOne({ where: { id: sellerId } });
    const bizName =
      commerceProfile?.displayName ||
      business?.storeName ||
      business?.name ||
      'Biashara';
    // Profile-scoped followers of this exact profile always get notified;
    // legacy account-level followers only when this post was published
    // under the account's own BUSINESS profile (see
    // CommerceProfilesService.getPostNotificationAudience for why) — this
    // is what stops a personal-profile moment from blasting every legacy
    // business-follower, and starts profile-scoped followers receiving
    // anything at all.
    const followerIds = await this.commerceProfiles
      .getPostNotificationAudience(sellerId, itemCommerceProfileId)
      .catch(() => []);
    for (const followerId of followerIds) {
      this.notifService
        .businessFeedPost(
          followerId,
          bizName,
          item.title,
          sellerId,
          (item as any).commerceProfileId,
        )
        .catch(() => {});
    }
  }
}
