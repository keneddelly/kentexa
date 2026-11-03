import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { Product } from '../products/entities/products.entity';
import { Order } from '../orders/entities/order.entity';
import { User } from '../users/entities/user.entity';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { BusinessModule } from '../business/business.module';
import { SmsModule } from '../sms/sms.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PosDayService } from './pos-day.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale, SaleItem, Product, Order, User]),
    InventoryModule,
    InvoicesModule,
    BusinessModule,
    SmsModule,
    NotificationsModule,
  ],
  controllers: [SalesController],
  providers: [SalesService, PosDayService],
  exports: [SalesService, PosDayService],
})
export class SalesModule {}
