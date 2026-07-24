/**
 * CvsService — Commerce Value Score engine
 * Place at: src/feed/cvs.service.ts
 *
 * Computes and updates CVS whenever a commerce action fires.
 * CVS = Purchases×10 + Shipments×8 + Saves×3 + Comments×2 + Shares×1 + Views×0.5
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository }   from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { BusinessFeedItem }   from '../business/entities/business-feed-item.entity';
import { PostEngagement, EngagementType, CVS_WEIGHTS } from './entities/post-engagement.entity';
import { Classified } from '../classifieds/entities/classified.entity';
import { Product }    from '../products/entities/products.entity';
import { ServiceAd }  from '../services/entities/service-ad.entity';
import { PostComment }        from './entities/post-comment.entity';
import { User }               from '../users/entities/user.entity';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { EntityOwnerResolver } from './engagements.controller';

@Injectable()
export class CvsService {
  private readonly logger = new Logger(CvsService.name);

  constructor(
    @InjectRepository(BusinessFeedItem) private feedRepo:       Repository<BusinessFeedItem>,
    @InjectRepository(PostEngagement)   private engageRepo:     Repository<PostEngagement>,
    @InjectRepository(PostComment)      private commentRepo:    Repository<PostComment>,
    @InjectRepository(User)             private userRepo:       Repository<User>,
    @InjectRepository(Classified)       private classifiedRepo: Repository<Classified>,
    @InjectRepository(Product)          private productRepo:    Repository<Product>,
    @InjectRepository(ServiceAd)        private serviceAdRepo2: Repository<ServiceAd>,
    private readonly notifService:      InAppNotificationService,
    private readonly owners:            EntityOwnerResolver,
  ) {}

  // ── Record engagement + update CVS ───────────────────────────────────────
  async engage(userId: number, postId: number, type: EngagementType): Promise<{
    toggled: boolean; newCvs: number;
  }> {
    // VIEW is always recorded (no toggle)
    if (type === EngagementType.VIEW) {
      await this.engageRepo.save(this.engageRepo.create({ userId, postId, type }))
        .catch(() => {}); // ignore duplicate
      await this.recalculate(postId);
      return { toggled: true, newCvs: 0 };
    }

    // Others toggle (save/share/etc)
    const existing = await this.engageRepo.findOne({
      where: { userId, postId, type }
    });
    if (existing) {
      await this.engageRepo.delete(existing.id);
    } else {
      await this.engageRepo.save(this.engageRepo.create({ userId, postId, type }));
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
    userId: number, postId: number, body: string, parentId?: number,
    offer?: { entityType: string; entityId: number },
  ): Promise<PostComment> {
    let offerEntityType: string | null = null;
    let offerEntityId:   number | null = null;

    if (offer?.entityType && offer?.entityId) {
      // Only allow tagging something the replier actually owns —
      // otherwise anyone could falsely claim to have a product.
      const owned = await this.owners.resolve(offer.entityType, offer.entityId);
      if (owned && owned.ownerId === userId) {
        offerEntityType = offer.entityType;
        offerEntityId   = offer.entityId;
      }
    }

    const comment = await this.commentRepo.save(this.commentRepo.create({
      postId,
      authorId: userId,
      body:     body.trim(),
      parentId: parentId || null,
      offerEntityType,
      offerEntityId,
    }));

    // Record comment engagement
    await this.engageRepo.save(
      this.engageRepo.create({ userId, postId, type: EngagementType.COMMENT })
    ).catch(() => {});

    await this.recalculate(postId);

    // Notify post author (fire-and-forget, never blocks the response)
    if (offerEntityType) {
      this.notifyOwnerOfPost(userId, postId, 'offer', body).catch(() => {});
    } else {
      this.notifyOwnerOfPost(userId, postId, 'comment', body).catch(() => {});
    }

    const saved = await this.commentRepo.findOne({
      where: { id: comment.id },
      relations: { author: true },
    }) as PostComment;

    return this.attachOfferCards([saved]).then(r => r[0]);
  }

  // ── Enrich comments (and their replies) with resolved offer card data ────
  private async attachOfferCards(comments: PostComment[]): Promise<any[]> {
    const flat: PostComment[] = [];
    comments.forEach(c => { flat.push(c); (c.replies || []).forEach(r => flat.push(r)); });

    const tagged = flat.filter(c => c.offerEntityType && c.offerEntityId);
    const cards = await Promise.all(
      tagged.map(c => this.owners.resolveOfferCard(c.offerEntityType as string, c.offerEntityId as number))
    );
    const cardMap = new Map<string, any>();
    tagged.forEach((c, i) => { if (cards[i]) cardMap.set(`${c.offerEntityType}-${c.offerEntityId}`, cards[i]); });

    const enrich = (c: PostComment): any => ({
      ...c,
      offerCard: c.offerEntityType && c.offerEntityId
        ? cardMap.get(`${c.offerEntityType}-${c.offerEntityId}`) || null
        : null,
      replies: (c.replies || []).map(enrich),
    });
    return comments.map(enrich);
  }

  // ── Notify a real feed post's owner about a save or comment ──────────────
  private async notifyOwnerOfPost(
    actorId: number, postId: number,
    kind: 'save' | 'comment' | 'offer', commentBody?: string,
  ): Promise<void> {
    const post = await this.feedRepo.findOne({ where: { id: postId } });
    if (!post || post.businessId === actorId) return; // don't notify yourself

    const actor = await this.userRepo.findOne({ where: { id: actorId } });
    const actorName = actor?.storeName || actor?.name || 'Someone';
    const postTitle = post.title || 'your post';

    if (kind === 'save') {
      await this.notifService.notify({
        userId:      post.businessId,
        type:        'save',
        title:       '❤️ New save',
        body:        `${actorName} saved "${postTitle}"`,
        icon:        '❤️',
        actionPage:  'CommerceProfile',
        actionParam: String(post.businessId),
      });
    } else if (kind === 'offer') {
      // A seller replied to a Looking For post with a matching item —
      // this is the moment that actually closes the loop for the buyer.
      await this.notifService.notify({
        userId:      post.businessId,
        type:        'offer',
        title:       '🙋 Someone has what you\u2019re looking for',
        body:        `${actorName} has an item matching "${postTitle}"`,
        icon:        '🙋',
        actionPage:  'CommerceProfile',
        actionParam: String(post.businessId),
      });
    } else {
      const preview = (commentBody || '').slice(0, 60) + ((commentBody || '').length > 60 ? '...' : '');
      await this.notifService.notify({
        userId:      post.businessId,
        type:        'comment',
        title:       '💬 New comment',
        body:        `${actorName}: "${preview}"`,
        icon:        '💬',
        actionPage:  'CommerceProfile',
        actionParam: String(post.businessId),
      });
    }
  }

  // ── Get comments for a post ───────────────────────────────────────────────
  async getComments(postId: number): Promise<any[]> {
    const comments = await this.commentRepo.find({
      where: { postId, parentId: IsNull(), isDeleted: false },
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
      saveCount:     0, commentCount: 0, shareCount: 0,
      purchaseCount: 0, shipmentCount: 0, viewCount: 0,
    };

    for (const row of counts) {
      const type  = row.type as EngagementType;
      const count = Number(row.count);
      const weight = CVS_WEIGHTS[type] || 0;
      cvs += count * weight;

      const fieldMap: Record<EngagementType, string> = {
        [EngagementType.SAVE]:     'saveCount',
        [EngagementType.COMMENT]:  'commentCount',
        [EngagementType.SHARE]:    'shareCount',
        [EngagementType.VIEW]:     'viewCount',
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
      classified: 'cls', product: 'prd', service: 'svc',
    };
    return rows
      .map(r => {
        if (r.postId) return r.postId;
        if (r.entityType && r.entityId) {
          const prefix = prefixMap[r.entityType] || r.entityType;
          return `${prefix}-${r.entityId}`;
        }
        return null;
      })
      .filter((v): v is number | string => v !== null);
  }

  // ── Set of sellerIds the given user follows ───────────────────────────────
  private async getFollowedSellerIds(userId?: number | null): Promise<Set<number>> {
    if (!userId) return new Set();
    const rows: { sellerId: number }[] = await this.feedRepo
      .query('SELECT "sellerId" FROM follow WHERE "followerId" = $1', [userId])
      .catch(() => []);
    return new Set(rows.map(r => r.sellerId));
  }

  // ── Real save/comment counts for a batch of virtual entities ─────────────
  private async getEntityCounts(
    entityType: string, entityIds: number[],
  ): Promise<Map<number, { saves: number; comments: number }>> {
    const map = new Map<number, { saves: number; comments: number }>();
    entityIds.forEach(id => map.set(id, { saves: 0, comments: 0 }));
    if (!entityIds.length) return map;

    const [saveRows, commentRows] = await Promise.all([
      this.engageRepo.createQueryBuilder('e')
        .select('e.entityId', 'entityId')
        .addSelect('COUNT(*)', 'count')
        .where('e.entityType = :entityType', { entityType })
        .andWhere('e.entityId IN (:...ids)', { ids: entityIds })
        .andWhere('e.type = :type', { type: EngagementType.SAVE })
        .groupBy('e.entityId')
        .getRawMany()
        .catch(() => []),
      this.commentRepo.createQueryBuilder('c')
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
  async getTrending(limit = 10, userId?: number | null): Promise<{
    topPurchased:  any[];
    fastestGrowing:any[];
    topBusinesses: any[];
    topServices:   any[];
    topRoutes:     any[];
    topProducts:   any[];
    topClassifieds:any[];
  }> {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since6h  = new Date(Date.now() -  6 * 60 * 60 * 1000);
    const followedSellerIds = await this.getFollowedSellerIds(userId);

    const base = this.feedRepo.createQueryBuilder('f')
      .leftJoin('f.business', 'b')
      .addSelect([
        'b.id', 'b.name', 'b.storeName', 'b.logo', 'b.businessLocation',
        'b.reputationScore', 'b.followersCount', 'b.isVerified',
        'b.isOfficialStore', 'b.storeWhatsApp', 'b.phone', 'b.role',
      ])
      .where('f.isActive = true');

    let [topPurchased, fastestGrowing, topBusinesses, topServices, topRoutes] =
      await Promise.all([
        // Most purchased today
        base.clone()
          .andWhere('f.createdAt > :since', { since: since24h })
          .orderBy('f.purchaseCount', 'DESC')
          .addOrderBy('f.cvsScore', 'DESC')
          .take(limit).getMany(),

        // Fastest growing CVS (last 6 hours)
        base.clone()
          .andWhere('f.createdAt > :since', { since: since6h })
          .orderBy('f.cvsScore', 'DESC')
          .take(limit).getMany(),

        // Top businesses by saves + comments
        base.clone()
          .andWhere("f.type = 'new_product' OR f.type = 'announcement'")
          .orderBy('f.saveCount', 'DESC')
          .addOrderBy('f.commentCount', 'DESC')
          .addOrderBy('b.followersCount', 'DESC')
          .take(limit).getMany(),

        // Top services
        base.clone()
          .andWhere("f.type = 'new_service'")
          .orderBy('f.cvsScore', 'DESC')
          .take(limit).getMany(),

        // Most requested shipment routes
        base.clone()
          .andWhere("f.type = 'delivery_info'")
          .orderBy('f.shipmentCount', 'DESC')
          .take(limit).getMany(),
      ]) as any[];

    // ── Cold-start fallbacks: no BusinessFeedItem rows exist yet ─────────────
    if (!topBusinesses.length) {
      const sellers = await this.userRepo.createQueryBuilder('u')
        .where("u.role IN ('seller','admin','manager')")
        .andWhere('u."storeName" IS NOT NULL')
        .andWhere("u.\"storeName\" != ''")
        .orderBy('u.followersCount', 'DESC')
        .addOrderBy('u.reputationScore', 'DESC')
        .take(limit).getMany();

      topBusinesses = sellers.map(u => ({
        id: `biz-${u.id}`, businessId: u.id, title: u.storeName || u.name,
        cvsScore: 0,
        business: {
          id: u.id, storeName: u.storeName, name: u.name, logo: u.logo,
          businessLocation: u.businessLocation,
          reputationScore: (u as any).reputationScore || 0,
          isFollowing: followedSellerIds.has(u.id),
        },
      }));
    }

    if (!topServices.length) {
      const svcs = await this.serviceAdRepo2.createQueryBuilder('s')
        .leftJoinAndSelect('s.provider', 'u')
        .where("s.status = 'active'")
        .orderBy('s.rating', 'DESC').take(limit).getMany();

      topServices = svcs.map(s => ({
        id: `svc-${s.id}`, businessId: s.provider?.id, title: s.title,
        entityType: 'service', entityId: s.id,
        imageUrl: s.images?.[0] || null, price: s.price || null,
        cvsScore: 0,
        business: {
          id: s.provider?.id, storeName: s.provider?.storeName,
          name: s.provider?.name, logo: s.provider?.logo,
          isFollowing: s.provider?.id ? followedSellerIds.has(s.provider.id) : false,
        },
      }));
    }

    if (!topPurchased.length) {
      const products = await this.productRepo.createQueryBuilder('p')
        .leftJoinAndSelect('p.seller', 's')
        .where('p."isActive" = true').andWhere('p."isAvailable" = true')
        .orderBy('p.createdAt', 'DESC').take(limit).getMany();

      topPurchased = products.map(p => ({
        id: `prd-${p.id}`, businessId: p.seller?.id, title: p.name,
        entityType: 'product', entityId: p.id,
        imageUrl: p.images?.[0] || null, price: p.displayPrice || p.basePrice || null,
        cvsScore: 0,
        business: {
          id: p.seller?.id, storeName: p.seller?.storeName, name: p.seller?.name,
          logo: p.seller?.logo,
          isFollowing: p.seller?.id ? followedSellerIds.has(p.seller.id) : false,
        },
      }));
    }

    if (!fastestGrowing.length) {
      const recentClassifieds = await this.classifiedRepo.createQueryBuilder('c')
        .leftJoinAndSelect('c.seller', 's')
        .where("c.status = 'active'")
        .orderBy('c.createdAt', 'DESC').take(limit).getMany();

      fastestGrowing = recentClassifieds.map(c => ({
        id: `cls-${c.id}`, businessId: c.seller?.id, title: c.title,
        entityType: 'classified', entityId: c.id,
        imageUrl: c.images?.[0] || null, price: c.flashSalePrice || c.price || null,
        cvsScore: 0,
        business: {
          id: c.seller?.id, storeName: c.seller?.storeName, name: c.seller?.name,
          logo: c.seller?.logo,
          isFollowing: c.seller?.id ? followedSellerIds.has(c.seller.id) : false,
        },
      }));
    }

    // ── Dedicated Products / Classifieds rails ────────────────────────────
    // Queried directly (not derived from feed posts) so these are always
    // type-pure — topPurchased/fastestGrowing above can mix types once
    // real feed activity exists, which isn't safe for a "Products only"
    // or "Classifieds only" scrolling rail.
    const [rawProducts, rawClassifieds] = await Promise.all([
      this.productRepo.createQueryBuilder('p')
        .leftJoinAndSelect('p.seller', 's')
        .where('p."isActive" = true').andWhere('p."isAvailable" = true')
        .orderBy('p.createdAt', 'DESC').take(limit).getMany(),
      this.classifiedRepo.createQueryBuilder('c')
        .leftJoinAndSelect('c.seller', 's')
        .where("c.status = 'active'")
        .orderBy('c.createdAt', 'DESC').take(limit).getMany(),
    ]);

    const topProducts = rawProducts.map(p => ({
      id: `prd-${p.id}`, businessId: p.seller?.id, title: p.name,
      entityType: 'product', entityId: p.id,
      imageUrl: p.images?.[0] || null, price: p.displayPrice || p.basePrice || null,
      business: {
        id: p.seller?.id, storeName: p.seller?.storeName, name: p.seller?.name,
        logo: p.seller?.logo,
      },
    }));

    const topClassifieds = rawClassifieds.map(c => ({
      id: `cls-${c.id}`, businessId: c.seller?.id, title: c.title,
      entityType: 'classified', entityId: c.id,
      imageUrl: c.images?.[0] || null, price: c.flashSalePrice || c.price || null,
      business: {
        id: c.seller?.id, storeName: c.seller?.storeName, name: c.seller?.name,
        logo: c.seller?.logo,
      },
    }));

    return { topPurchased, fastestGrowing, topBusinesses, topServices, topRoutes, topProducts, topClassifieds };
  }

  // ── Get feed by filter with CVS ranking ──────────────────────────────────
  async getFilteredFeed(params: {
    filter:   string;
    userId?:  number;
    city?:    string;
    page?:    number;
    limit?:   number;
  }): Promise<{ items: any[]; total: number }> {
    const { filter = 'for_you', userId, city, page = 1, limit = 15 } = params;
    const offset = (page - 1) * limit;
    const followedSellerIds = await this.getFollowedSellerIds(userId);

    const qb = this.feedRepo.createQueryBuilder('f')
      .leftJoin('f.business', 'b')
      .addSelect([
        'b.id', 'b.name', 'b.storeName', 'b.logo', 'b.businessLocation',
        'b.reputationScore', 'b.followersCount', 'b.isVerified',
        'b.isOfficialStore', 'b.storeWhatsApp', 'b.phone', 'b.role',
      ])
      .where('f.isActive = true')
      .andWhere('(f.expiresAt IS NULL OR f.expiresAt > NOW())');

    switch (filter) {
      case 'following':
        if (!userId) { return { items: [], total: 0 }; }
        qb.innerJoin('follow', 'sf',
          'sf."sellerId" = f."businessId" AND sf."followerId" = :uid', { uid: userId });
        qb.orderBy('f.createdAt', 'DESC');
        break;
      // following fallback is handled after getManyAndCount below

      case 'nearby':
        if (city) {
          qb.andWhere('LOWER(b."businessLocation") LIKE LOWER(:city)',
            { city: `%${city.split(',')[0].trim()}%` });
        }
        qb.orderBy('f.cvsScore', 'DESC').addOrderBy('f.createdAt', 'DESC');
        break;

      case 'products':
        qb.andWhere("f.type IN ('new_product','discount','restock')")
          .orderBy('f.cvsScore', 'DESC').addOrderBy('f.purchaseCount', 'DESC');
        break;

      case 'services':
        qb.andWhere("f.type = 'new_service'")
          .orderBy('f.cvsScore', 'DESC');
        break;

      case 'transport':
        qb.andWhere("f.type = 'delivery_info'")
          .orderBy('f.shipmentCount', 'DESC').addOrderBy('f.createdAt', 'DESC');
        break;

      case 'businesses':
        qb.andWhere("f.type IN ('announcement','new_service')")
          .orderBy('b.followersCount', 'DESC').addOrderBy('f.cvsScore', 'DESC');
        break;

      case 'trending':
        qb.orderBy('f.cvsScore', 'DESC')
          .addOrderBy('f.purchaseCount', 'DESC')
          .addOrderBy('f.saveCount', 'DESC');
        break;

      default: // for_you
        // Weighted: CVS 40% + recency 30% + city match 20% + following 10%
        qb.orderBy('f.cvsScore', 'DESC')
          .addOrderBy('f.createdAt', 'DESC');
        // Note: following boost handled client-side to avoid pagination issues
        break;
    }

    const [items, total] = await qb.skip(offset).take(limit).getManyAndCount();
    const savedIds = userId ? await this.getSavedPostIds(userId) : [];

    // ── Fallback for 'following': show classifieds from followed sellers ────
    if (items.length === 0 && page === 1 && filter === 'following' && userId) {
      const followedClassifieds = await this.classifiedRepo
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.seller', 's')
        .innerJoin('follow', 'sf',
          'sf."sellerId" = c."sellerId" AND sf."followerId" = :uid', { uid: userId })
        .where("c.status = 'active'")
        .orderBy('c.createdAt', 'DESC')
        .take(limit)
        .getMany();

      if (followedClassifieds.length > 0) {
        const counts = await this.getEntityCounts('classified', followedClassifieds.map(c => c.id));
        const virtualPosts = followedClassifieds.map(c => ({
          id: `cls-${c.id}`, entityType: 'classified', entityId: c.id,
          feedType: 'classified', type: 'new_product',
          title: c.title, body: c.description, imageUrl: c.images?.[0] || null,
          linkedEntityId: c.id, linkedEntityType: 'classified',
          price: c.flashSalePrice || c.price,
          isNegotiable: c.isNegotiable, isFlashSale: c.isFlashSale,
          location: c.location, createdAt: c.createdAt,
          cvsScore: 0,
          saveCount:    counts.get(c.id)?.saves    || 0,
          commentCount: counts.get(c.id)?.comments || 0,
          shareCount: 0,
          purchaseCount: 0, isSaved: savedIds.includes(`cls-${c.id}`),
          business: {
            id: c.seller?.id, name: c.seller?.name, storeName: c.seller?.storeName,
            logo: c.seller?.logo, businessLocation: c.seller?.businessLocation,
            storeWhatsApp: c.seller?.storeWhatsApp, phone: c.seller?.phone,
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
        id:               seller?.id,
        name:             seller?.name,
        storeName:        seller?.storeName,
        logo:             seller?.logo,
        businessLocation: seller?.businessLocation || seller?.sellerCity,
        storeWhatsApp:    seller?.storeWhatsApp,
        phone:            seller?.phone,
        reputationScore:  (seller as any)?.reputationScore || 0,
        isVerified:       seller?.isVerified,
        isFollowing:      seller?.id ? followedSellerIds.has(seller.id) : false,
      });

      // 1. Classifieds (ads — contact only, no buy now)
      if (filter !== 'services') {
        const clsQb = this.classifiedRepo.createQueryBuilder('c')
          .leftJoinAndSelect('c.seller', 's')
          .where("c.status = 'active'");
        if (filter === 'nearby' && city)
          clsQb.andWhere('LOWER(c.location) LIKE LOWER(:city)', { city: `%${city}%` });
        const classifieds = await clsQb.orderBy('c.createdAt', 'DESC').take(8).getMany();
        const clsCounts = await this.getEntityCounts('classified', classifieds.map(c => c.id));

        classifieds.forEach(c => virtualPosts.push({
          id: `cls-${c.id}`, entityType: 'classified', entityId: c.id,
          feedType: 'classified', type: 'new_product',
          title: c.title, body: c.description,
          imageUrl: c.images?.[0] || null,
          linkedEntityId: c.id, linkedEntityType: 'classified',
          price: c.flashSalePrice || c.price,
          isNegotiable: c.isNegotiable,
          isFlashSale: c.isFlashSale,
          createdAt: c.createdAt, cvsScore: 0,
          saveCount:    clsCounts.get(c.id)?.saves    || 0,
          commentCount: clsCounts.get(c.id)?.comments || 0,
          shareCount: 0, purchaseCount: 0,
          isSaved: savedIds.includes(`cls-${c.id}`),
          location: c.location,
          business: toBiz(c.seller), data: c,
        }));
      }

      // 2. Products (shop items — can buy online)
      if (filter !== 'services' && filter !== 'transport') {
        const products = await this.productRepo.createQueryBuilder('p')
          .leftJoinAndSelect('p.seller', 's')
          .where('p."isActive" = true').andWhere('p."isAvailable" = true')
          .orderBy('p.createdAt', 'DESC').take(6).getMany();
        const prdCounts = await this.getEntityCounts('product', products.map(p => p.id));

        products.forEach(p => virtualPosts.push({
          id: `prd-${p.id}`, entityType: 'product', entityId: p.id,
          feedType: 'product', type: 'new_product',
          title: p.name, body: p.description,
          imageUrl: p.images?.[0] || null,
          linkedEntityId: p.id, linkedEntityType: 'product',
          price: p.displayPrice || p.basePrice,
          canBuyOnline: true,
          createdAt: (p as any).createdAt, cvsScore: 0,
          saveCount:    prdCounts.get(p.id)?.saves    || 0,
          commentCount: prdCounts.get(p.id)?.comments || 0,
          shareCount: 0, purchaseCount: 0,
          isSaved: savedIds.includes(`prd-${p.id}`),
          business: toBiz(p.seller), data: p,
        }));
      }

      // 3. Services (book/contact — no buy now)
      if (filter !== 'products' && filter !== 'transport') {
        const services = await this.serviceAdRepo2.createQueryBuilder('s')
          .leftJoinAndSelect('s.provider', 'u')
          .where("s.status = 'active'")
          .orderBy('s.rating', 'DESC').take(4).getMany();
        const svcCounts = await this.getEntityCounts('service', services.map(s => s.id));

        services.forEach(s => virtualPosts.push({
          id: `svc-${s.id}`, entityType: 'service', entityId: s.id,
          feedType: 'service', type: 'new_service',
          title: s.title, body: s.description,
          imageUrl: s.images?.[0] || null,
          linkedEntityId: s.id, linkedEntityType: 'service',
          price: s.price, priceType: s.priceType,
          createdAt: (s as any).createdAt, cvsScore: 0,
          saveCount:    svcCounts.get(s.id)?.saves    || 0,
          commentCount: svcCounts.get(s.id)?.comments || 0,
          shareCount: 0, purchaseCount: 0,
          isSaved: savedIds.includes(`svc-${s.id}`),
          business: toBiz(s.provider), data: s,
        }));
      }

      // Shuffle mix: alternate classifieds, products, services
      virtualPosts.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return { items: virtualPosts.slice(0, limit), total: virtualPosts.length };
    }

    return {
      items: items.map(f => ({
        ...f,
        isSaved: savedIds.includes(f.id),
        business: (f as any).business ? {
          ...(f as any).business,
          isFollowing: followedSellerIds.has((f as any).business.id),
        } : (f as any).business,
      })),
      total,
    };
  }
}