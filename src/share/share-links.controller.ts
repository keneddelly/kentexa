import { BadRequestException, Body, Controller, Get, NotFoundException, Param, ParseIntPipe, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { OptionalJwtAuthGuard } from '../auth/optional-auth.guard';
import { ShareLinksService } from './share-links.service';

/** Viral engine A2 (issue #381): make and read short share links. */
@Controller('share-links')
export class ShareLinksController {
  constructor(private readonly links: ShareLinksService) {}

  /**
   * { contentType: 'post'|'community', contentId, channel } -> { code, url, path }. Guests may share too.
   * C10: { ..., channels: ['whatsapp', 'status', ...] } -> { links: { whatsapp: url, ... } }, one
   * code per channel, so the share sheet has every link ready when it opens.
   */
  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  async create(@Request() req, @Body() body: { contentType?: string; contentId?: number; channel?: string; channels?: string[] }) {
    const who = req?.user?.id || null;
    const type = String(body?.contentType || '');
    const id = Number(body?.contentId);
    if (Array.isArray(body?.channels)) {
      const channels = Array.from(new Set(body.channels.map(String))).slice(0, 10);
      const links: Record<string, string> = {};
      for (const ch of channels) links[ch] = (await this.links.create(who, type, id, ch)).url;
      return { links };
    }
    return this.links.create(who, type, id, String(body?.channel || 'link'));
  }

  /** B8: a browser opened a short link (once per session; the sharer's own opens are not counted). */
  @Post(':code/visit')
  @UseGuards(OptionalJwtAuthGuard)
  visit(@Param('code') code: string, @Request() req, @Body('sessionKey') sessionKey: string) {
    return this.links.recordVisit(code, String(sessionKey || ''), req?.user?.id || null);
  }

  /** B8: a new account (last 24 h) that arrived through this link. */
  @Post(':code/claim')
  @UseGuards(JwtAuthGuard)
  claim(@Param('code') code: string, @Request() req) {
    return this.links.claim(req.user.id, code);
  }

  /** B9: what my own shares of a post or community brought (only I see it). */
  @Get('mine/:type/:id')
  @UseGuards(JwtAuthGuard)
  mine(@Param('type') type: string, @Param('id', ParseIntPipe) id: number, @Request() req) {
    if (!['post', 'community'].includes(type)) throw new BadRequestException('Aina hii haishirikiwi.');
    return this.links.myStats(req.user.id, type, id);
  }

  /** Stage E: the admin growth report. */
  @Get('admin/report')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  report(@Query('days') days?: string) {
    return this.links.adminReport(Number(days) || 30);
  }

  /** Where a code leads (the app opens that page). Never says who shared. */
  @Get(':code')
  async resolve(@Param('code') code: string) {
    const r = await this.links.resolve(code);
    if (!r) throw new NotFoundException('Kiungo hiki hakipatikani.');
    return { contentType: r.contentType, contentId: r.contentId, path: r.path };
  }
}
