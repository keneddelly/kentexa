import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SellerProfile, SellerStatus } from './entities/seller-profile.entity';
import { CreateSellerProfileDto } from './dto/create-seller-profile.dto';
import { User, UserRole } from '../users/entities/user.entity';
import {
  Order,
  OrderStatus,
  PaymentStatus,
} from '../orders/entities/order.entity';
import { Classified } from '../classifieds/entities/classified.entity';
import { Product } from '../products/entities/products.entity';
import { BusinessTeamMember } from '../business/entities/business-team-member.entity';
import { mergeActiveRole } from '../users/utils/merge-active-role.util';
import { ProfileService } from '../profile/profile.service';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import {
  CommerceProfileType,
  CommerceProfileStatus,
} from '../commerce-profiles/entities/commerce-profile.entity';

@Injectable()
export class SellerService {
  constructor(
    @InjectRepository(SellerProfile)
    private profileRepo: Repository<SellerProfile>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
    @InjectRepository(Classified)
    private classifiedRepo: Repository<Classified>,
    @InjectRepository(Product)
    private productRepo: Repository<Product>,
    @InjectRepository(BusinessTeamMember)
    private teamRepo: Repository<BusinessTeamMember>,
    private profileService: ProfileService,
    private commerceProfiles: CommerceProfilesService,
  ) {}

  // ── Public: all approved sellers (raw profiles) ──────────────────────────
  async findAllApproved(): Promise<SellerProfile[]> {
    return this.profileRepo.find({
      where: [
        { status: SellerStatus.APPROVED },
        { status: SellerStatus.PENDING },
      ],
      order: { createdAt: 'DESC' },
    });
  }

  // ── Public: approved sellers for storefront cards (Home, Stores list) ────
  // Returns USER.id (so it links correctly to /stores/:sellerId) plus the
  // store-branding fields (storeName, logo) that live on the User entity,
  // not on SellerProfile. If viewerId is given, stamps isFollowing per card.
  async findPublicSellers(viewerId?: number) {
    const users = await this.userRepo
      .createQueryBuilder('u')
      .select([
        'u.id',
        'u.name',
        'u.storeName',
        'u.storeTagline',
        'u.storeDescription',
        'u.logo',
        'u.coverImage',
        'u.rating',
        'u.isOfficialStore',
        'u.isVerified',
        'u.followersCount',
        'u.businessLocation',
        'u.completedOrders',
        'u.reviewsCount',
        'u.reputationScore',
        'u.createdAt',
      ])
      .where("u.role IN ('seller','admin','manager')")
      .andWhere('u."storeName" IS NOT NULL')
      .andWhere('u."storeName" != \'\'')
      .orderBy('u.createdAt', 'DESC')
      .getMany();

    let followedIds = new Set<number>();
    if (viewerId) {
      const rows: { sellerId: number }[] = await this.userRepo
        .query('SELECT "sellerId" FROM follow WHERE "followerId" = $1', [
          viewerId,
        ])
        .catch(() => []);
      followedIds = new Set(rows.map((r) => r.sellerId));
    }

    // Optional enrichment — a formal SellerProfile application isn't
    // required to show up here, but if one exists we layer on its extra
    // fields (business category/city/district/region).
    const profiles = await this.profileRepo
      .find({ relations: { user: true } })
      .catch(() => [] as SellerProfile[]);
    const profileByUserId = new Map(
      profiles.filter((p) => p.user).map((p) => [p.user.id, p]),
    );

    return users.map((u) => {
      const p = profileByUserId.get(u.id);
      return {
        id: u.id, // ✅ USER id — matches /stores/:sellerId route
        businessName: p?.businessName || u.storeName,
        businessCategory: (p as any)?.businessCategory || null,
        storeName: u.storeName || null,
        storeTagline: u.storeTagline || null,
        storeDescription: u.storeDescription || null,
        logo: u.logo || null,
        coverImage: u.coverImage || null,
        rating: u.rating || null,
        isOfficialStore: u.isOfficialStore || false,
        isVerified: u.isVerified || false,
        followersCount: u.followersCount || 0,
        city: (p as any)?.businessCity || u.businessLocation || null,
        district: (p as any)?.businessDistrict || null,
        region: (p as any)?.businessRegion || null,
        completedOrders: u.completedOrders || 0,
        reviewsCount: u.reviewsCount || 0,
        reputationScore: (u as any).reputationScore || 0,
        userId: u.id,
        createdAt: u.createdAt,
        isFollowing: followedIds.has(u.id),
      };
    });
  }

  // ── Public: ANY user's public profile ─────────────────────────────────────
  // This backs CommerceProfile.js for every account type — buyer, seller,
  // agent, super agent, transport provider — not just sellers. A seller
  // profile is optional enrichment layered on top, never a requirement:
  // requiring one here used to 404 the public profile of anyone who wasn't
  // an approved seller.
  async findByUserId(userId: number): Promise<any> {
    const u = await this.userRepo.findOne({ where: { id: userId } });
    if (!u) throw new NotFoundException('User not found');

    // Seller enrichment is optional — most fields below already live on
    // User directly, this just adds a couple of seller-only extras.
    const [sellerProfile, roleEntities] = await Promise.all([
      this.profileRepo
        .findOne({
          where: { user: { id: userId }, status: SellerStatus.APPROVED },
        })
        .catch(() => null),
      this.profileService.getRoleEntities(userId),
    ]);

    return {
      id: u.id, // ✅ USER id — matches CommerceProfile-{id} route
      userId: u.id,
      kentexaId: u.kentexaId,
      role: u.role,
      activeRoles: (u as any).activeRoles || [],
      name: u.name,
      avatarUrl: u.avatarUrl || null,
      storeName: u.storeName || sellerProfile?.businessName || null,
      storeTagline: u.storeTagline || null,
      storeDescription: u.storeDescription || null,
      bio: (u as any).bio || null,
      logo: u.logo || null,
      coverImage: u.coverImage || null,
      storeWhatsApp: u.storeWhatsApp || null,
      phone: u.phone || null,
      businessLocation:
        u.businessLocation || (sellerProfile as any)?.businessCity || null,
      businessCategory: (sellerProfile as any)?.businessCategory || null,
      isOfficialStore: u.isOfficialStore || false,
      isVerified: u.isVerified || false,
      isApprovedSeller: !!sellerProfile,
      rating: u.rating || 0,
      reviewsCount: u.reviewsCount || 0,
      followersCount: u.followersCount || 0,
      completedOrders: u.completedOrders || 0,
      reputationScore: (u as any).reputationScore || 0,
      createdAt: u.createdAt,
      serviceProvider: roleEntities.serviceProvider || null,
    };
  }

  // ── Apply to become seller ────────────────────────────────────────────────
  async apply(dto: CreateSellerProfileDto, user: User): Promise<SellerProfile> {
    const existing = await this.profileRepo.findOne({
      where: { user: { id: user.id } },
    });
    if (existing)
      throw new ConflictException('You already have a seller application');

    const profile = this.profileRepo.create({
      ...dto,
      user,
      status: SellerStatus.PENDING,
    });
    const saved = await this.profileRepo.save(profile);

    // Creates the business's Commerce Profile alongside the application —
    // starts PENDING, mirrors the SellerProfile's own status exactly.
    // Non-fatal: the admin backfill catches anything that slips through.
    try {
      await this.commerceProfiles.createProfile({
        ownerId: user.id,
        type: CommerceProfileType.BUSINESS,
        displayName: saved.businessName,
        usernameSeed: saved.businessName,
        photoUrl: saved.logo,
        bio: saved.businessDescription,
        location: saved.address,
        status: CommerceProfileStatus.PENDING,
        sellerProfileId: saved.id,
      });
    } catch {}

    return saved;
  }

  // ── Get my seller profile ─────────────────────────────────────────────────
  async getMyProfile(userId: number): Promise<SellerProfile> {
    const profile = await this.profileRepo.findOne({
      where: { user: { id: userId } },
    });
    if (!profile) throw new NotFoundException('Seller profile not found');
    return profile;
  }

  // ── Update my seller profile ──────────────────────────────────────────────
  async updateProfile(
    userId: number,
    dto: Partial<CreateSellerProfileDto> & {
      phone?: string;
      name?: string;
      email?: string;
    },
  ): Promise<SellerProfile> {
    const profile = await this.getMyProfile(userId);

    // Extract user-level fields (not on SellerProfile entity)
    const { phone, name, email, ...profileDto } = dto as any;

    // Update SellerProfile fields
    Object.assign(profile, profileDto);
    await this.profileRepo.save(profile);

    // Also update User entity if user-level fields were sent
    if (phone || name || email) {
      const userUpdates: any = {};
      if (phone) userUpdates.phone = phone;
      if (name) userUpdates.name = name;
      if (email) userUpdates.email = email;
      await this.userRepo.update(userId, userUpdates);
    }

    return profile;
  }

  // ── Seller dashboard stats ────────────────────────────────────────────────
  async getDashboardStats(user: User) {
    const profile = await this.getMyProfile(user.id);

    if (profile.status !== SellerStatus.APPROVED) {
      throw new ForbiddenException(
        `Your seller account is ${profile.status}. Please wait for approval.`,
      );
    }

    const [myProducts, myClassifieds, myOrders] = await Promise.all([
      this.productRepo.find({ where: { seller: { id: user.id } } }),
      this.classifiedRepo.find({ where: { seller: { id: user.id } } }),
      // Fetch both online orders (via product) and manual shipments (direct seller)
      Promise.all([
        this.orderRepo
          .createQueryBuilder('o')
          .leftJoinAndSelect('o.product', 'p')
          .leftJoin('o.seller', 's')
          .addSelect(['s.id', 's.name', 's.storeName'])
          .leftJoin('o.buyer', 'b')
          .addSelect(['b.id', 'b.name', 'b.phone'])
          .where('p.seller = :sid', { sid: user.id })
          .orderBy('o.createdAt', 'DESC')
          .take(30)
          .getMany(),
        this.orderRepo
          .createQueryBuilder('o')
          .leftJoinAndSelect('o.product', 'p')
          .leftJoin('o.seller', 's')
          .addSelect(['s.id', 's.name', 's.storeName'])
          .leftJoin('o.buyer', 'b')
          .addSelect(['b.id', 'b.name', 'b.phone'])
          .where('o.seller = :sid', { sid: user.id })
          .andWhere(
            "o.source IN ('seller_shipment', 'offline', 'offline_intercity')",
          )
          .orderBy('o.createdAt', 'DESC')
          .take(30)
          .getMany(),
      ]).then(([onlineOrders, manualOrders]) => {
        // Merge and deduplicate by id
        const seen = new Set<number>();
        return [...onlineOrders, ...manualOrders]
          .filter((o) => {
            if (seen.has(o.id)) return false;
            seen.add(o.id);
            return true;
          })
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          );
      }),
    ]);

    const totalRevenue = myOrders
      .filter((o) => o.paymentStatus === PaymentStatus.PAID)
      .reduce((sum, o) => sum + Number(o.totalAmount), 0);

    // ✅ Use correct OrderStatus enum values
    const pendingOrders = myOrders.filter(
      (o) =>
        o.status === OrderStatus.PENDING_PAYMENT ||
        o.status === OrderStatus.PAID,
    ).length;

    const completedOrders = myOrders.filter(
      (o) =>
        o.status === OrderStatus.COMPLETED ||
        o.status === OrderStatus.DELIVERED,
    ).length;

    const needsShipping = myOrders.filter(
      (o) => o.status === OrderStatus.PAID,
    ).length;

    // ── Analytics ────────────────────────────────────────────────────────────
    // Per-product revenue
    const productRevenue: Record<
      number,
      { name: string; orders: number; revenue: number }
    > = {};
    for (const order of myOrders) {
      const pid = order.product?.id || 0;
      const name =
        order.product?.name ||
        (order as any).manualProductName ||
        'Bidhaa ya Mkono';
      if (!productRevenue[pid])
        productRevenue[pid] = { name, orders: 0, revenue: 0 };
      productRevenue[pid].orders++;
      productRevenue[pid].revenue += Number(order.totalAmount || 0);
    }
    const topProducts = Object.values(productRevenue)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    // Top customers by spend
    const customerSpend: Record<
      string,
      { name: string; phone: string; orders: number; spent: number }
    > = {};
    for (const order of myOrders) {
      const phone =
        order.buyer?.phone ||
        (order as any).manualBuyerPhone ||
        (order as any).phone ||
        null;
      const name =
        order.buyer?.name || (order as any).manualBuyerName || 'Mteja';
      if (!phone) continue;
      if (!customerSpend[phone])
        customerSpend[phone] = { name, phone, orders: 0, spent: 0 };
      customerSpend[phone].orders++;
      customerSpend[phone].spent += Number(order.totalAmount || 0);
    }
    const topCustomers = Object.values(customerSpend)
      .sort((a, b) => b.spent - a.spent)
      .slice(0, 5);

    // Repeat customers (more than 1 order)
    const repeatCount = Object.values(customerSpend).filter(
      (c) => c.orders > 1,
    ).length;
    const totalCustomers = Object.keys(customerSpend).length;
    const repeatRate =
      totalCustomers > 0 ? Math.round((repeatCount / totalCustomers) * 100) : 0;

    // Daily revenue last 14 days
    const now2 = new Date();
    const daily: Record<string, number> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now2);
      d.setDate(d.getDate() - i);
      daily[d.toISOString().slice(0, 10)] = 0;
    }
    for (const order of myOrders) {
      const day = new Date(order.createdAt).toISOString().slice(0, 10);
      if (daily[day] !== undefined)
        daily[day] += Number(order.totalAmount || 0);
    }
    const dailyRevenue = Object.entries(daily).map(([date, revenue]) => ({
      date,
      label: new Date(date).toLocaleDateString('sw-TZ', {
        weekday: 'short',
        day: 'numeric',
      }),
      revenue,
    }));

    return {
      profile,
      stats: {
        totalProducts: myProducts.length,
        activeProducts: myProducts.filter((p) => p.isAvailable).length,
        totalClassifieds: myClassifieds.length,
        totalOrders: myOrders.length,
        pendingOrders,
        completedOrders,
        needsShipping,
        totalRevenue,
        repeatRate,
        totalCustomers,
      },
      recentOrders: myOrders,
      products: myProducts,
      analytics: {
        topProducts,
        topCustomers,
        repeatRate,
        totalCustomers,
        repeatCount,
        dailyRevenue,
      },
    };
  }

  // ── Seller: payout history ────────────────────────────────────────────────
  async getMyPayouts(userId: number) {
    // Get all orders where this seller has earned money
    const orders = await this.orderRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.product', 'p')
      .leftJoinAndSelect('o.buyer', 'b')
      .where('(p.sellerId = :uid OR o.createdByUserId = :uid)', { uid: userId })
      .andWhere('o.status NOT IN (:...skip)', { skip: ['cancelled'] })
      .orderBy('o.createdAt', 'DESC')
      .take(50)
      .getMany();

    const released = orders.filter(
      (o) => (o as any).payoutStatus === 'released',
    );
    const pending = orders.filter(
      (o) =>
        (o as any).payoutStatus !== 'released' &&
        (o as any).escrowStatus === 'held',
    );
    const total = orders.length;

    const totalEarned = released.reduce(
      (s, o) => s + Number((o as any).sellerAmount || 0),
      0,
    );
    const totalPending = pending.reduce(
      (s, o) => s + Number((o as any).sellerAmount || 0),
      0,
    );

    return {
      summary: {
        totalOrders: total,
        totalEarned,
        totalPending,
        releasedCount: released.length,
        pendingCount: pending.length,
      },
      orders: orders.map((o) => ({
        id: o.id,
        trackingNumber: (o as any).trackingNumber,
        productName:
          (o as any).product?.name || (o as any).manualProductName || 'Bidhaa',
        buyerName:
          (o as any).buyer?.name || (o as any).manualBuyerName || 'Mteja',
        totalAmount: Number(o.totalAmount || 0),
        sellerAmount: Number((o as any).sellerAmount || 0),
        platformFee: Number((o as any).platformFeeAmount || 0),
        payoutStatus: (o as any).payoutStatus || 'pending',
        escrowStatus: (o as any).escrowStatus || null,
        fundsReleasedAt: (o as any).fundsReleasedAt || null,
        autoReleaseAt: (o as any).autoReleaseAt || null,
        buyerConfirmedAt: (o as any).buyerConfirmedAt || null,
        autoConfirmed: (o as any).autoConfirmed || false,
        createdAt: o.createdAt,
        status: o.status,
      })),
    };
  }

  // ── Admin: all seller applications ───────────────────────────────────────
  async findAll(): Promise<SellerProfile[]> {
    return this.profileRepo.find({ order: { createdAt: 'DESC' } });
  }

  // ── Admin: approve seller ─────────────────────────────────────────────────
  async approve(profileId: number): Promise<SellerProfile> {
    const profile = await this.profileRepo.findOne({
      where: { id: profileId },
    });
    if (!profile) throw new NotFoundException('Seller profile not found');
    profile.status = SellerStatus.APPROVED;
    await this.userRepo.update(profile.user.id, {
      role: UserRole.SELLER,
      activeRoles: mergeActiveRole(profile.user.activeRoles, 'seller'),
    });
    await this.commerceProfiles
      .syncStatusByLink('sellerProfileId', profile.id, CommerceProfileStatus.ACTIVE)
      .catch(() => {});
    return this.profileRepo.save(profile);
  }

  // ── Admin: reject seller ──────────────────────────────────────────────────
  async reject(profileId: number, reason: string): Promise<SellerProfile> {
    const profile = await this.profileRepo.findOne({
      where: { id: profileId },
    });
    if (!profile) throw new NotFoundException('Seller profile not found');
    profile.status = SellerStatus.REJECTED;
    profile.rejectionReason = reason;
    await this.commerceProfiles
      .syncStatusByLink('sellerProfileId', profile.id, CommerceProfileStatus.REJECTED)
      .catch(() => {});
    return this.profileRepo.save(profile);
  }

  // ── Admin: suspend seller ─────────────────────────────────────────────────
  async suspend(profileId: number, reason: string): Promise<SellerProfile> {
    const profile = await this.profileRepo.findOne({
      where: { id: profileId },
    });
    if (!profile) throw new NotFoundException('Seller profile not found');
    profile.status = SellerStatus.SUSPENDED;
    profile.rejectionReason = reason;
    await this.commerceProfiles
      .syncStatusByLink('sellerProfileId', profile.id, CommerceProfileStatus.SUSPENDED)
      .catch(() => {});
    await this.userRepo.update(profile.user.id, { role: UserRole.USER });
    return this.profileRepo.save(profile);
  }
  // ── Team Management ───────────────────────────────────────────────────────

  async getTeamMembers(sellerId: number): Promise<BusinessTeamMember[]> {
    return this.teamRepo.find({
      where: { sellerId, isActive: true },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
  }

  async inviteTeamMember(
    sellerId: number,
    dto: {
      phone: string;
      role: string;
      permissions: Record<string, boolean>;
    },
  ): Promise<BusinessTeamMember> {
    // Find user by phone
    const user = await this.userRepo.findOne({
      where: { phone: dto.phone },
    });
    if (!user)
      throw new NotFoundException(
        `Mtumiaji mwenye nambari ${dto.phone} hajapatikana. Waombe ajiandikishe kwanza.`,
      );

    // Don't add self
    if (user.id === sellerId)
      throw new BadRequestException('Huwezi kujiongeza mwenyewe');

    // Check not already member
    const existing = await this.teamRepo.findOne({
      where: { sellerId, userId: user.id, isActive: true },
    });
    if (existing)
      throw new BadRequestException(
        'Mtumiaji huyu tayari yuko kwenye timu yako',
      );

    return this.teamRepo.save(
      this.teamRepo.create({
        sellerId,
        userId: user.id,
        role: dto.role || 'sales',
        permissions: dto.permissions || {},
        isActive: true,
        joinedAt: new Date(),
      }),
    );
  }

  async updateTeamMember(
    sellerId: number,
    memberId: number,
    dto: {
      role?: string;
      permissions?: Record<string, boolean>;
      isActive?: boolean;
    },
  ): Promise<BusinessTeamMember> {
    const member = await this.teamRepo.findOne({
      where: { id: memberId, sellerId },
    });
    if (!member) throw new NotFoundException('Mwanachama hajapatikana');
    if (dto.role !== undefined) member.role = dto.role;
    if (dto.permissions !== undefined) member.permissions = dto.permissions;
    if (dto.isActive !== undefined) member.isActive = dto.isActive;
    return this.teamRepo.save(member);
  }

  async removeTeamMember(sellerId: number, memberId: number): Promise<void> {
    const member = await this.teamRepo.findOne({
      where: { id: memberId, sellerId },
    });
    if (!member) throw new NotFoundException('Mwanachama hajapatikana');
    member.isActive = false;
    await this.teamRepo.save(member);
  }
}
