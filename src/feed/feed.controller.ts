/**
 * FeedController — unified feed with CVS + comments + filters
 * Place at: src/feed/feed.controller.ts
 */
import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  ParseIntPipe,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { resolveCommentActorProfileId } from './comment-actor';
import { OptionalJwtAuthGuard } from '../auth/optional-auth.guard';
import { FeedService } from './feed.service';
import { CvsService } from './cvs.service';
import { EngagementType } from './entities/post-engagement.entity';
import { assertComposerText } from './publish-input';
import { PollService, assertPollInput } from './poll.service';
import { SocialSafetyService } from './social-safety.service';
import { TopicsService } from './topics.service';
import { TodayService } from './today.service';
import { CommunitiesService } from './communities.service';
import { composerEvent, ComposerEventLimiter } from './composer-events';
import { PostSuggestService } from './post-suggest.service';
import { Throttle } from '@nestjs/throttler';

@Controller('feed')
export class FeedController {
  constructor(
    private readonly svc: FeedService,
    private readonly cvs: CvsService,
    // Phase E (Kura). Optional so hand-built test controllers keep constructing.
    @Optional() private readonly polls?: PollService,
    // Phase F (report, mute). Optional for the same reason.
    @Optional() private readonly safety?: SocialSafetyService,
    // Social Home: topics. Optional for the same reason.
    @Optional() private readonly topics?: TopicsService,
    // Social Home part 2: "Leo kwako". Optional for the same reason.
    @Optional() private readonly today?: TodayService,
    // Social Home part 3: communities. Optional for the same reason.
    @Optional() private readonly communities?: CommunitiesService,
    // Smart Post "Pendekeza". Optional for the same reason.
    @Optional() private readonly suggester?: PostSuggestService,
  ) {}

  // ── Discovery (no auth required, but personalized when logged in) ────────
  @UseGuards(OptionalJwtAuthGuard)
  @Get('discover')
  getDiscover(@Request() req) {
    const userId = req?.user?.id || null;
    return this.svc.getDiscoverFeed(userId);
  }

  // ── Filtered feed (works with or without auth, personalized when logged in) ─
  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  async getFiltered(
    @Query('filter') filter = 'for_you',
    @Query('page') page = '1',
    @Query('city') city?: string,
    @Request() req?,
    @Query('topic') topic?: string,
  ) {
    const userId = req?.user?.id || null;
    // Social Home part 3: the Jumuiya tab reads the communities this person belongs to.
    const communityIds = filter === 'communities' && userId && this.communities
      ? await this.communities.myCommunityIds(userId) : undefined;
    return this.cvs.getFilteredFeed({
      communityIds,
      topic: typeof topic === 'string' && /^[a-z_]{2,40}$/.test(topic) ? topic : null,
      filter,
      userId,
      city,
      page: Number(page) || 1,
      limit: 15,
    });
  }

  // ── Trending feed ─────────────────────────────────────────────────────────
  @UseGuards(OptionalJwtAuthGuard)
  @Get('trending')
  getTrending(@Request() req) {
    const userId = req?.user?.id || null;
    return this.cvs.getTrending(8, userId);
  }

  // ── Story ring — sellers with a fresh Moment in the last 48h ──────────────
  @UseGuards(OptionalJwtAuthGuard)
  @Get('moments/stories')
  getMomentStories(@Request() req) {
    const userId = req?.user?.id || null;
    return this.svc.getMomentStories(userId);
  }

  // ── Business feed ─────────────────────────────────────────────────────────
  @UseGuards(OptionalJwtAuthGuard)
  @Get('business/:id')
  getBusinessFeed(
    @Param('id', ParseIntPipe) id: number,
    @Query('commerceProfileId') commerceProfileId?: string,
    @Request() req?,
  ) {
    return this.svc.getBusinessFeed(
      id,
      commerceProfileId ? Number(commerceProfileId) : undefined,
      req?.user?.id || null,
    );
  }

  // ── Publish post ──────────────────────────────────────────────────────────
  @Post('publish')
  @UseGuards(JwtAuthGuard, RoleContextGuard)
  async publish(@Request() req, @Body() dto: any) {
    // Phase D: what a person types in the composer is at most 500 characters.
    assertComposerText(dto);
    // Social Home: only internal listing code may mark a post automatic; the topic must exist.
    if (dto && typeof dto === 'object') {
      delete dto.autoListing;
      if (this.topics) dto.topic = await this.topics.assertTopic(dto.topic);
      else delete dto.topic;
      // Social Home part 3: a post made in a community needs an active member; it takes the
      // community's topic when none was chosen.
      const community = this.communities ? await this.communities.assertCanPost(dto.communityId, req.user.id) : null;
      dto.communityId = community?.id ?? null;
      if (community && !dto.topic) dto.topic = community.topicKey;
    }
    // Phase E: a poll is checked before the post is saved, and only a poll post carries one.
    const isPoll = dto?.intent === 'poll';
    if (isPoll && !this.polls) throw new BadRequestException('Kura haipatikani kwa sasa.');
    const poll = isPoll ? assertPollInput(dto.poll) : null;
    // I2B: the acting identity comes from the server-resolved active
    // context, never solely from a client-supplied commerceProfileId.
    const item = await this.svc.publish(req.user.id, dto, req.roleContext);
    if (poll && this.polls) {
      try {
        await this.polls.create(item.id, dto.title, poll);
      } catch (err) {
        // Never leave a poll post without its poll: the post is taken down again.
        await this.svc.deletePost(req.user.id, item.id).catch(() => {});
        throw err;
      }
    }
    return item;
  }

  // ── Smart Post: the composer's steps (no text kept; see composer-events.ts) ──
  private readonly composerLimiter = new ComposerEventLimiter();

  @Post('analytics/composer')
  @UseGuards(JwtAuthGuard)
  composerStep(@Request() req, @Body() body: any) {
    const ev = composerEvent(body);
    if (ev && this.composerLimiter.allow(req.user.id)) this.svc.recordComposerStep(req.user.id, ev);
    return { ok: true };
  }

  /** Smart Post "Pendekeza": one suggestion, only when the person taps it (10 a minute). */
  @Post('composer/suggest')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async composerSuggest(@Request() req, @Body() body: any) {
    if (!this.suggester) return { suggestion: null, unavailable: true };
    return this.suggester.suggest(req.user.id, body || {});
  }

  // ── Phase E: Kura ───────────────────────────────────────────────────────────
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/poll')
  getPoll(@Param('id', ParseIntPipe) id: number, @Request() req?) {
    if (!this.polls) throw new BadRequestException('Kura haipatikani kwa sasa.');
    return this.polls.view(id, req?.user?.id || null);
  }

  @Post(':id/poll/vote')
  @UseGuards(JwtAuthGuard)
  votePoll(@Request() req, @Param('id', ParseIntPipe) id: number, @Body('optionId') optionId: any) {
    if (!this.polls) throw new BadRequestException('Kura haipatikani kwa sasa.');
    if (!Number.isInteger(Number(optionId)) || Number(optionId) <= 0) throw new BadRequestException('Chagua chaguo moja.');
    return this.polls.vote(id, req.user.id, Number(optionId));
  }

  // ── Phase D: the author edits within 15 minutes (text, photos, audience) ──
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async editPost(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    await this.svc.editPost(req.user.id, id, dto || {});
    return this.cvs.getPost(id, req.user.id);
  }

  // ── Delete post ───────────────────────────────────────────────────────────
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  deletePost(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.svc.deletePost(req.user.id, id);
  }

  // ── Engage (like / save / share / view / purchase / shipment) ───────────────────
  @Post(':id/engage')
  @UseGuards(JwtAuthGuard)
  engage(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body('type') type: EngagementType,
  ) {
    if (!Object.values(EngagementType).includes(type)) {
      throw new BadRequestException('Aina ya kitendo haijulikani.');
    }
    return this.cvs.engage(req.user.id, id, type);
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/comments')
  getComments(@Param('id', ParseIntPipe) id: number, @Request() req?) {
    return this.cvs.getComments(id, req?.user?.id || null);
  }

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard, RoleContextGuard)
  addComment(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body('body') body: string,
    @Body('parentId') parentId?: number,
    @Body('offer') offer?: { entityType: string; entityId: number },
    @Body('type') type?: any,
    @Body('rating') rating?: number,
    @Body('media') media?: { url: string; type: 'image' | 'video' }[],
    @Body('offlinePurchaseClaim') offlinePurchaseClaim?: boolean,
    // IGNORED (I2F): the stored actor is the server RoleContext's, never client input.
    @Body('commerceProfileId') _ignoredClientProfileId?: number,
  ) {
    const commerceProfileId = resolveCommentActorProfileId(req.roleContext) ?? undefined;
    return this.cvs.addComment(
      req.user.id,
      id,
      body,
      parentId,
      offer,
      {
        type,
        rating,
        media,
        offlinePurchaseClaim,
      },
      commerceProfileId,
    );
  }

  @Delete('comments/:id')
  @UseGuards(JwtAuthGuard)
  deleteComment(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.cvs.deleteComment(req.user.id, id);
  }

  // ── Saved post IDs ────────────────────────────────────────────────────────
  @Get('saved/ids')
  @UseGuards(JwtAuthGuard)
  getSavedIds(@Request() req) {
    return this.cvs.getSavedPostIds(req.user.id);
  }

  // ── Everything saved, with full display data — powers Wishlist.js ────────
  @Get('saved')
  @UseGuards(JwtAuthGuard)
  getSavedItems(@Request() req) {
    return this.cvs.getMySavedItems(req.user.id);
  }

  // ── Phase C (2026-11-02): posts this person has hearted ───────────────────
  @Get('liked/ids')
  @UseGuards(JwtAuthGuard)
  getLikedIds(@Request() req) {
    return this.cvs.getLikedPostIds(req.user.id);
  }

  // ── Social Home: topics ("Mada") ─────────────────────────────────────────
  @UseGuards(OptionalJwtAuthGuard)
  @Get('topics')
  listTopics(@Request() req?) {
    if (!this.topics) return [];
    return this.topics.list(req?.user?.id || null);
  }

  // ── New profiles: the header's post count and topics for one profile ──
  @UseGuards(OptionalJwtAuthGuard)
  @Get('profile/:profileId/summary')
  profileSummary(@Param('profileId', ParseIntPipe) profileId: number, @Request() req?) {
    return this.cvs.getProfileSummary(profileId, req?.user?.id || null);
  }

  // ── New profiles part 2: "Majibu" (replies written as this profile) ──
  @UseGuards(OptionalJwtAuthGuard)
  @Get('profile/:profileId/replies')
  profileReplies(@Param('profileId', ParseIntPipe) profileId: number, @Request() req?) {
    return this.cvs.getProfileReplies(profileId, req?.user?.id || null);
  }

  // ── Social Home part 2: "Leo kwako" (only real activity; empty means no block) ──
  @Get('today')
  @UseGuards(JwtAuthGuard)
  getToday(@Request() req) {
    if (!this.today) return [];
    return this.today.forViewer(req.user.id);
  }

  @Post('topics/follow')
  @UseGuards(JwtAuthGuard)
  followTopics(@Request() req, @Body('keys') keys: any) {
    if (!this.topics) throw new BadRequestException('Mada hazipatikani kwa sasa.');
    return this.topics.setFollowed(req.user.id, keys);
  }

  @Get('reposted/ids')
  @UseGuards(JwtAuthGuard)
  getRepostedIds(@Request() req) {
    return this.cvs.getRepostedPostIds(req.user.id);
  }

  // ── Phase F: repost goes through /feed/:id/engage (type 'repost'); report and mute here ──
  @Post(':id/report')
  @UseGuards(JwtAuthGuard)
  reportPost(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() body: any) {
    if (!this.safety) throw new BadRequestException('Huduma hii haipatikani kwa sasa.');
    return this.safety.report(id, req.user.id, body?.reason, body?.note);
  }

  @Post('mute')
  @UseGuards(JwtAuthGuard)
  toggleMute(@Request() req, @Body() body: any) {
    if (!this.safety) throw new BadRequestException('Huduma hii haipatikani kwa sasa.');
    return this.safety.toggleMute(req.user.id, body || {});
  }

  @Get('mute/status')
  @UseGuards(JwtAuthGuard)
  muteStatus(@Request() req, @Query('commerceProfileId') commerceProfileId?: string, @Query('accountId') accountId?: string) {
    if (!this.safety) throw new BadRequestException('Huduma hii haipatikani kwa sasa.');
    return this.safety.muteStatus(req.user.id, { commerceProfileId, accountId });
  }

  // ── Phase C: one post, for its own page and share links. Declared last so
  // the named routes above (saved, trending, discover...) are matched first.
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  getPost(@Param('id', ParseIntPipe) id: number, @Request() req?) {
    return this.cvs.getPost(id, req?.user?.id || null);
  }
}
