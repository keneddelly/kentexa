import {
  Injectable, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Follow } from './follow.entity';
import { Review } from './review.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { Product } from '../products/entities/products.entity';

@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(User)    private userRepo: Repository<User>,
    @InjectRepository(Follow)  private followRepo: Repository<Follow>,
    @InjectRepository(Review)  private reviewRepo: Repository<Review>,
    @InjectRepository(Order)   private orderRepo: Repository<Order>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
  ) {}

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

    const {
      password, otp, otpExpiry, otpAttempts, ...safeSeller
    } = seller as any;

    return {
      seller: safeSeller,
      products,
      reviews: reviews.map(r => ({
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
      'storeName', 'storeTagline', 'storeDescription', 'logo', 'coverImage',
      'businessLocation', 'businessHours', 'pickupAvailable', 'freeDelivery',
      'fastShipping', 'galleryImages', 'activePromotion',
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
    if (followerId === sellerId) throw new BadRequestException('Cannot follow your own store');

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
        })
      );
      await this.userRepo.increment({ id: sellerId }, 'followersCount', 1);
      return { following: true, message: 'Following store' };
    }
  }

  // ── Submit a review (buyer, must have completed order) ──────────────────
  async submitReview(buyerId: number, sellerId: number, dto: { orderId: number; rating: number; comment?: string }) {
    if (dto.rating < 1 || dto.rating > 5) throw new BadRequestException('Rating must be 1-5');

    const order = await this.orderRepo.findOne({
      where: { id: dto.orderId },
      relations: { buyer: true, seller: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyer?.id !== buyerId) throw new BadRequestException('Not your order');
    if (order.seller?.id !== sellerId) throw new BadRequestException('Order does not belong to this seller');
    if (order.status !== OrderStatus.COMPLETED) throw new BadRequestException('Can only review completed orders');

    const existing = await this.reviewRepo.findOne({
      where: { order: { id: dto.orderId }, buyer: { id: buyerId } },
    });
    if (existing) throw new ConflictException('You already reviewed this order');

    const review = await this.reviewRepo.save(
      this.reviewRepo.create({
        buyer: { id: buyerId } as User,
        seller: { id: sellerId } as User,
        order: { id: dto.orderId } as Order,
        rating: dto.rating,
        comment: dto.comment || null,
        verified: true,
      })
    );

    // Update seller's aggregate rating & review count
    const allReviews = await this.reviewRepo.find({ where: { seller: { id: sellerId } } });
    const avgRating  = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;

    await this.userRepo.update(sellerId, {
      rating: parseFloat(avgRating.toFixed(2)),
      reviewsCount: allReviews.length,
    } as any);

    return { message: 'Review submitted successfully', review };
  }

  // ── Get my followed stores ─────────────────────────────────────────────────
  async getMyFollowedStores(followerId: number) {
    const follows = await this.followRepo.find({
      where: { follower: { id: followerId } },
      relations: { seller: true },
    });
    return follows.map(f => ({
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
      .filter(f => f.follower)
      .map(f => ({
        id:         f.follower.id,
        name:       f.follower.storeName || f.follower.name || 'KenteXa user',
        logo:       f.follower.logo,
        role:       f.follower.role,
        followedAt: f.createdAt,
      }));
  }
}