import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, Between, MoreThanOrEqual } from 'typeorm';
import { Sale, SaleChannel, SaleStatus } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { Product } from '../products/entities/products.entity';
import { Order, OrderSource, OrderStatus } from '../orders/entities/order.entity';
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
    @InjectRepository(Order) private orderRepo: Repository<Order>,
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

  // The BIS commerce dashboard — the one place "today's sales by channel,
  // low stock, best sellers, gross profit" (spec §9) actually merges Sale
  // (Local POS + Manual) and Order (Kentexa Online) data, since those are
  // deliberately two different tables (see the approved BIS POS plan for
  // why: Order stays single-product-per-row for online checkout, Sale is
  // the multi-item local/manual transaction). An online order counts as a
  // real sale once payment has gone through — anything still
  // PENDING_PAYMENT or CANCELLED is excluded, same "has the money actually
  // moved" bar Sale.status===COMPLETED uses on the other side.
  async getDashboard(sellerId: number) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const now = new Date();

    const salesToday = await this.saleRepo.find({
      where: { sellerId, status: SaleStatus.COMPLETED, createdAt: Between(startOfDay, now) },
    });
    const onlineOrdersToday = await this.orderRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.product', 'product')
      .leftJoin('o.seller', 'seller')
      .where('seller.id = :sellerId', { sellerId })
      .andWhere('o.source = :source', { source: OrderSource.ONLINE })
      .andWhere('o.status NOT IN (:...excluded)', {
        excluded: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED],
      })
      .andWhere('o.createdAt >= :start', { start: startOfDay })
      .getMany();

    const byChannel: Record<string, number> = { local_pos: 0, manual: 0, kentexa_online: 0 };
    const byPaymentMethod: Record<string, number> = {};
    let itemsSoldToday = 0;
    let costOfGoodsToday = 0;

    for (const s of salesToday) {
      byChannel[s.channel] = (byChannel[s.channel] || 0) + Number(s.total);
      byPaymentMethod[s.paymentMethod] = (byPaymentMethod[s.paymentMethod] || 0) + Number(s.total);
      for (const item of s.items) {
        itemsSoldToday += item.quantity;
        if (item.product?.costPrice != null) {
          costOfGoodsToday += Number(item.product.costPrice) * item.quantity;
        }
      }
    }
    for (const o of onlineOrdersToday) {
      byChannel.kentexa_online += Number(o.totalAmount || 0);
      itemsSoldToday += o.quantity;
      if (o.product?.costPrice != null) {
        costOfGoodsToday += Number(o.product.costPrice) * o.quantity;
      }
    }

    const grossSales = byChannel.local_pos + byChannel.manual + byChannel.kentexa_online;
    const grossProfit = grossSales - costOfGoodsToday;

    // Inventory snapshot — current, not "today".
    const products = await this.productRepo.find({ where: { seller: { id: sellerId } } });
    const totalStockUnits = products.reduce((s, p) => s + Number(p.stock || 0), 0);
    const lowStock = products
      .filter((p) => p.minStockThreshold > 0 && p.stock <= p.minStockThreshold)
      .map((p) => ({ id: p.id, name: p.name, stock: p.stock, minStockThreshold: p.minStockThreshold }));

    // Best sellers — last 30 days, merged across both tables the same way.
    const since30 = new Date();
    since30.setDate(since30.getDate() - 30);
    const salesLast30 = await this.saleRepo.find({
      where: { sellerId, status: SaleStatus.COMPLETED, createdAt: MoreThanOrEqual(since30) },
    });
    const ordersLast30 = await this.orderRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.product', 'product')
      .leftJoin('o.seller', 'seller')
      .where('seller.id = :sellerId', { sellerId })
      .andWhere('o.source = :source', { source: OrderSource.ONLINE })
      .andWhere('o.status NOT IN (:...excluded)', {
        excluded: [OrderStatus.PENDING_PAYMENT, OrderStatus.CANCELLED],
      })
      .andWhere('o.createdAt >= :start', { start: since30 })
      .getMany();

    const bestSellerMap = new Map<number, { productId: number; name: string; unitsSold: number; revenue: number }>();
    const bump = (productId: number, name: string, qty: number, revenue: number) => {
      const cur = bestSellerMap.get(productId) || { productId, name, unitsSold: 0, revenue: 0 };
      cur.unitsSold += qty;
      cur.revenue += revenue;
      bestSellerMap.set(productId, cur);
    };
    for (const s of salesLast30) {
      for (const item of s.items) {
        if (item.productId) bump(item.productId, item.productName, item.quantity, Number(item.lineTotal));
      }
    }
    for (const o of ordersLast30) {
      if (o.product) bump(o.product.id, o.product.name, o.quantity, Number(o.totalAmount || 0));
    }
    const bestSellers = [...bestSellerMap.values()].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, 10);

    return {
      date: startOfDay.toISOString().slice(0, 10),
      today: {
        byChannel,
        byPaymentMethod,
        total: grossSales,
        salesCount: salesToday.length + onlineOrdersToday.length,
        itemsSold: itemsSoldToday,
      },
      grossSales,
      costOfGoods: costOfGoodsToday,
      grossProfit,
      inventory: { totalProducts: products.length, totalStockUnits },
      lowStock,
      bestSellers,
    };
  }
}
