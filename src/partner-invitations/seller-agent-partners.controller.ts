import { Body, Controller, Get, Header, Param, ParseIntPipe, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { SellerScopeService } from '../business/seller-scope.service';
import { SellerAgentPartnersService } from './seller-agent-partners.service';

@Controller('seller-agent-partners')
export class SellerAgentPartnersController {
  constructor(
    private readonly service: SellerAgentPartnersService,
    private readonly sellerScope: SellerScopeService,
  ) {}

  // ── The seller (owner, or staff allowed to manage the team) ───────────────
  @UseGuards(JwtAuthGuard)
  @Post('invite')
  @Header('Cache-Control', 'no-store')
  async invite(@Request() req, @Body() dto: { phone?: string; name?: string; channel?: string }) {
    const sellerId = await this.sellerScope.resolve(req.user, 'canManageTeam');
    return this.service.invite(sellerId, req.user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  async mine(@Request() req) {
    const sellerId = await this.sellerScope.resolve(req.user, 'canManageTeam');
    return this.service.listForSeller(sellerId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/end')
  async endBySeller(@Request() req, @Param('id', ParseIntPipe) id: number) {
    const sellerId = await this.sellerScope.resolve(req.user, 'canManageTeam');
    return this.service.endBySeller(sellerId, id);
  }

  // ── The agent: sellers I work with ────────────────────────────────────────
  @UseGuards(JwtAuthGuard)
  @Get('as-agent')
  asAgent(@Request() req) {
    return this.service.listForAgent(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('as-agent/:id/end')
  endByAgent(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.endByAgent(req.user.id, id);
  }

  // ── The invited person ────────────────────────────────────────────────────
  // Public: the link is the key.
  @Get('link/:token')
  @Header('Cache-Control', 'no-store')
  view(@Param('token') token: string) {
    return this.service.publicView(token);
  }

  // Login required, any role: a new account is a buyer until its agent application is approved.
  @UseGuards(JwtAuthGuard)
  @Post('link/:token/accept')
  accept(@Request() req, @Param('token') token: string) {
    return this.service.accept(req.user, token);
  }
}
