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
import { PosDayService } from './pos-day.service';
import { CreateSaleDto } from './dto/create-sale.dto';

// I2G: every sale route derives the acting workspace from the authenticated RoleContext.
@Controller('sales')
@UseGuards(JwtAuthGuard, RoleContextGuard)
export class SalesController {
  constructor(
    private service: SalesService,
    private sellerScope: SellerScopeService,
    private posDay: PosDayService,
  ) {}

  // ── POS part 2 (owner approved 2026-11-03): Leo, Matumizi, Zamu. Declared before ':id'. ──
  private async till(req: any, ctx: RoleContext, perm: 'canOperatePOS' | 'canViewRevenue' = 'canOperatePOS') {
    const sellerId = await this.sellerScope.resolve(req.user, perm);
    const scope = await this.sellerScope.resolveScope(sellerId, req.user, ctx);
    return { sellerId, scope };
  }

  @Get('pos/today')
  async posToday(@Request() req, @CurrentRoleContext() ctx: RoleContext) {
    const { sellerId, scope } = await this.till(req, ctx);
    return this.posDay.today(sellerId, req.user.id, scope);
  }

  @Post('pos/expenses')
  async posExpense(@Request() req, @Body() body: any, @CurrentRoleContext() ctx: RoleContext) {
    const { sellerId, scope } = await this.till(req, ctx);
    return this.posDay.addExpense(sellerId, req.user.id, body || {}, scope);
  }

  @Post('pos/shifts/open')
  async posOpenShift(@Request() req, @Body('openingFloat') openingFloat: unknown, @CurrentRoleContext() ctx: RoleContext) {
    const { sellerId, scope } = await this.till(req, ctx);
    return this.posDay.openShift(sellerId, req.user.id, openingFloat, scope);
  }

  @Post('pos/shifts/close')
  async posCloseShift(@Request() req, @Body() body: any, @CurrentRoleContext() ctx: RoleContext) {
    const { sellerId, scope } = await this.till(req, ctx);
    return this.posDay.closeShift(sellerId, req.user.id, body || {}, scope);
  }

  @Get('pos/shifts')
  async posShifts(@Request() req, @CurrentRoleContext() ctx: RoleContext) {
    const { sellerId, scope } = await this.till(req, ctx, 'canViewRevenue');
    return this.posDay.shifts(sellerId, scope);
  }

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

  // POS sales waiting to be sent (owner approved 2026-11-02): pay-on-delivery and
  // "Itatumwa kwa mteja" sales with no shipment yet. Declared before ':id'.
  @Get('to-ship')
  async toShip(@Request() req, @CurrentRoleContext() ctx: RoleContext) {
    const sellerId = await this.sellerScope.resolve(req.user, 'canOperatePOS');
    const scope = await this.sellerScope.resolveScope(sellerId, req.user, ctx);
    return this.service.getSalesToShip(sellerId, scope);
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
