import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassifiedsController } from './classifieds.controller';
import { ClassifiedsService } from './classifieds.service';
import { PriceSuggestionService } from './price-suggestion.service';
import { Classified } from './entities/classified.entity';
import { ClassifiedInvoiceRequest } from './entities/classified-invoice-request.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Order } from '../orders/entities/order.entity';
import { User } from '../users/entities/user.entity';
import { InvoicesModule } from '../invoices/invoices.module';
import { OrdersModule } from '../orders/orders.module';
import { FeedModule } from '../feed/feed.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Classified,
      ClassifiedInvoiceRequest,
      Invoice,
      Order,
      User,
    ]),
    InvoicesModule,
    OrdersModule,
    FeedModule,
  ],
  controllers: [ClassifiedsController],
  providers: [ClassifiedsService, PriceSuggestionService],
  exports: [ClassifiedsService, PriceSuggestionService],
})
export class ClassifiedsModule {}
