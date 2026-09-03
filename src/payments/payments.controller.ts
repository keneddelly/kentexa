import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { InvoiceLookupResult } from './payments.service';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { ActiveRoleGuard } from '../role-context/active-role.guard';
import { RequireActiveRole } from '../role-context/require-active-role.decorator';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  // ─── Online Payment ─────────────────────────────────────────────────────
  // Security closure pass, item 2: initiate/my-payments/order/:orderId are
  // strictly the caller's own buyer-side payment history (verified against
  // their services: each filters by buyer.id/user.id server-side), so they
  // require active Buyer context. customerPayInvoice below is deliberately
  // left ungated -- its own comment documents "(any logged-in user)" as
  // intentional (paying an invoice, including on someone else's behalf, is
  // not exclusively "my own buyer history" the way these three are), and
  // agent/* below are a separate Agent-role surface, not buyer commerce.

  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.BUYER)
  @Post('initiate')
  initiatePayment(@Body() dto: InitiatePaymentDto, @Request() req) {
    return this.paymentsService.initiatePayment(dto, req.user);
  }

  @Post('callback/:provider')
  handleCallback(@Body() body: any, @Param('provider') provider: string) {
    return this.paymentsService.handleCallback(body, provider);
  }

  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.BUYER)
  @Get('my-payments')
  getMyPayments(@Request() req) {
    return this.paymentsService.getMyPayments(req.user);
  }

  // ─── Admin: all payments across all users ────────────────────────────────
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/all')
  getAllPayments() {
    return this.paymentsService.getAllPayments();
  }

  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.BUYER)
  @Get('order/:orderId')
  getPaymentByOrder(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Request() req,
  ) {
    return this.paymentsService.getPaymentByOrder(orderId, req.user);
  }

  // ─── Customer: Pay Invoice (any logged-in user) ──────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('invoice/pay')
  customerPayInvoice(
    @Body()
    body: {
      invoiceNumber?: string;
      orderId?: number;
      phone: string;
      provider: string;
    },
    @Request() req,
  ) {
    return this.paymentsService.customerPayInvoice(
      body.invoiceNumber,
      body.phone,
      body.provider,
      req.user,
      body.orderId,
    );
  }

  // ─── Agent Payment ──────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('agent/lookup/:invoiceNumber')
  agentLookupInvoice(
    @Param('invoiceNumber') invoiceNumber: string,
    @Request() req,
  ): Promise<InvoiceLookupResult> {
    return this.paymentsService.agentLookupInvoice(invoiceNumber, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('agent/initiate')
  agentInitiatePayment(
    @Body()
    body: { invoiceNumber: string; agentPhone: string; provider: string },
    @Request() req,
  ) {
    return this.paymentsService.agentInitiatePayment(
      body.invoiceNumber,
      body.agentPhone,
      body.provider,
      req.user,
    );
  }

  @Post('agent/callback/:provider')
  agentPaymentCallback(@Body() body: any, @Param('provider') provider: string) {
    return this.paymentsService.agentPaymentCallback(body, provider);
  }

  // DEV ONLY — service layer also refuses to run this when NODE_ENV=production.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('agent/mock-confirm/:providerRequestId')
  mockAgentConfirm(@Param('providerRequestId') providerRequestId: string) {
    return this.paymentsService.mockAgentCallback(providerRequestId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('admin/:orderId/release-escrow')
  releaseEscrow(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Request() req,
  ) {
    return this.paymentsService.releaseEscrow(orderId, req.user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/payout-summary')
  getPayoutSummary() {
    return this.paymentsService.getPayoutSummary();
  }

  @UseGuards(JwtAuthGuard)
  @Get('agent/dashboard')
  getAgentDashboard(@Request() req) {
    return this.paymentsService.getAgentDashboard(req.user);
  }

  // Public route — anyone can look up an invoice number
  @UseGuards(JwtAuthGuard)
  @Get('lookup/:invoiceNumber')
  publicLookupInvoice(
    @Param('invoiceNumber') invoiceNumber: string,
  ): Promise<InvoiceLookupResult> {
    return this.paymentsService.publicLookupInvoice(invoiceNumber);
  }
}
