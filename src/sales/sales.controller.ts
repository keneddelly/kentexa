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
import { RoleContextGuard } from '../role-context/role-context.guard';
import { CurrentRoleContext } from '../role-context/current-role-context.decorator';
import type { RoleContext } from '../role-context/role-context.types';
import { SellerScopeService } from '../business/seller-scope.service';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';

// I2G: every sale route derives the acting workspace from the authenticated RoleContext.
@Controller('sales')
@UseGuards(JwtAuthGuard, RoleContextGuard)
export class SalesController {
  constructor(
    private service: SalesService,
    private sellerScope: SellerScopeService,
  ) {}

  @Post()
  async create(@Request() req, @Body() dto: CreateSaleDto, @CurrentRoleContext() ctx: RoleContext) {
    const sellerId = await this.sellerScope.resolve(req.user, 'canOperatePOS');
    const scope = await this.sellerScope.resolveScope(sellerId, req.user, ctx);
    return this.service.createSale(sellerId, req.user.id, dto, scope);
  }

  @Get()
  async list(
    @Request() req,
    @CurrentRoleContext() ctx: RoleContext,
    @Query('channel') channel?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    const sellerId = await this.sellerScope.resolve(req.user, 'canOperatePOS');
    const scope = await this.sellerScope.resolveScope(sellerId, req.user, ctx);
    return this.service.getSales(sellerId, {
      channel,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
    }, scope);
  }

  @Get('dashboard')
  async dashboard(@Request() req, @CurrentRoleContext() ctx: RoleContext) {
    const sellerId = await this.sellerScope.resolve(req.user, 'canViewRevenue');
    const scope = await this.sellerScope.resolveScope(sellerId, req.user, ctx);
    return this.service.getDashboard(sellerId, scope);
  }

  @Get(':id')
  async detail(@Request() req, @Param('id', ParseIntPipe) id: number, @CurrentRoleContext() ctx: RoleContext) {
    const sellerId = await this.sellerScope.resolve(req.user, 'canOperatePOS');
    const scope = await this.sellerScope.resolveScope(sellerId, req.user, ctx);
    return this.service.getSale(sellerId, id, scope);
  }

  @Post(':id/void')
  async void(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
    @CurrentRoleContext() ctx: RoleContext,
  ) {
    const sellerId = await this.sellerScope.resolve(req.user, 'canManageInventory');
    const scope = await this.sellerScope.resolveScope(sellerId, req.user, ctx);
    return this.service.voidSale(sellerId, id, reason, req.user.id, scope);
  }

  // Marks a COD manual sale's balance as collected — same permission as
  // recording the sale itself (whoever can operate the POS/record a manual
  // sale is trusted to confirm they were paid the rest of it).
  @Post(':id/collect-cod-balance')
  async collectCodBalance(@Request() req, @Param('id', ParseIntPipe) id: number, @CurrentRoleContext() ctx: RoleContext) {
    const sellerId = await this.sellerScope.resolve(req.user, 'canOperatePOS');
    const scope = await this.sellerScope.resolveScope(sellerId, req.user, ctx);
    return this.service.recordCodBalancePayment(sellerId, id, scope);
  }
}
