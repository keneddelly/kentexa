/**
 * FeedController — unified feed with CVS + comments + filters
 * Place at: src/feed/feed.controller.ts
 */
import {
  Controller, Get, Post, Delete,
  Body, Param, Query, Request,
  UseGuards, ParseIntPipe, Optional,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { FeedService }  from './feed.service';
import { CvsService }   from './cvs.service';
import { EngagementType } from './entities/post-engagement.entity';

@Controller('feed')
export class FeedController {
  constructor(
    private readonly svc: FeedService,
    private readonly cvs: CvsService,
  ) {}

  // ── Discovery (no auth needed) ────────────────────────────────────────────
  @Get('discover')
  getDiscover(@Request() req) {
    const userId = req?.user?.id || null;
    return this.svc.getDiscoverFeed(userId);
  }

  // ── Filtered feed (works with or without auth) ────────────────────────────
  @Get()
  async getFiltered(
    @Query('filter') filter = 'for_you',
    @Query('page')   page   = '1',
    @Query('city')   city?: string,
    @Request() req?,
  ) {
    const userId = req?.user?.id || null;
    return this.cvs.getFilteredFeed({
      filter,
      userId,
      city,
      page:  Number(page) || 1,
      limit: 15,
    });
  }

  // ── Trending feed ─────────────────────────────────────────────────────────
  @Get('trending')
  getTrending(@Request() req) {
    const userId = req?.user?.id || null;
    return this.cvs.getTrending(8, userId);
  }

  // ── Story ring — sellers with a fresh Moment in the last 48h ──────────────
  @Get('moments/stories')
  getMomentStories(@Request() req) {
    const userId = req?.user?.id || null;
    return this.svc.getMomentStories(userId);
  }

  // ── Business feed ─────────────────────────────────────────────────────────
  @Get('business/:id')
  getBusinessFeed(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getBusinessFeed(id);
  }

  // ── Publish post ──────────────────────────────────────────────────────────
  @Post('publish')
  @UseGuards(JwtAuthGuard)
  publish(@Request() req, @Body() dto: any) {
    return this.svc.publish(req.user.id, dto);
  }

  // ── Delete post ───────────────────────────────────────────────────────────
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  deletePost(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.deletePost(req.user.id, id);
  }

  // ── Engage (save / share / view / purchase / shipment) ───────────────────
  @Post(':id/engage')
  @UseGuards(JwtAuthGuard)
  engage(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body('type') type: EngagementType,
  ) {
    return this.cvs.engage(req.user.id, id, type);
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  @Get(':id/comments')
  getComments(@Param('id', ParseIntPipe) id: number) {
    return this.cvs.getComments(id);
  }

  @Post(':id/comments')
  @UseGuards(JwtAuthGuard)
  addComment(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body('body')     body:      string,
    @Body('parentId') parentId?: number,
  ) {
    return this.cvs.addComment(req.user.id, id, body, parentId);
  }

  @Delete('comments/:id')
  @UseGuards(JwtAuthGuard)
  deleteComment(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.cvs.deleteComment(req.user.id, id);
  }

  // ── Saved post IDs ────────────────────────────────────────────────────────
  @Get('saved/ids')
  @UseGuards(JwtAuthGuard)
  getSavedIds(@Request() req) {
    return this.cvs.getSavedPostIds(req.user.id);
  }
}