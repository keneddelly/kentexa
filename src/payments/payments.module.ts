import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { Payment } from './entities/payment.entity';
import { Order } from '../orders/entities/order.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { ClassifiedInvoiceRequest } from '../classifieds/entities/classified-invoice-request.entity';
import { Agent } from '../agents/entities/agent.entity';
import { AgentTransaction } from '../agents/entities/agent-transaction.entity';
import { Payout } from '../payouts/entities/payout.entity';
import { VodacomService } from './providers/vodacom/vodacom.service';
import { AirtelService } from './providers/airtel/airtel.service';
import { SelcomService } from './providers/selcom/selcom.service';
import { MockAgentService } from './providers/mock/mock-agent.service';
import { ClickPesaService } from './providers/clickpesa/clickpesa.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payment,
      Order,
      Invoice,
      ClassifiedInvoiceRequest,
      Agent,
      AgentTransaction,
      Payout,
    ]),
    NotificationsModule,
    InvoicesModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    VodacomService, // kept — hidden on frontend for now
    AirtelService, // kept — hidden on frontend for now
    SelcomService, // active
    MockAgentService, // dev only
    ClickPesaService, // built, reachable — production selection still defaults to Selcom
  ],
  exports: [PaymentsService],
})
export class PaymentsModule {}
