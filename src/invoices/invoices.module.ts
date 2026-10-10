import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
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
    // No ScheduleModule.forRoot() here: AppModule's single, global set-up runs
    // this module's @Cron jobs. A second set-up runs every job a second time
    // (KNOWN_FAULTS.md #10; guarded by src/scheduling/schedule-setup.spec.ts).
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
