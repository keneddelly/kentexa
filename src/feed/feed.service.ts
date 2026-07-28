/**
 * FeedService — Commerce feed with CVS algorithm
 * Place at: src/feed/feed.service.ts
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
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
    private readonly notifService: InAppNotificationService,
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
    },
  ): Promise<BusinessFeedItem> {
    const item = await this.feedRepo.save(
      this.feedRepo.create({
        businessId: sellerId,
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
      const rows: { sellerId: number }[] = await this.feedRepo
        .query('SELECT "sellerId" FROM follow WHERE "followerId" = $1', [
          viewerId,
        ])
        .catch(() => []);
      followedIds = new Set(rows.map((r) => r.sellerId));
    }

    return unique.map((m) => ({
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
        name: m.business?.name,
        storeName: m.business?.storeName,
        logo: m.business?.logo,
        businessLocation: (m.business as any)?.businessLocation,
        isVerified: (m.business as any)?.isVerified,
        isFollowing: m.business ? followedIds.has(m.business.id) : false,
      },
    }));
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
          items: this.formatPosts(posts, 'trending'),
          total: posts.length,
        };
      }

      case 'following': {
        if (!userId) return { items: [], total: 0 };
        const posts = await this.feedRepo
          .createQueryBuilder('f')
          .leftJoinAndSelect('f.business', 'b')
          .innerJoin(
            'follow',
            'sf',
            'sf."sellerId" = f."businessId" AND sf."followerId" = :uid',
            { uid: userId },
          )
          .where('f.isActive = true')
          .andWhere('(f.expiresAt IS NULL OR f.expiresAt > NOW())')
          .orderBy('f.createdAt', 'DESC')
          .skip(offset)
          .take(limit)
          .getMany();
        return {
          items: this.formatPosts(posts, 'following'),
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
        const [followed, trending, recent] = await Promise.all([
          userId
            ? this.feedRepo
                .createQueryBuilder('f')
                .leftJoinAndSelect('f.business', 'b')
                .innerJoin(
                  'follow',
                  'sf',
                  'sf."sellerId" = f."businessId" AND sf."followerId" = :uid',
                  { uid: userId },
                )
                .where('f.isActive = true')
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

        const items = [
          ...this.formatPosts(followed, 'following'),
          ...this.formatPosts(trending, 'trending'),
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

  // ── Trending summary ──────────────────────────────────────────────────────
  async getTrending(): Promise<{
    topProducts: any[];
    topBusinesses: any[];
    topServices: any[];
    topRoutes: any[];
    fastestGrowing: any[];
  }> {
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [topPosts, fastGrowing, topBiz, topSvc] = await Promise.all([
      // Most purchased today
      this.feedRepo
        .createQueryBuilder('f')
        .leftJoinAndSelect('f.business', 'b')
        .where('f.isActive = true')
        .andWhere('f.createdAt > :cutoff', { cutoff: cutoff24h })
        .orderBy('f.purchaseCount', 'DESC')
        .take(5)
        .getMany(),
      // Fastest growing (CVS gained most in 6h)
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
      // Trending businesses (most new followers)
      this.userRepo
        .createQueryBuilder('u')
        .where("u.role = 'seller'")
        .andWhere('u."storeName" IS NOT NULL')
        .orderBy('u.followersCount', 'DESC')
        .take(5)
        .getMany(),
      // Popular services
      this.serviceAdRepo
        .createQueryBuilder('s')
        .leftJoinAndSelect('s.provider', 'u')
        .where("s.status = 'active'")
        .orderBy('s.rating', 'DESC')
        .take(5)
        .getMany(),
    ]);

    return {
      topProducts: this.formatPosts(topPosts, 'trending'),
      fastestGrowing: this.formatPosts(fastGrowing, 'trending'),
      topBusinesses: this.formatBusinesses(topBiz),
      topServices: this.formatServices(topSvc),
      topRoutes: [], // populated from transport data
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
      this.userRepo
        .createQueryBuilder('u')
        .where("u.role IN ('seller', 'admin', 'manager')")
        .andWhere('u."storeName" IS NOT NULL')
        .andWhere('u."storeName" != \'\'')
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
      const rows: { sellerId: number }[] = await this.feedRepo
        .query('SELECT "sellerId" FROM follow WHERE "followerId" = $1', [
          userId,
        ])
        .catch(() => []);
      followedSellerIds = new Set(rows.map((r) => r.sellerId));

      if (followedSellerIds.size > 0) {
        const followed = await this.feedRepo
          .createQueryBuilder('f')
          .leftJoinAndSelect('f.business', 'b')
          .innerJoin(
            'follow',
            'sf',
            'sf."sellerId" = f."businessId" AND sf."followerId" = :uid',
            { uid: userId },
          )
          .where('f.isActive = true')
          .andWhere('(f.expiresAt IS NULL OR f.expiresAt > NOW())')
          .orderBy('f.createdAt', 'DESC')
          .take(20)
          .getMany();

        followedFeed = followed.map((f) => ({
          id: 'feed-' + f.id,
          feedType: 'business_post',
          createdAt: f.createdAt,
          data: f,
          business: f.business,
          cvsScore: f.cvsScore,
          saveCount: f.saveCount,
          commentCount: f.commentCount,
        }));
      }
    }

    return {
      suggestedSellers: sellers.map((u) => ({
        id: u.id,
        userId: u.id,
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
  async getBusinessFeed(sellerId: number): Promise<BusinessFeedItem[]> {
    return this.feedRepo.find({
      where: { businessId: sellerId, isActive: true },
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
  private formatPosts(posts: BusinessFeedItem[], feedType: string) {
    return posts.map((f) => ({
      id: 'feed-' + f.id,
      feedType,
      createdAt: f.createdAt,
      data: f,
      business: (f as any).business,
      cvsScore: f.cvsScore,
      saveCount: f.saveCount,
      commentCount: f.commentCount,
      purchaseCount: f.purchaseCount,
    }));
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
    const business = await this.userRepo.findOne({ where: { id: sellerId } });
    const bizName = business?.storeName || business?.name || 'Biashara';
    const followers: { followerId: number }[] = await this.feedRepo
      .query('SELECT "followerId" FROM follow WHERE "sellerId" = $1', [
        sellerId,
      ])
      .catch(() => []);
    for (const f of followers) {
      this.notifService
        .businessFeedPost(f.followerId, bizName, item.title, sellerId)
        .catch(() => {});
    }
  }
}
