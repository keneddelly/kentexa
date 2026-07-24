import {
  Controller, Get, Patch, Post, Body, Param, Request, UseGuards, ParseIntPipe, Query,
} from '@nestjs/common';
import { StoreService } from './store.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-auth.guard';

@Controller('stores')
export class StoreController {
  constructor(private storeService: StoreService) {}

  // ── Logged-in user: Get stores I follow ───────────────────────────────────
  // NOTE: must be declared BEFORE the ':sellerId' route below, otherwise
  // Nest matches "me" as :sellerId and ParseIntPipe throws a 400.
  @UseGuards(JwtAuthGuard)
  @Get('me/following')
  getFollowedStores(@Request() req) {
    return this.storeService.getMyFollowedStores(req.user.id);
  }

  // ── Logged-in user: See who follows ME (names, not just the count) ───────
  @UseGuards(JwtAuthGuard)
  @Get('me/followers')
  getMyFollowers(@Request() req) {
    return this.storeService.getMyFollowers(req.user.id);
  }

  // ── Public: View a store page ──────────────────────────────────────────────
  @UseGuards(OptionalJwtAuthGuard)
  @Get(':sellerId')
  getStore(@Param('sellerId', ParseIntPipe) sellerId: number, @Request() req) {
    const viewerId = req.user?.id;
    return this.storeService.getStore(sellerId, viewerId);
  }

  // ── Seller: Update own store profile ──────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  updateProfile(@Request() req, @Body() dto: any) {
    return this.storeService.updateStoreProfile(req.user.id, dto);
  }

  // ── Logged-in user: Follow/unfollow a store ──────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post(':sellerId/follow')
  toggleFollow(@Param('sellerId', ParseIntPipe) sellerId: number, @Request() req) {
    return this.storeService.toggleFollow(req.user.id, sellerId);
  }

  // ── Buyer: Submit a review ────────────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Post(':sellerId/reviews')
  submitReview(
    @Param('sellerId', ParseIntPipe) sellerId: number,
    @Request() req,
    @Body() dto: { orderId: number; rating: number; comment?: string },
  ) {
    return this.storeService.submitReview(req.user.id, sellerId, dto);
  }
}