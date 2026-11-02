import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-auth.guard';
import { CommunitiesService } from './communities.service';
import { CvsService } from './cvs.service';

/** Social Home part 3: Jumuiya (communities). Owner approved 2026-11-02. */
@Controller('communities')
export class CommunitiesController {
  constructor(
    private readonly communities: CommunitiesService,
    private readonly cvs: CvsService,
  ) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  list(@Request() req, @Query('mine') mine?: string, @Query('topic') topic?: string) {
    const viewer = req?.user?.id || null;
    if (mine === '1' && !viewer) return [];
    return this.communities.list(viewer, {
      mine: mine === '1',
      topic: typeof topic === 'string' && /^[a-z_]{2,40}$/.test(topic) ? topic : null,
    });
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Request() req, @Body() dto: any) {
    return this.communities.create(req.user.id, dto || {});
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.communities.get(id, req?.user?.id || null);
  }

  /** The community's posts, newest first, under the feed's own visibility rules. */
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/posts')
  async posts(@Param('id', ParseIntPipe) id: number, @Request() req, @Query('page') page = '1', @Query('kind') kind?: string) {
    await this.communities.get(id, req?.user?.id || null);
    return this.cvs.getCommunityPosts(id, req?.user?.id || null, Number(page) || 1,
      ['question', 'poll', 'discussion'].includes(String(kind)) ? String(kind) : null);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':id/members')
  members(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.communities.members(id, req?.user?.id || null);
  }

  @Post(':id/join')
  @UseGuards(JwtAuthGuard)
  join(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.communities.join(id, req.user.id);
  }

  @Post(':id/leave')
  @UseGuards(JwtAuthGuard)
  leave(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.communities.leave(id, req.user.id);
  }

  @Get(':id/requests')
  @UseGuards(JwtAuthGuard)
  requests(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.communities.pending(id, req.user.id);
  }

  @Post(':id/requests/:userId')
  @UseGuards(JwtAuthGuard)
  decide(@Param('id', ParseIntPipe) id: number, @Param('userId', ParseIntPipe) userId: number, @Request() req, @Body('approve') approve: any) {
    if (typeof approve !== 'boolean') throw new BadRequestException('Kubali au kataa.');
    return this.communities.decide(id, req.user.id, userId, approve);
  }

  @Post(':id/helpers/:userId')
  @UseGuards(JwtAuthGuard)
  setHelper(@Param('id', ParseIntPipe) id: number, @Param('userId', ParseIntPipe) userId: number, @Request() req, @Body('helper') helper: any) {
    if (typeof helper !== 'boolean') throw new BadRequestException('Chagua ndiyo au hapana.');
    return this.communities.setHelper(id, req.user.id, userId, helper);
  }

  @Post(':id/posts/:postId/remove')
  @UseGuards(JwtAuthGuard)
  removePost(@Param('id', ParseIntPipe) id: number, @Param('postId', ParseIntPipe) postId: number, @Request() req) {
    return this.communities.removePost(id, req.user.id, postId);
  }
}
