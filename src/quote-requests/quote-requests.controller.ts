import { Body, Controller, Get, Header, Param, ParseIntPipe, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { CurrentRoleContext } from '../role-context/current-role-context.decorator';
import { RoleContext } from '../role-context/role-context.types';
import { QuoteRequestsService } from './quote-requests.service';

@Controller('quote-requests')
@UseGuards(JwtAuthGuard, RoleContextGuard)
export class QuoteRequestsController {
  constructor(private readonly service: QuoteRequestsService) {}

  // ── Asking ──────────────────────────────────────────────────────────────
  @Post()
  create(@Request() req, @Body() body: any, @CurrentRoleContext() roleContext: RoleContext) {
    return this.service.create(req.user.id, roleContext, body);
  }

  @Get('mine')
  @Header('Cache-Control', 'no-store')
  mine(@Request() req) {
    return this.service.mine(req.user.id);
  }

  @Post(':id/cancel')
  cancel(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.cancel(req.user.id, id);
  }

  @Post(':id/accept/:offerId')
  accept(@Request() req, @Param('id', ParseIntPipe) id: number, @Param('offerId', ParseIntPipe) offerId: number) {
    return this.service.accept(req.user.id, id, offerId);
  }

  // ── Answering (office or transporter, from the active role) ─────────────
  @Get('inbox')
  @Header('Cache-Control', 'no-store')
  inbox(@Request() req, @CurrentRoleContext() roleContext: RoleContext) {
    return this.service.inbox(req.user.id, roleContext);
  }

  @Post(':id/offer')
  offer(@Request() req, @Param('id', ParseIntPipe) id: number, @Body() body: any, @CurrentRoleContext() roleContext: RoleContext) {
    return this.service.offer(req.user.id, roleContext, id, body);
  }

  // ── Office: the goods it takes ("Bei zangu") ────────────────────────────
  @Get('goods-types')
  @Header('Cache-Control', 'no-store')
  goodsTypes(@Request() req, @CurrentRoleContext() roleContext: RoleContext) {
    return this.service.getGoodsTypes(req.user.id, roleContext);
  }

  @Put('goods-types')
  setGoodsTypes(@Request() req, @Body() body: any, @CurrentRoleContext() roleContext: RoleContext) {
    return this.service.setGoodsTypes(req.user.id, roleContext, body);
  }
}
