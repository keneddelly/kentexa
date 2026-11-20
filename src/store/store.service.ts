import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { CommerceProfile, CommerceProfileStatus } from '../commerce-profiles/entities/commerce-profile.entity';
import { Follow } from './follow.entity';
import { Review } from './review.entity';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import { Product } from '../products/entities/products.entity';
import { ProfileService } from '../profile/profile.service';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import { CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';
import { InAppNotificationService } from '../notifications/in-app-notification.service';

@Injectable()
export class StoreService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Follow) private followRepo: Repository<Follow>,
    @InjectRepository(Review) private reviewRepo: Repository<Review>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(CommerceProfile) private commerceProfileRepo: Repository<CommerceProfile>,
    private profileService: ProfileService,
    private commerceProfiles: CommerceProfilesService,
    private inAppNotif: InAppNotificationService,
  ) {}


  // ── Discover personal profiles from contacts selected by the user ─────────
  // The address book is never stored. Only selected phone numbers are matched
  // in memory, and only public personal-profile fields are returned.
  private static contactDiscoveryLastRun = new Map<number, number>();

  private normalizeContactPhone(value: string): string | null {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('0')) digits = '255' + digits.slice(1);
    else if (digits.length === 9) digits = '255' + digits;
    if (digits.length < 10 || digits.length > 15) return null;
    return digits;
  }

  async discoverContacts(userId: number, phoneNumbers: string[]) {
    if (!Array.isArray(phoneNumbers) || phoneNumbers.length > 200 ||
        phoneNumbers.some((phone) => typeof phone !== 'string' || phone.length > 32)) {
      throw new BadRequestException('Submit up to 200 valid phone numbers');
    }

    const now = Date.now();
    const lastRun = StoreService.contactDiscoveryLastRun.get(userId) || 0;
    if (now - lastRun < 60 * 1000) {
      throw new BadRequestException('Please wait before checking contacts again');
    }
    if (StoreService.contactDiscoveryLastRun.size > 10000) {
      for (const [id, timestamp] of StoreService.contactDiscoveryLastRun) {
        if (now - timestamp > 10 * 60 * 1000) StoreService.contactDiscoveryLastRun.delete(id);
      }
    }
    StoreService.contactDiscoveryLastRun.set(userId, now);

    const normalized = [...new Set(phoneNumbers.map((phone) => this.normalizeContactPhone(phone)).filter(Boolean))] as string[];
    if (!normalized.length) return { matches: [] };

    const variants = new Set<string>();
    for (const phone of normalized) {
      variants.add(phone);
      variants.add('+' + phone);
      if (phone.startsWith('255')) variants.add('0' + phone.slice(3));
    }

    const users = await this.userRepo.find({
      select: { id: true, phone: true },
      where: { phone: In([...variants]), isVerified: true },
      take: 200,
    });
    const ownerIds = users.filter((user) => user.id !== userId).map((user) => user.id);
    if (!ownerIds.length) return { matches: [] };

    const profiles = await this.commerceProfileRepo.find({
      select: { id: true, ownerId: true, type: true, displayName: true, username: true, photoUrl: true, location: true },
      where: {
        ownerId: In(ownerIds),
        type: CommerceProfileType.PERSONAL,
        status: CommerceProfileStatus.ACTIVE,
        hiddenFromPublic: false,
      },
      take: 200,
    });
    if (!profiles.length) return { matches: [] };

    const followedProfiles = await this.commerceProfiles.getFollowingProfilesForAccount(userId);
    const followedIds = new Set(followedProfiles
      .filter((profile) => profile.type === CommerceProfileType.PERSONAL)
      .map((profile) => profile.id));

    return {
      matches: profiles.map((profile) => ({
        id: profile.id,
        displayName: profile.displayName,
        username: profile.username,
        photoUrl: profile.photoUrl,
        location: profile.location,
        isFollowing: followedIds.has(profile.id),
      })),
    };
  }

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
  // Every Follow button in the app (HomeFeed, Search, Stores, StorePage,
  // Onboarding) calls this one endpoint. Sellers who already have a BUSINESS
  // CommerceProfile get redirected onto the profile-scoped follow system
  // (CommerceProfilesService.toggleFollow) so new follows start counting
  // toward that profile's own followersCount and its followers actually
  // receive post notifications — without touching any existing `follow`
  // rows or changing a single frontend call site. Sellers with no business
  // profile yet (rare/legacy edge case) keep today's exact legacy behavior.
  async toggleFollow(followerId: number, sellerId: number) {
    if (followerId === sellerId)
      throw new BadRequestException('Cannot follow your own store');

    const businessProfile = await this.commerceProfiles
      .findForUserByType(sellerId, CommerceProfileType.BUSINESS)
      .catch(() => null);
    if (businessProfile) {
      const result = await this.commerceProfiles.toggleFollow(
        followerId,
        businessProfile.id,
      );
      return {
        following: result.following,
        message: result.following ? 'Following store' : 'Unfollowed store',
      };
    }

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
      relations: { buyer: true, seller: true, product: true },
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

    const productName =
      order.product?.name || (order as any).manualProductName || 'bidhaa yako';
    await this.inAppNotif
      .reviewReceived(
        sellerId,
        dto.rating,
        productName,
        order.product?.id,
        businessProfile?.id ?? null,
      )
      .catch(() => {});

    return { message: 'Review submitted successfully', review };
  }

  // ── Get my followed stores ─────────────────────────────────────────────────
  async getMyFollowedStores(followerId: number) {
    return this.commerceProfiles.getFollowedStoresDetailed(followerId);
  }

  // ── Get people who follow ME (names, not just the count) ─────────────────
  async getMyFollowers(sellerId: number) {
    return this.commerceProfiles.getSellerFollowersDetailed(sellerId);
  }
}
