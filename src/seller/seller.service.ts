import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Brackets } from 'typeorm';
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
import { VerificationService } from '../identity/verification.service';
import { SellingCapabilityService } from '../selling-capability/selling-capability.service';
import {
  SellingCapabilityType,
  SellingCapabilityVerificationLevel,
} from '../selling-capability/entities/selling-capability.entity';

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
    private verification: VerificationService,
    private sellingCapability: SellingCapabilityService,
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
    // Optional enrichment — a formal SellerProfile application isn't
    // required to show up here, but if one exists we layer on its extra
    // fields (business category/city/district/region).
    const profiles = await this.profileRepo
      .find({ relations: { user: true } })
      .catch(() => [] as SellerProfile[]);
    const profileByUserId = new Map(
      profiles.filter((p) => p.user).map((p) => [p.user.id, p]),
    );
    // A multi-role account's SELLER business shouldn't disappear from
    // here just because a LATER role approval (agent/hub/transport) has
    // since overwritten User.role — that field only ever holds one value
    // at a time and says nothing about whether the seller side is still
    // active. Approved-profile ownership is checked independently of
    // whatever role currently happens to be primary.
    const approvedUserIds = profiles
      .filter((p) => p.status === SellerStatus.APPROVED && p.user)
      .map((p) => p.user.id);

    const selectColumns = [
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
    ];

    // Two separate, simple queries merged in JS rather than one combined
    // OR query — a Brackets()-wrapped OR here was triggering a TypeORM
    // alias-resolution bug ("COALESCE(CAST(u" alias was not found) when
    // mixed with the partial .select() above, so this sidesteps it
    // entirely instead of fighting the query builder. Neither query
    // filters on storeName in SQL — a seller who applied via the normal
    // application flow only ever gets a businessName on SellerProfile;
    // User.storeName stays null unless separately edited later. That
    // filter now happens in JS below, checking both fields (same
    // fallback findByUserId already uses), so an approved seller isn't
    // silently dropped just because storeName specifically is unset.
    const byRole = await this.userRepo
      .createQueryBuilder('u')
      .select(selectColumns)
      .where("u.role IN ('seller','admin','manager')")
      .getMany();

    let byApprovedProfile: User[] = [];
    if (approvedUserIds.length > 0) {
      byApprovedProfile = await this.userRepo
        .createQueryBuilder('u')
        .select(selectColumns)
        .where('u.id IN (:...approvedUserIds)', { approvedUserIds })
        .getMany();
    }

    const userById = new Map<number, User>();
    for (const u of [...byRole, ...byApprovedProfile]) userById.set(u.id, u);
    const users = Array.from(userById.values())
      .filter((u) => u.storeName || profileByUserId.get(u.id)?.businessName)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    let followedIds = new Set<number>();
    if (viewerId) {
      const ids = await this.commerceProfiles
        .getFollowedSellerIds(viewerId)
        .catch(() => []);
      followedIds = new Set(ids);
    }

    // Each card's own BUSINESS CommerceProfile id — without this, clicking
    // through from a search/directory card navigated on the bare account
    // id, which the profile page then defaulted to resolving as the
    // account's PERSONAL profile instead of the business being shown.
    const commerceProfileByOwnerId = await this.commerceProfiles
      .findMapForOwnersByType(
        users.map((u) => u.id),
        CommerceProfileType.BUSINESS,
      )
      .catch(() => new Map());

    return users.map((u) => {
      const p = profileByUserId.get(u.id);
      return {
        id: u.id, // ✅ USER id — matches /stores/:sellerId route
        commerceProfileId: commerceProfileByOwnerId.get(u.id)?.id || null,
        businessName: p?.businessName || u.storeName,
        businessCategory: p?.businessCategory || null,
        verificationTier: p?.verificationTier || null,
        // Falls back to the SellerProfile application's businessName —
        // storeName only gets set if the seller separately edits their
        // store branding later; without this, Onboarding's suggested-
        // sellers cards (which read s.storeName || s.name) would show
        // the owner's personal name instead of their business name.
        storeName: u.storeName || p?.businessName || null,
        storeTagline: u.storeTagline || null,
        storeDescription: u.storeDescription || null,
        logo: u.logo || null,
        coverImage: u.coverImage || null,
        rating: u.rating || null,
        isOfficialStore: u.isOfficialStore || false,
        isVerified: u.isVerified || false,
        followersCount: u.followersCount || 0,
        city: p?.businessCity || u.businessLocation || null,
        district: p?.businessDistrict || null,
        region: p?.businessRegion || null,
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
        u.businessLocation || sellerProfile?.businessCity || null,
      businessCategory: sellerProfile?.businessCategory || null,
      verificationTier: sellerProfile?.verificationTier || null,
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

    // businessDocuments isn't a SellerProfile column — it becomes
    // BusinessDocument rows via submitBusinessDocuments() below, once the
    // profile (and its id) exists.
    const { businessDocuments, ...profileFields } = dto;

    const profile = this.profileRepo.create({
      ...profileFields,
      // businessName is only actually required (DTO-validated) for
      // sellerType === 'business' — an individual seller who left it blank
      // gets their own account name here instead. This column still means
      // "this seller's display name" for every downstream reader
      // (dashboards, storefront cards, admin lists), it just isn't
      // literally a business's name for an individual.
      businessName: profileFields.businessName?.trim() || user.name || `Seller ${user.id}`,
      user,
      status: SellerStatus.PENDING,
    });
    const saved = await this.profileRepo.save(profile);

    if (dto.sellerType === 'business' && (businessDocuments?.length || dto.tinNumber || dto.businessLicenseNumber)) {
      await this.verification
        .submitBusinessDocuments(saved, {
          tinNumber: dto.tinNumber,
          businessLicenseNumber: dto.businessLicenseNumber,
          documents: businessDocuments || [],
        })
        .catch(() => {});
    }

    // Attaches selling eligibility to the right identity. A genuine
    // business (sellerType === 'business') gets its own new Business-type
    // CommerceProfile — a distinct identity from the person, same as
    // before. An individual seller reuses their EXISTING Personal
    // CommerceProfile (created at registration, auth.service.ts) instead
    // of spawning a redundant second identity — this was the actual root
    // cause of "choosing Sell forces business onboarding": every
    // applicant, individual or business, used to get a Business-type
    // profile created here unconditionally.
    // Non-fatal: the admin backfill catches anything that slips through.
    try {
      if (dto.sellerType === 'business') {
        await this.commerceProfiles.createProfile({
          ownerId: user.id,
          type: CommerceProfileType.BUSINESS,
          displayName: saved.businessName,
          usernameSeed: saved.businessName,
          // User.logo is the field store-branding actually writes to (Store
          // Settings, search cards, etc.) — SellerProfile.logo is essentially
          // never populated. Reading only saved.logo here left the business's
          // CommerceProfile.photoUrl null even when the seller had a real
          // logo showing everywhere else. Matches the backfill service's
          // already-correct sp.user.logo || sp.logo fallback order.
          photoUrl: user.logo || saved.logo,
          bio: saved.businessDescription,
          location: saved.address,
          status: CommerceProfileStatus.PENDING,
          sellerProfileId: saved.id,
        });
      } else {
        const personalProfile = await this.commerceProfiles.findForUserByType(
          user.id,
          CommerceProfileType.PERSONAL,
        );
        if (personalProfile) {
          await this.commerceProfiles.linkSellerProfile(personalProfile.id, saved.id);
        }
      }
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
  // Selling is universal (see Classified/Product create() — neither
  // requires an approved SellerProfile), so viewing your own basic seller
  // stats is too: everything below is already scoped purely by user.id,
  // never SellerProfile-specific data. A user with no activity yet just
  // gets zero-value stats, not a 403 — verification is a trust upgrade,
  // not a gate on this basic view.
  // commerceProfileId scopes every stat to one specific business the
  // account runs — without it (the account-wide default, unchanged for
  // any caller that doesn't send it yet), stats merge every business an
  // account owns into one dashboard, which was the actual bug once an
  // account could run more than one (profile-architecture-audit-2026-08
  // Stage 6). Legacy rows with no commerceProfileId of their own still
  // resolve here, same NULL-fallback rule used everywhere else this
  // session — a business's dashboard isn't missing pre-migration data.
  async getDashboardStats(user: User, commerceProfileId?: number) {
    // Tolerant lookup — unlike getMyProfile(), never throws for a user who
    // hasn't applied yet; `profile` in the response below is simply null,
    // same shape the frontend already treats as "not verified" elsewhere.
    const profile = await this.profileRepo.findOne({
      where: { user: { id: user.id } },
    });

    const productScope = commerceProfileId
      ? new Brackets((qb) =>
          qb
            .where('p."commerceProfileId" = :cpid', { cpid: commerceProfileId })
            .orWhere(
              new Brackets((qb2) =>
                qb2
                  .where('p."commerceProfileId" IS NULL')
                  .andWhere('p."sellerId" = :sid', { sid: user.id }),
              ),
            ),
        )
      : null;
    const classifiedScope = commerceProfileId
      ? new Brackets((qb) =>
          qb
            .where('c."commerceProfileId" = :cpid', { cpid: commerceProfileId })
            .orWhere(
              new Brackets((qb2) =>
                qb2
                  .where('c."commerceProfileId" IS NULL')
                  .andWhere('c."sellerId" = :sid', { sid: user.id }),
              ),
            ),
        )
      : null;
    const orderScope = commerceProfileId
      ? new Brackets((qb) =>
          qb
            .where('o."commerceProfileId" = :cpid', { cpid: commerceProfileId })
            .orWhere(
              new Brackets((qb2) =>
                qb2
                  .where('o."commerceProfileId" IS NULL')
                  .andWhere('o."sellerId" = :sid', { sid: user.id }),
              ),
            ),
        )
      : null;

    const [myProducts, myClassifieds, myOrders] = await Promise.all([
      (() => {
        const qb = this.productRepo
          .createQueryBuilder('p')
          .where('p."sellerId" = :sid', { sid: user.id });
        if (productScope) qb.andWhere(productScope);
        return qb.getMany();
      })(),
      (() => {
        const qb = this.classifiedRepo
          .createQueryBuilder('c')
          .where('c."sellerId" = :sid', { sid: user.id });
        if (classifiedScope) qb.andWhere(classifiedScope);
        return qb.getMany();
      })(),
      // Fetch both online orders (via product) and manual shipments (direct seller)
      Promise.all([
        (() => {
          const qb = this.orderRepo
            .createQueryBuilder('o')
            .leftJoinAndSelect('o.product', 'p')
            .leftJoin('o.seller', 's')
            .addSelect(['s.id', 's.name', 's.storeName'])
            .leftJoin('o.buyer', 'b')
            .addSelect(['b.id', 'b.name', 'b.phone'])
            .where('p.seller = :sid', { sid: user.id })
            .orderBy('o.createdAt', 'DESC')
            .take(30);
          if (orderScope) qb.andWhere(orderScope);
          return qb.getMany();
        })(),
        (() => {
          const qb = this.orderRepo
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
            .take(30);
          if (orderScope) qb.andWhere(orderScope);
          return qb.getMany();
        })(),
        // Orders created from a paid classified invoice (ClassifiedsService.
        // setShippingMethod) have no product (classifieds aren't catalog
        // Products) and keep the default source:'online' — matching neither
        // branch above, so they silently never appeared in Seller Orders
        // and the seller could never reach the Ship Order / Super Agent
        // flow for them despite a real Order + escrow already existing.
        (() => {
          const qb = this.orderRepo
            .createQueryBuilder('o')
            .leftJoinAndSelect('o.product', 'p')
            .leftJoin('o.seller', 's')
            .addSelect(['s.id', 's.name', 's.storeName'])
            .leftJoin('o.buyer', 'b')
            .addSelect(['b.id', 'b.name', 'b.phone'])
            .where('o.seller = :sid', { sid: user.id })
            .andWhere('o."classifiedInvoiceId" IS NOT NULL')
            .orderBy('o.createdAt', 'DESC')
            .take(30);
          if (orderScope) qb.andWhere(orderScope);
          return qb.getMany();
        })(),
      ]).then(([onlineOrders, manualOrders, classifiedInvoiceOrders]) => {
        // Merge and deduplicate by id
        const seen = new Set<number>();
        return [...onlineOrders, ...manualOrders, ...classifiedInvoiceOrders]
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
  async getMyPayouts(userId: number, commerceProfileId?: number) {
    // Get all orders where this seller has earned money — commerceProfileId
    // scopes this to one specific business, otherwise (the default) an
    // account running more than one sees every business's payouts merged
    // together (profile-architecture-audit-2026-08 Stage 6). Legacy orders
    // with no commerceProfileId of their own still show up.
    const ordersQb = this.orderRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.product', 'p')
      .leftJoinAndSelect('o.buyer', 'b')
      // Orders with no catalog product (classified-invoice-derived orders,
      // among others) carry the seller directly on o.seller instead — this
      // used to only check p.sellerId/o.createdByUserId, so those orders'
      // payouts silently never appeared here either.
      .where(
        '(p.sellerId = :uid OR o.createdByUserId = :uid OR o."sellerId" = :uid)',
        { uid: userId },
      )
      .andWhere('o.status NOT IN (:...skip)', { skip: ['cancelled'] })
      .orderBy('o.createdAt', 'DESC')
      .take(50);
    if (commerceProfileId) {
      ordersQb.andWhere(
        '(o."commerceProfileId" = :cpid OR o."commerceProfileId" IS NULL)',
        { cpid: commerceProfileId },
      );
    }
    const orders = await ordersQb.getMany();

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
  async approve(
    profileId: number,
    verificationTier?: SellerProfile['verificationTier'],
  ): Promise<SellerProfile> {
    const profile = await this.profileRepo.findOne({
      where: { id: profileId },
    });
    if (!profile) throw new NotFoundException('Seller profile not found');
    profile.status = SellerStatus.APPROVED;
    if (verificationTier) profile.verificationTier = verificationTier;
    await this.userRepo.update(profile.user.id, {
      role: UserRole.SELLER,
      activeRoles: mergeActiveRole(profile.user.activeRoles, 'seller'),
    });
    await this.commerceProfiles
      .syncStatusByLink('sellerProfileId', profile.id, CommerceProfileStatus.ACTIVE)
      .catch(() => {});

    // Layer 1 audit follow-up: every newly-approved seller gets a real
    // SellingCapability grant going forward (pre-existing sellers are
    // covered once by SellingCapabilityBackfillService). Not yet the
    // actual enforcement point for product creation/payments — that
    // cutover is a deliberately separate, later phase.
    //
    // Granted to whichever CommerceProfile apply() actually attached this
    // application to — the account's Business profile for
    // sellerType==='business', or the account's existing Personal profile
    // for an individual seller (apply() no longer creates a redundant
    // Business-type profile for individuals — see the "Sell intent forced
    // business onboarding" fix). Eligibility (this SellerProfile being
    // approved) is a user-level fact, but SELL capability belongs to
    // whichever profile is acting (profile-architecture-audit-2026-08).
    // Skip silently if the expected profile is somehow missing (e.g. its
    // creation/lookup failed) rather than granting a capability with
    // nothing to attach it to.
    const profileTypeForCapability =
      profile.sellerType === 'business'
        ? CommerceProfileType.BUSINESS
        : CommerceProfileType.PERSONAL;
    const targetProfileForCapability = await this.commerceProfiles
      .findForUserByType(profile.user.id, profileTypeForCapability)
      .catch(() => null);
    if (targetProfileForCapability) {
      await this.sellingCapability
        .grant(
          targetProfileForCapability.id,
          profile.user.id,
          SellingCapabilityType.SELL_PHYSICAL,
          profile.sellerType === 'business'
            ? SellingCapabilityVerificationLevel.BUSINESS
            : SellingCapabilityVerificationLevel.INDIVIDUAL,
          null,
        )
        .catch(() => {});
    }

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
