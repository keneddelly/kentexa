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
import { BrandAuthorizationsService } from '../brands/brand-authorizations.service';
import { BrandsService } from '../brands/brands.service';
import { validateAttributes, validateVariantAttributes } from '../categories/categories.data';
import { ProductVariantGroup } from './entities/product-variant-group.entity';
import { ProductSerial, ProductSerialStatus } from './entities/product-serial.entity';

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

    @InjectRepository(ProductVariantGroup)
    private variantGroupRepo: Repository<ProductVariantGroup>,

    @InjectRepository(ProductSerial)
    private serialRepo: Repository<ProductSerial>,

    private readonly feedService: FeedService,
    private readonly commerceProfiles: CommerceProfilesService,
    private readonly profileScope: CommerceProfileScopeService,
    private readonly searchIndex: SearchIndexService,
    private readonly ranking: SellerRankingService,
    private readonly inventory: InventoryService,
    private readonly activityEvents: ActivityEventService,
    private readonly brandAuthorizations: BrandAuthorizationsService,
    private readonly brands: BrandsService,
  ) {}

  // Live-computed only, never persisted — see brands.module.ts. Used both
  // by product-read serialization and directly by the seller-facing
  // product-creation form (GET /products/brand-status) so a seller sees
  // whether they're authorized before they even submit.
  async getBrandStatus(params: {
    commerceProfileId: number;
    brandId: number;
    category?: string;
    model?: string;
    city?: string;
  }) {
    return this.brandAuthorizations.getBadgeStatus(params.commerceProfileId, {
      brandId: params.brandId,
      category: params.category,
      model: params.model,
      city: params.city,
    });
  }

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
      // AI-parsed free-text brand guess (spec §23) — resolved to a real
      // Brand row below via BrandsService.findByName() before it's ever
      // used as a filter. A name that doesn't resolve is silently
      // ignored, never a hard error — this must never break plain
      // keyword search just because the AI guessed a brand that isn't in
      // Kentexa's own Brand table.
      brand?: string | null;
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
    if (filters?.brand) {
      const resolvedBrand = await this.brands.findByName(filters.brand).catch(() => null);
      if (resolvedBrand) {
        qb.andWhere('p.brandId = :brandId', { brandId: resolvedBrand.id });
      }
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

    // Never persisted, never trusted from the product row itself — see
    // brands.module.ts. Only computed when both a brand and a resolvable
    // commerce profile exist; a product with no brandId simply gets null.
    const brandAuthorizationBadge =
      product.brandId && commerceProfile
        ? (
            await this.brandAuthorizations.getBadgeStatus(commerceProfile.id, {
              brandId: product.brandId,
              category: product.category || undefined,
              model: product.model || undefined,
            })
          ).badge
        : commerceProfile?.isVerified
          ? 'kentexa_verified'
          : null;

    const brand = product.brandId
      ? await this.brands.findOne(product.brandId).catch(() => null)
      : null;

    // ── Variants (Phase B) — sibling Product rows sharing this row's
    // variantGroupId, minimal fields only (this is a picker, not a full
    // product page). Never includes itself. ─────────────────────────────
    const variantGroupId = (product as any).variantGroupId as number | null;
    const variants = variantGroupId
      ? (
          await this.repo.find({
            where: { variantGroupId },
            order: { id: 'ASC' },
          })
        )
          .filter((v) => v.id !== product.id)
          .map((v) => ({
            id: v.id,
            variantAttributes: v.variantAttributes,
            basePrice: v.basePrice,
            displayPrice: v.displayPrice,
            stock: v.stock,
            image: v.images?.[0] || null,
            isAvailable: v.isAvailable,
          }))
      : [];

    // ── Other sellers' offers on the same official catalog item (Phase B,
    // spec §21-22's "compare offers") — never includes this row's own
    // seller. Resolved per-row rather than batched: officialProductId is
    // rare today (brand-managed catalog is admin-only, Phase A/B), so the
    // extra profile lookups are never more than a handful. ──────────────
    const officialProductId = (product as any).officialProductId as number | null;
    let otherOffers: any[] = [];
    if (officialProductId) {
      const others = await this.repo.find({
        where: { officialProductId },
        relations: { seller: true },
        order: { basePrice: 'ASC' },
      });
      otherOffers = (
        await Promise.all(
          others
            .filter((o) => o.id !== product.id)
            .map(async (o) => {
              const offerProfile = o.commerceProfileId
                ? await this.commerceProfiles.findById(o.commerceProfileId).catch(() => null)
                : o.seller
                  ? await this.commerceProfiles
                      .findForUserByType(o.seller.id, CommerceProfileType.BUSINESS)
                      .catch(() => null)
                  : null;
              return {
                productId: o.id,
                commerceProfile: offerProfile
                  ? { id: offerProfile.id, displayName: offerProfile.displayName, photoUrl: offerProfile.photoUrl, rating: offerProfile.rating }
                  : null,
                basePrice: o.basePrice,
                displayPrice: o.displayPrice,
                stock: o.stock,
              };
            }),
        )
      );
    }

    // Cheap existence check only — the seller's own management list (which
    // serials, their status) lives behind GET /products/:id/serials, never
    // exposed on this public read.
    const hasRegisteredSerials = await this.serialRepo.exists({ where: { productId: product.id } });

    return {
      ...product,
      brandAuthorizationBadge,
      brand: brand ? { id: brand.id, name: brand.name, logoUrl: brand.logoUrl } : null,
      variants,
      otherOffers,
      hasRegisteredSerials,
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
      brandId: dto.brandId ?? null,
      officialProductId: dto.officialProductId ?? null,
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

  // ── Variants (Phase B) ────────────────────────────────────────────────────
  // A variant is just another independent Product row (own price/stock/
  // images, own inventory-movement ledger) sharing a variantGroupId with
  // its siblings — see products.entity.ts's own comment on why this was
  // never a restructure of Product. Shared fields (name/category/brand/
  // shipping) are inherited from the source product server-side; the
  // caller only has to supply what actually differs.
  async createVariant(
    sourceProductId: number,
    dto: {
      variantAttributes: Record<string, string>;
      basePrice?: number;
      deliveryFee?: number;
      stock?: number;
      images?: string[];
      sku?: string;
      barcode?: string;
      costPrice?: number;
      minStockThreshold?: number;
      specs?: Record<string, string>;
    },
    user: User,
  ): Promise<Product> {
    const source = await this.findOne(sourceProductId);
    if (user.role !== UserRole.ADMIN) {
      if (!source.seller || source.seller.id !== user.id) {
        throw new ForbiddenException('You can only add variants to your own products');
      }
    }

    const attrErrors = validateVariantAttributes(
      source.category || 'general',
      source.subcategory,
      dto.variantAttributes,
    );
    if (attrErrors.length) {
      throw new BadRequestException(attrErrors.join('; '));
    }

    // Create-if-missing, same idempotent pattern
    // SuperAgentsService.createParcelForOrder() already uses — the FIRST
    // variant created against a plain product retroactively backfills a
    // group onto that original product too, so it joins its own variant's
    // group instead of staying an orphan the picker never shows.
    let variantGroupId = (source as any).variantGroupId as number | null;
    if (!variantGroupId) {
      const group = await this.variantGroupRepo.save(
        this.variantGroupRepo.create({
          name: source.name,
          brandId: (source as any).brandId ?? null,
          officialProductId: (source as any).officialProductId ?? null,
          category: source.category || 'general',
          subcategory: source.subcategory ?? null,
        }),
      );
      variantGroupId = group.id;
      await this.repo.update(sourceProductId, { variantGroupId });
    }

    const basePrice = dto.basePrice !== undefined ? Number(dto.basePrice) : Number(source.basePrice);
    const deliveryFee = dto.deliveryFee !== undefined ? Number(dto.deliveryFee) : Number(source.deliveryFee);

    const variant = this.repo.create({
      name: source.name,
      description: source.description,
      basePrice,
      deliveryFee,
      displayPrice: basePrice + deliveryFee,
      stock: dto.stock ?? 0,
      productType: source.productType,
      category: source.category,
      subcategory: source.subcategory,
      model: source.model,
      brandId: (source as any).brandId ?? null,
      officialProductId: (source as any).officialProductId ?? null,
      variantGroupId,
      variantAttributes: dto.variantAttributes,
      specs: dto.specs ?? source.specs,
      features: source.features,
      images: dto.images ?? [],
      isAvailable: true,
      isActive: true,
      shippingMethod: source.shippingMethod,
      estimatedDelivery: source.estimatedDelivery,
      shippingNotes: source.shippingNotes,
      weightKg: source.weightKg,
      bodaFee: Number(source.bodaFee || 0),
      sellerCity: source.sellerCity,
      seller: source.seller,
      commerceProfileId: (source as any).commerceProfileId ?? null,
      sku: dto.sku || null,
      barcode: dto.barcode || null,
      costPrice: dto.costPrice ?? null,
      minStockThreshold: dto.minStockThreshold || 0,
      availableOnline: source.availableOnline,
      availableInStore: source.availableInStore,
      codEnabled: source.codEnabled,
    } as any);

    const saved = (await this.repo.save(variant)) as unknown as Product;

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

  // ── Serial/IMEI authenticity tracking (spec §14) ─────────────────────────
  // Deliberately NOT wired into OrdersService/SalesService's transaction
  // path — assignSerial() below is always a manual seller action, keeping
  // this feature fully out of checkout/POS's transaction-critical code.

  private normalizeSerial(raw: string): string {
    return String(raw || '').trim().toUpperCase();
  }

  async registerSerials(
    productId: number,
    serialNumbers: string[],
    user: User,
  ): Promise<{ registered: string[]; duplicates: string[] }> {
    const product = await this.findOne(productId);
    if (user.role !== UserRole.ADMIN) {
      if (!product.seller || product.seller.id !== user.id) {
        throw new ForbiddenException('You can only register serials for your own products');
      }
    }

    const registered: string[] = [];
    const duplicates: string[] = [];

    for (const raw of serialNumbers || []) {
      const serialNumber = this.normalizeSerial(raw);
      if (!serialNumber) continue;

      const existing = await this.serialRepo.findOne({ where: { serialNumber } });
      if (existing) {
        duplicates.push(serialNumber);
        // A serial already registered elsewhere being submitted again is a
        // fraud signal (counterfeit/relabeled unit, or a copied real one) —
        // never silently allowed, and never lets the rest of a batch fail.
        this.activityEvents.record({
          eventType: 'DUPLICATE_SERIAL_REGISTRATION_ATTEMPT',
          category: ActivityCategory.SECURITY,
          actorId: user.id,
          targetType: 'product',
          targetId: productId,
          metadata: {
            serialNumber,
            existingProductId: existing.productId,
            attemptedProductId: productId,
          },
        });
        continue;
      }

      await this.serialRepo.save(
        this.serialRepo.create({
          productId,
          serialNumber,
          status: ProductSerialStatus.IN_STOCK,
          registeredByUserId: user.id,
        }),
      );
      registered.push(serialNumber);
    }

    return { registered, duplicates };
  }

  async getSerials(productId: number, user: User): Promise<ProductSerial[]> {
    const product = await this.findOne(productId);
    if (user.role !== UserRole.ADMIN) {
      if (!product.seller || product.seller.id !== user.id) {
        throw new ForbiddenException('You can only view serials for your own products');
      }
    }
    return this.serialRepo.find({ where: { productId }, order: { createdAt: 'DESC' } });
  }

  private async loadOwnedSerial(serialId: number, user: User): Promise<ProductSerial> {
    const serial = await this.serialRepo.findOne({ where: { id: serialId } });
    if (!serial) throw new NotFoundException('Serial not found');
    const product = await this.findOne(serial.productId);
    if (user.role !== UserRole.ADMIN) {
      if (!product.seller || product.seller.id !== user.id) {
        throw new ForbiddenException('You can only manage serials for your own products');
      }
    }
    return serial;
  }

  async assignSerial(
    serialId: number,
    dto: { orderId?: number; saleId?: number },
    user: User,
  ): Promise<ProductSerial> {
    const serial = await this.loadOwnedSerial(serialId, user);
    if (!dto.orderId && !dto.saleId) {
      throw new BadRequestException('orderId or saleId is required');
    }
    serial.status = ProductSerialStatus.SOLD;
    serial.soldReferenceType = dto.orderId ? 'order' : 'sale';
    serial.soldReferenceId = dto.orderId ?? dto.saleId ?? null;
    serial.soldAt = new Date();
    return this.serialRepo.save(serial);
  }

  async reportSerial(
    serialId: number,
    status: ProductSerialStatus.REPORTED_LOST | ProductSerialStatus.REPORTED_STOLEN,
    user: User,
  ): Promise<ProductSerial> {
    const serial = await this.loadOwnedSerial(serialId, user);
    serial.status = status;
    return this.serialRepo.save(serial);
  }

  // Public — no auth. A customer scans/types a serial and learns whether
  // it's a genuine registered unit, sold by whom, and whether it's been
  // reported lost/stolen. Never returns buyer identity or order details —
  // this is an authenticity check, not an order lookup. A not-found result
  // never distinguishes "no such serial" from "serial exists but belongs
  // to a product/seller we won't describe" — both look identical.
  async verifySerial(code: string) {
    const serialNumber = this.normalizeSerial(code);
    if (!serialNumber) return { found: false };

    const serial = await this.serialRepo.findOne({ where: { serialNumber } });
    if (!serial) return { found: false };

    const product = await this.repo.findOne({ where: { id: serial.productId }, relations: { seller: true } });
    if (!product) return { found: false };

    const commerceProfile = product.commerceProfileId
      ? await this.commerceProfiles.findById(product.commerceProfileId).catch(() => null)
      : product.seller
        ? await this.commerceProfiles
            .findForUserByType(product.seller.id, CommerceProfileType.BUSINESS)
            .catch(() => null)
        : null;

    const brandAuthorizationBadge =
      product.brandId && commerceProfile
        ? (
            await this.brandAuthorizations.getBadgeStatus(commerceProfile.id, {
              brandId: product.brandId,
              category: product.category || undefined,
              model: product.model || undefined,
            })
          ).badge
        : commerceProfile?.isVerified
          ? 'kentexa_verified'
          : null;

    const brand = product.brandId ? await this.brands.findOne(product.brandId).catch(() => null) : null;

    return {
      found: true,
      status: serial.status,
      soldAt: serial.soldAt,
      product: { id: product.id, name: product.name, image: product.images?.[0] || null },
      brand: brand ? { id: brand.id, name: brand.name, logoUrl: brand.logoUrl } : null,
      brandAuthorizationBadge,
      seller: commerceProfile
        ? {
            commerceProfileId: commerceProfile.id,
            ownerId: commerceProfile.ownerId,
            displayName: commerceProfile.displayName,
            photoUrl: commerceProfile.photoUrl,
            isVerified: commerceProfile.isVerified,
          }
        : null,
    };
  }
}
