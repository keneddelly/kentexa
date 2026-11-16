import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { GuestCache } from '../traffic/guest-cache';
import { JwtAuthGuard } from '../auth/auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CvsService } from './cvs.service';
import { HashtagService } from './hashtag.service';
import { hashtagKey } from './hashtags';

/**
 * Hashtags (owner approved 2026-11-15). The tag page is public: anyone can read it, signed
 * out or in; what each viewer sees follows the feed's visibility rules.
 */
@Controller('hashtags')
export class HashtagsController {
  constructor(
    private readonly hashtags: HashtagService,
    private readonly cvs: CvsService,
  ) {}

  /** Composer: tags that start with what was typed after #, with how many posts use each. */
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @GuestCache(60)
  @Get('suggest')
  suggest(@Query('q') q?: string) {
    return this.hashtags.suggest(String(q || ''));
  }

  /** Admin: read the tags of all existing posts. Safe to run again. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/backfill')
  backfill() {
    return this.hashtags.backfill();
  }

  /** Admin: block (or unblock) a tag. Its page then shows nothing. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/:key/block')
  block(@Param('key') key: string, @Body('blocked') blocked: any) {
    if (typeof blocked !== 'boolean') throw new BadRequestException('Chagua kuzuia au kuruhusu.');
    return this.hashtags.setBlocked(key, blocked);
  }

  /** The tag page's header. A tag nobody has used yet answers with 0 posts, not an error. */
  @GuestCache(60)
  @Get(':key')
  async info(@Param('key') raw: string) {
    const key = hashtagKey(raw);
    if (!key) throw new NotFoundException('Tagi si sahihi.');
    return (await this.hashtags.info(key)) || { key, display: raw.replace(/^#/, ''), blocked: false, postCount: 0 };
  }

  /** The tag page's posts: sort=top (Juu) or latest (Mpya). */
  @UseGuards(OptionalJwtAuthGuard)
  @GuestCache(30)
  @Get(':key/posts')
  async posts(@Param('key') raw: string, @Request() req, @Query('sort') sort?: string, @Query('page') page?: string) {
    const key = hashtagKey(raw);
    if (!key) throw new NotFoundException('Tagi si sahihi.');
    return this.cvs.getHashtagPosts(key, req?.user?.id || null, sort === 'latest' ? 'latest' : 'top', Math.min(Math.max(Number(page) || 1, 1), 200));
  }
}
