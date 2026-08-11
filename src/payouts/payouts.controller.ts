import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { PayoutsService } from './payouts.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('payouts')
export class PayoutsController {
  constructor(private payoutsService: PayoutsService) {}

  // ─── Admin routes ─────────────────────────────────────────────────────────
  // Guards combined in a single @UseGuards() call per method — this codebase
  // has a proven gotcha where splitting JwtAuthGuard/RolesGuard across
  // separate @UseGuards() calls on the same handler silently drops one of
  // them, so every admin route here uses one call, not class + method.

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/all')
  getAll() {
    return this.payoutsService.getAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/pending')
  getAllPending() {
    return this.payoutsService.getAllPending();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/seller/:sellerId')
  getBySeller(@Param('sellerId', ParseIntPipe) sellerId: number) {
    return this.payoutsService.getBySeller(sellerId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/process/:orderId')
  processPayout(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body()
    body: {
      paymentMethod: string;
      transactionReference: string;
      notes?: string;
    },
  ) {
    return this.payoutsService.processPayout(
      orderId,
      body.paymentMethod,
      body.transactionReference,
      body.notes,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/bulk/:sellerId')
  processBulkPayout(
    @Param('sellerId', ParseIntPipe) sellerId: number,
    @Body()
    body: {
      paymentMethod: string;
      transactionReference: string;
      notes?: string;
    },
  ) {
    return this.payoutsService.processBulkPayout(
      sellerId,
      body.paymentMethod,
      body.transactionReference,
      body.notes,
    );
  }

  // ─── Seller routes ────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('my-payouts')
  getMyPayouts(@Request() req) {
    return this.payoutsService.getMyPayouts(req.user);
  }
}
