import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Follow } from './follow.entity';
import { Review } from './review.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { Product } from '../products/entities/products.entity';

@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Follow) private followRepo: Repository<Follow>,
    @InjectRepository(Review) private reviewRepo: Repository<Review>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
  ) {}


  // ── Discover verified Kentexa users from contacts ─────────────────────────
  // Phone numbers are processed in memory only; the submitted address book is
  // never persisted and phone numbers are never returned to the client.
  private static contactDiscoveryLastRun = new Map<number, number>();

  private normalizeContactPhone(value: unknown): string | null {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    // Kentexa's initial market is Tanzania. Normalize local 07xx/06xx and
    // nine-digit mobile formats to the same E.164 country prefix.
    if (digits.startsWith('0')) digits = '255' + digits.slice(1);
    else if (digits.length === 9) digits = '255' + digits;
    if (digits.length < 10 || digits.length > 15) return null;
    return digits;
  }

  async discoverContacts(userId: number, phoneNumbers: string[]) {
    if (!Array.isArray(phoneNumbers) || phoneNumbers.length > 200) {
      throw new BadRequestException('Submit no more than 200 contact numbers at a time');
    }

    const now = Date.now();
    const lastRun = StoreService.contactDiscoveryLastRun.get(userId) || 0;
    if (now - lastRun < 5 * 60 * 1000) {
      throw new BadRequestException('Please wait a few minutes before checking contacts again');
    }
    StoreService.contactDiscoveryLastRun.set(userId, now);

    const normalized = [...new Set(
      phoneNumbers.map((phone) => this.normalizeContactPhone(phone)).filter(Boolean),
    )] as string[];
    if (!normalized.length) return { matches: [] };

    // Match common stored formats without scanning the complete user table.
    const variants = new Set<string>();
    for (const phone of normalized) {
      variants.add(phone);
      variants.add('+' + phone);
      if (phone.startsWith('255')) variants.add('0' + phone.slice(3));
    }

    const users = await this.userRepo.find({
      where: { phone: In([...variants]) },
      take: 200,
    });
    const matches = users.filter((user) => user.id !== userId && user.isVerified);
    if (!matches.length) return { matches: [] };

    const followed = await this.followRepo.find({
      where: {
        follower: { id: userId },
        seller: { id: In(matches.map((user) => user.id)) },
      },
    });
    const followedIds = new Set(followed.map((item) => item.seller?.id));

    return {
      matches: matches.map((user) => ({
        id: user.id,
        name: user.name,
        storeName: user.storeName,
        logo: user.logo,
        city: user.city,
        role: user.role,
        isFollowing: followedIds.has(user.id),
      })),
    };
  }

  // ── Get full store page data ──────────────────────────────────────────────
  async getStore(sellerId: number, viewerId?: number) {
    const seller = await this.userRepo.findOne({ where: { id: sellerId } });
    if (!seller) throw new NotFoundException('Store not found');

    const products = await this.productRepo.find({
      where: { seller: { id: sellerId } },
      order: { createdAt: 'DESC' },
    });

    const reviews = await this.reviewRepo.find({
      where: { seller: { id: sellerId } },
      relations: { buyer: true },
      order: { createdAt: 'DESC' },
      take: 20,
    });

    let isFollowing = false;
    if (viewerId) {
      const f = await this.followRepo.findOne({
        where: { follower: { id: viewerId }, seller: { id: sellerId } },
      });
      isFollowing = !!f;
    }

    const { password, otp, otpExpiry, otpAttempts, ...safeSeller } =
      seller as any;

    return {
      seller: safeSeller,
      products,
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        verified: r.verified,
        date: r.createdAt,
        buyerName: r.buyer?.name || 'Anonymous',
      })),
      isFollowing,
    };
  }

  // ── Update store profile (seller only) ──────────────────────────────────────
  async updateStoreProfile(sellerId: number, dto: Partial<User>) {
    const seller = await this.userRepo.findOne({ where: { id: sellerId } });
    if (!seller) throw new NotFoundException('Seller not found');

    const allowedFields = [
      'storeName',
      'storeTagline',
      'storeDescription',
      'logo',
      'coverImage',
      'businessLocation',
      'businessHours',
      'pickupAvailable',
      'freeDelivery',
      'fastShipping',
      'galleryImages',
      'activePromotion',
    ];

    const update: any = {};
    for (const key of allowedFields) {
      if (dto[key] !== undefined) update[key] = dto[key];
    }

    await this.userRepo.update(sellerId, update);
    return { message: 'Store profile updated successfully' };
  }

  // ── Follow / Unfollow ────────────────────────────────────────────────────
  async toggleFollow(followerId: number, sellerId: number) {
    if (followerId === sellerId)
      throw new BadRequestException('Cannot follow your own store');

    const existing = await this.followRepo.findOne({
      where: { follower: { id: followerId }, seller: { id: sellerId } },
    });

    if (existing) {
      await this.followRepo.remove(existing);
      await this.userRepo.decrement({ id: sellerId }, 'followersCount', 1);
      return { following: false, message: 'Unfollowed store' };
    } else {
      await this.followRepo.save(
        this.followRepo.create({
          follower: { id: followerId } as User,
          seller: { id: sellerId } as User,
        }),
      );
      await this.userRepo.increment({ id: sellerId }, 'followersCount', 1);
      return { following: true, message: 'Following store' };
    }
  }

  // ── Submit a review (buyer, must have completed order) ──────────────────
  async submitReview(
    buyerId: number,
    sellerId: number,
    dto: { orderId: number; rating: number; comment?: string },
  ) {
    if (dto.rating < 1 || dto.rating > 5)
      throw new BadRequestException('Rating must be 1-5');

    const order = await this.orderRepo.findOne({
      where: { id: dto.orderId },
      relations: { buyer: true, seller: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyer?.id !== buyerId)
      throw new BadRequestException('Not your order');
    if (order.seller?.id !== sellerId)
      throw new BadRequestException('Order does not belong to this seller');
    if (order.status !== OrderStatus.COMPLETED)
      throw new BadRequestException('Can only review completed orders');

    const existing = await this.reviewRepo.findOne({
      where: { order: { id: dto.orderId }, buyer: { id: buyerId } },
    });
    if (existing)
      throw new ConflictException('You already reviewed this order');

    const review = await this.reviewRepo.save(
      this.reviewRepo.create({
        buyer: { id: buyerId } as User,
        seller: { id: sellerId } as User,
        order: { id: dto.orderId } as Order,
        rating: dto.rating,
        comment: dto.comment || null,
        verified: true,
      }),
    );

    // Update seller's aggregate rating & review count
    const allReviews = await this.reviewRepo.find({
      where: { seller: { id: sellerId } },
    });
    const avgRating =
      allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;

    await this.userRepo.update(sellerId, {
      rating: parseFloat(avgRating.toFixed(2)),
      reviewsCount: allReviews.length,
    });

    return { message: 'Review submitted successfully', review };
  }

  // ── Get my followed stores ─────────────────────────────────────────────────
  async getMyFollowedStores(followerId: number) {
    const follows = await this.followRepo.find({
      where: { follower: { id: followerId } },
      relations: { seller: true },
    });
    return follows.map((f) => ({
      id: f.seller.id,
      storeName: f.seller.storeName || f.seller.name,
      logo: f.seller.logo,
      followedAt: f.createdAt,
    }));
  }

  // ── Get people who follow ME (names, not just the count) ─────────────────
  async getMyFollowers(sellerId: number) {
    const follows = await this.followRepo.find({
      where: { seller: { id: sellerId } },
      relations: { follower: true },
      order: { createdAt: 'DESC' },
    });
    return follows
      .filter((f) => f.follower)
      .map((f) => ({
        id: f.follower.id,
        name: f.follower.storeName || f.follower.name || 'KenteXa user',
        logo: f.follower.logo,
        role: f.follower.role,
        followedAt: f.createdAt,
      }));
  }
}
