import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from './entities/products.entity';
import { ProductReview } from './entities/product-review.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { User, UserRole } from '../users/entities/user.entity';
import { FeedService } from '../feed/feed.service';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import { CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';
import { SearchIndexService } from '../search/search-index.service';
import { normalizeSearchQuery } from '../search/search-term-normalizer.util';
import { buildMultiTermLikeClause } from '../search/search-query.util';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { withPriceOverlay, formatPriceLabel } from '../feed/utils/price-overlay.util';
import { SellerRankingService } from './seller-ranking.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private repo: Repository<Product>,

    @InjectRepository(ProductReview)
    private reviewRepo: Repository<ProductReview>,

    @InjectRepository(SellerProfile)
    private sellerProfileRepo: Repository<SellerProfile>,

    private readonly feedService: FeedService,
    private readonly commerceProfiles: CommerceProfilesService,
    private readonly searchIndex: SearchIndexService,
    private readonly ranking: SellerRankingService,
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

  async findAll(category?: string) {
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
      .where('p.isAvailable = :isAvailable', { isAvailable: true });
    if (category) query.andWhere('p.category = :category', { category });
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
      .where('p.isAvailable = :isAvailable', { isAvailable: true });

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

    const products = await qb.orderBy('p.createdAt', 'DESC').getMany();
    return this.rankByRelevance(products);
  }

  async findOne(id: number) {
    const product = await this.repo.findOne({
      where: { id },
      relations: { seller: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    // "Sold by" must point at the seller's BUSINESS identity, not their
    // personal one — this is the exact bug CommerceProfile.js's header
    // had before Stage 1 (a visitor seeing the owner's personal name/
    // follower count instead of the store's), just one layer deeper: the
    // product page's seller card was still doing it. commerceProfile is
    // null when the seller has no business profile yet (shouldn't happen
    // for anyone who can list a product, but stay defensive).
    const commerceProfile = product.seller
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
      where: { seller: { id: sellerId }, isAvailable: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findMyProducts(user: User) {
    return this.repo.find({
      where: { seller: { id: user.id } },
      order: { createdAt: 'DESC' },
    });
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
    const basePrice = Number(dto.basePrice || 0);
    const deliveryFee = Number(dto.deliveryFee || 0);
    const displayPrice = basePrice + deliveryFee;

    const product = this.repo.create({
      name: dto.name,
      description: dto.description || null,
      basePrice,
      deliveryFee,
      displayPrice,
      stock: dto.stock || 0,
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
    } as any);

    const saved = (await this.repo.save(product)) as unknown as Product;

    // Auto-share as a Moment — fire-and-forget, never blocks product creation.
    // Price + category burned into the shared image (see price-overlay.util)
    // so a viewer scrolling the feed has something to act on immediately,
    // instead of a bare photo.
    if (seller?.id) {
      this.feedService
        .publish(seller.id, {
          type: 'moment',
          title: saved.name,
          imageUrl: withPriceOverlay(saved.images?.[0], {
            priceLabel: formatPriceLabel(saved.displayPrice),
            category: saved.category,
          }),
          linkedEntityType: 'product',
          linkedEntityId: saved.id,
          category: saved.category || undefined,
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

  async decreaseStock(id: number, quantity: number) {
    const product = await this.findOne(id);
    product.stock -= quantity;
    if (product.stock <= 0) product.isAvailable = false;
    return this.repo.save(product);
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
    return saved;
  }
}
