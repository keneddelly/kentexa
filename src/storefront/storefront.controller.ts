import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { StorefrontService } from './storefront.service';

/** Duka page (owner approved 2026-11-18): public read, owner-only changes. */
@Controller('storefront')
export class StorefrontController {
  constructor(private readonly store: StorefrontService) {}

  @Get(':profileId')
  get(@Param('profileId', ParseIntPipe) profileId: number) { return this.store.get(profileId); }

  @Patch(':profileId/settings') @UseGuards(JwtAuthGuard)
  settings(@Param('profileId', ParseIntPipe) profileId: number, @Body() body: any, @Request() req: any) {
    return this.store.saveSettings(profileId, req.user.id, body);
  }

  @Post(':profileId/collections') @UseGuards(JwtAuthGuard)
  add(@Param('profileId', ParseIntPipe) profileId: number, @Body() body: any, @Request() req: any) {
    return this.store.addCollection(profileId, req.user.id, body);
  }

  @Patch(':profileId/collections/:collectionId') @UseGuards(JwtAuthGuard)
  update(@Param('profileId', ParseIntPipe) profileId: number, @Param('collectionId', ParseIntPipe) collectionId: number, @Body() body: any, @Request() req: any) {
    return this.store.updateCollection(profileId, req.user.id, collectionId, body);
  }

  @Delete(':profileId/collections/:collectionId') @UseGuards(JwtAuthGuard)
  remove(@Param('profileId', ParseIntPipe) profileId: number, @Param('collectionId', ParseIntPipe) collectionId: number, @Request() req: any) {
    return this.store.removeCollection(profileId, req.user.id, collectionId);
  }
}
