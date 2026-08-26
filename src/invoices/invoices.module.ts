import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Invoice } from './entities/invoice.entity';
import { InvoiceCounter } from './entities/invoice-counter.entity';
import { ReceiptCounter } from './entities/receipt-counter.entity';
import { Order } from '../orders/entities/order.entity';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { ActivityModule } from '../activity/activity.module';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';
import { WalletModule } from '../wallet/wallet.module';
import { ReputationModule } from '../reputation/reputation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Invoice, InvoiceCounter, ReceiptCounter, Order]),
    ScheduleModule.forRoot(),
    ActivityModule,
    CommerceProfilesModule,
    WalletModule,
    ReputationModule,
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
