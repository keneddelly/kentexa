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
import { PosStockService } from './pos-stock.service';
import { PosCashierService } from './pos-cashier.service';
import { CreateSaleDto } from './dto/create-sale.dto';

// I2G: every sale route derives the acting workspace from the authenticated RoleContext.
@Controller('sales')
@UseGuards(JwtAuthGuard, RoleContextGuard)
export class SalesController {
  constructor(
    private service: SalesService,
    private sellerScope: SellerScopeService,
    private posDay: PosDayService,
    private posStock: PosStockService,
    private posCashiers: PosCashierService,
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
    return this.posDay.today(sellerId, await this.posCashiers.onDuty(sellerId, req.user.id, req.query?.cashierUserId), scope);
  }

  @Post('pos/expenses')
  async posExpense(@Request() req, @Body() body: any, @CurrentRoleContext() ctx: RoleContext) {
    const { sellerId, scope } = await this.till(req, ctx);
    return this.posDay.addExpense(sellerId, await this.posCashiers.onDuty(sellerId, req.user.id, body?.cashierUserId), body || {}, scope);
  }

  @Post('pos/shifts/open')
  async posOpenShift(@Request() req, @Body() body: any, @CurrentRoleContext() ctx: RoleContext) {
    const { sellerId, scope } = await this.till(req, ctx);
    return this.posDay.openShift(sellerId, await this.posCashiers.onDuty(sellerId, req.user.id, body?.cashierUserId), body?.openingFloat, scope);
  }

  @Post('pos/shifts/close')
  async posCloseShift(@Request() req, @Body() body: any, @CurrentRoleContext() ctx: RoleContext) {
    const { sellerId, scope } = await this.till(req, ctx);
    return this.posDay.closeShift(sellerId, await this.posCashiers.onDuty(sellerId, req.user.id, body?.cashierUserId), body || {}, scope);
  }

  // ── POS part 3 (owner approved 2026-11-03): Stoo and Madeni. ──
  @Get('pos/stock')
  async posStockView(@Request() req, @CurrentRoleContext() ctx: RoleContext) {
    const { sellerId } = await this.till(req, ctx);
    return this.posStock.stock(sellerId);
  }

  @Post('pos/stock/receive')
  async posReceive(@Request() req, @Body() body: any, @CurrentRoleContext() ctx: RoleContext) {
    const { sellerId, scope } = await this.till(req, ctx);
    return this.posStock.receive(sellerId, req.user.id, body || {}, scope);
  }

  @Post('pos/stock/count')
  async posCount(@Request() req, @Body() body: any, @CurrentRoleContext() ctx: RoleContext) {
    const { sellerId } = await this.till(req, ctx);
    return this.posStock.count(sellerId, req.user.id, body || {});
  }

  @Get('pos/debts')
  async posDebts(@Request() req, @CurrentRoleContext() ctx: RoleContext) {
    const { sellerId, scope } = await this.till(req, ctx);
    return this.posStock.debts(sellerId, scope);
  }

  @Post('pos/debts/customer')
  async posPayCustomer(@Request() req, @Body() body: any, @CurrentRoleContext() ctx: RoleContext) {
    const { sellerId, scope } = await this.till(req, ctx);
    return this.posStock.payCustomer(sellerId, await this.posCashiers.onDuty(sellerId, req.user.id, body?.cashierUserId), body || {}, scope);
  }

  @Post('pos/debts/supplier')
  async posPaySupplier(@Request() req, @Body() body: any, @CurrentRoleContext() ctx: RoleContext) {
    const { sellerId, scope } = await this.till(req, ctx);
    return this.posStock.paySupplier(sellerId, await this.posCashiers.onDuty(sellerId, req.user.id, body?.cashierUserId), body || {}, scope);
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
    const cashier = await this.posCashiers.onDuty(sellerId, req.user.id, dto.cashierUserId);
    const sale = await this.service.createSale(sellerId, req.user.id, dto, scope);
    await this.posCashiers.stamp(Number((sale as any).id), cashier === req.user.id && dto.cashierUserId == null ? null : cashier);
    return sale;
  }

  // ── "Badilisha mhudumu" (owner approved 2026-11-03): the shop's cashiers and their PINs. ──
  @Get('pos/cashiers')
  async posCashierList(@Request() req, @CurrentRoleContext() ctx: RoleContext) {
    const { sellerId } = await this.till(req, ctx);
    return this.posCashiers.list(sellerId);
  }

  @Post('pos/cashiers/:userId/pin')
  async posSetPin(@Request() req, @Param('userId', ParseIntPipe) userId: number, @Body('pin') pin: unknown, @CurrentRoleContext() ctx: RoleContext) {
    const { sellerId } = await this.till(req, ctx);
    const canManage = await this.sellerScope.resolve(req.user, 'canManageTeam').then((id) => id === sellerId).catch(() => false);
    return this.posCashiers.setPin(sellerId, req.user.id, canManage, userId, pin);
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
