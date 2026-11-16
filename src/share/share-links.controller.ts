import { Body, Controller, Get, NotFoundException, Param, Post, Request, UseGuards } from '@nestjs/common';
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

  /** Where a code leads (the app opens that page). Never says who shared. */
  @Get(':code')
  async resolve(@Param('code') code: string) {
    const r = await this.links.resolve(code);
    if (!r) throw new NotFoundException('Kiungo hiki hakipatikani.');
    return { contentType: r.contentType, contentId: r.contentId, path: r.path };
  }
}
