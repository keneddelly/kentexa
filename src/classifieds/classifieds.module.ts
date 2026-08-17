import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClassifiedsController } from './classifieds.controller';
import { ClassifiedsService } from './classifieds.service';
import { PriceSuggestionService } from './price-suggestion.service';
import { Classified } from './entities/classified.entity';
import { ClassifiedInvoiceRequest } from './entities/classified-invoice-request.entity';
import { Invoice } from '../invoices/entities/invoice.entity';
import { Order } from '../orders/entities/order.entity';
import { InvoicesModule } from '../invoices/invoices.module';
import { OrdersModule } from '../orders/orders.module';
import { FeedModule } from '../feed/feed.module';
import { AiModule } from '../ai/ai.module';
import { BusinessModule } from '../business/business.module';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Classified,
      ClassifiedInvoiceRequest,
      Invoice,
      Order,
    ]),
    InvoicesModule,
    OrdersModule,
    FeedModule,
    AiModule,
    BusinessModule,
    CommerceProfilesModule,
    SearchModule,
  ],
  controllers: [ClassifiedsController],
  providers: [ClassifiedsService, PriceSuggestionService],
  exports: [ClassifiedsService, PriceSuggestionService],
})
export class ClassifiedsModule {}
