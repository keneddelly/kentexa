import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { Product } from '../products/entities/products.entity';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { InventoryModule } from '../inventory/inventory.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { BusinessModule } from '../business/business.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale, SaleItem, Product]),
    InventoryModule,
    InvoicesModule,
    BusinessModule,
  ],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
