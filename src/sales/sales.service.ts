import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, Between } from 'typeorm';
import { Sale, SaleChannel, SaleStatus } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { Product } from '../products/entities/products.entity';
import { CreateSaleDto } from './dto/create-sale.dto';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryMovementReason } from '../inventory/entities/inventory-movement.entity';
import { InvoicesService } from '../invoices/invoices.service';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale) private saleRepo: Repository<Sale>,
    @InjectRepository(SaleItem) private saleItemRepo: Repository<SaleItem>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    private dataSource: DataSource,
    private inventory: InventoryService,
    private invoices: InvoicesService,
  ) {}

  // The whole multi-item sale is one DB transaction: build every SaleItem
  // (snapshotting name/sku/price), save the Sale (cascades the items), then
  // adjust stock for each item through InventoryService using THIS
  // transaction's manager — so if item 3 of 5 fails (insufficient stock),
  // nothing about the sale persists, not a partially-completed one.
  async createSale(
    sellerId: number,
    cashierId: number,
    dto: CreateSaleDto,
  ): Promise<Sale> {
    if (dto.channel !== SaleChannel.LOCAL_POS && dto.channel !== SaleChannel.MANUAL) {
      throw new BadRequestException('Unsupported sale channel');
    }

    return this.dataSource.transaction(async (manager) => {
      const productRepo = manager.getRepository(Product);
      const saleRepo = manager.getRepository(Sale);

      let subtotal = 0;
      const items: SaleItem[] = [];
      for (const line of dto.items) {
        const product = await productRepo.findOne({
          where: { id: line.productId },
          relations: { seller: true },
        });
        if (!product) throw new NotFoundException(`Product ${line.productId} not found`);
        if (product.seller?.id !== sellerId) {
          throw new ForbiddenException(`Product ${line.productId} is not yours to sell`);
        }
        if (dto.channel === SaleChannel.LOCAL_POS && !product.availableInStore) {
          throw new BadRequestException(`"${product.name}" is not available for local shop sale`);
        }

        const unitPrice = line.unitPrice ?? Number(product.displayPrice);
        const lineDiscount = line.lineDiscount || 0;
        const lineTotal = unitPrice * line.quantity - lineDiscount;
        subtotal += unitPrice * line.quantity;

        const item = manager.getRepository(SaleItem).create({
          product,
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          quantity: line.quantity,
          unitPrice,
          lineDiscount,
          lineTotal,
        });
        items.push(item);
      }

      const discountAmount =
        (dto.discountAmount || 0) + items.reduce((s, i) => s + Number(i.lineDiscount || 0), 0);
      const total = subtotal - discountAmount;
      if (total < 0) throw new BadRequestException('Discount exceeds sale total');
      if (dto.amountPaid < total) {
        throw new BadRequestException(
          `Amount paid (${dto.amountPaid}) is less than the total due (${total})`,
        );
      }

      const receiptNumber = await this.invoices.generateReceiptNumber();

      const sale = saleRepo.create({
        sellerId,
        channel: dto.channel,
        receiptNumber,
        customerId: dto.customerId || null,
        customerName: dto.customerName || null,
        customerPhone: dto.customerPhone || null,
        items,
        subtotal,
        discountAmount,
        total,
        paymentMethod: dto.paymentMethod,
        amountPaid: dto.amountPaid,
        changeDue: dto.amountPaid - total,
        status: SaleStatus.COMPLETED,
        createdByUserId: cashierId,
      });
      const saved = await saleRepo.save(sale);

      const reason =
        dto.channel === SaleChannel.LOCAL_POS
          ? InventoryMovementReason.LOCAL_POS
          : InventoryMovementReason.MANUAL;
      for (const item of saved.items) {
        await this.inventory.adjustStock(item.productId!, -item.quantity, reason, {
          referenceType: 'sale',
          referenceId: saved.id,
          userId: cashierId,
          manager,
        });
      }

      return saved;
    });
  }

  async getSales(
    sellerId: number,
    filters: { channel?: string; from?: string; to?: string; limit?: number } = {},
  ) {
    const where: any = { sellerId };
    if (filters.channel) where.channel = filters.channel;
    if (filters.from && filters.to) {
      where.createdAt = Between(new Date(filters.from), new Date(filters.to));
    }
    return this.saleRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: filters.limit || 50,
    });
  }

  async getSale(sellerId: number, id: number) {
    const sale = await this.saleRepo.findOne({ where: { id, sellerId } });
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  // Restores every line item's stock and marks the sale voided. Uses
  // ADJUSTMENT rather than RETURN — voiding is correcting a mistaken sale
  // that never really happened, distinct from a customer physically
  // returning goods after a completed one.
  async voidSale(sellerId: number, id: number, reason: string, actorId: number) {
    return this.dataSource.transaction(async (manager) => {
      const saleRepo = manager.getRepository(Sale);
      const sale = await saleRepo.findOne({ where: { id, sellerId } });
      if (!sale) throw new NotFoundException('Sale not found');
      if (sale.status !== SaleStatus.COMPLETED) {
        throw new BadRequestException('Only a completed sale can be voided');
      }

      for (const item of sale.items) {
        await this.inventory.adjustStock(
          item.productId!,
          item.quantity,
          InventoryMovementReason.ADJUSTMENT,
          { referenceType: 'sale', referenceId: sale.id, userId: actorId, manager },
        );
      }

      sale.status = SaleStatus.VOIDED;
      sale.voidedReason = reason || null;
      return saleRepo.save(sale);
    });
  }

  // Local-shop/manual totals only — merging in Kentexa online (Order) data
  // is Phase 5's job (see the approved BIS POS plan).
  async getTodaySummary(sellerId: number) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const sales = await this.saleRepo.find({
      where: {
        sellerId,
        status: SaleStatus.COMPLETED,
        createdAt: Between(startOfDay, new Date()),
      },
    });

    const byChannel: Record<string, number> = {};
    let total = 0;
    let itemsSold = 0;
    for (const s of sales) {
      byChannel[s.channel] = (byChannel[s.channel] || 0) + Number(s.total);
      total += Number(s.total);
      itemsSold += s.items.reduce((sum, i) => sum + i.quantity, 0);
    }

    return { date: startOfDay.toISOString().slice(0, 10), salesCount: sales.length, itemsSold, total, byChannel };
  }
}
