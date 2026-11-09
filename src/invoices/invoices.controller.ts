import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  Res,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { ActiveRoleGuard } from '../role-context/active-role.guard';
import { RequireActiveRole } from '../role-context/require-active-role.decorator';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import type { Response } from 'express';
import { signPdfQuery, verifyPdfQuery } from './invoice-pdf-link';
import { CurrentRoleContext } from '../role-context/current-role-context.decorator';
import type { RoleContext } from '../role-context/role-context.types';

// KenteXa staff who may open any invoice or receipt (admin mirror, support, finance).
const STAFF = new Set(['admin', 'manager', 'customer_care', 'finance']);

@Controller('invoices')
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}

  // Public — verify receipt
  @Get('verify/:receiptNumber')
  verifyReceipt(@Param('receiptNumber') receiptNumber: string) {
    return this.invoicesService.verifyReceipt(receiptNumber);
  }

  // Download Receipt PDF — public
  // Signed link only (owner 2026-11-09 audit): ?e=&k= from GET receipt/:n/pdf-link.
  @Get('receipt/:receiptNumber/pdf')
  async downloadReceipt(
    @Param('receiptNumber') receiptNumber: string,
    @Query('e') e: string,
    @Query('k') k: string,
    @Res() res: Response,
  ) {
    if (!verifyPdfQuery('receipt', receiptNumber, e, k)) throw new ForbiddenException('Kiungo hiki kimekwisha muda. Fungua risiti tena kwenye KenteXa.');
    const buffer = await this.invoicesService.generateReceiptPDF(receiptNumber);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=${receiptNumber}.pdf`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // A 15-minute download link for the buyer, the seller or KenteXa staff (owner 2026-11-09 audit).
  @UseGuards(JwtAuthGuard, RoleContextGuard)
  @Get('number/:invoiceNumber/pdf-link')
  async invoicePdfLink(@Param('invoiceNumber') invoiceNumber: string, @Request() req, @CurrentRoleContext() role: RoleContext) {
    const invoice = await this.invoicesService.findByInvoiceNumber(invoiceNumber);
    if (!STAFF.has(String(role?.roleType))) this.invoicesService.assertInvoiceOwner(invoice, req.user);
    return { url: `/invoices/number/${encodeURIComponent(invoiceNumber)}/pdf?${signPdfQuery('invoice', invoiceNumber)}` };
  }

  @UseGuards(JwtAuthGuard, RoleContextGuard)
  @Get('receipt/:receiptNumber/pdf-link')
  async receiptPdfLink(@Param('receiptNumber') receiptNumber: string, @Request() req, @CurrentRoleContext() role: RoleContext) {
    const invoice = await this.invoicesService.findByReceiptNumber(receiptNumber);
    if (!STAFF.has(String(role?.roleType))) this.invoicesService.assertInvoiceOwner(invoice, req.user);
    return { url: `/invoices/receipt/${encodeURIComponent(receiptNumber)}/pdf?${signPdfQuery('receipt', receiptNumber)}` };
  }

  // My Invoices
  @UseGuards(JwtAuthGuard)
  @Get('my-invoices')
  findMyInvoices(@Request() req) {
    return this.invoicesService.findMyInvoices(req.user.id);
  }

  // Get Invoice by Number — was reachable by any authenticated user for any
  // invoice number with no ownership check; now requires the caller be the
  // invoice's buyer or the order's seller (see assertInvoiceOwner's comment).
  @UseGuards(JwtAuthGuard)
  @Get('number/:invoiceNumber')
  async findByNumber(@Param('invoiceNumber') invoiceNumber: string, @Request() req) {
    const invoice = await this.invoicesService.findByInvoiceNumber(invoiceNumber);
    return this.invoicesService.assertInvoiceOwner(invoice, req.user);
  }

  // Get Invoice by Order ID — same fix as findByNumber above.
  @UseGuards(JwtAuthGuard)
  @Get('order/:orderId')
  async findByOrder(@Param('orderId') orderId: string, @Request() req) {
    const invoice = await this.invoicesService.findByOrderId(Number(orderId));
    return this.invoicesService.assertInvoiceOwner(invoice, req.user);
  }

  // Download Invoice PDF: signed link only (owner 2026-11-09 audit). Plain <a href> links cannot
  // carry a sign-in, so the app first asks GET number/:n/pdf-link (signed in, buyer / seller /
  // staff only) and opens the 15-minute link it returns.
  @Get('number/:invoiceNumber/pdf')
  async downloadInvoice(
    @Param('invoiceNumber') invoiceNumber: string,
    @Query('e') e: string,
    @Query('k') k: string,
    @Res() res: Response,
  ) {
    if (!verifyPdfQuery('invoice', invoiceNumber, e, k)) throw new ForbiddenException('Kiungo hiki kimekwisha muda. Fungua ankara tena kwenye KenteXa.');
    const buffer = await this.invoicesService.generateInvoicePDF(invoiceNumber);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=${invoiceNumber}.pdf`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // Admin — Get All Invoices
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  findAll() {
    return this.invoicesService.findAll();
  }

  // Admin — Cancel Invoice
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':invoiceNumber/cancel')
  cancel(@Param('invoiceNumber') invoiceNumber: string) {
    return this.invoicesService.cancel(invoiceNumber);
  }

  // Admin — manual/admin_manual payment confirmation. S0: this is NOT a
  // second financial authority — it creates a real, sealed admin_manual
  // Payment and runs it through the SAME canonical confirmation every
  // provider webhook uses (see InvoicesService.markPaid's own comment).
  // Unified onto RoleContext (not the legacy UserRole.role) to match every
  // other financial-admin endpoint in this codebase.
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.ADMIN)
  @Patch(':invoiceNumber/mark-paid')
  markPaid(
    @Param('invoiceNumber') invoiceNumber: string,
    @Body('transactionReference') transactionReference: string,
    @Body('reason') reason: string,
    @Request() req,
  ) {
    return this.invoicesService.markPaid(invoiceNumber, transactionReference, reason, req.user.id);
  }
}
