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

@Controller('payouts')
@UseGuards(JwtAuthGuard)
export class PayoutsController {
  constructor(private payoutsService: PayoutsService) {}

  // ─── Admin routes ─────────────────────────────────────────────────────────

  @Get('admin/all')
  getAll() {
    return this.payoutsService.getAll();
  }

  @Get('admin/pending')
  getAllPending() {
    return this.payoutsService.getAllPending();
  }

  @Get('admin/seller/:sellerId')
  getBySeller(@Param('sellerId', ParseIntPipe) sellerId: number) {
    return this.payoutsService.getBySeller(sellerId);
  }

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

  @Get('my-payouts')
  getMyPayouts(@Request() req) {
    return this.payoutsService.getMyPayouts(req.user);
  }
}
