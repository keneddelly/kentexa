import { Body, Controller, Get, NotFoundException, Param, Post, Request, UseGuards } from '@nestjs/common';
import { OptionalJwtAuthGuard } from '../auth/optional-auth.guard';
import { ShareLinksService } from './share-links.service';

/** Viral engine A2 (issue #381): make and read short share links. */
@Controller('share-links')
export class ShareLinksController {
  constructor(private readonly links: ShareLinksService) {}

  /** { contentType: 'post'|'community', contentId, channel } -> { code, url, path }. Guests may share too. */
  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  create(@Request() req, @Body() body: { contentType?: string; contentId?: number; channel?: string }) {
    return this.links.create(req?.user?.id || null, String(body?.contentType || ''), Number(body?.contentId), String(body?.channel || 'link'));
  }

  /** Where a code leads (the app opens that page). Never says who shared. */
  @Get(':code')
  async resolve(@Param('code') code: string) {
    const r = await this.links.resolve(code);
    if (!r) throw new NotFoundException('Kiungo hiki hakipatikani.');
    return { contentType: r.contentType, contentId: r.contentId, path: r.path };
  }
}
