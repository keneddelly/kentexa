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
import { CreateReviewDto } from './dto/create-review.dto';
import { User, UserRole } from '../users/entities/user.entity';
import { FeedService } from '../feed/feed.service';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private repo: Repository<Product>,

    @InjectRepository(ProductReview)
    private reviewRepo: Repository<ProductReview>,

    private readonly feedService: FeedService,
  ) {}

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
    return query.orderBy('p.createdAt', 'DESC').getMany();
  }

  async search(
    query: string,
    opts?: { flashSale?: boolean; category?: string; limit?: number },
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

    if (query) {
      qb.andWhere(
        '(LOWER(p.name) LIKE :query OR LOWER(p.description) LIKE :query OR LOWER(p.category) LIKE :query)',
        { query: `%${query.toLowerCase()}%` },
      );
    }
    if (opts?.category)
      qb.andWhere('p.category = :category', { category: opts.category });
    if (opts?.flashSale)
      qb.andWhere('p.isFlashSale = true AND p.flashSaleEndsAt > NOW()');

    return qb
      .orderBy('p.createdAt', 'DESC')
      .take(opts?.limit || 50)
      .getMany();
  }

  async findOne(id: number) {
    const product = await this.repo.findOne({
      where: { id },
      relations: { seller: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
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
      subcategory: (dto as any).subcategory || null,
      model: dto.model || null,
      specs: (dto as any).specs || null,
      features: (dto as any).features || null,
      images: dto.images || [],
      isAvailable: dto.isAvailable ?? true,
      isActive: true,
      shippingMethod: dto.shippingMethod,
      estimatedDelivery: dto.estimatedDelivery || null,
      shippingNotes: dto.shippingNotes || null,
      weightKg: (dto as any).weightKg || null,
      bodaFee: Number((dto as any).bodaFee || 0),
      sellerCity: (dto as any).sellerCity || 'Dar es Salaam',
      isFlashSale: dto.isFlashSale || false,
      flashSalePrice: dto.flashSalePrice ?? null,
      originalPrice: dto.originalPrice ?? null,
      flashSaleEndsAt: dto.flashSaleEndsAt ? new Date(dto.flashSaleEndsAt) : null,
      flashSaleQuantity: dto.flashSaleQuantity ?? null,
      seller: seller || null,
    } as any);

    const saved = (await this.repo.save(product)) as unknown as Product;

    // Auto-share as a Moment — fire-and-forget, never blocks product creation
    if (seller?.id) {
      this.feedService
        .publish(seller.id, {
          type: 'moment',
          title: saved.name,
          imageUrl: saved.images?.[0] || undefined,
          linkedEntityType: 'product',
          linkedEntityId: saved.id,
        })
        .catch(() => {});
    }

    return saved;
  }

  async update(
    id: number,
    dto: Partial<CreateProductDto>,
    user: User,
  ): Promise<Product> {
    const product = await this.findOne(id);

    if (user.role !== UserRole.ADMIN) {
      if (!product.seller || product.seller.id !== user.id) {
        throw new ForbiddenException('You can only edit your own products');
      }
    }

    // Recalculate displayPrice if pricing changed
    const newBasePrice = Number((dto as any).basePrice ?? product.basePrice);
    const newDeliveryFee = Number(
      (dto as any).deliveryFee ?? product.deliveryFee,
    );
    if (
      (dto as any).basePrice !== undefined ||
      (dto as any).deliveryFee !== undefined
    ) {
      (dto as any).displayPrice = newBasePrice + newDeliveryFee;
    }

    Object.assign(product, dto);
    return this.repo.save(product);
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

  // ── Flash sale: track units sold against the limited quantity ────────────
  async incrementFlashSaleSold(productId: number, quantity: number): Promise<void> {
    try {
      await this.repo.increment({ id: productId }, 'flashSaleSold', quantity);
    } catch {
      // Non-critical — never block order creation over this
    }
  }

  // ── Flash sale: true only while active, not expired, and not sold out ────
  isFlashSaleActive(product: Product): boolean {
    if (!product.isFlashSale || product.flashSalePrice == null) return false;
    if (product.flashSaleEndsAt && new Date(product.flashSaleEndsAt) <= new Date())
      return false;
    if (
      product.flashSaleQuantity != null &&
      (product.flashSaleSold || 0) >= product.flashSaleQuantity
    )
      return false;
    return true;
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
          }),
        );
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
    const product = await this.repo.findOne({ where: { id: productId } });
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

    const review = this.reviewRepo.create({
      product: { id: productId },
      reviewer: { id: userId },
      rating: dto.rating,
      comment: dto.comment,
      isVerifiedPurchase: (dto as any).isVerifiedPurchase || false,
      orderId: (dto as any).orderId || null,
    });
    return this.reviewRepo.save(review);
  }
}
