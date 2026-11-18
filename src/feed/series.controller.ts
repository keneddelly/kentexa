import { Body, Controller, Delete, Get, NotFoundException, Param, ParseIntPipe, Patch, Post, Put, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { SeriesService } from './series.service';
import { SERIES_TEXT, seriesIdFromRef } from './series-rules';

/**
 * Mfululizo (Topic Series, issue #410, owner approved 2026-11-17). Public reads (guests too) show
 * published series and public episodes only; follow needs sign-in; management is admin only
 * (creators later, behind a permission). Named routes come before ':ref'.
 */
@Controller('series')
export class SeriesController {
  constructor(private readonly series: SeriesService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  list(@Query('topic') topic?: string, @Query('communityId') communityId?: string, @Query('limit') limit?: string, @Request() req?: any, @Query('profileId') profileId?: string) {
    return this.series.list({ topic, communityId: communityId ? Number(communityId) : undefined, limit: limit ? Number(limit) : undefined,
      profileId: profileId ? Number(profileId) : undefined }, { id: req?.user?.id ?? null });
  }

  /** The series a post belongs to (the bar on the post page). */
  @Get('for-post/:postId')
  forPost(@Param('postId', ParseIntPipe) postId: number) {
    return this.series.forPost(postId);
  }

  // ── Creators (phase 5): their own series only; the service checks ownership on every call ──
  @UseGuards(JwtAuthGuard)
  @Get('my/status')
  myStatus(@Request() req: any) {
    return this.series.creatorStatus(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my/all')
  myList(@Request() req: any) {
    return this.series.mine(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my/:id')
  myGet(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.series.get(id, { id: req.user.id, isAdmin: false });
  }

  @UseGuards(JwtAuthGuard)
  @Post('my')
  myCreate(@Body() body: any, @Request() req: any) {
    return this.series.create(req.user.id, body, true);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('my/:id')
  myUpdate(@Param('id', ParseIntPipe) id: number, @Body() body: any, @Request() req: any) {
    return this.series.update(req.user.id, id, body, true);
  }

  @UseGuards(JwtAuthGuard)
  @Post('my/:id/episodes')
  myAdd(@Param('id', ParseIntPipe) id: number, @Body() body: any, @Request() req: any) {
    return this.series.addEpisode(req.user.id, id, body, true);
  }

  @UseGuards(JwtAuthGuard)
  @Put('my/:id/episodes/order')
  myReorder(@Param('id', ParseIntPipe) id: number, @Body('postIds') postIds: unknown, @Request() req: any) {
    return this.series.reorder(req.user.id, id, postIds, true);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('my/:id/episodes/:postId')
  myRemove(@Param('id', ParseIntPipe) id: number, @Param('postId', ParseIntPipe) postId: number, @Request() req: any) {
    return this.series.removeEpisode(req.user.id, id, postId, true);
  }

  // ── Admin ──
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/all')
  adminList() {
    return this.series.adminList();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/:id')
  adminGet(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.series.get(id, { id: req.user.id, isAdmin: true });
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() body: any, @Request() req: any) {
    return this.series.create(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any, @Request() req: any) {
    return this.series.update(req.user.id, id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post(':id/episodes')
  addEpisode(@Param('id', ParseIntPipe) id: number, @Body() body: any, @Request() req: any) {
    return this.series.addEpisode(req.user.id, id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Put(':id/episodes/order')
  reorder(@Param('id', ParseIntPipe) id: number, @Body('postIds') postIds: unknown, @Request() req: any) {
    return this.series.reorder(req.user.id, id, postIds);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id/episodes/:postId')
  removeEpisode(@Param('id', ParseIntPipe) id: number, @Param('postId', ParseIntPipe) postId: number, @Request() req: any) {
    return this.series.removeEpisode(req.user.id, id, postId);
  }

  // ── Signed-in people ──
  @UseGuards(JwtAuthGuard)
  @Post(':id/follow')
  follow(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.series.follow(req.user.id, id, true);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/follow')
  unfollow(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.series.follow(req.user.id, id, false);
  }

  /** One published series (guests too): /series/12 or /series/12-business-conversations. */
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':ref')
  get(@Param('ref') ref: string, @Request() req?: any) {
    const id = seriesIdFromRef(ref);
    if (!id) throw new NotFoundException(SERIES_TEXT.missing);
    return this.series.get(id, { id: req?.user?.id ?? null, isAdmin: false });
  }
}
