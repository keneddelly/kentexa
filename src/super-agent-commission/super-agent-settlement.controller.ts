import { Body, Controller, Get, Param, ParseIntPipe, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { SuperAgentSettlementService } from './super-agent-settlement.service';
import { SuperAgentCashRemittanceService } from './super-agent-cash-remittance.service';

/**
 * L8 operational settlement surface.
 *
 * This controller intentionally exposes reconciliation + physical cash
 * remittance only. Commission payout remains an internal service until live
 * money activation is explicitly authorized; adding operational visibility
 * must not silently activate wallet credits.
 */
@Controller('admin/logistics-settlement')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class SuperAgentSettlementController {
  constructor(
    private readonly settlements: SuperAgentSettlementService,
    private readonly remittances: SuperAgentCashRemittanceService,
  ) {}

  @Post('super-agents/:superAgentId/proposals')
  createProposal(
    @Param('superAgentId', ParseIntPipe) superAgentId: number,
    @Body() body: { currency: string; periodStart: string; periodEnd: string },
    @Request() req: any,
  ) {
    return this.settlements.createSettlementProposal({
      superAgentId,
      currency: body.currency,
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      actorUserId: req.user.id,
    });
  }

  @Get('proposals/:id')
  getProposal(@Param('id', ParseIntPipe) id: number) {
    return this.settlements.getSettlementDetail(id);
  }

  @Post('super-agents/:superAgentId/remittances')
  recordRemittance(
    @Param('superAgentId', ParseIntPipe) superAgentId: number,
    @Body() body: {
      currency: string;
      cashCollectionIds: number[];
      idempotencyKey: string;
      evidenceRef?: string;
    },
    @Request() req: any,
  ) {
    return this.remittances.recordRemittance({
      superAgentId,
      currency: body.currency,
      cashCollectionIds: body.cashCollectionIds ?? [],
      actorUserId: req.user.id,
      idempotencyKey: body.idempotencyKey,
      evidenceRef: body.evidenceRef ?? null,
    });
  }
}
