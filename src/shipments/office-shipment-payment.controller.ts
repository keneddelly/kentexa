import { Body, Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { ActiveRoleGuard } from '../role-context/active-role.guard';
import { RequireActiveRole } from '../role-context/require-active-role.decorator';
import { CurrentRoleContext } from '../role-context/current-role-context.decorator';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import type { RoleContext } from '../role-context/role-context.types';
import { OfficeShipmentPaymentService } from './office-shipment-payment.service';

/** The office's payments for send-form shipments it received (2026-10-24). */
@Controller('office/shipment-payments')
@UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
@RequireActiveRole(AccountRoleType.SUPER_AGENT)
export class OfficeShipmentPaymentController {
  constructor(private readonly payments: OfficeShipmentPaymentService) {}

  @Get('pending')
  pending(@Request() req, @CurrentRoleContext() role: RoleContext) {
    return this.payments.pending(req.user.id, role);
  }

  @Post()
  record(@Request() req, @CurrentRoleContext() role: RoleContext, @Body() body: any) {
    return this.payments.record(req.user.id, role, body);
  }
}
