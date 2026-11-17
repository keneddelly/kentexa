import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { CurrentRoleContext } from '../role-context/current-role-context.decorator';
import { KentexaFeeService } from './kentexa-fee.service';

/** Ada ya KenteXa (owner approved 2026-11-03). See kentexa-fee.service.ts. */
@Controller('kentexa-fee')
export class KentexaFeeController {
  constructor(private readonly fees: KentexaFeeService) {}

  /** The asking account's own fee card: as = office (its active ofisi) | agent | seller. */
  @UseGuards(JwtAuthGuard, RoleContextGuard)
  @Get('mine')
  mine(@Request() req: any, @Query('as') as: string, @CurrentRoleContext() roleContext: any) {
    return this.fees.mine(req.user, as, roleContext);
  }

  /** "Lipa deni": the amount paid to KenteXa's Lipa Namba and the private screenshot. */
  @UseGuards(JwtAuthGuard, RoleContextGuard)
  @Post('payments')
  pay(@Request() req: any, @Body() body: any, @CurrentRoleContext() roleContext: any) {
    return this.fees.pay(req.user, body, roleContext);
  }

  /** One of the asking account's own monthly invoices, with its jobs. */
  @UseGuards(JwtAuthGuard, RoleContextGuard)
  @Get('invoices/:id')
  myInvoice(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Query('as') as: string, @CurrentRoleContext() roleContext: any) {
    return this.fees.myInvoice(req.user, as, id, roleContext);
  }

  /** Admin: every account that uses KenteXa's paid work, what it owes and whether it is late. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/accounts')
  adminAccounts(@Query('filter') filter?: string, @Query('q') q?: string) {
    return this.fees.adminAccounts(filter, q);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/accounts/:type/:id')
  adminAccount(@Param('type') type: string, @Param('id', ParseIntPipe) id: number) {
    return this.fees.adminAccount(type as any, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/accounts/:type/:id/remind')
  adminRemind(@Param('type') type: string, @Param('id', ParseIntPipe) id: number) {
    return this.fees.adminRemind(type as any, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/invoices/:id')
  adminInvoice(@Param('id', ParseIntPipe) id: number) {
    return this.fees.invoiceDetail(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/payments')
  adminPayments(@Query('status') status?: string) {
    return this.fees.adminPayments(status);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/payments/:id/confirm')
  confirm(@Request() req: any, @Param('id', ParseIntPipe) id: number) {
    return this.fees.adminReview(req.user.id, id, 'confirm');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/payments/:id/reject')
  reject(@Request() req: any, @Param('id', ParseIntPipe) id: number, @Body('reason') reason: string) {
    return this.fees.adminReview(req.user.id, id, 'reject', reason);
  }
}
