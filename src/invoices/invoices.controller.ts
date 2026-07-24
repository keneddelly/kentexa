import {
  Controller, Get, Post, Patch,
  Param, Body, UseGuards, Request,
  Res, Query,
} from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import type { Response } from 'express';

@Controller('invoices')
export class InvoicesController {
  constructor(private invoicesService: InvoicesService) {}

  // Public — verify receipt
  @Get('verify/:receiptNumber')
  verifyReceipt(@Param('receiptNumber') receiptNumber: string) {
    return this.invoicesService.verifyReceipt(receiptNumber);
  }

  // Download Receipt PDF — public
  @Get('receipt/:receiptNumber/pdf')
  async downloadReceipt(
    @Param('receiptNumber') receiptNumber: string,
    @Res() res: Response,
  ) {
    const buffer = await this.invoicesService.generateReceiptPDF(receiptNumber);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=${receiptNumber}.pdf`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  // My Invoices
  @UseGuards(JwtAuthGuard)
  @Get('my-invoices')
  findMyInvoices(@Request() req) {
    return this.invoicesService.findMyInvoices(req.user.id);
  }

  // Get Invoice by Number
  @UseGuards(JwtAuthGuard)
  @Get('number/:invoiceNumber')
  findByNumber(@Param('invoiceNumber') invoiceNumber: string) {
    return this.invoicesService.findByInvoiceNumber(invoiceNumber);
  }

  // Get Invoice by Order ID
  @UseGuards(JwtAuthGuard)
  @Get('order/:orderId')
  findByOrder(@Param('orderId') orderId: string) {
    return this.invoicesService.findByOrderId(Number(orderId));
  }

  // ✅ Download Invoice PDF — public, same as receipt.
  // Invoice number itself acts as the access key (same trust model as receipts).
  // Frontend links use plain <a href> tags which can't attach auth tokens,
  // so this must be public to actually work when clicked from the browser.
  @Get('number/:invoiceNumber/pdf')
  async downloadInvoice(
    @Param('invoiceNumber') invoiceNumber: string,
    @Res() res: Response,
  ) {
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

  // System — Mark Paid (called by payment webhook)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':invoiceNumber/mark-paid')
  markPaid(
    @Param('invoiceNumber') invoiceNumber: string,
    @Body('transactionReference') transactionReference: string,
  ) {
    return this.invoicesService.markPaid(invoiceNumber, transactionReference);
  }
}