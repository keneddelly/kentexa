import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { agentHoldsDelivery, recordSellerCodReceived } from '../orders/order-delivery-sync';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, Between, MoreThanOrEqual, IsNull } from 'typeorm';
import { Sale, SaleChannel, SalePaymentMethod, SaleStatus } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { Product } from '../products/entities/products.entity';
import { Order, OrderSource, OrderStatus } from '../orders/entities/order.entity';
import { User } from '../users/entities/user.entity';
import { CreateSaleDto } from './dto/create-sale.dto';
import { SellerScope, assertResourceInBusinessScope, workspacePartition } from '../business/seller-scope.service';
import { ownershipFlag } from '../ownership/ownership-feature-flags.service';
import { InventoryService } from '../inventory/inventory.service';
import { InventoryMovementReason } from '../inventory/entities/inventory-movement.entity';
import { InvoicesService } from '../invoices/invoices.service';
import { SmsService } from '../sms/sms.service';
import { GrowthInviteService, InviteContext } from '../sms/growth-invite.service';
import { COD_MESSAGES } from '../super-agents/cod-sms';

/** POS part 1 (owner 2026-10-27): what the till may send for an offline, split or credit sale. */
export const POS_MESSAGES = {
  notReady: 'Huduma hii ya POS bado haijawashwa. Jaribu tena baadaye.',
  badPayments: 'Kila njia ya kulipa iwe na kiasi kikubwa kuliko sifuri.',
  creditNeedsCustomer: 'Deni linahitaji jina na simu ya mteja.',
  creditFullyPaid: 'Amelipa yote: hakuna deni.',
  overpaidCredit: 'Kiasi kilicholipwa hakiwezi kuzidi jumla kwa mauzo ya deni.',
  badSoldAt: 'Muda wa mauzo si sahihi.',
} as const;
const PAY_METHODS = Object.values(SalePaymentMethod) as string[];
const CLIENT_SALE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * A split payment, checked: each part a known method and a positive amount. The sale's
 * paymentMethod is the largest part; amountPaid is the sum. Null when none was sent.
 */
export function normalizePayments(raw: unknown): { method: string; amount: number; reference: string | null }[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 6) throw new BadRequestException(POS_MESSAGES.badPayments);
  return raw.map((p: any) => {
    const method = String(p?.method || '');
    const amount = Math.round(Number(p?.amount) * 100) / 100;
    if (!PAY_METHODS.includes(method) || !Number.isFinite(amount) || amount <= 0) throw new BadRequestException(POS_MESSAGES.badPayments);
    const reference = typeof p?.reference === 'string' && p.reference.trim() ? p.reference.trim().slice(0, 60) : null;
    return { method, amount, reference };
  });
}

@Injectable()
export class SalesService {
  private posReady = false;
  private posCheckedAt = 0;

  constructor(
    @InjectRepository(Sale) private saleRepo: Repository<Sale>,
    @InjectRepository(SaleItem) private saleItemRepo: Repository<SaleItem>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private dataSource: DataSource,
    private inventory: InventoryService,
    private invoices: InvoicesService,
    private smsService: SmsService,
    private growthInvite: GrowthInviteService,
  ) {}

  // The whole multi-item sale is one DB transaction: build every SaleItem
  // (snapshotting name/sku/price), save the Sale (cascades the items), then
  // adjust stock for each item through InventoryService using THIS
  // transaction's manager — so if item 3 of 5 fails (insufficient stock),
  // nothing about the sale persists, not a partially-completed one.
  /** I2G: repository WHERE fragment partitioning Sales by the acting workspace (flag SALE_WORKSPACE_ENFORCE). */
  private saleWs(scope?: SellerScope): Record<string, unknown> {
    if (!scope || scope.delegated || !ownershipFlag('SALE_WORKSPACE_ENFORCE')) return {};
    return { workspaceId: scope.workspaceId != null ? scope.workspaceId : IsNull() };
  }

  /** The POS columns (clientSaleId, soldAt, payments, creditSale) exist once migration 1793600000000 ran. */
  async isPosReady(): Promise<boolean> {
    if (!this.posReady && Date.now() - this.posCheckedAt > 60_000) {
      this.posCheckedAt = Date.now();
      try {
        const [row] = await this.dataSource.query(`SELECT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'sale' AND column_name = 'clientSaleId') AS ok`);
        this.posReady = Boolean(row?.ok);
      } catch { this.posReady = false; }
    }
    return this.posReady;
  }

  /** A sale this till already sent (same clientSaleId): recorded once, never twice. */
  private async findClientSale(sellerId: number, clientSaleId: string): Promise<Sale | null> {
    const [row] = await this.dataSource.query(
      `SELECT id FROM public.sale WHERE "sellerId" = $1 AND "clientSaleId" = $2`, [sellerId, clientSaleId]);
    return row ? this.saleRepo.findOne({ where: { id: Number(row.id) } }) : null;
  }

  async createSale(
    sellerId: number,
    cashierId: number,
    dto: CreateSaleDto,
    scope?: SellerScope,
  ): Promise<Sale> {
    if (dto.channel !== SaleChannel.LOCAL_POS && dto.channel !== SaleChannel.MANUAL) {
      throw new BadRequestException('Unsupported sale channel');
    }

    // POS part 1: offline id, split payment, credit ("Deni"), the real time of an offline sale.
    const clientSaleId = typeof dto.clientSaleId === 'string' && CLIENT_SALE_ID.test(dto.clientSaleId) ? dto.clientSaleId.toLowerCase() : null;
    const payments = normalizePayments(dto.payments);
    const credit = !!dto.credit;
    let soldAt: Date | null = null;
    if (dto.soldAt) {
      soldAt = new Date(dto.soldAt);
      const now = Date.now();
      if (Number.isNaN(soldAt.getTime()) || soldAt.getTime() > now + 5 * 60_000 || soldAt.getTime() < now - 30 * 86_400_000) {
        throw new BadRequestException(POS_MESSAGES.badSoldAt);
      }
    }
    const posReady = await this.isPosReady();
    if (credit && !posReady) throw new BadRequestException(POS_MESSAGES.notReady);
    if (clientSaleId && posReady) {
      const existing = await this.findClientSale(sellerId, clientSaleId);
      if (existing) return existing;
    }
    if (payments) {
      dto.amountPaid = Math.round(payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
      dto.paymentMethod = [...payments].sort((a, b) => b.amount - a.amount)[0].method as SalePaymentMethod;
    }
    if (credit) {
      if (dto.isCod) throw new BadRequestException(POS_MESSAGES.badPayments);
      if (!dto.customerName?.trim() || !dto.customerPhone?.trim()) throw new BadRequestException(POS_MESSAGES.creditNeedsCustomer);
    }
    // A sale made offline already happened: stock it sold beyond the recorded count goes to zero.
    const offline = !!(clientSaleId && soldAt);

    let saved: Sale;
    try {
    saved = await this.dataSource.transaction(async (manager) => {
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
        // I2G: same-owner Business A can never sell Business B's product (and a legacy Seller never a Business's).
        assertResourceInBusinessScope(scope, (product as any).workspaceId);
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

      // Cash on Delivery is the ONE explicit escape hatch from "paid in
      // full at creation" — everything else still enforces amountPaid >=
      // total exactly as before, so a plain shortfall on a non-COD sale
      // remains a rejected request, not a silent hole in this check.
      if (credit) {
        if (dto.amountPaid > total) throw new BadRequestException(POS_MESSAGES.overpaidCredit);
        if (dto.amountPaid >= total) throw new BadRequestException(POS_MESSAGES.creditFullyPaid);
      } else if (dto.isCod) {
        if (!dto.customerPhone) {
          throw new BadRequestException('customerPhone is required for a COD sale — someone has to pay the balance later');
        }
        if (dto.amountPaid > total) {
          throw new BadRequestException('Amount paid cannot exceed the total for a COD sale');
        }
        // A COD sale must leave a balance to pay on delivery. A full payment is
        // cash or mobile money, never COD (owner, 2026-10-22).
        if (dto.amountPaid >= total) throw new BadRequestException(COD_MESSAGES.fullyPaid);
      } else if (dto.amountPaid < total) {
        throw new BadRequestException(
          `Amount paid (${dto.amountPaid}) is less than the total due (${total})`,
        );
      }
      const balanceDue = dto.isCod || credit ? parseFloat((total - dto.amountPaid).toFixed(2)) : 0;

      const receiptNumber = await this.invoices.generateReceiptNumber();

      const sale = saleRepo.create({
        sellerId,
        // I2G creation authority: the acting Business workspace from the authenticated RoleContext
        // (never the payload); NULL for legacy/Personal/delegated contexts.
        workspaceId: ownershipFlag('ORDER_WORKSPACE_STAMP') ? (scope?.workspaceId ?? null) : null,
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
        changeDue: dto.isCod || credit ? 0 : dto.amountPaid - total,
        isCod: !!dto.isCod,
        balanceDue,
        status: SaleStatus.COMPLETED,
        createdByUserId: cashierId,
      });
      const saved = await saleRepo.save(sale);
      if (posReady && (clientSaleId || soldAt || payments || credit)) {
        await manager.query(
          `UPDATE public.sale SET "clientSaleId" = $2, "soldAt" = $3, payments = $4::jsonb, "creditSale" = $5 WHERE id = $1`,
          [saved.id, clientSaleId, soldAt, payments ? JSON.stringify(payments) : null, credit]);
      }

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
          floorAtZero: offline,
        });
      }

      return saved;
    });
    } catch (err: any) {
      // The same offline sale sent twice at once: the second one finds the first.
      if (clientSaleId && err?.code === '23505') {
        const existing = await this.findClientSale(sellerId, clientSaleId);
        if (existing) return existing;
      }
      throw err;
    }

    // Digital receipt SMS — outside the DB transaction (this is external
    // I/O, not something that should ever roll back a completed sale) and
    // never allowed to fail the request: a seller's manual/local sale is
    // real the moment stock and payment are recorded, regardless of
    // whether the SMS provider is reachable. See CreateSaleDto — a manual
    // sale doesn't require a customer phone at all (in-shop cash sale with
    // no contact info), so this is skipped entirely when none was given.
    // A COD sale gets no receipt SMS: its one text is sent when the shipment is
    // created (goods + boda = total, to pay on delivery; owner 2026-10-22).
    if (saved.customerPhone && !saved.isCod) {
      this.sendReceiptSms(sellerId, saved).catch((e) =>
        console.error('Manual sale receipt SMS failed (non-critical):', e.message),
      );
    }

    return saved;
  }

  // The customer for a manual/local-POS sale very often did NOT come from
  // Kentexa (a walk-in shopper, a WhatsApp order, a phone call) — this is
  // the one place in the whole app where Kentexa can reach someone who has
  // never heard of it, purely because the SELLER already uses Kentexa to
  // record the sale. See CLAUDE.md-adjacent product spec: "even when the
  // customer did not originate from Kentexa, the seller can use Kentexa to
  // digitize the transaction."
  private async sendReceiptSms(sellerId: number, sale: Sale): Promise<void> {
    const seller = await this.userRepo.findOne({ where: { id: sellerId } });
    const sellerName = (seller as any)?.storeName || seller?.name || 'Muuzaji';
    const owed = Number(sale.balanceDue || 0);
    // A credit sale ("Deni") says what was paid and what is still owed.
    const baseMessage = owed > 0
      ? `${sellerName}: Risiti ${sale.receiptNumber} ya TZS ${Number(sale.total).toLocaleString()}. Umelipa TZS ${Number(sale.amountPaid).toLocaleString()}, deni TZS ${owed.toLocaleString()}.`
      : `KenteXa: Umepokea risiti ${sale.receiptNumber} ya TZS ${Number(sale.total).toLocaleString()} kutoka ${sellerName}.`;
    const message = await this.growthInvite.appendInvite(
      baseMessage,
      sale.customerPhone,
      InviteContext.MANUAL_SALE_CUSTOMER,
    );
    await this.smsService.sendSms(sale.customerPhone!, message);
  }

  // Marks a COD manual sale's remaining balance as collected — the seller
  // (or whoever physically received the cash) confirms it once the
  // customer pays on delivery/pickup. No payment-gateway involvement here,
  // same as the rest of this manual-sale flow: Kentexa records that money
  // changed hands, it never held or moved it electronically.
  async recordCodBalancePayment(sellerId: number, saleId: number, scope?: SellerScope): Promise<Sale> {
    const sale = await this.saleRepo.findOne({ where: { id: saleId, sellerId, ...this.saleWs(scope) } });
    if (!sale) throw new NotFoundException('Sale not found');
    if (!sale.isCod) {
      // A credit sale ("Deni", POS part 1) is collected the same way.
      const [extra] = (await this.isPosReady())
        ? await this.dataSource.query(`SELECT "creditSale" FROM public.sale WHERE id = $1`, [sale.id]) : [];
      if (!extra?.creditSale) throw new BadRequestException('This sale is not a COD sale');
    }
    if (Number(sale.balanceDue) <= 0) {
      throw new BadRequestException('No balance is due on this sale');
    }

    // A shipped COD sale: the order on its parcel moves with it. An Agent or office carrying
    // it collects the cash at the door instead, so the till must not take it too.
    const [linked] = await this.dataSource.query(
      `SELECT o.id, o."codBalanceCollected", o."paymentMethod"::text AS "paymentMethod",
              (p."superAgentId" IS NOT NULL OR p."destinationSuperAgentId" IS NOT NULL) AS "officeHandles"
         FROM public.parcel p JOIN public."order" o ON o.id = p."orderId"
        WHERE p."saleId" = $1 AND o.source::text = 'seller_shipment' AND o.status::text <> 'cancelled'
        ORDER BY p.id DESC LIMIT 1`, [sale.id]);
    const linkedOpen = linked && linked.paymentMethod === 'cod' && !linked.codBalanceCollected;
    if (linkedOpen && (linked.officeHandles || await agentHoldsDelivery(this.dataSource.manager, Number(linked.id)))) {
      throw new BadRequestException('Mzigo huu unapelekwa na KenteXa: wakala au ofisi atapokea pesa kwa mteja.');
    }

    sale.amountPaid = sale.total;
    sale.balanceDue = 0;
    const updated = await this.dataSource.transaction(async (em) => {
      const saved = await em.getRepository(Sale).save(sale);
      if (linkedOpen) await recordSellerCodReceived(em, Number(linked.id));
      return saved;
    });

    if (updated.customerPhone) {
      const message = `KenteXa: Asante! Salio la TZS ${Number(sale.total).toLocaleString()} kwa risiti ${updated.receiptNumber} limekamilika.`;
      this.smsService
        .sendSms(updated.customerPhone, message)
        .catch((e) => console.error('COD balance-paid SMS failed (non-critical):', e.message));
    }

    return updated;
  }

  async getSales(
    sellerId: number,
    filters: { channel?: string; from?: string; to?: string; limit?: number } = {},
    scope?: SellerScope,
  ) {
    const where: any = { sellerId, ...this.saleWs(scope) };
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

  async getSale(sellerId: number, id: number, scope?: SellerScope) {
    const sale = await this.saleRepo.findOne({ where: { id, sellerId, ...this.saleWs(scope) } });
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  // Restores every line item's stock and marks the sale voided. Uses
  // ADJUSTMENT rather than RETURN — voiding is correcting a mistaken sale
  // that never really happened, distinct from a customer physically
  // returning goods after a completed one.
  async voidSale(sellerId: number, id: number, reason: string, actorId: number, scope?: SellerScope) {
    return this.dataSource.transaction(async (manager) => {
      const saleRepo = manager.getRepository(Sale);
      const sale = await saleRepo.findOne({ where: { id, sellerId, ...this.saleWs(scope) } });
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
  async getDashboard(sellerId: number, scope?: SellerScope) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const now = new Date();

    const salesToday = await this.saleRepo.find({
      where: { sellerId, ...this.saleWs(scope), status: SaleStatus.COMPLETED, createdAt: Between(startOfDay, now) },
    });
    const orderPart = workspacePartition(scope, 'o."workspaceId"', ownershipFlag('ORDER_WORKSPACE_ENFORCE'));
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
      .andWhere(orderPart ? orderPart.clause : '1=1', orderPart?.params ?? {})
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
      where: { sellerId, ...this.saleWs(scope), status: SaleStatus.COMPLETED, createdAt: MoreThanOrEqual(since30) },
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
      .andWhere(orderPart ? orderPart.clause : '1=1', orderPart?.params ?? {})
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
