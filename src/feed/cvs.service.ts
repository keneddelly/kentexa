/**
 * CvsService — Commerce Value Score engine
 * Place at: src/feed/cvs.service.ts
 *
 * Computes and updates CVS whenever a commerce action fires.
 * CVS = Purchases×10 + Shipments×8 + Saves×3 + Comments×2 + Shares×1 + Views×0.5
 */
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import { BusinessFeedItem } from '../business/entities/business-feed-item.entity';
import {
  PostEngagement,
  EngagementType,
  CVS_WEIGHTS,
} from './entities/post-engagement.entity';
import { Classified } from '../classifieds/entities/classified.entity';
import { Product } from '../products/entities/products.entity';
import { ServiceAd } from '../services/entities/service-ad.entity';
import { TransportRoute } from '../transport/entities/transport-route.entity';
import { ProviderAvailability } from '../transport/entities/provider-availability.entity';
import { ProviderStatus } from '../transport/entities/transport-provider.entity';
import {
  PostComment,
  PostCommentType,
  PurchaseVerification,
} from './entities/post-comment.entity';
import { User } from '../users/entities/user.entity';
import { CommerceProfile, CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { EntityOwnerResolver } from './engagements.controller';
import { PurchaseVerificationService } from './comment-support.service';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';

@Injectable()
export class CvsService {
  private readonly logger = new Logger(CvsService.name);

  constructor(
    @InjectRepository(BusinessFeedItem)
    private feedRepo: Repository<BusinessFeedItem>,
    @InjectRepository(PostEngagement)
    private engageRepo: Repository<PostEngagement>,
    @InjectRepository(PostComment) private commentRepo: Repository<PostComment>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Classified)
    private classifiedRepo: Repository<Classified>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(ServiceAd) private serviceAdRepo2: Repository<ServiceAd>,
    @InjectRepository(TransportRoute)
    private routeRepo: Repository<TransportRoute>,
    @InjectRepository(ProviderAvailability)
    private availabilityRepo: Repository<ProviderAvailability>,
    @InjectRepository(CommerceProfile)
    private commerceProfileRepo: Repository<CommerceProfile>,
    private readonly notifService: InAppNotificationService,
    private readonly owners: EntityOwnerResolver,
    private readonly purchaseVerification: PurchaseVerificationService,
    private readonly commerceProfiles: CommerceProfilesService,
  ) {}

  // ── Record engagement + update CVS ───────────────────────────────────────
  async engage(
    userId: number,
    postId: number,
    type: EngagementType,
  ): Promise<{
    toggled: boolean;
    newCvs: number;
  }> {
    // VIEW is always recorded (no toggle)
    if (type === EngagementType.VIEW) {
      await this.engageRepo
        .save(this.engageRepo.create({ userId, postId, type }))
        .catch(() => {}); // ignore duplicate
      await this.recalculate(postId);
      return { toggled: true, newCvs: 0 };
    }

    // Others toggle (save/share/etc)
    const existing = await this.engageRepo.findOne({
      where: { userId, postId, type },
    });
    if (existing) {
      await this.engageRepo.delete(existing.id);
    } else {
      await this.engageRepo.save(
        this.engageRepo.create({ userId, postId, type }),
      );
    }

    const newCvs = await this.recalculate(postId);
    const toggled = !existing;

    // Notify the post owner on a brand-new save (not on unsave)
    if (toggled && type === EngagementType.SAVE) {
      this.notifyOwnerOfPost(userId, postId, 'save').catch(() => {});
    }

    return { toggled, newCvs };
  }

  // ── Add comment (optionally an "I Have This" offer reply) ─────────────────
  async addComment(
    userId: number,
    postId: number,
    body: string,
    parentId?: number,
    offer?: { entityType: string; entityId: number },
    extra?: {
      type?: PostCommentType;
      rating?: number;
      media?: { url: string; type: 'image' | 'video' }[];
      offlinePurchaseClaim?: boolean;
    },
    commerceProfileId?: number | null,
  ): Promise<any> {
    // ── Unification: if this Moment is tagged to a real product/listing/
    // service, its comment thread IS that entity's own thread — not a
    // separate one. A review left here shows up on ProductDetail.js too,
    // and vice versa, because it's literally the same rows.
    const post = await this.feedRepo.findOne({ where: { id: postId } });
    const linked =
      post?.linkedEntityType && post?.linkedEntityId
        ? { entityType: post.linkedEntityType, entityId: post.linkedEntityId }
        : null;

    const type = extra?.type || PostCommentType.COMMENT;
    if (type === PostCommentType.REVIEW && !linked) {
      throw new BadRequestException(
        'Reviews can only be posted on a Moment tagged to a product, listing, or service.',
      );
    }
    if (type === PostCommentType.REVIEW && !extra?.rating) {
      throw new BadRequestException(
        'A star rating (1-5) is required for a review.',
      );
    }
    if (
      type === PostCommentType.REVIEW &&
      !body?.trim() &&
      !extra?.media?.length
    ) {
      throw new BadRequestException('A review needs text or a photo/video.');
    }

    let offerEntityType: string | null = null;
    let offerEntityId: number | null = null;
    if (offer?.entityType && offer?.entityId) {
      // Only allow tagging something the replier actually owns —
      // otherwise anyone could falsely claim to have a product.
      const owned = await this.owners.resolve(offer.entityType, offer.entityId);
      if (owned && owned.ownerId === userId) {
        offerEntityType = offer.entityType;
        offerEntityId = offer.entityId;
      }
    }

    const purchaseVerification =
      type === PostCommentType.REVIEW && linked
        ? await this.purchaseVerification.resolve(
            userId,
            linked.entityType,
            linked.entityId,
            extra?.offlinePurchaseClaim,
          )
        : PurchaseVerification.NONE;

    const comment = await this.commentRepo.save(
      this.commentRepo.create({
        // Linked → store under the entity (unified thread). Not linked
        // (plain Moment, Looking For) → keep the original postId-only thread.
        postId: linked ? null : postId,
        entityType: linked ? linked.entityType : null,
        entityId: linked ? linked.entityId : null,
        authorId: userId,
        commerceProfileId: commerceProfileId || null,
        body: body?.trim() || null,
        parentId: parentId || null,
        type,
        rating: type === PostCommentType.REVIEW ? extra!.rating! : null,
        media: extra?.media?.length ? extra.media : null,
        purchaseVerification,
        offerEntityType,
        offerEntityId,
      }),
    );

    // Comment engagement + CVS recalculation always credit the Moment's
    // own postId, regardless of where the comment row itself is stored —
    // the Moment should still get "more active" for the activity it drove.
    await this.engageRepo
      .save(
        this.engageRepo.create({
          userId,
          postId,
          type: EngagementType.COMMENT,
        }),
      )
      .catch(() => {});

    await this.recalculate(postId);

    // Notify post author (fire-and-forget, never blocks the response)
    if (offerEntityType) {
      this.notifyOwnerOfPost(userId, postId, 'offer', body, commerceProfileId).catch(() => {});
    } else {
      this.notifyOwnerOfPost(userId, postId, 'comment', body, commerceProfileId).catch(() => {});
    }

    const saved = (await this.commentRepo.findOne({
      where: { id: comment.id },
      relations: { author: true },
    })) as PostComment;

    return this.attachOfferCards([saved]).then((r) => r[0]);
  }

  // ── Enrich comments (and their replies) with resolved offer card data ────
  private async attachOfferCards(comments: PostComment[]): Promise<any[]> {
    const flat: PostComment[] = [];
    comments.forEach((c) => {
      flat.push(c);
      (c.replies || []).forEach((r) => flat.push(r));
    });

    const tagged = flat.filter((c) => c.offerEntityType && c.offerEntityId);
    const cards = await Promise.all(
      tagged.map((c) =>
        this.owners.resolveOfferCard(
          c.offerEntityType as string,
          c.offerEntityId as number,
        ),
      ),
    );
    const cardMap = new Map<string, any>();
    tagged.forEach((c, i) => {
      if (cards[i])
        cardMap.set(`${c.offerEntityType}-${c.offerEntityId}`, cards[i]);
    });

    // Resolve which CommerceProfile each commenter was acting as, so the
    // thread shows the business/agent/etc. identity they actually commented
    // as — not always their personal account, the same identity-bleed gap
    // "Sold by" links and the Home feed had before this pass.
    const profileIds = [
      ...new Set(
        flat.map((c) => c.commerceProfileId).filter((id): id is number => !!id),
      ),
    ];
    const profiles = profileIds.length
      ? await this.commerceProfileRepo.find({ where: { id: In(profileIds) } })
      : [];
    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    const enrich = (c: PostComment): any => ({
      ...c,
      offerCard:
        c.offerEntityType && c.offerEntityId
          ? cardMap.get(`${c.offerEntityType}-${c.offerEntityId}`) || null
          : null,
      commerceProfile: c.commerceProfileId
        ? (() => {
            const p = profileMap.get(c.commerceProfileId);
            return p
              ? {
                  id: p.id,
                  type: p.type,
                  username: p.username,
                  displayName: p.displayName,
                  photoUrl: p.photoUrl,
                }
              : null;
          })()
        : null,
      replies: (c.replies || []).map(enrich),
    });
    return comments.map(enrich);
  }

  // ── Notify a real feed post's owner about a save or comment ──────────────
  private async notifyOwnerOfPost(
    actorId: number,
    postId: number,
    kind: 'save' | 'comment' | 'offer',
    commentBody?: string,
    actorCommerceProfileId?: number | null,
  ): Promise<void> {
    const post = await this.feedRepo.findOne({ where: { id: postId } });
    if (!post || post.businessId === actorId) return; // don't notify yourself

    const actor = await this.userRepo.findOne({ where: { id: actorId } });
    // The actor's own acting-as profile (stored on the comment, when this
    // fires for a comment/offer) wins over their raw account name.
    const actorProfile = actorCommerceProfileId
      ? await this.commerceProfileRepo.findOne({ where: { id: actorCommerceProfileId } }).catch(() => null)
      : null;
    const actorName = actorProfile?.displayName || actor?.storeName || actor?.name || 'Someone';
    const postTitle = post.title || 'your post';
    // Which specific profile owns this post — without it, tapping the
    // notification falls back to CommerceProfile.js's ambiguous-bare-id
    // default (the owner's personal profile), regardless of which of the
    // owner's profiles this post actually belongs to.
    const ownerCommerceProfileId = (post as any).commerceProfileId || undefined;

    if (kind === 'save') {
      await this.notifService.notify({
        userId: post.businessId,
        type: 'save',
        title: '❤️ New save',
        body: `${actorName} saved "${postTitle}"`,
        icon: '❤️',
        actionPage: 'CommerceProfile',
        // "-feed-{postId}" lands on the Posts/Feed tab and scrolls to/
        // highlights this exact post (see CommerceProfile.js pageParam parsing).
        actionParam: `${post.businessId}-feed-${postId}`,
        actionCommerceProfileId: ownerCommerceProfileId,
      });
    } else if (kind === 'offer') {
      // A seller replied to a Looking For post with a matching item —
      // this is the moment that actually closes the loop for the buyer.
      await this.notifService.notify({
        userId: post.businessId,
        type: 'offer',
        title: '🙋 Someone has what you\u2019re looking for',
        body: `${actorName} has an item matching "${postTitle}"`,
        icon: '🙋',
        actionPage: 'CommerceProfile',
        // "-feed-{postId}" lands on the Posts/Feed tab and scrolls to/
        // highlights this exact post (see CommerceProfile.js pageParam parsing).
        actionParam: `${post.businessId}-feed-${postId}`,
        actionCommerceProfileId: ownerCommerceProfileId,
      });
    } else {
      const preview =
        (commentBody || '').slice(0, 60) +
        ((commentBody || '').length > 60 ? '...' : '');
      await this.notifService.notify({
        userId: post.businessId,
        type: 'comment',
        title: '💬 New comment',
        body: `${actorName}: "${preview}"`,
        icon: '💬',
        actionPage: 'CommerceProfile',
        // "-feed-{postId}" lands on the Posts/Feed tab and scrolls to/
        // highlights this exact post (see CommerceProfile.js pageParam parsing).
        actionParam: `${post.businessId}-feed-${postId}`,
        actionCommerceProfileId: ownerCommerceProfileId,
      });
    }
  }

  // ── Get comments for a post ───────────────────────────────────────────────
  // Unified: a Moment tagged to a real entity reads that entity's own
  // thread — same reviews/questions/comments a product/listing/service
  // page shows, not a separate Moment-only list.
  async getComments(postId: number): Promise<any[]> {
    const post = await this.feedRepo.findOne({ where: { id: postId } });
    const linked =
      post?.linkedEntityType && post?.linkedEntityId
        ? { entityType: post.linkedEntityType, entityId: post.linkedEntityId }
        : null;

    const comments = await this.commentRepo.find({
      where: linked
        ? {
            entityType: linked.entityType,
            entityId: linked.entityId,
            parentId: IsNull(),
            isDeleted: false,
          }
        : { postId, parentId: IsNull(), isDeleted: false },
      relations: { author: true, replies: { author: true } },
      order: { createdAt: 'ASC' },
    });
    return this.attachOfferCards(comments);
  }

  // ── Delete comment ────────────────────────────────────────────────────────
  async deleteComment(userId: number, commentId: number): Promise<void> {
    const c = await this.commentRepo.findOne({ where: { id: commentId } });
    if (!c) return;
    if (c.authorId !== userId) return; // can only delete own
    c.isDeleted = true;
    c.body = '[Deleted]';
    await this.commentRepo.save(c);
  }

  // ── Recalculate CVS for a post ────────────────────────────────────────────
  async recalculate(postId: number): Promise<number> {
    const counts = await this.engageRepo
      .createQueryBuilder('e')
      .select('e.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('e.postId = :postId', { postId })
      .groupBy('e.type')
      .getRawMany();

    let cvs = 0;
    const updateData: any = {
      saveCount: 0,
      commentCount: 0,
      shareCount: 0,
      purchaseCount: 0,
      shipmentCount: 0,
      viewCount: 0,
    };

    for (const row of counts) {
      const type = row.type as EngagementType;
      const count = Number(row.count);
      const weight = CVS_WEIGHTS[type] || 0;
      cvs += count * weight;

      const fieldMap: Record<EngagementType, string> = {
        [EngagementType.SAVE]: 'saveCount',
        [EngagementType.COMMENT]: 'commentCount',
        [EngagementType.SHARE]: 'shareCount',
        [EngagementType.VIEW]: 'viewCount',
        [EngagementType.PURCHASE]: 'purchaseCount',
        [EngagementType.SHIPMENT]: 'shipmentCount',
      };
      if (fieldMap[type]) updateData[fieldMap[type]] = count;
    }

    updateData.cvsScore = Math.round(cvs * 10) / 10;
    await this.feedRepo.update(postId, updateData);
    return updateData.cvsScore;
  }

  // ── Get user's saved post IDs (real posts + virtual entities) ────────────
  async getSavedPostIds(userId: number): Promise<(number | string)[]> {
    const rows = await this.engageRepo.find({
      where: { userId, type: EngagementType.SAVE },
    });
    const prefixMap: Record<string, string> = {
      classified: 'cls',
      product: 'prd',
      service: 'svc',
    };
    return rows
      .map((r) => {
        if (r.postId) return r.postId;
        if (r.entityType && r.entityId) {
          const prefix = prefixMap[r.entityType] || r.entityType;
          return `${prefix}-${r.entityId}`;
        }
        return null;
      })
      .filter((v): v is number | string => v !== null);
  }

  // ── Everything a user has saved, with full display data, one unified list ──
  async getMySavedItems(userId: number): Promise<any[]> {
    const rows = await this.engageRepo.find({
      where: { userId, type: EngagementType.SAVE },
      order: { createdAt: 'DESC' },
    });
    if (!rows.length) return [];

    const postIds: number[] = [];
    const byType: Record<string, number[]> = {
      classified: [],
      product: [],
      service: [],
      route: [],
    };
    const savedAtByKey = new Map<string, Date>();

    rows.forEach((r) => {
      if (r.postId) {
        postIds.push(r.postId);
        savedAtByKey.set(`post-${r.postId}`, r.createdAt);
      } else if (r.entityType && r.entityId && byType[r.entityType]) {
        byType[r.entityType].push(r.entityId);
        savedAtByKey.set(`${r.entityType}-${r.entityId}`, r.createdAt);
      }
    });

    const [posts, classifieds, products, services, routes] = await Promise.all([
      postIds.length
        ? this.feedRepo
            .createQueryBuilder('f')
            .leftJoin('f.business', 'b')
            .addSelect(['b.id', 'b.name', 'b.storeName', 'b.logo'])
            .where('f.id IN (:...ids)', { ids: postIds })
            .getMany()
        : [],
      byType.classified.length
        ? this.classifiedRepo
            .createQueryBuilder('c')
            .leftJoin('c.seller', 's')
            .addSelect(['s.id', 's.name', 's.storeName', 's.logo'])
            .where('c.id IN (:...ids)', { ids: byType.classified })
            .getMany()
        : [],
      byType.product.length
        ? this.productRepo
            .createQueryBuilder('p')
            .leftJoin('p.seller', 's')
            .addSelect(['s.id', 's.name', 's.storeName', 's.logo'])
            .where('p.id IN (:...ids)', { ids: byType.product })
            .getMany()
        : [],
      byType.service.length
        ? this.serviceAdRepo2
            .createQueryBuilder('a')
            .leftJoin('a.provider', 'u')
            .addSelect(['u.id', 'u.name', 'u.storeName', 'u.logo'])
            .where('a.id IN (:...ids)', { ids: byType.service })
            .getMany()
        : [],
      byType.route.length
        ? this.routeRepo.find({ where: { id: In(byType.route) }, relations: { provider: true } })
        : [],
    ]);

    const items: any[] = [];

    posts.forEach((p: any) =>
      items.push({
        type: 'moment',
        id: p.id,
        title: p.title,
        image: p.imageUrl || null,
        price: null,
        business: p.business
          ? {
              id: p.business.id,
              name: p.business.storeName || p.business.name,
              logo: p.business.logo,
            }
          : null,
        savedAt: savedAtByKey.get(`post-${p.id}`),
        linkedEntityType: p.linkedEntityType,
        linkedEntityId: p.linkedEntityId,
      }),
    );

    classifieds.forEach((c: any) =>
      items.push({
        type: 'classified',
        id: c.id,
        title: c.title,
        image: c.images?.[0] || null,
        price: c.flashSalePrice || c.price || null,
        business: c.seller
          ? {
              id: c.seller.id,
              name: c.seller.storeName || c.seller.name,
              logo: c.seller.logo,
            }
          : null,
        savedAt: savedAtByKey.get(`classified-${c.id}`),
      }),
    );

    products.forEach((p: any) =>
      items.push({
        type: 'product',
        id: p.id,
        title: p.name,
        image: p.images?.[0] || null,
        price: p.displayPrice || p.basePrice || null,
        business: p.seller
          ? {
              id: p.seller.id,
              name: p.seller.storeName || p.seller.name,
              logo: p.seller.logo,
            }
          : null,
        savedAt: savedAtByKey.get(`product-${p.id}`),
      }),
    );

    services.forEach((s: any) =>
      items.push({
        type: 'service',
        id: s.id,
        title: s.title,
        image: s.images?.[0] || null,
        price: s.price || null,
        business: s.provider
          ? {
              id: s.provider.id,
              name: s.provider.storeName || s.provider.name,
              logo: s.provider.logo,
            }
          : null,
        savedAt: savedAtByKey.get(`service-${s.id}`),
      }),
    );

    routes.forEach((r: any) => {
      const title =
        r.routeType === 'intercity' && r.originCity && r.destinationCity
          ? `${r.originCity} \u2192 ${r.destinationCity}`
          : r.routeType === 'local_loop' && r.loopStops?.length
            ? r.loopStops.join(' \u2192 ')
            : r.coverageWards?.length
              ? `${r.coverageCity || ''} \u2014 ${r.coverageWards.slice(0, 3).join(', ')}`
              : 'Route';
      items.push({
        type: 'route',
        id: r.id,
        title,
        image: null,
        price: null,
        business: r.provider
          ? {
              id: r.provider.userId,
              name: r.provider.name,
              logo: r.provider.logoUrl,
            }
          : null,
        savedAt: savedAtByKey.get(`route-${r.id}`),
      });
    });

    return items.sort(
      (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
    );
  }

  // ── Set of sellerIds the given user follows ───────────────────────────────
  private async getFollowedSellerIds(
    userId?: number | null,
  ): Promise<Set<number>> {
    if (!userId) return new Set();
    const ids = await this.commerceProfiles
      .getFollowedSellerIds(userId)
      .catch(() => []);
    return new Set(ids);
  }

  // ── Real save/comment counts for a batch of virtual entities ─────────────
  private async getEntityCounts(
    entityType: string,
    entityIds: number[],
  ): Promise<Map<number, { saves: number; comments: number }>> {
    const map = new Map<number, { saves: number; comments: number }>();
    entityIds.forEach((id) => map.set(id, { saves: 0, comments: 0 }));
    if (!entityIds.length) return map;

    const [saveRows, commentRows] = await Promise.all([
      this.engageRepo
        .createQueryBuilder('e')
        .select('e.entityId', 'entityId')
        .addSelect('COUNT(*)', 'count')
        .where('e.entityType = :entityType', { entityType })
        .andWhere('e.entityId IN (:...ids)', { ids: entityIds })
        .andWhere('e.type = :type', { type: EngagementType.SAVE })
        .groupBy('e.entityId')
        .getRawMany()
        .catch(() => []),
      this.commentRepo
        .createQueryBuilder('c')
        .select('c.entityId', 'entityId')
        .addSelect('COUNT(*)', 'count')
        .where('c.entityType = :entityType', { entityType })
        .andWhere('c.entityId IN (:...ids)', { ids: entityIds })
        .andWhere('c.isDeleted = false')
        .groupBy('c.entityId')
        .getRawMany()
        .catch(() => []),
    ]);

    saveRows.forEach((r: any) => {
      const e = map.get(Number(r.entityId));
      if (e) e.saves = Number(r.count);
    });
    commentRows.forEach((r: any) => {
      const e = map.get(Number(r.entityId));
      if (e) e.comments = Number(r.count);
    });
    return map;
  }

  // ── Trending feed (CVS-ranked, with cold-start fallbacks) ─────────────────
  async getTrending(
    limit = 10,
    userId?: number | null,
  ): Promise<{
    topPurchased: any[];
    fastestGrowing: any[];
    topBusinesses: any[];
    topServices: any[];
    topRoutes: any[];
    topProducts: any[];
    topClassifieds: any[];
  }> {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since6h = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const followedSellerIds = await this.getFollowedSellerIds(userId);

    const base = this.feedRepo
      .createQueryBuilder('f')
      .leftJoin('f.business', 'b')
      .addSelect([
        'b.id',
        'b.name',
        'b.storeName',
        'b.logo',
        'b.businessLocation',
        'b.reputationScore',
        'b.followersCount',
        'b.isVerified',
        'b.isOfficialStore',
        'b.storeWhatsApp',
        'b.phone',
        'b.role',
      ])
      .where('f.isActive = true');

    let [topPurchased, fastestGrowing, topBusinesses, topServices, topRoutes] =
      (await Promise.all([
        // Most purchased today
        base
          .clone()
          .andWhere('f.createdAt > :since', { since: since24h })
          .orderBy('f.purchaseCount', 'DESC')
          .addOrderBy('f.cvsScore', 'DESC')
          .take(limit)
          .getMany(),

        // Fastest growing CVS (last 6 hours)
        base
          .clone()
          .andWhere('f.createdAt > :since', { since: since6h })
          .orderBy('f.cvsScore', 'DESC')
          .take(limit)
          .getMany(),

        // Top businesses by saves + comments
        base
          .clone()
          .andWhere("f.type = 'new_product' OR f.type = 'announcement'")
          .orderBy('f.saveCount', 'DESC')
          .addOrderBy('f.commentCount', 'DESC')
          .addOrderBy('b.followersCount', 'DESC')
          .take(limit)
          .getMany(),

        // Top services
        base
          .clone()
          .andWhere("f.type = 'new_service'")
          .orderBy('f.cvsScore', 'DESC')
          .take(limit)
          .getMany(),

        // Most requested shipment routes
        base
          .clone()
          .andWhere("f.type = 'delivery_info'")
          .orderBy('f.shipmentCount', 'DESC')
          .take(limit)
          .getMany(),
      ])) as any[];

    // ── Cold-start fallbacks: no BusinessFeedItem rows exist yet ─────────────
    if (!topBusinesses.length) {
      // Was restricted to role IN ('seller','admin','manager') AND a
      // non-empty storeName — broke for multi-role accounts (role only
      // ever holds one value) and for anyone who applied through the
      // normal seller flow, who only gets businessName on SellerProfile,
      // never User.storeName. Widened to also match an approved
      // SellerProfile; storeName requirement dropped since the mapping
      // below already falls back to u.name.
      const sellers = await this.userRepo
        .createQueryBuilder('u')
        .where(
          `(u.role IN ('seller','admin','manager') OR EXISTS (SELECT 1 FROM seller_profile sp WHERE sp."userId" = u.id AND sp.status = 'approved'))`,
        )
        .orderBy('u.followersCount', 'DESC')
        .addOrderBy('u.reputationScore', 'DESC')
        .take(limit)
        .getMany();

      topBusinesses = sellers.map((u) => ({
        id: `biz-${u.id}`,
        businessId: u.id,
        title: u.storeName || u.name,
        cvsScore: 0,
        business: {
          id: u.id,
          storeName: u.storeName,
          name: u.name,
          logo: u.logo,
          businessLocation: u.businessLocation,
          reputationScore: (u as any).reputationScore || 0,
          isFollowing: followedSellerIds.has(u.id),
        },
      }));
    }

    if (!topServices.length) {
      const svcs = await this.serviceAdRepo2
        .createQueryBuilder('s')
        .leftJoinAndSelect('s.provider', 'u')
        .where("s.status = 'active'")
        .orderBy('s.rating', 'DESC')
        .take(limit)
        .getMany();

      topServices = svcs.map((s) => ({
        id: `svc-${s.id}`,
        businessId: s.provider?.id,
        title: s.title,
        entityType: 'service',
        entityId: s.id,
        imageUrl: s.images?.[0] || null,
        price: s.price || null,
        cvsScore: 0,
        business: {
          id: s.provider?.id,
          storeName: s.provider?.storeName,
          name: s.provider?.name,
          logo: s.provider?.logo,
          isFollowing: s.provider?.id
            ? followedSellerIds.has(s.provider.id)
            : false,
        },
      }));
    }

    // topRoutes has no non-fallback source at all — it was only ever
    // populated from real BusinessFeedItem posts of type 'delivery_info',
    // which providers essentially never publish (their route data lives on
    // TransportRoute directly, not as feed posts) — so this rail was
    // always empty in practice. Same query/shape as getFilteredFeed()'s
    // 'transport' fallback above.
    if (!topRoutes.length) {
      const routes = await this.routeRepo
        .createQueryBuilder('r')
        .leftJoinAndSelect('r.provider', 'p')
        .where('r.isActive = true')
        .andWhere('p.status IN (:...statuses)', {
          statuses: [ProviderStatus.VERIFIED, ProviderStatus.ACTIVE],
        })
        .orderBy('r.createdAt', 'DESC')
        .take(limit)
        .getMany();

      topRoutes = routes.map((r) => {
        const routeLabel =
          r.routeType === 'intercity' && r.originCity && r.destinationCity
            ? `${r.originCity} → ${r.destinationCity}`
            : r.routeType === 'local_loop' && r.loopStops?.length
              ? r.loopStops.join(' → ')
              : r.coverageCity || r.coverageWards?.join(', ') || '';
        return {
          id: `rte-${r.id}`,
          businessId: r.provider?.userId,
          title: `${r.provider?.name || 'Transport'} — ${routeLabel}`,
          entityType: 'route',
          entityId: r.id,
          imageUrl: r.provider?.logoUrl || null,
          price: r.pricePerKg || null,
          cvsScore: 0,
          business: {
            id: r.provider?.userId,
            storeName: r.provider?.name,
            name: r.provider?.name,
            logo: r.provider?.logoUrl,
            isFollowing: r.provider?.userId
              ? followedSellerIds.has(r.provider.userId)
              : false,
          },
          provider: { id: r.provider?.id, name: r.provider?.name, logoUrl: r.provider?.logoUrl || null },
          routeLabel,
        };
      });
    }

    if (!topPurchased.length) {
      const products = await this.productRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.seller', 's')
        .where('p."isActive" = true')
        .andWhere('p."isAvailable" = true')
        .orderBy('p.createdAt', 'DESC')
        .take(limit)
        .getMany();

      topPurchased = products.map((p) => ({
        id: `prd-${p.id}`,
        businessId: p.seller?.id,
        title: p.name,
        entityType: 'product',
        entityId: p.id,
        imageUrl: p.images?.[0] || null,
        price: p.displayPrice || p.basePrice || null,
        cvsScore: 0,
        business: {
          id: p.seller?.id,
          storeName: p.seller?.storeName,
          name: p.seller?.name,
          logo: p.seller?.logo,
          isFollowing: p.seller?.id
            ? followedSellerIds.has(p.seller.id)
            : false,
        },
      }));
    }

    if (!fastestGrowing.length) {
      const recentClassifieds = await this.classifiedRepo
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.seller', 's')
        .where("c.status = 'active'")
        .orderBy('c.createdAt', 'DESC')
        .take(limit)
        .getMany();

      fastestGrowing = recentClassifieds.map((c) => ({
        id: `cls-${c.id}`,
        businessId: c.seller?.id,
        title: c.title,
        entityType: 'classified',
        entityId: c.id,
        imageUrl: c.images?.[0] || null,
        price: c.flashSalePrice || c.price || null,
        cvsScore: 0,
        business: {
          id: c.seller?.id,
          storeName: c.seller?.storeName,
          name: c.seller?.name,
          logo: c.seller?.logo,
          isFollowing: c.seller?.id
            ? followedSellerIds.has(c.seller.id)
            : false,
        },
      }));
    }

    // ── Dedicated Products / Classifieds rails ────────────────────────────
    // Queried directly (not derived from feed posts) so these are always
    // type-pure — topPurchased/fastestGrowing above can mix types once
    // real feed activity exists, which isn't safe for a "Products only"
    // or "Classifieds only" scrolling rail.
    const [rawProducts, rawClassifieds] = await Promise.all([
      this.productRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.seller', 's')
        .where('p."isActive" = true')
        .andWhere('p."isAvailable" = true')
        .orderBy('p.createdAt', 'DESC')
        .take(limit)
        .getMany(),
      this.classifiedRepo
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.seller', 's')
        .where("c.status = 'active'")
        .orderBy('c.createdAt', 'DESC')
        .take(limit)
        .getMany(),
    ]);

    const topProducts = rawProducts.map((p) => ({
      id: `prd-${p.id}`,
      businessId: p.seller?.id,
      title: p.name,
      entityType: 'product',
      entityId: p.id,
      imageUrl: p.images?.[0] || null,
      price: p.displayPrice || p.basePrice || null,
      business: {
        id: p.seller?.id,
        storeName: p.seller?.storeName,
        name: p.seller?.name,
        logo: p.seller?.logo,
      },
    }));

    const topClassifieds = rawClassifieds.map((c) => ({
      id: `cls-${c.id}`,
      businessId: c.seller?.id,
      title: c.title,
      entityType: 'classified',
      entityId: c.id,
      imageUrl: c.images?.[0] || null,
      price: c.flashSalePrice || c.price || null,
      business: {
        id: c.seller?.id,
        storeName: c.seller?.storeName,
        name: c.seller?.name,
        logo: c.seller?.logo,
      },
    }));

    // Every rail's `business` sub-object carries a raw account id, never a
    // commerceProfileId — the exact reason clicking a business card from
    // HomeFeed navigated to the account's PERSONAL profile instead of the
    // business one actually shown on the card (CommerceProfile.js defaults
    // a bare id to the personal profile). One batch resolution covers
    // every rail at once instead of threading it through each branch above.
    const allBusinessIds = [
      ...topPurchased,
      ...fastestGrowing,
      ...topBusinesses,
      ...topServices,
      ...topProducts,
      ...topClassifieds,
    ]
      .map((item: any) => item.business?.id)
      .filter((id): id is number => !!id);
    const businessProfileByOwnerId = await this.commerceProfiles
      .findMapForOwnersByType([...new Set(allBusinessIds)], CommerceProfileType.BUSINESS)
      .catch(() => new Map());
    for (const item of [
      ...topPurchased,
      ...fastestGrowing,
      ...topBusinesses,
      ...topServices,
      ...topProducts,
      ...topClassifieds,
    ] as any[]) {
      if (item.business?.id) {
        item.business.commerceProfileId =
          businessProfileByOwnerId.get(item.business.id)?.id || null;
      }
    }

    return {
      topPurchased,
      fastestGrowing,
      topBusinesses,
      topServices,
      topRoutes,
      topProducts,
      topClassifieds,
    };
  }

  // ── Get feed by filter with CVS ranking ──────────────────────────────────
  async getFilteredFeed(params: {
    filter: string;
    userId?: number;
    city?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: any[]; total: number }> {
    const { filter = 'for_you', userId, city, page = 1, limit = 15 } = params;
    const offset = (page - 1) * limit;
    const followedSellerIds = await this.getFollowedSellerIds(userId);

    const qb = this.feedRepo
      .createQueryBuilder('f')
      .leftJoin('f.business', 'b')
      .addSelect([
        'b.id',
        'b.name',
        'b.storeName',
        'b.logo',
        'b.businessLocation',
        'b.reputationScore',
        'b.followersCount',
        'b.isVerified',
        'b.isOfficialStore',
        'b.storeWhatsApp',
        'b.phone',
        'b.role',
      ])
      .where('f.isActive = true')
      .andWhere('(f.expiresAt IS NULL OR f.expiresAt > NOW())');

    switch (filter) {
      case 'following':
        if (!userId) {
          return { items: [], total: 0 };
        }
        if (followedSellerIds.size === 0) {
          return { items: [], total: 0 };
        }
        qb.andWhere('f."businessId" IN (:...followedIds)', {
          followedIds: [...followedSellerIds],
        });
        qb.orderBy('f.createdAt', 'DESC');
        break;
      // following fallback is handled after getManyAndCount below

      case 'nearby':
        if (city) {
          qb.andWhere('LOWER(b."businessLocation") LIKE LOWER(:city)', {
            city: `%${city.split(',')[0].trim()}%`,
          });
        }
        qb.orderBy('f.cvsScore', 'DESC').addOrderBy('f.createdAt', 'DESC');
        break;

      case 'products':
        qb.andWhere("f.type IN ('new_product','discount','restock')")
          .orderBy('f.cvsScore', 'DESC')
          .addOrderBy('f.purchaseCount', 'DESC');
        break;

      case 'services':
        qb.andWhere("f.type = 'new_service'").orderBy('f.cvsScore', 'DESC');
        break;

      case 'transport':
        qb.andWhere("f.type = 'delivery_info'")
          .orderBy('f.shipmentCount', 'DESC')
          .addOrderBy('f.createdAt', 'DESC');
        break;

      case 'businesses':
        qb.andWhere("f.type IN ('announcement','new_service')")
          .orderBy('b.followersCount', 'DESC')
          .addOrderBy('f.cvsScore', 'DESC');
        break;

      case 'trending':
        qb.orderBy('f.cvsScore', 'DESC')
          .addOrderBy('f.purchaseCount', 'DESC')
          .addOrderBy('f.saveCount', 'DESC');
        break;

      default:
        // Weighted: CVS 40% + recency 30% + city match 20% + following 10%.
        // No qb.orderBy here — the blended score below needs per-row values
        // (recency, city match against THIS viewer, follow membership) that
        // don't reduce to a single SQL ORDER BY, so it's computed after a
        // bounded candidate fetch instead. See isForYou below.
        break;
    }

    const isForYou = ![
      'following',
      'nearby',
      'products',
      'services',
      'transport',
      'businesses',
      'trending',
    ].includes(filter);

    let items: BusinessFeedItem[];
    let total: number;

    if (isForYou) {
      // Bounded candidate window ranked by cvsScore, then blend-scored in
      // application code, then paginated from the sorted result.
      const CANDIDATE_WINDOW = 200;
      const candidates = await qb
        .orderBy('f.cvsScore', 'DESC')
        .take(CANDIDATE_WINDOW)
        .getMany();

      const scores = candidates.map((c) => c.cvsScore || 0);
      const minScore = Math.min(...scores, 0);
      const maxScore = Math.max(...scores, 0);
      const scoreRange = maxScore - minScore || 1;

      const nowMs = Date.now();
      const cityNeedle = city ? city.split(',')[0].trim().toLowerCase() : null;

      const ranked = candidates
        .map((item) => {
          const cvsNorm = ((item.cvsScore || 0) - minScore) / scoreRange;
          const ageDays =
            (nowMs - new Date(item.createdAt).getTime()) / 86400000;
          const recency = Math.max(0, 1 - ageDays / 14);
          const business = (item as any).business;
          const cityMatch =
            cityNeedle && business?.businessLocation
              ? business.businessLocation.toLowerCase().includes(cityNeedle)
                ? 1
                : 0
              : 0;
          const followBoost =
            business?.id && followedSellerIds.has(business.id) ? 1 : 0;
          const blended =
            cvsNorm * 0.4 + recency * 0.3 + cityMatch * 0.2 + followBoost * 0.1;
          return { item, blended };
        })
        .sort((a, b) => b.blended - a.blended);

      items = ranked.slice(offset, offset + limit).map((r) => r.item);
      total = ranked.length;
    } else {
      [items, total] = await qb.skip(offset).take(limit).getManyAndCount();
    }

    const savedIds = userId ? await this.getSavedPostIds(userId) : [];

    // ── Fallback for 'following': show classifieds from followed sellers ────
    if (
      items.length === 0 &&
      page === 1 &&
      filter === 'following' &&
      userId &&
      followedSellerIds.size > 0
    ) {
      const followedClassifieds = await this.classifiedRepo
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.seller', 's')
        .where("c.status = 'active'")
        .andWhere('c."sellerId" IN (:...followedIds)', {
          followedIds: [...followedSellerIds],
        })
        .orderBy('c.createdAt', 'DESC')
        .take(limit)
        .getMany();

      if (followedClassifieds.length > 0) {
        const counts = await this.getEntityCounts(
          'classified',
          followedClassifieds.map((c) => c.id),
        );
        const virtualPosts = followedClassifieds.map((c) => ({
          id: `cls-${c.id}`,
          entityType: 'classified',
          entityId: c.id,
          feedType: 'classified',
          type: 'new_product',
          title: c.title,
          body: c.description,
          imageUrl: c.images?.[0] || null,
          linkedEntityId: c.id,
          linkedEntityType: 'classified',
          price: c.flashSalePrice || c.price,
          isNegotiable: c.isNegotiable,
          isFlashSale: c.isFlashSale,
          location: c.location,
          createdAt: c.createdAt,
          cvsScore: 0,
          saveCount: counts.get(c.id)?.saves || 0,
          commentCount: counts.get(c.id)?.comments || 0,
          shareCount: 0,
          purchaseCount: 0,
          isSaved: savedIds.includes(`cls-${c.id}`),
          business: {
            id: c.seller?.id,
            name: c.seller?.name,
            storeName: c.seller?.storeName,
            logo: c.seller?.logo,
            businessLocation: c.seller?.businessLocation,
            storeWhatsApp: c.seller?.storeWhatsApp,
            phone: c.seller?.phone,
            reputationScore: (c.seller as any)?.reputationScore || 0,
            isVerified: c.seller?.isVerified,
            isFollowing: true,
          },
          data: c,
        }));
        return { items: virtualPosts, total: followedClassifieds.length };
      }
      return { items: [], total: 0 };
    }

    // ── Fallback: mix classifieds + products + services when no feed posts ────
    if (items.length === 0 && page === 1 && filter !== 'following') {
      const virtualPosts: any[] = [];

      // Helper to map seller to business shape
      const toBiz = (seller: any) => ({
        id: seller?.id,
        name: seller?.name,
        storeName: seller?.storeName,
        logo: seller?.logo,
        businessLocation: seller?.businessLocation || seller?.sellerCity,
        storeWhatsApp: seller?.storeWhatsApp,
        phone: seller?.phone,
        reputationScore: seller?.reputationScore || 0,
        isVerified: seller?.isVerified,
        isFollowing: seller?.id ? followedSellerIds.has(seller.id) : false,
      });

      // 1. Classifieds (ads — contact only, no buy now)
      if (filter !== 'services' && filter !== 'transport') {
        const clsQb = this.classifiedRepo
          .createQueryBuilder('c')
          .leftJoinAndSelect('c.seller', 's')
          .where("c.status = 'active'");
        if (filter === 'nearby' && city)
          clsQb.andWhere('LOWER(c.location) LIKE LOWER(:city)', {
            city: `%${city}%`,
          });
        const classifieds = await clsQb
          .orderBy('c.createdAt', 'DESC')
          .take(8)
          .getMany();
        const clsCounts = await this.getEntityCounts(
          'classified',
          classifieds.map((c) => c.id),
        );

        classifieds.forEach((c) =>
          virtualPosts.push({
            id: `cls-${c.id}`,
            entityType: 'classified',
            entityId: c.id,
            feedType: 'classified',
            type: 'new_product',
            title: c.title,
            body: c.description,
            imageUrl: c.images?.[0] || null,
            linkedEntityId: c.id,
            linkedEntityType: 'classified',
            price: c.flashSalePrice || c.price,
            isNegotiable: c.isNegotiable,
            isFlashSale: c.isFlashSale,
            createdAt: c.createdAt,
            cvsScore: 0,
            saveCount: clsCounts.get(c.id)?.saves || 0,
            commentCount: clsCounts.get(c.id)?.comments || 0,
            shareCount: 0,
            purchaseCount: 0,
            isSaved: savedIds.includes(`cls-${c.id}`),
            location: c.location,
            business: toBiz(c.seller),
            data: c,
          }),
        );
      }

      // 2. Products (shop items — can buy online)
      if (filter !== 'services' && filter !== 'transport') {
        const products = await this.productRepo
          .createQueryBuilder('p')
          .leftJoinAndSelect('p.seller', 's')
          .where('p."isActive" = true')
          .andWhere('p."isAvailable" = true')
          .orderBy('p.createdAt', 'DESC')
          .take(6)
          .getMany();
        const prdCounts = await this.getEntityCounts(
          'product',
          products.map((p) => p.id),
        );

        products.forEach((p) =>
          virtualPosts.push({
            id: `prd-${p.id}`,
            entityType: 'product',
            entityId: p.id,
            feedType: 'product',
            type: 'new_product',
            title: p.name,
            body: p.description,
            imageUrl: p.images?.[0] || null,
            linkedEntityId: p.id,
            linkedEntityType: 'product',
            price: p.displayPrice || p.basePrice,
            canBuyOnline: true,
            createdAt: (p as any).createdAt,
            cvsScore: 0,
            saveCount: prdCounts.get(p.id)?.saves || 0,
            commentCount: prdCounts.get(p.id)?.comments || 0,
            shareCount: 0,
            purchaseCount: 0,
            isSaved: savedIds.includes(`prd-${p.id}`),
            business: toBiz(p.seller),
            data: p,
          }),
        );
      }

      // 3. Services (book/contact — no buy now)
      if (filter !== 'products' && filter !== 'transport') {
        const services = await this.serviceAdRepo2
          .createQueryBuilder('s')
          .leftJoinAndSelect('s.provider', 'u')
          .where("s.status = 'active'")
          .orderBy('s.rating', 'DESC')
          .take(4)
          .getMany();
        const svcCounts = await this.getEntityCounts(
          'service',
          services.map((s) => s.id),
        );

        services.forEach((s) =>
          virtualPosts.push({
            id: `svc-${s.id}`,
            entityType: 'service',
            entityId: s.id,
            feedType: 'service',
            type: 'new_service',
            title: s.title,
            body: s.description,
            imageUrl: s.images?.[0] || null,
            linkedEntityId: s.id,
            linkedEntityType: 'service',
            price: s.price,
            priceType: s.priceType,
            createdAt: (s as any).createdAt,
            cvsScore: 0,
            saveCount: svcCounts.get(s.id)?.saves || 0,
            commentCount: svcCounts.get(s.id)?.comments || 0,
            shareCount: 0,
            purchaseCount: 0,
            isSaved: savedIds.includes(`svc-${s.id}`),
            business: toBiz(s.provider),
            data: s,
          }),
        );
      }

      // 4. Transport (registered providers' routes — a real leg, not a
      // marketplace item). The 'transport' filter tab had nothing wired to
      // it at all: this fallback excluded products/services correctly but
      // never excluded classifieds (fixed above) and never added anything
      // of its own — so the tab showed leftover classifieds with no real
      // transport content underneath, and no way to discover a route
      // except asking the AI search directly. routeRepo was already
      // injected into this service for exactly this, just never used.
      if (filter !== 'products' && filter !== 'services') {
        // ACTIVE is the legacy status for already-onboarded Phase 2
        // API-integrated providers and is treated as equally
        // good-to-show everywhere else (TransportService's own
        // isVerified check) — matching only VERIFIED here excluded them.
        const routes = await this.routeRepo
          .createQueryBuilder('r')
          .leftJoinAndSelect('r.provider', 'p')
          .where('r.isActive = true')
          .andWhere('p.status IN (:...statuses)', {
            statuses: [ProviderStatus.VERIFIED, ProviderStatus.ACTIVE],
          })
          .orderBy('r.createdAt', 'DESC')
          .take(6)
          .getMany();

        // Today's published trip capacity, if the provider has posted one
        // for this route — "available space" is a per-day figure
        // (ProviderAvailability), not something the route definition
        // itself carries. Best-effort: a route with no trip published
        // today simply shows no slot count on its card, never a fake one.
        const today = new Date().toISOString().slice(0, 10);
        const routeIds = routes.map((r) => r.id);
        const availabilityByRouteId = new Map<
          number,
          { slotsAvailable: number; departureTime: string | null }
        >();
        if (routeIds.length) {
          const todaysAvailability = await this.availabilityRepo.find({
            where: { routeId: In(routeIds), date: today },
          });
          for (const a of todaysAvailability) {
            if (a.routeId == null) continue;
            availabilityByRouteId.set(a.routeId, {
              slotsAvailable: Math.max(0, a.totalSlots - a.usedSlots),
              departureTime: a.departureTime,
            });
          }
        }

        routes.forEach((r) => {
          const routeLabel =
            r.routeType === 'intercity' && r.originCity && r.destinationCity
              ? `${r.originCity} → ${r.destinationCity}`
              : r.routeType === 'local_loop' && r.loopStops?.length
                ? r.loopStops.join(' → ')
                : r.coverageCity || r.coverageWards?.join(', ') || '';
          const todaysTrip = availabilityByRouteId.get(r.id) || null;
          virtualPosts.push({
            id: `rte-${r.id}`,
            entityType: 'route',
            entityId: r.id,
            feedType: 'route',
            type: 'delivery_info',
            title: `${r.provider?.name || 'Transport'} — ${routeLabel}`,
            body: r.notes || null,
            imageUrl: r.provider?.logoUrl || null,
            linkedEntityId: r.id,
            linkedEntityType: 'route',
            price: r.pricePerKg || null,
            createdAt: (r as any).createdAt,
            cvsScore: 0,
            saveCount: 0,
            commentCount: 0,
            shareCount: 0,
            purchaseCount: 0,
            isSaved: savedIds.includes(`rte-${r.id}`),
            business: {
              id: r.provider?.userId,
              name: r.provider?.name,
              storeName: r.provider?.name,
              logo: r.provider?.logoUrl,
              reputationScore: 0,
              isVerified: true,
              isFollowing: false,
            },
            // Card-ready transport fields — kept flat (not just inside
            // `data`) so HomeFeed's transport card doesn't need to know
            // the raw TransportRoute/ProviderAvailability shape.
            transport: {
              vehicleType: r.provider?.type || null,
              routeType: r.routeType,
              routeLabel,
              originCity: r.originCity,
              destinationCity: r.destinationCity,
              coverageCity: r.coverageCity,
              pricePerKg: r.pricePerKg || null,
              fixedFee: r.fixedFee || null,
              slotsAvailable: todaysTrip?.slotsAvailable ?? null,
              departureTime: todaysTrip?.departureTime ?? null,
            },
            data: r,
          });
        });
      }

      // Shuffle mix: alternate classifieds, products, services
      virtualPosts.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

      return {
        items: virtualPosts.slice(0, limit),
        total: virtualPosts.length,
      };
    }

    // Resolve which CommerceProfile each real feed item was actually posted
    // as, so the card shows THAT business/agent/etc.'s own name/photo/
    // followers — not always the owning account's personal identity. This
    // was the root cause of a Moment posted while on a business profile
    // still displaying the owner's personal name in the Home feed: the
    // write path already stamped commerceProfileId correctly, but this read
    // path only ever joined the raw account (`f.business`/`b`) and never
    // looked at it. Items without a commerceProfileId (older content, or a
    // type where it doesn't apply) fall through to the account-level
    // `business` fields unchanged — never retro-guessed.
    const feedProfileIds = [
      ...new Set(
        items
          .map((f) => (f as any).commerceProfileId)
          .filter((id): id is number => !!id),
      ),
    ];
    const feedProfiles = feedProfileIds.length
      ? await this.commerceProfileRepo.find({ where: { id: In(feedProfileIds) } })
      : [];
    const feedProfileMap = new Map(feedProfiles.map((p) => [p.id, p]));

    return {
      items: items.map((f) => {
        const rawBiz = (f as any).business;
        const profile = (f as any).commerceProfileId
          ? feedProfileMap.get((f as any).commerceProfileId)
          : null;
        const business = rawBiz
          ? {
              ...rawBiz,
              isFollowing: followedSellerIds.has(rawBiz.id),
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
        return { ...f, isSaved: savedIds.includes(f.id), business };
      }),
      total,
    };
  }
}
