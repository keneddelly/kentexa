import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Invoice } from './entities/invoice.entity';
import { InvoiceCounter } from './entities/invoice-counter.entity';
import { ReceiptCounter } from './entities/receipt-counter.entity';
import { Order } from '../orders/entities/order.entity';
import { Payment } from '../payments/entities/payment.entity';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { ActivityModule } from '../activity/activity.module';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';
import { WalletModule } from '../wallet/wallet.module';
import { ReputationModule } from '../reputation/reputation.module';
import { PaymentCoreModule } from '../payments/payment-core.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invoice, InvoiceCounter, ReceiptCounter, Order, Payment]),
    ScheduleModule.forRoot(),
    ActivityModule,
    CommerceProfilesModule,
    WalletModule,
    ReputationModule,
    // S0 — admin_manual mark-paid goes through the SAME canonical confirmation as every
    // provider webhook (Decision 4/5); shared via PaymentCoreModule to avoid a
    // PaymentsModule <-> InvoicesModule import cycle (PaymentsModule imports InvoicesModule).
    PaymentCoreModule,
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
