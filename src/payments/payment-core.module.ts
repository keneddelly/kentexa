import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { Order } from '../orders/entities/order.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { ClassifiedInvoiceRequest } from '../classifieds/entities/classified-invoice-request.entity';
import { PaymentConfirmationService } from './payment-confirmation.service';
import { PaymentEvidenceService } from './payment-evidence.service';

/**
 * S0 — the canonical confirmation/evidence pair lives in its own small
 * module so both PaymentsModule (provider webhooks/initiation) and
 * InvoicesModule (admin_manual mark-paid) can depend on it without a
 * PaymentsModule <-> InvoicesModule import cycle (PaymentsModule already
 * imports InvoicesModule for invoice creation).
 */
@Module({
  imports: [TypeOrmModule.forFeature([Payment, Order, Invoice, ClassifiedInvoiceRequest])],
  providers: [PaymentConfirmationService, PaymentEvidenceService],
  exports: [PaymentConfirmationService, PaymentEvidenceService],
})
export class PaymentCoreModule {}
