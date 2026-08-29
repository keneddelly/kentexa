import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { SellerScopeService } from '../business/seller-scope.service';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';

@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(
    private service: SalesService,
    private sellerScope: SellerScopeService,
  ) {}

  @Post()
  async create(@Request() req, @Body() dto: CreateSaleDto) {
    const sellerId = await this.sellerScope.resolve(req.user, 'canOperatePOS');
    return this.service.createSale(sellerId, req.user.id, dto);
  }

  @Get()
  async list(
    @Request() req,
    @Query('channel') channel?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const sellerId = await this.sellerScope.resolve(req.user, 'canOperatePOS');
    return this.service.getSales(sellerId, {
      channel,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('dashboard')
  async dashboard(@Request() req) {
    const sellerId = await this.sellerScope.resolve(req.user, 'canViewRevenue');
    return this.service.getDashboard(sellerId);
  }

  @Get(':id')
  async detail(@Request() req, @Param('id', ParseIntPipe) id: number) {
    const sellerId = await this.sellerScope.resolve(req.user, 'canOperatePOS');
    return this.service.getSale(sellerId, id);
  }

  @Post(':id/void')
  async void(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
  ) {
    const sellerId = await this.sellerScope.resolve(req.user, 'canManageInventory');
    return this.service.voidSale(sellerId, id, reason, req.user.id);
  }

  // Marks a COD manual sale's balance as collected — same permission as
  // recording the sale itself (whoever can operate the POS/record a manual
  // sale is trusted to confirm they were paid the rest of it).
  @Post(':id/collect-cod-balance')
  async collectCodBalance(@Request() req, @Param('id', ParseIntPipe) id: number) {
    const sellerId = await this.sellerScope.resolve(req.user, 'canOperatePOS');
    return this.service.recordCodBalancePayment(sellerId, id);
  }
}
