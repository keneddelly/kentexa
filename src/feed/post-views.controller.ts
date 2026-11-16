import { Body, Controller, Get, Param, ParseIntPipe, Post, Request, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/auth.guard';
import { PostViewsService } from './post-views.service';

/** Post views (owner approved 2026-11-16). */
@Controller('feed-views')
export class PostViewsController {
  constructor(private readonly views: PostViewsService) {}

  /** A guest read a public post (one per post per browser; a random key, no personal data). */
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Post(':id/guest')
  guest(@Param('id', ParseIntPipe) id: number, @Body() body: { sessionKey?: string; fromShare?: boolean }) {
    return this.views.guestView(id, body?.sessionKey, body?.fromShare);
  }

  /** The writer's own numbers for one post. */
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  stats(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.views.stats(id, req.user.id);
  }
}
