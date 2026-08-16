import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  CommerceProfile,
  CommerceProfileType,
  CommerceProfileStatus,
} from './entities/commerce-profile.entity';
import { CommerceProfileFollow } from './entities/commerce-profile-follow.entity';
import { CommerceProfileMember } from './entities/commerce-profile-member.entity';
import { User } from '../users/entities/user.entity';
import { Review } from '../store/review.entity';
import { ProductReview } from '../products/entities/product-review.entity';

const RESERVED_USERNAMES = new Set([
  'admin',
  'api',
  'app',
  'help',
  'support',
  'kentexa',
  'about',
  'contact',
  'login',
  'register',
  'settings',
  'null',
  'undefined',
]);

@Injectable()
export class CommerceProfilesService {
  constructor(
    @InjectRepository(CommerceProfile)
    private repo: Repository<CommerceProfile>,
    @InjectRepository(CommerceProfileFollow)
    private followRepo: Repository<CommerceProfileFollow>,
    @InjectRepository(CommerceProfileMember)
    private memberRepo: Repository<CommerceProfileMember>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(Review)
    private reviewRepo: Repository<Review>,
    @InjectRepository(ProductReview)
    private productReviewRepo: Repository<ProductReview>,
  ) {}

  // Slugifies `seed` and appends a numeric suffix until it's free. Never
  // throws on collision — always returns something usable, since this
  // runs both at interactive signup time and inside the unattended
  // backfill script.
  async generateUniqueUsername(seed: string): Promise<string> {
    const base =
      seed
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 24) || 'user';

    let candidate = base;
    let suffix = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (
        !RESERVED_USERNAMES.has(candidate) &&
        !(await this.repo.findOne({ where: { username: candidate } }))
      ) {
        return candidate;
      }
      suffix += 1;
      candidate = `${base}${suffix}`;
    }
  }

  async findByUsername(username: string): Promise<CommerceProfile | null> {
    return this.repo.findOne({
      where: { username: username.toLowerCase() },
    });
  }

  async findById(id: number): Promise<CommerceProfile> {
    const profile = await this.repo.findOne({ where: { id } });
    if (!profile) throw new NotFoundException('Commerce profile not found');
    return profile;
  }

  // Every profile a user owns — the personal one they got at signup, plus
  // whichever business/agent/transport/hub profiles they've had approved.
  async findForUser(ownerId: number): Promise<CommerceProfile[]> {
    return this.repo.find({
      where: { ownerId },
      order: { createdAt: 'ASC' },
    });
  }

  // Every profile a user can ACT AS — their own, plus any profile they're
  // an active CommerceProfileMember of. This is what the profile switcher
  // uses (GET /profiles/mine): a hub's staff needs to see and switch into
  // that hub even though they don't own it. findForUser() above stays
  // owned-only — it backs public "which profiles does this account run"
  // lookups where membership shouldn't leak.
  async findAccessibleForUser(userId: number): Promise<CommerceProfile[]> {
    const owned = await this.findForUser(userId);
    const memberships = await this.memberRepo.find({
      where: { userId, isActive: true },
    });
    const memberProfileIds = memberships
      .map((m) => m.commerceProfileId)
      .filter((id) => !owned.some((p) => p.id === id));
    if (memberProfileIds.length === 0) return owned;
    const memberProfiles = await this.repo.find({
      where: { id: In(memberProfileIds) },
    });
    return [...owned, ...memberProfiles].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );
  }

  async findForUserByType(
    ownerId: number,
    type: CommerceProfileType,
  ): Promise<CommerceProfile | null> {
    return this.repo.findOne({ where: { ownerId, type } });
  }

  // Idempotent by design: if this owner already has a profile of this type
  // (checked by the caller passing a stable linkField/linkId), callers
  // should look it up first — this always creates. Used both by the live
  // approval flows and the one-time backfill script.
  async createProfile(params: {
    ownerId: number;
    type: CommerceProfileType;
    displayName: string;
    usernameSeed: string;
    photoUrl?: string | null;
    bio?: string | null;
    location?: string | null;
    category?: string | null;
    status?: CommerceProfileStatus;
    sellerProfileId?: number;
    transportProviderId?: number;
    agentId?: number;
    superAgentId?: number;
  }): Promise<CommerceProfile> {
    const username = await this.generateUniqueUsername(params.usernameSeed);
    return this.repo.save(
      this.repo.create({
        ownerId: params.ownerId,
        type: params.type,
        username,
        displayName: params.displayName,
        photoUrl: params.photoUrl || null,
        bio: params.bio || null,
        location: params.location || null,
        category: params.category || null,
        status: params.status || CommerceProfileStatus.ACTIVE,
        sellerProfileId: params.sellerProfileId ?? null,
        transportProviderId: params.transportProviderId ?? null,
        agentId: params.agentId ?? null,
        superAgentId: params.superAgentId ?? null,
      }),
    );
  }

  async updateStatus(
    id: number,
    status: CommerceProfileStatus,
  ): Promise<void> {
    await this.repo.update(id, { status });
  }

  // Used by every approve/reject/suspend flow (seller, transport, agent,
  // super-agent) to keep the linked CommerceProfile's status mirroring the
  // operational entity's own status, without each service needing to know
  // the CommerceProfile's own id — just the id of the record they already
  // approved. Silently no-ops if no linked profile exists yet (e.g. this
  // ran before the backfill caught up an old record).
  async syncStatusByLink(
    linkField:
      | 'sellerProfileId'
      | 'transportProviderId'
      | 'agentId'
      | 'superAgentId',
    linkId: number,
    status: CommerceProfileStatus,
  ): Promise<void> {
    await this.repo.update({ [linkField]: linkId } as any, { status });
  }

  // ── Following a specific profile ────────────────────────────────────────
  // Separate from every other CommerceProfile identity — Kened following
  // his own hub, or a buyer following Bishoo Intelligence Systems without
  // ever following Kened personally, has to be representable. followerId
  // is a User id (whoever's logged in), commerceProfileId is the exact
  // profile being followed, never the owning account.
  async isFollowing(
    followerId: number | undefined,
    commerceProfileId: number,
  ): Promise<boolean> {
    if (!followerId) return false;
    const row = await this.followRepo.findOne({
      where: { followerId, commerceProfileId },
    });
    return !!row;
  }

  async toggleFollow(
    followerId: number,
    commerceProfileId: number,
  ): Promise<{ following: boolean; followersCount: number }> {
    const existing = await this.followRepo.findOne({
      where: { followerId, commerceProfileId },
    });
    if (existing) {
      await this.followRepo.remove(existing);
      await this.repo.decrement({ id: commerceProfileId }, 'followersCount', 1);
    } else {
      await this.followRepo.save(
        this.followRepo.create({ followerId, commerceProfileId }),
      );
      await this.repo.increment({ id: commerceProfileId }, 'followersCount', 1);
    }
    const profile = await this.findById(commerceProfileId);
    return { following: !existing, followersCount: profile.followersCount };
  }

  // Rolling-average rating + count, called once per new review (Review or
  // ProductReview) that gets a commerceProfileId stamped on it. Same
  // "denormalized, kept in sync by the services that own Follow/Review
  // writes" contract the entity's own comment describes — this is the
  // Review half of that (toggleFollow above is the Follow half).
  async recordReview(commerceProfileId: number, rating: number): Promise<void> {
    const profile = await this.findById(commerceProfileId);
    const newCount = profile.reviewsCount + 1;
    const newAverage =
      (Number(profile.rating) * profile.reviewsCount + rating) / newCount;
    await this.repo.update(commerceProfileId, {
      reviewsCount: newCount,
      rating: Number(newAverage.toFixed(2)),
    });
  }

  // Reviews scoped to THIS profile — merges the two separate review tables
  // (Review, keyed to a seller account's storefront checkout; ProductReview,
  // keyed to an individual product) into one normalized, newest-first list.
  // Only rows with commerceProfileId set are returned — reviews written
  // before this feature existed have no profile to correctly attribute to,
  // so they're omitted here rather than guessed at (same rule Stage 3 used
  // for feed posts, just inverted: there, untagged posts stayed visible
  // everywhere; here, untagged reviews aren't scoped to any one profile so
  // they can't appear on this profile-specific list at all).
  async getReviews(commerceProfileId: number, limit = 30) {
    const [storeReviews, productReviews] = await Promise.all([
      this.reviewRepo.find({
        where: { commerceProfileId },
        relations: { buyer: true },
        order: { createdAt: 'DESC' },
        take: limit,
      }),
      this.productReviewRepo.find({
        where: { commerceProfileId },
        order: { createdAt: 'DESC' },
        take: limit,
      }),
    ]);

    const normalized = [
      ...storeReviews.map((r) => ({
        id: `store-${r.id}`,
        rating: r.rating,
        comment: r.comment,
        reviewerName: r.buyer?.name || 'Kentexa user',
        reviewerPhoto: r.buyer?.avatarUrl || null,
        createdAt: r.createdAt,
      })),
      ...productReviews.map((r) => ({
        id: `product-${r.id}`,
        rating: r.rating,
        comment: r.comment,
        reviewerName: r.reviewer?.name || 'Kentexa user',
        reviewerPhoto: r.reviewer?.avatarUrl || null,
        createdAt: r.createdAt,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return normalized.slice(0, limit);
  }

  // ── Team management ────────────────────────────────────────────────────
  // Direct generalization of SellerService's getTeamMembers/inviteTeamMember/
  // updateTeamMember/removeTeamMember (src/seller/seller.service.ts) — same
  // shape, keyed by commerceProfileId instead of sellerId so it works for
  // any profile type (hub staff, transport company staff), not just sellers.
  async getMembers(commerceProfileId: number): Promise<CommerceProfileMember[]> {
    return this.memberRepo.find({
      where: { commerceProfileId, isActive: true },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
  }

  async inviteMember(
    commerceProfileId: number,
    dto: { phone: string; role: string; permissions: Record<string, boolean> },
  ): Promise<CommerceProfileMember> {
    const profile = await this.findById(commerceProfileId);
    const user = await this.userRepo.findOne({ where: { phone: dto.phone } });
    if (!user) {
      throw new NotFoundException(
        `No user found with phone ${dto.phone}. Ask them to register first.`,
      );
    }
    if (user.id === profile.ownerId) {
      throw new BadRequestException("You can't add yourself.");
    }
    const existing = await this.memberRepo.findOne({
      where: { commerceProfileId, userId: user.id, isActive: true },
    });
    if (existing) {
      throw new BadRequestException(
        'This person is already on the team.',
      );
    }
    return this.memberRepo.save(
      this.memberRepo.create({
        commerceProfileId,
        userId: user.id,
        role: dto.role || 'staff',
        permissions: dto.permissions || {},
      }),
    );
  }

  async updateMember(
    commerceProfileId: number,
    memberId: number,
    dto: { role?: string; permissions?: Record<string, boolean>; isActive?: boolean },
  ): Promise<CommerceProfileMember> {
    const member = await this.memberRepo.findOne({
      where: { id: memberId, commerceProfileId },
    });
    if (!member) throw new NotFoundException('Team member not found');
    if (dto.role !== undefined) member.role = dto.role;
    if (dto.permissions !== undefined) member.permissions = dto.permissions;
    if (dto.isActive !== undefined) member.isActive = dto.isActive;
    return this.memberRepo.save(member);
  }

  async removeMember(commerceProfileId: number, memberId: number): Promise<void> {
    const member = await this.memberRepo.findOne({
      where: { id: memberId, commerceProfileId },
    });
    if (!member) throw new NotFoundException('Team member not found');
    member.isActive = false;
    await this.memberRepo.save(member);
  }

  async updatePublicFields(
    id: number,
    dto: Partial<
      Pick<
        CommerceProfile,
        'displayName' | 'photoUrl' | 'coverImage' | 'bio' | 'location'
      >
    >,
  ): Promise<CommerceProfile> {
    await this.repo.update(id, dto);
    return this.findById(id);
  }
}
