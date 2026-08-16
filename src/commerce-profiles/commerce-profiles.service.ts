import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CommerceProfile,
  CommerceProfileType,
  CommerceProfileStatus,
} from './entities/commerce-profile.entity';
import { CommerceProfileFollow } from './entities/commerce-profile-follow.entity';

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
