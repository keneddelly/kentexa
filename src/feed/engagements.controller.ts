/**
 * EngagementsController + CommentsController — universal save/share/view
 * and comment tracking for VIRTUAL posts (classifieds/products/services
 * that don't have a real BusinessFeedItem row yet).
 *
 * Real feed posts keep using POST /feed/:id/engage and /feed/:id/comments
 * (handled by FeedController + CvsService). The frontend picks the right
 * endpoint based on whether post.id is numeric or a prefixed string
 * (cls-12 / prd-8 / svc-3).
 *
 * Both controllers notify the entity owner when someone saves or comments,
 * so it shows up on their Activity tab — not just as a counter on the post.
 *
 * EXTENDED for the unified Commerce Comment System: CommentsController now
 * doubles as the Review/Question engine for classified/product/service/
 * business pages. Nothing about EngagementsController or the original
 * getComments()/addComment() behavior changed — everything below the "NEW"
 * markers is additive, so any existing caller keeps working unmodified
 * (type defaults to 'comment', which is the old row shape).
 *
 * TODO: real feed posts (postId, routed through FeedController ->
 * CvsService) don't get reviews/ratings/helpful yet — that needs the same
 * additions made to CvsService.addComment()/getComments(), not shown here.
 *
 * Place at: src/feed/engagements.controller.ts
 */
import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Request,
  Query,
  Param,
  UseGuards,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Injectable,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, In } from 'typeorm';
import {
  PostEngagement,
  EngagementType,
} from './entities/post-engagement.entity';
import {
  PostComment,
  PostCommentType,
  PurchaseVerification,
} from './entities/post-comment.entity';
import { PostCommentHelpfulVote } from './entities/post-comment-helpful-vote.entity';
import { CommerceProfile } from '../commerce-profiles/entities/commerce-profile.entity';
import {
  PurchaseVerificationService,
  AiSummaryProvider,
} from './comment-support.service';
import { AiService } from '../ai/ai.service';
import { AiPromptTemplateService } from '../ai/ai-prompt-templates.service';
import { Classified } from '../classifieds/entities/classified.entity';
import { Product } from '../products/entities/products.entity';
import { ServiceAd } from '../services/entities/service-ad.entity';
import { TransportRoute } from '../transport/entities/transport-route.entity';
import { User } from '../users/entities/user.entity';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import {
  CommerceProfilesService,
} from '../commerce-profiles/commerce-profiles.service';
import { CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';

export type CommentFilter = 'all' | 'reviews' | 'questions' | 'media';

// ── Resolve the right notification destination for an entityType ───────────
// Was inlined as a ternary at each call site that only branched for
// 'service'/'route' and silently defaulted everything else — including
// 'product' and 'business' — to 'ClassifiedDetail'. That sent product/
// business notifications to the wrong detail page (looking up a classified
// by an id that actually belongs to a product/business), which is why
// tapping them looked like it "opened the wrong thing" instead of the
// actual notification target.
function resolveActionPage(entityType: string): string {
  switch (entityType) {
    case 'service':
      return 'ServiceDetail';
    case 'route':
      return 'SellerShipment';
    case 'product':
      return 'ProductDetail';
    case 'business':
      return 'CommerceProfile';
    case 'classified':
    default:
      return 'ClassifiedDetail';
  }
}

// ── Build a readable title from a route regardless of its type ──────────────
function routeTitle(r: any): string {
  if (r.routeType === 'intercity' && r.originCity && r.destinationCity) {
    return `${r.originCity} \u2192 ${r.destinationCity}`;
  }
  if (r.routeType === 'local_loop' && r.loopStops?.length) {
    return r.loopStops.join(' \u2192 ');
  }
  if (r.routeType === 'last_mile' && r.coverageWards?.length) {
    return `${r.coverageCity || ''} \u2014 ${r.coverageWards.slice(0, 3).join(', ')}`.trim();
  }
  return 'Route';
}

// ── Shared helper: resolve who owns a classified/product/service/route ──────
@Injectable()
export class EntityOwnerResolver {
  constructor(
    @InjectRepository(Classified)
    private classifiedRepo: Repository<Classified>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(ServiceAd) private serviceAdRepo: Repository<ServiceAd>,
    @InjectRepository(TransportRoute)
    private routeRepo: Repository<TransportRoute>,
    private commerceProfiles: CommerceProfilesService,
  ) {}

  // Resolves which CommerceProfile actually owns this piece of content, not
  // just the raw account — a save/comment notification's actionCommerceProfileId
  // comes from here, so tapping it lands on the right identity (e.g. the
  // business that owns a classified, not the owner's personal profile by
  // default) instead of the ambiguous-bare-id fallback CommerceProfile.js
  // otherwise falls back to. null when nothing resolves — callers already
  // handle that the same way they handle no commerceProfileId at all today.
  async resolve(
    entityType: string,
    entityId: number,
  ): Promise<{ ownerId: number; title: string; commerceProfileId: number | null } | null> {
    try {
      if (entityType === 'classified') {
        const c = await this.classifiedRepo.findOne({
          where: { id: entityId },
          relations: { seller: true },
        });
        if (!c?.seller) return null;
        return { ownerId: c.seller.id, title: c.title, commerceProfileId: c.commerceProfileId };
      }
      if (entityType === 'product') {
        const p = await this.productRepo.findOne({
          where: { id: entityId },
          relations: { seller: true },
        });
        if (!p?.seller) return null;
        // Products are business-only by established convention (never
        // posted from a personal profile) — same resolution
        // ProductsService.findOne() already does for its own "sold by".
        const profile = await this.commerceProfiles
          .findForUserByType((p as any).seller.id, CommerceProfileType.BUSINESS)
          .catch(() => null);
        return {
          ownerId: (p as any).seller.id,
          title: (p as any).name,
          commerceProfileId: profile?.id ?? null,
        };
      }
      if (entityType === 'service' || entityType === 'new_service') {
        const s = await this.serviceAdRepo.findOne({
          where: { id: entityId },
          relations: { provider: true },
        });
        if (!s?.provider) return null;
        // Same BUSINESS-profile fallback ServicesService.getById() already
        // uses — no dedicated service-provider CommerceProfile flow exists.
        const profile = await this.commerceProfiles
          .findForUserByType((s as any).provider.id, CommerceProfileType.BUSINESS)
          .catch(() => null);
        return {
          ownerId: (s as any).provider.id,
          title: (s as any).title,
          commerceProfileId: profile?.id ?? null,
        };
      }
      if (entityType === 'route') {
        const r = await this.routeRepo.findOne({
          where: { id: entityId },
          relations: { provider: true },
        });
        if (!r?.provider?.userId) return null;
        const profile = await this.commerceProfiles
          .findForUserByType(r.provider.userId, CommerceProfileType.TRANSPORT_PROVIDER)
          .catch(() => null);
        return {
          ownerId: r.provider.userId,
          title: routeTitle(r),
          commerceProfileId: profile?.id ?? null,
        };
      }
      // NEW — 'business' entityType: the entityId IS the owner's userId
      // directly (same convention as BusinessFeedItem.businessId).
      if (entityType === 'business') {
        return { ownerId: entityId, title: '', commerceProfileId: null };
      }
    } catch {
      /* entity gone or bad id — just skip notifying */
    }
    return null;
  }

  // ── Richer lookup for "I Have This" reply cards — image + price too ───────
  async resolveOfferCard(
    entityType: string,
    entityId: number,
  ): Promise<{
    entityType: string;
    entityId: number;
    title: string;
    image: string | null;
    price: number | null;
    providerUserId?: number | null;
  } | null> {
    try {
      if (entityType === 'classified') {
        const c = await this.classifiedRepo.findOne({
          where: { id: entityId },
        });
        if (!c) return null;
        return {
          entityType,
          entityId,
          title: c.title,
          image: c.images?.[0] || null,
          price: Number(c.flashSalePrice || c.price) || null,
        };
      }
      if (entityType === 'product') {
        const p = await this.productRepo.findOne({ where: { id: entityId } });
        if (!p) return null;
        return {
          entityType,
          entityId,
          title: (p as any).name,
          image: (p as any).images?.[0] || null,
          price:
            Number((p as any).displayPrice || (p as any).basePrice) || null,
        };
      }
      if (entityType === 'service') {
        const s = await this.serviceAdRepo.findOne({ where: { id: entityId } });
        if (!s) return null;
        return {
          entityType,
          entityId,
          title: (s as any).title,
          image: (s as any).images?.[0] || null,
          price: Number((s as any).price) || null,
        };
      }
      if (entityType === 'route') {
        const r = await this.routeRepo.findOne({
          where: { id: entityId },
          relations: { provider: true },
        });
        if (!r) return null;
        return {
          entityType,
          entityId,
          title: routeTitle(r),
          image: null,
          price: null,
          providerUserId: r.provider?.userId ?? null,
        };
      }
    } catch {
      /* entity gone or bad id */
    }
    return null;
  }
}

@Controller('engagements')
export class EngagementsController {
  constructor(
    @InjectRepository(PostEngagement)
    private engRepo: Repository<PostEngagement>,
    @InjectRepository(PostComment) private commentRepo: Repository<PostComment>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private readonly owners: EntityOwnerResolver,
    private readonly notifService: InAppNotificationService,
  ) {}

  // ── Batch save/comment counts for a list of entities of one type ─────────
  // GET /engagements/counts?entityType=product&entityIds=1,2,3
  // Used by CommerceProfile's Products tab (and anywhere else showing a
  // grid of classifieds/products/services) to display real counts.
  @Get('counts')
  async getCounts(
    @Query('entityType') entityType: string,
    @Query('entityIds') entityIdsCsv: string,
  ) {
    const entityIds = (entityIdsCsv || '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => !isNaN(n) && n > 0);
    const result: Record<number, { saves: number; comments: number }> = {};
    entityIds.forEach((id) => {
      result[id] = { saves: 0, comments: 0 };
    });
    if (!entityType || !entityIds.length) return result;

    const [saveRows, commentRows] = await Promise.all([
      this.engRepo
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
      const id = Number(r.entityId);
      if (result[id]) result[id].saves = Number(r.count);
    });
    commentRows.forEach((r: any) => {
      const id = Number(r.entityId);
      if (result[id]) result[id].comments = Number(r.count);
    });

    return result;
  }

  // ── Save / share / view / purchase / shipment on a virtual entity ─────────
  @Post()
  @UseGuards(JwtAuthGuard)
  async trackEngagement(
    @Request() req,
    @Body() dto: { entityType: string; entityId: number; type: EngagementType },
  ) {
    const userId = req.user.id;
    if (!dto.entityType || !dto.entityId || !dto.type) {
      throw new BadRequestException(
        'entityType, entityId and type are required',
      );
    }

    // VIEW records once, never toggles off
    if (dto.type === EngagementType.VIEW) {
      const existingView = await this.engRepo.findOne({
        where: {
          userId,
          entityType: dto.entityType,
          entityId: dto.entityId,
          type: EngagementType.VIEW,
        },
      });
      if (!existingView) {
        await this.engRepo.save(
          this.engRepo.create({
            userId,
            entityType: dto.entityType,
            entityId: dto.entityId,
            type: EngagementType.VIEW,
          }),
        );
      }
      return { toggled: true };
    }

    // Everything else toggles on/off (save, share, purchase, shipment)
    const existing = await this.engRepo.findOne({
      where: {
        userId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        type: dto.type,
      },
    });

    if (existing) {
      await this.engRepo.delete(existing.id);
      return { toggled: false };
    }

    await this.engRepo.save(
      this.engRepo.create({
        userId,
        entityType: dto.entityType,
        entityId: dto.entityId,
        type: dto.type,
      }),
    );

    // Notify the owner on a brand-new save
    if (dto.type === EngagementType.SAVE) {
      this.notifyOwner(userId, dto.entityType, dto.entityId, 'save').catch(
        () => {},
      );
    }

    return { toggled: true };
  }

  private async notifyOwner(
    actorId: number,
    entityType: string,
    entityId: number,
    kind: 'save' | 'comment',
    commentBody?: string,
  ): Promise<void> {
    const owner = await this.owners.resolve(entityType, entityId);
    if (!owner || owner.ownerId === actorId) return;

    const actor = await this.userRepo.findOne({ where: { id: actorId } });
    const actorName = actor?.storeName || actor?.name || 'Someone';

    if (kind === 'save') {
      await this.notifService.notify({
        userId: owner.ownerId,
        type: 'save',
        title: '❤️ New save',
        body: `${actorName} saved "${owner.title}"`,
        icon: '❤️',
        actionPage: resolveActionPage(entityType),
        // For entityType 'business' the entityId IS the businessId, and
        // CommerceProfile defaults to the Products tab — append "-feed" so
        // the owner lands on the Posts/Feed tab where the saved post lives.
        // For a real product/classified/service, "-comments" tells that
        // detail page to open on its comment thread instead of its default
        // tab — otherwise there's nowhere on that page to actually see it.
        actionParam:
          entityType === 'business'
            ? `${entityId}-feed`
            : `${entityId}-comments`,
        // Which specific profile owns this content — without it, a save on
        // a business-owned classified still lands the owner on their
        // personal profile by default when they tap the notification.
        actionCommerceProfileId: owner.commerceProfileId || undefined,
      });
    } else {
      const preview =
        (commentBody || '').slice(0, 60) +
        ((commentBody || '').length > 60 ? '...' : '');
      await this.notifService.notify({
        userId: owner.ownerId,
        type: 'comment',
        title: '💬 New comment',
        body: `${actorName}: "${preview}"`,
        icon: '💬',
        actionPage: resolveActionPage(entityType),
        actionParam:
          entityType === 'business'
            ? `${entityId}-feed`
            : `${entityId}-comments`,
        actionCommerceProfileId: owner.commerceProfileId || undefined,
      });
    }
  }
}

@Controller('comments')
export class CommentsController {
  constructor(
    @InjectRepository(PostComment) private commentRepo: Repository<PostComment>,
    @InjectRepository(PostEngagement)
    private engRepo: Repository<PostEngagement>,
    @InjectRepository(PostCommentHelpfulVote)
    private helpfulRepo: Repository<PostCommentHelpfulVote>, // NEW
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(CommerceProfile)
    private commerceProfileRepo: Repository<CommerceProfile>,
    private readonly owners: EntityOwnerResolver,
    private readonly notifService: InAppNotificationService,
    private readonly purchaseVerification: PurchaseVerificationService, // NEW
    private readonly aiSummaryProvider: AiSummaryProvider, // NEW
    private readonly aiService: AiService, // NEW — Kentexa AI
    private readonly aiPrompts: AiPromptTemplateService, // NEW — Kentexa AI
  ) {}

  // ── Get comments for a virtual entity ─────────────────────────────────────
  // EXTENDED: now accepts ?filter=all|reviews|questions|media (default
  // 'all', same as before) and returns a pinned AI summary separately.
  // Response shape changed from a bare array to { pinned, items } — update
  // any existing caller (was just `.then(r => setComments(r.data || []))`
  // in HomeFeed.js's CommentSection) to read `.items` instead. Kept the
  // array-compatible fallback below so old callers don't crash outright,
  // but they should be updated to use .items for filter/pinned support.
  @Get()
  async getComments(
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
    @Query('filter') filter: CommentFilter = 'all', // NEW
  ) {
    if (!entityType || !entityId) return { pinned: null, items: [] };
    const eid = Number(entityId);

    // NEW — pinned AI summary, fetched separately, never paginated away
    const pinned = await this.commentRepo.findOne({
      where: {
        entityType,
        entityId: eid,
        type: PostCommentType.AI_SUMMARY,
        isPinned: true,
        isDeleted: false,
      },
      order: { createdAt: 'DESC' },
    });

    const where: any = {
      entityType,
      entityId: eid,
      parentId: IsNull(),
      isDeleted: false,
    };
    if (filter === 'reviews') where.type = PostCommentType.REVIEW;
    if (filter === 'questions') where.type = PostCommentType.QUESTION;
    // 'media' filter needs a raw condition (media IS NOT NULL) — handled via query builder below when set
    if (filter === 'all' && !where.type) {
      // exclude AI_SUMMARY from the main list — it's returned separately, pinned
    }

    let items: PostComment[];
    if (filter === 'media') {
      items = await this.commentRepo
        .createQueryBuilder('c')
        .leftJoinAndSelect('c.author', 'author')
        .leftJoinAndSelect('c.replies', 'replies')
        .leftJoinAndSelect('replies.author', 'replyAuthor')
        .where('c."entityType" = :entityType', { entityType })
        .andWhere('c."entityId" = :entityId', { entityId: eid })
        .andWhere('c."parentId" IS NULL')
        .andWhere('c."isDeleted" = false')
        .andWhere('c.media IS NOT NULL')
        .orderBy('c."createdAt"', 'DESC')
        .getMany();
    } else {
      items = await this.commentRepo.find({
        where:
          filter === 'all'
            ? [
                {
                  entityType,
                  entityId: eid,
                  parentId: IsNull(),
                  isDeleted: false,
                  type: PostCommentType.COMMENT,
                },
                {
                  entityType,
                  entityId: eid,
                  parentId: IsNull(),
                  isDeleted: false,
                  type: PostCommentType.QUESTION,
                },
                {
                  entityType,
                  entityId: eid,
                  parentId: IsNull(),
                  isDeleted: false,
                  type: PostCommentType.REVIEW,
                },
              ]
            : where,
        relations: { author: true, replies: { author: true } },
        order: { createdAt: 'DESC' },
      });
    }

    const [enrichedPinned] = pinned ? await this.attachCommerceProfiles([pinned]) : [null];
    const enrichedItems = await this.attachCommerceProfiles(items);
    return { pinned: enrichedPinned || null, items: enrichedItems };
  }

  // ── Rating summary — NEW ─────────────────────────────────────────────────
  // GET /comments/rating-summary?entityType=product&entityId=42
  @Get('rating-summary')
  async ratingSummary(
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
  ) {
    if (!entityType || !entityId) {
      return {
        average: 0,
        total: 0,
        breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        verifiedPurchaseCount: 0,
      };
    }
    const rows: {
      rating: number;
      purchaseVerification: PurchaseVerification;
    }[] = await this.commentRepo
      .createQueryBuilder('c')
      .select([
        'c.rating AS rating',
        'c."purchaseVerification" AS "purchaseVerification"',
      ])
      .where('c."entityType" = :entityType', { entityType })
      .andWhere('c."entityId" = :entityId', { entityId: Number(entityId) })
      .andWhere('c.type = :t', { t: PostCommentType.REVIEW })
      .andWhere('c."isDeleted" = false')
      .getRawMany();

    const breakdown: Record<1 | 2 | 3 | 4 | 5, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    let sum = 0;
    let verifiedPurchaseCount = 0;
    rows.forEach((r) => {
      const rating = Number(r.rating) as 1 | 2 | 3 | 4 | 5;
      if (rating >= 1 && rating <= 5) breakdown[rating]++;
      sum += Number(r.rating) || 0;
      if (r.purchaseVerification === PurchaseVerification.KENTEXA_PURCHASE)
        verifiedPurchaseCount++;
    });

    return {
      average: rows.length ? Math.round((sum / rows.length) * 10) / 10 : 0,
      total: rows.length,
      breakdown,
      verifiedPurchaseCount,
    };
  }

  // ── Add a comment / question / review on a virtual entity ─────────────────
  // EXTENDED: dto now optionally carries type/rating/media/offlinePurchaseClaim.
  // type defaults to 'comment' — old callers that only send {body, entityType,
  // entityId, parentId} behave exactly as before.
  @Post()
  @UseGuards(JwtAuthGuard)
  async addComment(
    @Request() req,
    @Body()
    dto: {
      body: string;
      entityType: string;
      entityId: number;
      parentId?: number;
      type?: PostCommentType;
      rating?: number;
      media?: { url: string; type: 'image' | 'video' }[]; // NEW
      offlinePurchaseClaim?: boolean; // NEW
      offer?: { entityType: string; entityId: number }; // existing "I Have This" support
      commerceProfileId?: number | null; // which profile the commenter was acting as
    },
  ) {
    if (!dto.entityType || !dto.entityId) {
      throw new BadRequestException('entityType and entityId are required');
    }
    const type = dto.type || PostCommentType.COMMENT;
    if (
      type === PostCommentType.SELLER_REPLY ||
      type === PostCommentType.AI_SUMMARY
    ) {
      throw new BadRequestException(
        'Use /comments/:id/reply or /comments/ai-summary/regenerate for this type.',
      );
    }
    if (type === PostCommentType.REVIEW && !dto.rating) {
      throw new BadRequestException(
        'A star rating (1-5) is required for a review.',
      );
    }
    if (!dto.body?.trim() && !dto.media?.length) {
      throw new BadRequestException(
        'entityType, entityId and body (or media) are required',
      );
    }

    const purchaseVerification =
      type === PostCommentType.REVIEW
        ? await this.purchaseVerification.resolve(
            req.user.id,
            dto.entityType,
            dto.entityId,
            dto.offlinePurchaseClaim,
          )
        : PurchaseVerification.NONE;

    // NEW — Kentexa AI moderation. Fails open: comment creation must never
    // hard-depend on Anthropic's uptime.
    let moderationFlag: 'clean' | 'flagged' | 'blocked' | null = null;
    let moderationReason: string | null = null;
    if (dto.body?.trim()) {
      try {
        const template = this.aiPrompts.moderationPrompt();
        const result = await this.aiService.generate<{
          verdict: 'clean' | 'flagged' | 'blocked';
          reason: string;
        }>({
          task: 'moderation',
          prompt: dto.body.trim(),
          system: template.system,
          schema: template.schema,
          schemaName: template.schemaName,
        });
        const verdict = result.data;
        moderationFlag = verdict.verdict;
        moderationReason = verdict.verdict === 'clean' ? null : verdict.reason;
        if (verdict.verdict === 'blocked') {
          throw new BadRequestException(
            'This comment could not be posted: ' + verdict.reason,
          );
        }
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        // AI unavailable/errored — fail open, don't block the comment.
        moderationFlag = null;
        moderationReason = null;
      }
    }

    const comment = await this.commentRepo.save(
      this.commentRepo.create({
        entityType: dto.entityType,
        entityId: dto.entityId,
        authorId: req.user.id,
        commerceProfileId: dto.commerceProfileId || null,
        body: dto.body?.trim() || null,
        parentId: dto.parentId || null,
        type, // NEW
        rating: type === PostCommentType.REVIEW ? dto.rating! : null, // NEW
        media: dto.media?.length ? dto.media : null, // NEW
        purchaseVerification, // NEW
        offerEntityType: dto.offer?.entityType || null,
        offerEntityId: dto.offer?.entityId || null,
        moderationFlag, // NEW — Kentexa AI
        moderationReason, // NEW — Kentexa AI
      }),
    );

    // Count this as a CVS-worthy engagement too (only for top-level questions/comments)
    if (!dto.parentId) {
      await this.engRepo
        .save(
          this.engRepo.create({
            userId: req.user.id,
            entityType: dto.entityType,
            entityId: dto.entityId,
            type: EngagementType.COMMENT,
          }),
        )
        .catch(() => {});

      // Notify the owner about the new question/comment/review
      this.notifyOwner(
        req.user.id,
        dto.entityType,
        dto.entityId,
        'comment',
        dto.body,
        dto.commerceProfileId,
      ).catch(() => {});
    }

    // NEW — refresh rating aggregate implicitly happens live at read time
    // (getRatingSummary queries directly), no denormalized column to update.

    const saved = await this.commentRepo.findOne({
      where: { id: comment.id },
      relations: { author: true },
    });
    return saved ? (await this.attachCommerceProfiles([saved]))[0] : saved;
  }

  // Resolves which CommerceProfile each commenter was acting as (and their
  // replies'), so the thread shows the business/agent/etc. identity they
  // actually commented as — not always their personal account. Same gap
  // "Sold by" links and the Home feed had before this pass; comments were
  // never wired up at all until now.
  private async attachCommerceProfiles(comments: PostComment[]): Promise<any[]> {
    const flat: PostComment[] = [];
    comments.forEach((c) => {
      flat.push(c);
      (c.replies || []).forEach((r) => flat.push(r));
    });
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

  // ── Seller reply — NEW ────────────────────────────────────────────────────
  // POST /comments/:id/reply  { body }
  @Post(':id/reply')
  @UseGuards(JwtAuthGuard)
  async reply(
    @Request() req,
    @Param('id') id: string,
    @Body('body') body: string,
  ) {
    if (!body?.trim()) throw new BadRequestException('body is required');
    const parent = await this.commentRepo.findOne({
      where: { id: Number(id), isDeleted: false },
    });
    if (!parent) throw new NotFoundException('Comment not found');
    if (parent.parentId)
      throw new BadRequestException('Can only reply to a top-level comment.');
    if (!parent.entityType || !parent.entityId) {
      throw new BadRequestException(
        'Seller reply is only supported on entity-based comments right now.',
      );
    }

    const owner = await this.owners.resolve(parent.entityType, parent.entityId);
    if (!owner || owner.ownerId !== req.user.id) {
      throw new ForbiddenException(
        'Only the business/seller behind this listing can reply.',
      );
    }

    const reply = await this.commentRepo.save(
      this.commentRepo.create({
        entityType: parent.entityType,
        entityId: parent.entityId,
        authorId: req.user.id,
        type: PostCommentType.SELLER_REPLY,
        parentId: parent.id,
        body: body.trim(),
        purchaseVerification: PurchaseVerification.NONE,
      }),
    );
    return this.commentRepo.findOne({
      where: { id: reply.id },
      relations: { author: true },
    });
  }

  // ── AI-drafted reply — NEW — Kentexa AI ───────────────────────────────────
  // POST /comments/:id/draft-reply — suggests reply text only. Never saves
  // a comment; the seller reviews/edits and sends via POST /comments/:id/reply.
  @Post(':id/draft-reply')
  @UseGuards(JwtAuthGuard)
  async draftReply(@Request() req, @Param('id') id: string) {
    const parent = await this.commentRepo.findOne({
      where: { id: Number(id), isDeleted: false },
    });
    if (!parent) throw new NotFoundException('Comment not found');
    if (!parent.entityType || !parent.entityId) {
      throw new BadRequestException(
        'AI reply drafts are only supported on entity-based comments right now.',
      );
    }

    const owner = await this.owners.resolve(parent.entityType, parent.entityId);
    if (!owner || owner.ownerId !== req.user.id) {
      throw new ForbiddenException(
        'Only the business/seller behind this listing can draft a reply.',
      );
    }
    if (!parent.body?.trim()) {
      throw new BadRequestException('Comment has no text to reply to.');
    }

    const template = this.aiPrompts.replyDraftPrompt();
    const result = await this.aiService.generate<{ draftText: string }>({
      task: 'reply-draft',
      prompt: parent.body.trim(),
      system: template.system,
      schema: template.schema,
      schemaName: template.schemaName,
      userId: req.user.id,
    });
    return { draftText: result.data.draftText };
  }

  // ── Helpful toggle — NEW ──────────────────────────────────────────────────
  // POST /comments/:id/helpful
  @Post(':id/helpful')
  @UseGuards(JwtAuthGuard)
  async toggleHelpful(@Request() req, @Param('id') id: string) {
    const commentId = Number(id);
    const comment = await this.commentRepo.findOne({
      where: { id: commentId, isDeleted: false },
    });
    if (!comment) throw new NotFoundException('Comment not found');

    const existing = await this.helpfulRepo.findOne({
      where: { commentId, userId: req.user.id },
    });
    if (existing) {
      await this.helpfulRepo.remove(existing);
      comment.helpfulCount = Math.max(0, comment.helpfulCount - 1);
    } else {
      await this.helpfulRepo.save(
        this.helpfulRepo.create({ commentId, userId: req.user.id }),
      );
      comment.helpfulCount += 1;
    }
    await this.commentRepo.save(comment);
    return { helpful: !existing, helpfulCount: comment.helpfulCount };
  }

  // ── AI summary regeneration — NEW — seller/admin triggered ───────────────
  // POST /comments/ai-summary/regenerate?entityType=product&entityId=42&title=...
  @Post('ai-summary/regenerate')
  @UseGuards(JwtAuthGuard)
  async regenerateAiSummary(
    @Request() req,
    @Query('entityType') entityType: string,
    @Query('entityId') entityId: string,
    @Query('title') title = 'this listing',
  ) {
    if (!entityType || !entityId)
      throw new BadRequestException('entityType and entityId are required');
    const eid = Number(entityId);
    const owner = await this.owners.resolve(entityType, eid);
    if (!owner || owner.ownerId !== req.user.id) {
      // TODO: also allow admin/manager roles through once role is available here.
      throw new ForbiddenException(
        'Only the business behind this listing can regenerate the AI summary.',
      );
    }

    const reviews = await this.commentRepo.find({
      where: {
        entityType,
        entityId: eid,
        type: PostCommentType.REVIEW,
        isDeleted: false,
      },
      order: { createdAt: 'DESC' },
      take: 30,
    });
    const bodies = reviews
      .map((r) => r.body)
      .filter((b): b is string => !!b?.trim());
    const summaryText = await this.aiSummaryProvider.generateSummaryText(
      bodies,
      title,
    );

    await this.commentRepo.update(
      {
        entityType,
        entityId: eid,
        type: PostCommentType.AI_SUMMARY,
        isPinned: true,
      },
      { isPinned: false },
    );

    const summary = await this.commentRepo.save(
      this.commentRepo.create({
        entityType,
        entityId: eid,
        authorId: null,
        type: PostCommentType.AI_SUMMARY,
        body: summaryText,
        isPinned: true,
        purchaseVerification: PurchaseVerification.NONE,
      }),
    );
    return summary;
  }

  // ── Delete (soft) — NEW ───────────────────────────────────────────────────
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Request() req, @Param('id') id: string) {
    const commentId = Number(id);
    const comment = await this.commentRepo.findOne({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    const isAdmin = req.user.role === 'admin' || req.user.role === 'manager';
    if (comment.authorId !== req.user.id && !isAdmin) {
      throw new ForbiddenException('You can only delete your own comment.');
    }
    await this.commentRepo.update({ id: commentId }, { isDeleted: true });
    return { deleted: true };
  }

  private async notifyOwner(
    actorId: number,
    entityType: string,
    entityId: number,
    kind: 'save' | 'comment',
    commentBody?: string,
    actorCommerceProfileId?: number | null,
  ): Promise<void> {
    const owner = await this.owners.resolve(entityType, entityId);
    if (!owner || owner.ownerId === actorId) return;

    const actor = await this.userRepo.findOne({ where: { id: actorId } });
    // The commenter's own acting-as profile (already stored on PostComment,
    // just never read back out here) wins over their raw account name —
    // a comment left while acting as a business should say so, not always
    // show the personal account name underneath it.
    const actorProfile = actorCommerceProfileId
      ? await this.commerceProfileRepo.findOne({ where: { id: actorCommerceProfileId } }).catch(() => null)
      : null;
    const actorName = actorProfile?.displayName || actor?.storeName || actor?.name || 'Someone';
    const preview =
      (commentBody || '').slice(0, 60) +
      ((commentBody || '').length > 60 ? '...' : '');

    await this.notifService.notify({
      userId: owner.ownerId,
      type: 'comment',
      title: '💬 New comment',
      body: `${actorName}: "${preview}"`,
      icon: '💬',
      actionPage: resolveActionPage(entityType),
      actionParam:
        entityType === 'business' ? `${entityId}-feed` : `${entityId}-comments`,
      actionCommerceProfileId: owner.commerceProfileId || undefined,
    });
  }
}
