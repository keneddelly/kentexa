import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { v2 as cloudinary } from 'cloudinary';
import { Product } from './entities/products.entity';
import { ProductReview } from './entities/product-review.entity';
import { DigitalProductAsset } from './entities/digital-product-asset.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { User, UserRole } from '../users/entities/user.entity';
import { FeedService } from '../feed/feed.service';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import { CommerceProfileScopeService } from '../commerce-profiles/commerce-profile-scope.service';
import { CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';
import { SearchIndexService } from '../search/search-index.service';
import { normalizeSearchQuery } from '../search/search-term-normalizer.util';
import { buildMultiTermLikeClause } from '../search/search-query.util';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { SellerRankingService } from './seller-ranking.service';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryMovementReason } from '../inventory/entities/inventory-movement.entity';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';
import { validateAttributes } from '../categories/categories.data';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private repo: Repository<Product>,

    @InjectRepository(ProductReview)
    private reviewRepo: Repository<ProductReview>,

    @InjectRepository(SellerProfile)
    private sellerProfileRepo: Repository<SellerProfile>,

    @InjectRepository(Order)
    private orderRepo: Repository<Order>,

    @InjectRepository(DigitalProductAsset)
    private digitalAssetRepo: Repository<DigitalProductAsset>,

    private readonly feedService: FeedService,
    private readonly commerceProfiles: CommerceProfilesService,
    private readonly profileScope: CommerceProfileScopeService,
    private readonly searchIndex: SearchIndexService,
    private readonly ranking: SellerRankingService,
    private readonly inventory: InventoryService,
    private readonly activityEvents: ActivityEventService,
  ) {}

  // Batches verificationTier for a set of products' sellers in one query —
  // avoids joining SellerProfile into the main product query (a different
  // table, keyed by userId, not a Product/User relation) for every listing
  // fetch when most requests don't need it beyond ranking.
  private async rankByRelevance<
    T extends {
      id: number;
      createdAt: Date;
      salesCount?: number;
      seller?: {
        id?: number;
        reputationScore?: number;
        isVerified?: boolean;
      } | null;
    },
  >(products: T[]): Promise<T[]> {
    const sellerIds = [
      ...new Set(products.map((p) => p.seller?.id).filter(Boolean)),
    ] as number[];
    const tierBySellerId = new Map<number, string>();
    if (sellerIds.length > 0) {
      const profiles = await this.sellerProfileRepo
        .createQueryBuilder('sp')
        .leftJoin('sp.user', 'u')
        .select(['sp.verificationTier', 'u.id'])
        .where('u.id IN (:...sellerIds)', { sellerIds })
        .getMany();
      for (const p of profiles) tierBySellerId.set(p.user.id, p.verificationTier);
    }
    return this.ranking.rank(
      products.map((p) => ({
        ...p,
        salesCount: (p as any).salesCount || 0,
        sellerReputationScore: p.seller?.reputationScore || 0,
        sellerIsVerified: !!p.seller?.isVerified,
        sellerVerificationTier: p.seller?.id
          ? tierBySellerId.get(p.seller.id) || null
          : null,
      })),
    );
  }

  async findAll(category?: string, attributes?: Record<string, string> | null) {
    const query = this.repo
      .createQueryBuilder('p')
      .leftJoin('p.seller', 'seller')
      .addSelect([
        'seller.id',
        'seller.name',
        'seller.storeName',
        'seller.logo',
        'seller.businessLocation',
        'seller.reputationScore',
        'seller.followersCount',
        'seller.isVerified',
        'seller.isOfficialStore',
        'seller.storeWhatsApp',
        'seller.phone',
        'seller.role',
      ])
      .where('p.isAvailable = :isAvailable', { isAvailable: true })
      .andWhere('p.availableOnline = :availableOnline', { availableOnline: true });
    if (category) query.andWhere('p.category = :category', { category });
    // Same structured attribute filtering as search() — lets CategoryPage.js's
    // dynamic filter chips (e.g. Color, Brand) narrow a plain category browse,
    // not just a keyword search.
    if (attributes) {
      Object.entries(attributes).forEach(([key, value], i) => {
        if (!value) return;
        const param = `catAttrVal${i}`;
        query.andWhere(
          `LOWER(p.specs ->> '${key.replace(/[^a-z0-9_]/gi, '')}') LIKE :${param}`,
          { [param]: `%${value.toLowerCase()}%` },
        );
      });
    }
    const products = await query.orderBy('p.createdAt', 'DESC').getMany();
    return this.rankByRelevance(products);
  }

  async search(
    query: string,
    filters?: {
      category?: string | null;
      minPrice?: number | null;
      maxPrice?: number | null;
      location?: string | null;
      attributes?: Record<string, string> | null;
    },
  ) {
    const qb = this.repo
      .createQueryBuilder('p')
      .leftJoin('p.seller', 'seller')
      .addSelect([
        'seller.id',
        'seller.name',
        'seller.storeName',
        'seller.logo',
        'seller.businessLocation',
        'seller.reputationScore',
        'seller.followersCount',
        'seller.isVerified',
        'seller.isOfficialStore',
        'seller.storeWhatsApp',
        'seller.phone',
        'seller.role',
      ])
      .where('p.isAvailable = :isAvailable', { isAvailable: true })
      .andWhere('p.availableOnline = :availableOnline', { availableOnline: true });

    // Query normalization layer — see search-term-normalizer.util.ts.
    // "kamera" now also matches products titled "camera" (and vice versa),
    // plurals, and known Tanzanian marketplace terminology.
    const { patterns } = normalizeSearchQuery(query);
    const { clause, params } = buildMultiTermLikeClause(
      ['LOWER(p.name)', 'LOWER(p.description)', 'LOWER(p.category)'],
      patterns,
      'kw',
    );
    qb.andWhere(clause, params);

    // NEW — Kentexa AI search-query parsing (opt-in, ?ai=true)
    if (filters?.category) {
      qb.andWhere('LOWER(p.category) = :aiCategory', {
        aiCategory: filters.category.toLowerCase(),
      });
    }
    if (filters?.minPrice != null) {
      qb.andWhere('p.basePrice >= :minPrice', { minPrice: filters.minPrice });
    }
    if (filters?.maxPrice != null) {
      qb.andWhere('p.basePrice <= :maxPrice', { maxPrice: filters.maxPrice });
    }
    if (filters?.location) {
      qb.andWhere('LOWER(p.sellerCity) LIKE :location', {
        location: `%${filters.location.toLowerCase()}%`,
      });
    }
    // Structured attribute filtering (e.g. attr_color=Black) against the
    // existing `specs` JSONB column — no schema change. Multiselect values
    // are stored comma-separated within one specs value, so a single stored
    // value like "Black,White" matches a filter of either color.
    if (filters?.attributes) {
      Object.entries(filters.attributes).forEach(([key, value], i) => {
        if (!value) return;
        const param = `attrVal${i}`;
        qb.andWhere(
          `LOWER(p.specs ->> '${key.replace(/[^a-z0-9_]/gi, '')}') LIKE :${param}`,
          { [param]: `%${value.toLowerCase()}%` },
        );
      });
    }

    const products = await qb.orderBy('p.createdAt', 'DESC').getMany();
    return this.rankByRelevance(products);
  }

  async findOne(id: number) {
    const product = await this.repo.findOne({
      where: { id },
      relations: { seller: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    // Prefer the SPECIFIC profile this product was actually posted as
    // (stored at creation time — see create()). Only products that predate
    // the commerceProfileId column fall back to "the account's business
    // identity," matching the original behavior for those. This was
    // previously hardcoded to always resolve BUSINESS regardless of which
    // profile actually posted it — the same fix already applied to
    // ClassifiedsService.findOne() (profile-architecture-audit-2026-08).
    const commerceProfile = product.commerceProfileId
      ? await this.commerceProfiles.findById(product.commerceProfileId).catch(() => null)
      : product.seller
        ? await this.commerceProfiles
            .findForUserByType(product.seller.id, CommerceProfileType.BUSINESS)
            .catch(() => null)
        : null;

    return {
      ...product,
      commerceProfile: commerceProfile
        ? {
            id: commerceProfile.id,
            username: commerceProfile.username,
            displayName: commerceProfile.displayName,
            photoUrl: commerceProfile.photoUrl,
            followersCount: commerceProfile.followersCount,
            rating: commerceProfile.rating,
          }
        : null,
    };
  }

  async findBySeller(sellerId: number) {
    return this.repo.find({
      where: { seller: { id: sellerId }, isAvailable: true, availableOnline: true },
      order: { createdAt: 'DESC' },
    });
  }

  // findBySeller() above returns every product the ACCOUNT has ever
  // listed — personal and business mixed together, since it only filters
  // by seller.id. This scopes to the exact profile that was active when
  // each product was posted, same fallback rule findOne() applies: a
  // BUSINESS profile's tab also shows legacy products (posted before
  // commerceProfileId existed) since those defaulted to the business
  // identity anyway; a PERSONAL profile's tab only shows products
  // explicitly tagged to it. Mirrors
  // ClassifiedsService.findByCommerceProfile() exactly
  // (profile-architecture-audit-2026-08).
  async findByCommerceProfile(commerceProfileId: number) {
    const profile = await this.commerceProfiles
      .findById(commerceProfileId)
      .catch(() => null);
    if (!profile) return [];

    const qb = this.repo
      .createQueryBuilder('p')
      .where('p."isAvailable" = true')
      .andWhere('p."availableOnline" = true');

    if (profile.type === CommerceProfileType.BUSINESS && profile.ownerId) {
      qb.andWhere(
        '(p."commerceProfileId" = :commerceProfileId OR (p."commerceProfileId" IS NULL AND p."sellerId" = :ownerId))',
        { commerceProfileId, ownerId: profile.ownerId },
      );
    } else {
      qb.andWhere('p."commerceProfileId" = :commerceProfileId', {
        commerceProfileId,
      });
    }

    return qb.orderBy('p.createdAt', 'DESC').getMany();
  }

  // commerceProfileId scopes this to whichever profile is currently
  // active, unfiltered by availability (unlike findByCommerceProfile,
  // which is the public-facing "browse this profile's storefront" view) —
  // a seller managing their own catalog needs to see unavailable/hidden
  // products too, just only the ones under the active profile. Omitting
  // it keeps the old account-wide behavior for any caller that doesn't
  // send it yet (profile-architecture-audit-2026-08 Stage 6).
  async findMyProducts(user: User, commerceProfileId?: number) {
    const qb = this.repo
      .createQueryBuilder('p')
      .where('p."sellerId" = :sid', { sid: user.id })
      .orderBy('p.createdAt', 'DESC');
    if (commerceProfileId) {
      qb.andWhere(
        '(p."commerceProfileId" = :cpid OR p."commerceProfileId" IS NULL)',
        { cpid: commerceProfileId },
      );
    }
    const products = await qb.getMany();
    return this.attachReservedStock(products);
  }

  // "Reserved" is derived, not a stored column (see the BIS POS plan) —
  // Product.stock already IS available stock today, since online orders
  // decrement it immediately at creation. Reserved is purely informational:
  // how much of the seller's PHYSICAL stock (stock + reserved) is tied up
  // in orders a buyer hasn't finished paying for yet.
  private async attachReservedStock<T extends { id: number }>(
    products: T[],
  ): Promise<(T & { reservedStock: number })[]> {
    if (products.length === 0) return [];
    const ids = products.map((p) => p.id);
    const rows = await this.orderRepo
      .createQueryBuilder('o')
      .innerJoin('o.product', 'p')
      .select('p.id', 'productId')
      .addSelect('SUM(o.quantity)', 'reserved')
      .where('p.id IN (:...ids)', { ids })
      .andWhere('o.status = :status', { status: OrderStatus.PENDING_PAYMENT })
      .groupBy('p.id')
      .getRawMany<{ productId: number; reserved: string }>();
    const reservedMap = new Map(rows.map((r) => [r.productId, Number(r.reserved)]));
    return products.map((p) => ({ ...p, reservedStock: reservedMap.get(p.id) || 0 }));
  }

  // Barcode wins when both are given — a scan is unambiguous, a typed SKU
  // is more likely to be a partial/fuzzy entry at a busy POS counter.
  async findBySkuOrBarcode(
    sellerId: number,
    query: { sku?: string; barcode?: string },
  ) {
    if (query.barcode) {
      const byBarcode = await this.repo.findOne({
        where: { seller: { id: sellerId }, barcode: query.barcode },
      });
      if (byBarcode) return byBarcode;
    }
    if (query.sku) {
      return this.repo.findOne({
        where: { seller: { id: sellerId }, sku: query.sku },
      });
    }
    return null;
  }

  async findAllAdmin() {
    return this.repo.find({
      relations: { seller: true },
      order: { createdAt: 'DESC' },
    });
  }

  // isFeatured/isRecommended are curatorial (platform merchandising), not
  // something a seller sets on their own product — hence a dedicated
  // admin-only endpoint rather than being part of UpdateProductDto.
  async setBadges(
    id: number,
    dto: { isFeatured?: boolean; isRecommended?: boolean },
  ) {
    const product = await this.repo.findOne({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');

    const update: Partial<Product> = {};
    if (dto.isFeatured !== undefined) update.isFeatured = dto.isFeatured;
    if (dto.isRecommended !== undefined)
      update.isRecommended = dto.isRecommended;

    await this.repo.update(id, update);
    return { message: 'Badges updated', ...update };
  }

  async create(dto: CreateProductDto, seller?: User): Promise<Product> {
    const isDigital = dto.productType === 'digital';

    // Layer 1 seller verification's one hard gate for digital products:
    // no eBook/PDF without an explicit self-declared ownership claim.
    // This replaces demanding BRELA registration just to sell a file.
    if (isDigital && !dto.digitalAsset?.copyrightDeclared) {
      throw new BadRequestException(
        'You must declare that you own the rights to this file before selling it.',
      );
    }

    const attributeErrors = validateAttributes(
      dto.category || 'general',
      dto.subcategory,
      dto.specs,
    );
    if (attributeErrors.length) {
      throw new BadRequestException(attributeErrors.join('; '));
    }

    const basePrice = Number(dto.basePrice || 0);
    // Digital goods are never shipped — never carry a delivery fee,
    // regardless of what was computed/passed for a physical listing.
    const deliveryFee = isDigital ? 0 : Number(dto.deliveryFee || 0);
    const displayPrice = basePrice + deliveryFee;

    // Attributes the product to whichever profile was active when it was
    // posted — same fix already applied to Classifieds/Moments. Without
    // this, every product's Moment/post-card silently resolved to the
    // owner's personal profile instead of the business shown on the card.
    // Authorization is never trusted from the client.
    let commerceProfileId: number | null = null;
    if (dto.commerceProfileId && seller?.id) {
      const authorized = await this.profileScope.isAuthorizedFor(
        seller.id,
        dto.commerceProfileId,
        'canManageProducts',
      );
      if (!authorized) {
        throw new ForbiddenException('You do not manage this commerce profile');
      }
      commerceProfileId = dto.commerceProfileId;
    }

    const product = this.repo.create({
      name: dto.name,
      description: dto.description || null,
      basePrice,
      deliveryFee,
      displayPrice,
      // Digital goods are never out of stock — a large sentinel rather
      // than trusting/validating a client-sent stock count that means
      // nothing for a file.
      stock: isDigital ? 999999 : dto.stock || 0,
      productType: isDigital ? 'digital' : 'physical',
      category: dto.category || 'general',
      subcategory: dto.subcategory || null,
      model: dto.model || null,
      specs: dto.specs || null,
      features: dto.features || null,
      images: dto.images || [],
      isAvailable: dto.isAvailable ?? true,
      isActive: true,
      shippingMethod: dto.shippingMethod,
      estimatedDelivery: dto.estimatedDelivery || null,
      shippingNotes: dto.shippingNotes || null,
      weightKg: dto.weightKg || null,
      bodaFee: Number(dto.bodaFee || 0),
      sellerCity: dto.sellerCity || 'Dar es Salaam',
      seller: seller || null,
      commerceProfileId,
      sku: dto.sku || null,
      barcode: dto.barcode || null,
      costPrice: dto.costPrice ?? null,
      minStockThreshold: dto.minStockThreshold || 0,
      availableOnline: dto.availableOnline ?? true,
      availableInStore: dto.availableInStore ?? true,
      codEnabled: dto.codEnabled ?? false,
    } as any);

    const saved = (await this.repo.save(product)) as unknown as Product;

    if (isDigital && dto.digitalAsset) {
      await this.digitalAssetRepo.save(
        this.digitalAssetRepo.create({
          product: saved,
          cloudinaryPublicId: dto.digitalAsset.cloudinaryPublicId,
          format: dto.digitalAsset.format,
          fileSizeBytes: dto.digitalAsset.fileSizeBytes,
          licenseType: dto.digitalAsset.licenseType || null,
          copyrightDeclaredAt: new Date(),
        }),
      );
      this.activityEvents.record({
        eventType: 'DIGITAL_PRODUCT_CREATED',
        category: ActivityCategory.COMMERCE,
        actorId: seller?.id ?? null,
        actorType: 'seller',
        targetType: 'product',
        targetId: saved.id,
        metadata: { format: dto.digitalAsset.format, fileSizeBytes: dto.digitalAsset.fileSizeBytes },
      });
    }

    // Auto-share as a Moment — fire-and-forget, never blocks product creation.
    // price is passed as real data (not burned into the image pixels — see
    // the removed price-overlay.util) so HomeFeed.js's existing clean price
    // badge, already used for the classifieds/products/services fallback
    // mix, renders for this too instead of a cluttered on-image banner.
    if (seller?.id) {
      this.feedService
        .publish(seller.id, {
          type: 'moment',
          title: saved.name,
          imageUrl: saved.images?.[0],
          linkedEntityType: 'product',
          linkedEntityId: saved.id,
          category: saved.category || undefined,
          price: Number(saved.displayPrice) || undefined,
          commerceProfileId: commerceProfileId || undefined,
        })
        .catch(() => {});
    }

    this.searchIndex
      .upsert('product', saved.id, [saved.name, saved.description, saved.category].filter(Boolean).join(' \n '))
      .catch(() => {});

    return saved;
  }

  async update(
    id: number,
    dto: UpdateProductDto,
    user: User,
  ): Promise<Product> {
    const product = await this.findOne(id);

    if (user.role !== UserRole.ADMIN) {
      if (!product.seller || product.seller.id !== user.id) {
        throw new ForbiddenException('You can only edit your own products');
      }
    }

    if (dto.category || dto.subcategory || dto.specs) {
      const attributeErrors = validateAttributes(
        dto.category || product.category || 'general',
        dto.subcategory ?? product.subcategory,
        dto.specs ?? product.specs,
      );
      if (attributeErrors.length) {
        throw new BadRequestException(attributeErrors.join('; '));
      }
    }

    // Recalculate displayPrice if pricing changed
    const newBasePrice = Number(dto.basePrice ?? product.basePrice);
    const newDeliveryFee = Number(dto.deliveryFee ?? product.deliveryFee);
    const displayPriceChanged =
      dto.basePrice !== undefined || dto.deliveryFee !== undefined;

    Object.assign(product, dto);
    if (displayPriceChanged) {
      product.displayPrice = newBasePrice + newDeliveryFee;
    }
    const saved = await this.repo.save(product);
    this.searchIndex
      .upsert('product', saved.id, [saved.name, saved.description, saved.category].filter(Boolean).join(' \n '))
      .catch(() => {});
    return saved;
  }

  async remove(id: number, user: User) {
    const product = await this.repo.findOne({
      where: { id },
      relations: { seller: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (user.role !== UserRole.ADMIN && product.seller?.id !== user.id) {
      throw new ForbiddenException('You can only delete your own products');
    }
    await this.repo.remove(product);
    this.searchIndex.remove('product', id).catch(() => {});
    return { message: 'Product deleted successfully' };
  }

  // Delegates to InventoryService so every stock change — regardless of
  // which channel triggered it — goes through the same transactional,
  // row-locked mutation and gets one InventoryMovement audit row. `quantity`
  // keeps its existing sign convention here (positive = decrease stock,
  // negative = restore it, e.g. on order cancellation) for every existing
  // caller; it's just inverted into InventoryService's delta convention.
  async decreaseStock(
    id: number,
    quantity: number,
    reason: InventoryMovementReason = InventoryMovementReason.MANUAL,
    opts: {
      referenceType?: 'order' | 'sale' | null;
      referenceId?: number | null;
      userId?: number | null;
    } = {},
  ) {
    return this.inventory.adjustStock(id, -quantity, reason, opts);
  }

  // ── Social proof: track daily views ──────────────────────────────────────
  // Fire-and-forget from the frontend — resets the counter once per day.
  async trackView(productId: number): Promise<void> {
    const product = await this.repo.findOne({ where: { id: productId } });
    if (!product) return;

    const today = new Date().toISOString().split('T')[0];
    const lastReset = product.viewsResetDate
      ? new Date(product.viewsResetDate).toISOString().split('T')[0]
      : null;

    if (lastReset !== today) {
      // New day — reset counter to 1
      await this.repo.update(productId, {
        viewsToday: 1,
        viewsResetDate: new Date(),
      });
    } else {
      await this.repo.increment({ id: productId }, 'viewsToday', 1);
    }
  }

  // ── Social proof: increment sales count ──────────────────────────────────
  // Called by OrdersService when buyer confirms receipt (order completed).
  async incrementSalesCount(productId: number): Promise<void> {
    try {
      await this.repo.increment({ id: productId }, 'salesCount', 1);
    } catch {
      // Non-critical — never block order completion over this
    }
  }

  // ── Reviews ────────────────────────────────────────────────────────────

  async getReviews(productId: number) {
    return this.reviewRepo.find({
      where: { product: { id: productId } },
      relations: { reviewer: true },
      order: { createdAt: 'DESC' },
    });
  }

  // Called from confirmViaToken when buyer leaves product review
  async addReviewFromOrder(
    productId: number,
    reviewerId: number,
    rating: number,
    comment: string | null,
    orderId: number,
  ): Promise<void> {
    try {
      const existing = await this.reviewRepo.findOne({
        where: { productId, reviewerId },
      });
      // Which business actually sells this product — resolved once here
      // rather than trusted from any caller, same as the Review entity's
      // equivalent lookup in store.service.ts's submitReview().
      const product = await this.repo.findOne({
        where: { id: productId },
        relations: { seller: true },
      });
      const businessProfile = product?.seller
        ? await this.commerceProfiles
            .findForUserByType(product.seller.id, CommerceProfileType.BUSINESS)
            .catch(() => null)
        : null;

      if (existing) {
        await this.reviewRepo.update(existing.id, { rating, comment });
      } else {
        await this.reviewRepo.save(
          this.reviewRepo.create({
            productId,
            reviewerId,
            rating,
            comment,
            isVerifiedPurchase: true,
            orderId,
            commerceProfileId: businessProfile?.id ?? null,
          }),
        );
        if (businessProfile) {
          await this.commerceProfiles
            .recordReview(businessProfile.id, rating)
            .catch(() => {});
        }
      }
      // Update product average rating
      const reviews = await this.reviewRepo.find({ where: { productId } });
      const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
      await this.repo.update(productId, {
        rating: parseFloat(avg.toFixed(1)),
        reviewCount: reviews.length,
      } as any);
    } catch (e) {
      console.error('Product review failed:', e.message);
    }
  }

  async addReview(productId: number, dto: CreateReviewDto, user: any) {
    const product = await this.repo.findOne({
      where: { id: productId },
      relations: { seller: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const userId = user.id ?? user.sub;
    if (!userId) throw new NotFoundException('User not found');

    const existing = await this.reviewRepo.findOne({
      where: { product: { id: productId }, reviewer: { id: userId } },
    });
    if (existing) {
      existing.rating = dto.rating;
      existing.comment = dto.comment;
      return this.reviewRepo.save(existing);
    }

    const businessProfile = product.seller
      ? await this.commerceProfiles
          .findForUserByType(product.seller.id, CommerceProfileType.BUSINESS)
          .catch(() => null)
      : null;

    const review = this.reviewRepo.create({
      product: { id: productId },
      reviewer: { id: userId },
      rating: dto.rating,
      comment: dto.comment,
      isVerifiedPurchase: (dto as any).isVerifiedPurchase || false,
      orderId: (dto as any).orderId || null,
      commerceProfileId: businessProfile?.id ?? null,
    });
    const saved = await this.reviewRepo.save(review);
    if (businessProfile) {
      await this.commerceProfiles
        .recordReview(businessProfile.id, dto.rating)
        .catch(() => {});
    }
    this.activityEvents.record({
      eventType: 'REVIEW_CREATED',
      category: ActivityCategory.REPUTATION,
      actorId: userId,
      actorType: 'buyer',
      businessId: businessProfile?.id ?? null,
      relatedUserId: product.seller?.id ?? null,
      targetType: 'product',
      targetId: productId,
      metadata: { rating: dto.rating },
    });
    return saved;
  }

  // Layer 1 seller verification — purchase-gated digital delivery. Never
  // trusts a client-supplied "I bought this" claim: verifies a real
  // completed Order exists for this exact (product, buyer) pair before
  // generating anything. The returned URL is a short-lived Cloudinary
  // signed download link, never the stored publicId itself — the file
  // stays private (type: 'private') regardless of this URL leaking or
  // expiring.
  async getDownloadUrl(
    productId: number,
    user: User,
  ): Promise<{ downloadUrl: string; expiresAt: number }> {
    const product = await this.repo.findOne({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.productType !== 'digital') {
      throw new ForbiddenException('This product is not a digital download');
    }

    const asset = await this.digitalAssetRepo.findOne({
      where: { product: { id: productId } },
    });
    if (!asset) throw new NotFoundException('Digital file not found');

    const purchase = await this.orderRepo.findOne({
      where: {
        product: { id: productId },
        buyer: { id: user.id },
        status: In([OrderStatus.PAID, OrderStatus.COMPLETED]),
      },
    });
    if (!purchase) {
      throw new ForbiddenException(
        'You must purchase this product before downloading it',
      );
    }

    const expiresAt = Math.floor(Date.now() / 1000) + 5 * 60; // 5 minutes
    const downloadUrl = cloudinary.utils.private_download_url(
      asset.cloudinaryPublicId,
      asset.format,
      { resource_type: 'raw', type: 'private', expires_at: expiresAt },
    );

    this.activityEvents.record({
      eventType: 'DIGITAL_PRODUCT_DELIVERED',
      category: ActivityCategory.COMMERCE,
      actorId: user.id,
      actorType: 'buyer',
      targetType: 'product',
      targetId: productId,
      metadata: { orderId: purchase.id },
    });

    return { downloadUrl, expiresAt };
  }
}
