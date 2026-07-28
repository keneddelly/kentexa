/**
 * WishlistController
 * Place at: src/wishlist/wishlist.controller.ts
 */
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Request,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { WishlistService } from './wishlist.service';

@Controller('wishlist')
@UseGuards(JwtAuthGuard)
export class WishlistController {
  constructor(private readonly svc: WishlistService) {}

  @Get()
  getMyWishlist(@Request() req) {
    return this.svc.getMyWishlist(req.user.id);
  }

  @Get('ids')
  getWishlistIds(@Request() req) {
    return this.svc.getWishlistIds(req.user.id);
  }

  @Post('toggle/:classifiedId')
  toggle(
    @Request() req,
    @Param('classifiedId', ParseIntPipe) classifiedId: number,
    @Body('note') note?: string,
  ) {
    return this.svc.toggle(req.user.id, classifiedId, note);
  }

  @Delete(':id')
  remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.svc.removeFromWishlist(req.user.id, id);
  }
}
