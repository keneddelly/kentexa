import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommerceProfile, CommerceProfileType, CommerceProfileStatus } from './entities/commerce-profile.entity';
import { CommerceProfilesService } from './commerce-profiles.service';
import { User } from '../users/entities/user.entity';
import { SellerProfile, SellerStatus } from '../seller/entities/seller-profile.entity';
import { TransportProvider, ProviderStatus } from '../transport/entities/transport-provider.entity';
import { Agent, AgentStatus } from '../agents/entities/agent.entity';
import { SuperAgent, SuperAgentStatus } from '../super-agents/entities/super-agent.entity';
import { BusinessFeedItem } from '../business/entities/business-feed-item.entity';

export interface BackfillResult {
  personalCreated: number;
  businessCreated: number;
  transportCreated: number;
  agentCreated: number;
  hubCreated: number;
  skippedAlreadyExisted: number;
  businessPhotosRepaired: number;
  feedPostsRetagged: number;
}

// One-time (idempotent) catch-up for data that predates CommerceProfile.
// New records never need this — they get their CommerceProfile created
// inline by their own apply/register/approve flow going forward. Safe to
// re-run: every check below looks for an existing linked profile first.
@Injectable()
export class CommerceProfilesBackfillService {
  private readonly logger = new Logger(CommerceProfilesBackfillService.name);

  constructor(
    @InjectRepository(CommerceProfile) private profileRepo: Repository<CommerceProfile>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(SellerProfile) private sellerRepo: Repository<SellerProfile>,
    @InjectRepository(TransportProvider) private transportRepo: Repository<TransportProvider>,
    @InjectRepository(Agent) private agentRepo: Repository<Agent>,
    @InjectRepository(SuperAgent) private superAgentRepo: Repository<SuperAgent>,
    @InjectRepository(BusinessFeedItem) private feedItemRepo: Repository<BusinessFeedItem>,
    private profiles: CommerceProfilesService,
  ) {}

  async run(): Promise<BackfillResult> {
    const result: BackfillResult = {
      personalCreated: 0,
      businessCreated: 0,
      transportCreated: 0,
      agentCreated: 0,
      hubCreated: 0,
      skippedAlreadyExisted: 0,
      businessPhotosRepaired: 0,
      feedPostsRetagged: 0,
    };

    // ── Personal profile for every user ─────────────────────────────────────
    const users = await this.userRepo.find();
    for (const user of users) {
      const existing = await this.profiles.findForUserByType(user.id, CommerceProfileType.PERSONAL);
      if (existing) { result.skippedAlreadyExisted++; continue; }
      await this.profiles.createProfile({
        ownerId: user.id,
        type: CommerceProfileType.PERSONAL,
        displayName: user.name || `User ${user.id}`,
        usernameSeed: user.name || `user${user.id}`,
        photoUrl: user.avatarUrl,
        status: CommerceProfileStatus.ACTIVE,
      });
      result.personalCreated++;
    }
    this.logger.log(`Personal profiles: ${result.personalCreated} created`);

    // ── Business profile for every seller application ──────────────────────
    const sellerProfiles = await this.sellerRepo.find();
    for (const sp of sellerProfiles) {
      if (!sp.user) continue;
      const existing = await this.profileRepo.findOne({ where: { sellerProfileId: sp.id } });
      if (existing) { result.skippedAlreadyExisted++; continue; }
      await this.profiles.createProfile({
        ownerId: sp.user.id,
        type: CommerceProfileType.BUSINESS,
        displayName: sp.user.storeName || sp.businessName,
        usernameSeed: sp.businessName,
        photoUrl: sp.user.logo || sp.logo,
        bio: sp.businessDescription,
        location: sp.address,
        status: sp.status === SellerStatus.APPROVED ? CommerceProfileStatus.ACTIVE
          : sp.status === SellerStatus.REJECTED ? CommerceProfileStatus.REJECTED
          : sp.status === SellerStatus.SUSPENDED ? CommerceProfileStatus.SUSPENDED
          : CommerceProfileStatus.PENDING,
        sellerProfileId: sp.id,
      });
      result.businessCreated++;
    }
    this.logger.log(`Business profiles: ${result.businessCreated} created`);

    // ── Repair existing business profiles missing a photo ───────────────────
    // apply() used to seed photoUrl from SellerProfile.logo, a field that's
    // essentially never populated — real store logos live on User.logo
    // (Store Settings writes there, and that's what search cards/post
    // headers already display correctly). Any BUSINESS profile created
    // before that seeding was fixed is stuck with a null photoUrl forever,
    // since profile creation is create-once — this repairs those in place.
    // Safe to re-run: only touches rows where photoUrl is still null.
    const staleBusinessProfiles = await this.profileRepo.find({
      where: { type: CommerceProfileType.BUSINESS, photoUrl: null as any },
    });
    for (const profile of staleBusinessProfiles) {
      const user = await this.userRepo.findOne({ where: { id: profile.ownerId } });
      const sellerProfile = profile.sellerProfileId
        ? await this.sellerRepo.findOne({ where: { id: profile.sellerProfileId } })
        : null;
      const logo = user?.logo || sellerProfile?.logo;
      if (logo) {
        await this.profileRepo.update(profile.id, { photoUrl: logo });
        result.businessPhotosRepaired++;
      }
    }
    this.logger.log(`Business photos repaired: ${result.businessPhotosRepaired}`);

    // ── Retag old feed posts that predate commerceProfileId ─────────────────
    // Every post created after profile-switching shipped stamps the active
    // profile at publish time; posts from before that only have businessId
    // (the owning account), so they fall back to that account's PERSONAL
    // profile when rendered — wrong for a seller whose post was clearly a
    // business one. Only safe when the poster has EXACTLY ONE business
    // profile: with two or more, which one actually posted it is genuinely
    // ambiguous and guessing would misattribute it, so those are left alone
    // (same as before — this only fixes the unambiguous case).
    const untaggedPosts = await this.feedItemRepo.find({
      where: { commerceProfileId: null as any },
    });
    if (untaggedPosts.length > 0) {
      const posterIds = Array.from(new Set(untaggedPosts.map((p) => p.businessId)));
      const businessProfiles = await this.profileRepo.find({
        where: { type: CommerceProfileType.BUSINESS },
      });
      const businessProfilesByOwner = new Map<number, CommerceProfile[]>();
      for (const bp of businessProfiles) {
        if (!posterIds.includes(bp.ownerId)) continue;
        const list = businessProfilesByOwner.get(bp.ownerId) || [];
        list.push(bp);
        businessProfilesByOwner.set(bp.ownerId, list);
      }
      for (const post of untaggedPosts) {
        const candidates = businessProfilesByOwner.get(post.businessId) || [];
        if (candidates.length !== 1) continue;
        await this.feedItemRepo.update(post.id, { commerceProfileId: candidates[0].id });
        result.feedPostsRetagged++;
      }
    }
    this.logger.log(`Feed posts retagged: ${result.feedPostsRetagged}`);

    // ── Transport-provider profile for every registration ──────────────────
    const providers = await this.transportRepo.find();
    for (const tp of providers) {
      if (!tp.userId) continue;
      const existing = await this.profileRepo.findOne({ where: { transportProviderId: tp.id } });
      if (existing) { result.skippedAlreadyExisted++; continue; }
      await this.profiles.createProfile({
        ownerId: tp.userId,
        type: CommerceProfileType.TRANSPORT_PROVIDER,
        displayName: tp.name,
        usernameSeed: tp.name,
        photoUrl: tp.logoUrl,
        bio: tp.description,
        status: [ProviderStatus.VERIFIED, ProviderStatus.ACTIVE].includes(tp.status)
          ? CommerceProfileStatus.ACTIVE
          : tp.status === ProviderStatus.REJECTED ? CommerceProfileStatus.REJECTED
          : tp.status === ProviderStatus.SUSPENDED ? CommerceProfileStatus.SUSPENDED
          : CommerceProfileStatus.PENDING,
        transportProviderId: tp.id,
      });
      result.transportCreated++;
    }
    this.logger.log(`Transport provider profiles: ${result.transportCreated} created`);

    // ── Agent profile for every registration ────────────────────────────────
    const agents = await this.agentRepo.find();
    for (const a of agents) {
      if (!a.user) continue;
      const existing = await this.profileRepo.findOne({ where: { agentId: a.id } });
      if (existing) { result.skippedAlreadyExisted++; continue; }
      await this.profiles.createProfile({
        ownerId: a.user.id,
        type: CommerceProfileType.AGENT,
        displayName: a.fullName,
        usernameSeed: a.fullName,
        photoUrl: a.user.avatarUrl,
        location: a.city,
        status: a.status === AgentStatus.APPROVED ? CommerceProfileStatus.ACTIVE
          : a.status === AgentStatus.REJECTED ? CommerceProfileStatus.REJECTED
          : a.status === AgentStatus.SUSPENDED ? CommerceProfileStatus.SUSPENDED
          : CommerceProfileStatus.PENDING,
        agentId: a.id,
      });
      result.agentCreated++;
    }
    this.logger.log(`Agent profiles: ${result.agentCreated} created`);

    // ── Hub profile for every super agent ───────────────────────────────────
    const hubs = await this.superAgentRepo.find();
    for (const sa of hubs) {
      if (!sa.user) continue;
      const existing = await this.profileRepo.findOne({ where: { superAgentId: sa.id } });
      if (existing) { result.skippedAlreadyExisted++; continue; }
      await this.profiles.createProfile({
        ownerId: sa.user.id,
        type: CommerceProfileType.HUB,
        displayName: sa.businessName,
        usernameSeed: sa.businessName,
        photoUrl: sa.user.avatarUrl,
        location: sa.city,
        status: sa.status === SuperAgentStatus.ACTIVE ? CommerceProfileStatus.ACTIVE
          : sa.status === SuperAgentStatus.BLOCKED ? CommerceProfileStatus.REJECTED
          : sa.status === SuperAgentStatus.SUSPENDED ? CommerceProfileStatus.SUSPENDED
          : CommerceProfileStatus.PENDING,
        superAgentId: sa.id,
      });
      result.hubCreated++;
    }
    this.logger.log(`Hub profiles: ${result.hubCreated} created`);

    return result;
  }
}
