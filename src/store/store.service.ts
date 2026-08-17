import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Follow } from './follow.entity';
import { Review } from './review.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { Product } from '../products/entities/products.entity';
import { ProfileService } from '../profile/profile.service';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import { CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';

@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Follow) private followRepo: Repository<Follow>,
    @InjectRepository(Review) private reviewRepo: Repository<Review>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    private profileService: ProfileService,
    private commerceProfiles: CommerceProfilesService,
  ) {}

  // ── Get full store page data ──────────────────────────────────────────────
  async getStore(sellerId: number, viewerId?: number) {
    const full = await this.profileService.buildPublicProfile(
      sellerId,
      viewerId,
    );
    if (!full) throw new NotFoundException('Store not found');

    return {
      seller: full.user,
      products: full.products,
      reviews: full.reviews,
      isFollowing: full.isFollowing,
      serviceProvider: full.roleEntities.serviceProvider || null,
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

    // Keep the business CommerceProfile's own public fields in sync — this
    // form writes to the legacy User columns only, but CommerceProfile.js
    // renders the business's public page from CommerceProfile.photoUrl/
    // displayName/bio/location, which live in a completely separate row.
    // Without this, a new logo/description saved here would silently never
    // show up on the business's actual public profile.
    const profileUpdate: Record<string, any> = {};
    if (dto.logo !== undefined) profileUpdate.photoUrl = dto.logo;
    if (dto.coverImage !== undefined) profileUpdate.coverImage = dto.coverImage;
    if (dto.storeName !== undefined) profileUpdate.displayName = dto.storeName;
    if (dto.storeDescription !== undefined) profileUpdate.bio = dto.storeDescription;
    if (dto.businessLocation !== undefined) profileUpdate.location = dto.businessLocation;
    if (Object.keys(profileUpdate).length > 0) {
      const businessProfile = await this.commerceProfiles
        .findForUserByType(sellerId, CommerceProfileType.BUSINESS)
        .catch(() => null);
      if (businessProfile) {
        await this.commerceProfiles
          .updatePublicFields(businessProfile.id, profileUpdate)
          .catch(() => {});
      }
    }

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

    // Which business this review actually belongs to — never guessed from
    // the seller's personal identity. A seller with no BUSINESS-type
    // CommerceProfile yet (shouldn't happen for anyone who can receive
    // orders, but stay defensive) just leaves commerceProfileId null,
    // same as any other pre-this-feature review.
    const businessProfile = await this.commerceProfiles
      .findForUserByType(sellerId, CommerceProfileType.BUSINESS)
      .catch(() => null);

    const review = await this.reviewRepo.save(
      this.reviewRepo.create({
        buyer: { id: buyerId } as User,
        seller: { id: sellerId } as User,
        order: { id: dto.orderId } as Order,
        rating: dto.rating,
        comment: dto.comment || null,
        verified: true,
        commerceProfileId: businessProfile?.id ?? null,
      }),
    );

    if (businessProfile) {
      await this.commerceProfiles
        .recordReview(businessProfile.id, dto.rating)
        .catch(() => {});
    }

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

    // orders.service.ts's rateSellerForOrder() sets this same flag when a
    // review comes through that path — without setting it here too, a
    // review submitted via this endpoint left order.sellerRated false,
    // so any "have you reviewed this order?" check keyed on it was wrong.
    await this.orderRepo.update(dto.orderId, {
      sellerRated: true,
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
