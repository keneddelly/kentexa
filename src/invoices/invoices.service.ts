import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { InvoiceCounter } from './entities/invoice-counter.entity';
import { ReceiptCounter } from './entities/receipt-counter.entity';
import { Order, OrderStatus, PaymentStatus as OrderPaymentStatus } from '../orders/entities/order.entity';
import { User } from '../users/entities/user.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import PDFDocument from 'pdfkit';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import { CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';
import { WalletService } from '../wallet/wallet.service';
import { OrderReleaseService } from '../money-routing/order-release.service';
import { MoneyRoutingBlockedException } from '../money-routing/order-routing-target';
import { ReputationService } from '../reputation/reputation.service';
import { ReputationEventType } from '../reputation/entities/reputation-event.entity';
import { Payment, PaymentStatus as GatewayPaymentStatus } from '../payments/entities/payment.entity';
import { PaymentConfirmationService } from '../payments/payment-confirmation.service';
import { deriveOrderPaymentObligation } from '../payments/order-payment-obligation';
import { parseAmountToMinor } from '../payments/payment-money';

@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(
    @InjectRepository(Invoice) private invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceCounter)
    private counterRepo: Repository<InvoiceCounter>,
    @InjectRepository(ReceiptCounter)
    private receiptCounterRepo: Repository<ReceiptCounter>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Payment) private paymentRepo: Repository<Payment>,
    private dataSource: DataSource,
    private activityEvents: ActivityEventService,
    private commerceProfiles: CommerceProfilesService,
    private walletService: WalletService,
    private reputationService: ReputationService,
    private paymentConfirmation: PaymentConfirmationService,
    private orderRelease: OrderReleaseService,
  ) {}

  async generateInvoiceNumber(existingManager?: EntityManager): Promise<string> {
    const year = new Date().getFullYear();
    const generate = async (manager: EntityManager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [1347312105, year]);
      let counter = await manager.findOne(InvoiceCounter, { where: { year } });
      if (!counter)
        counter = manager.create(InvoiceCounter, { year, lastSequence: 0 });
      counter.lastSequence += 1;
      await manager.save(InvoiceCounter, counter);
      return `KNT-INV-${year}-${String(counter.lastSequence).padStart(5, '0')}`;
    };
    return existingManager ? generate(existingManager) : this.dataSource.transaction(generate);
  }

  async generateReceiptNumber(existingManager?: EntityManager): Promise<string> {
    const year = new Date().getFullYear();
    const generate = async (manager: EntityManager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1, $2)', [1347312106, year]);
      let counter = await manager.findOne(ReceiptCounter, { where: { year } });
      if (!counter)
        counter = manager.create(ReceiptCounter, { year, lastSequence: 0 });
      counter.lastSequence += 1;
      await manager.save(ReceiptCounter, counter);
      return `KNT-RCP-${year}-${String(counter.lastSequence).padStart(5, '0')}`;
    };
    return existingManager ? generate(existingManager) : this.dataSource.transaction(generate);
  }

  async createForOrder(order: Order): Promise<Invoice> {
    const invoiceNumber = await this.generateInvoiceNumber();
    const dueDate = new Date();
    dueDate.setHours(dueDate.getHours() + 24);

    // Cash on Delivery: only the upfront portion (possibly zero, for
    // same-city COD under the default policy) is ever charged through the
    // online payment gateway — the remaining balance is collected
    // physically at delivery, never through this invoice. A zero-upfront
    // COD order has nothing to charge online at all, so its invoice is
    // created already settled rather than sitting in AWAITING_PAYMENT
    // waiting for a payment that was never going to arrive that way.
    const isCod = (order as any).codUpfrontAmount != null;
    const amount = isCod ? Number((order as any).codUpfrontAmount) : order.totalAmount;
    const status = isCod && amount === 0 ? InvoiceStatus.PAID : InvoiceStatus.AWAITING_PAYMENT;

    const invoice = this.invoiceRepo.create({
      invoiceNumber,
      order,
      buyer: order.buyer || null,
      amount,
      status,
      dueDate,
      ...(status === InvoiceStatus.PAID ? { paidAt: new Date(), paymentMethod: 'cod' } : {}),
    } as any);
    const saved = (await this.invoiceRepo.save(
      invoice,
    )) as unknown as Invoice;
    const createSellerProfile = order.seller
      ? await this.commerceProfiles
          .findForUserByType(order.seller.id, CommerceProfileType.BUSINESS)
          .catch(() => null)
      : null;
    this.activityEvents.record({
      eventType: 'INVOICE_CREATED',
      category: ActivityCategory.INVOICE,
      actorId: order.buyer?.id ?? null,
      actorType: 'buyer',
      businessId: createSellerProfile?.id ?? null,
      relatedUserId: order.seller?.id ?? null,
      targetType: 'invoice',
      targetId: saved.id,
      metadata: { orderId: order.id, amount: order.totalAmount },
    });
    return saved;
  }

  // Cash on Delivery: the order already has exactly one Invoice (the
  // OneToOne created by createForOrder() above, for the upfront amount) —
  // this UPDATES that same row to the full total once the balance clears
  // at delivery, rather than creating a second Invoice for the same Order
  // (which the OneToOne relation wouldn't even allow). If no invoice was
  // ever created (e.g. a zero-upfront COD order, which skips the online
  // payment step entirely), one is created now, already settled — same
  // "money already changed hands" shape as recordManualPayment().
  async recordCodBalanceCollected(order: Order, fullAmountReceived: number, manager?: EntityManager): Promise<Invoice> {
    const repo = manager ? manager.getRepository(Invoice) : this.invoiceRepo;
    const existing = await repo.findOne({ where: { order: { id: order.id } } });
    if (existing) {
      existing.amount = fullAmountReceived;
      existing.status = InvoiceStatus.PAID;
      existing.paidAt = new Date();
      if (!existing.receiptNumber) {
        existing.receiptNumber = await this.generateReceiptNumber(manager);
      }
      return repo.save(existing);
    }
    return this.recordManualPayment(order, {
      amount: fullAmountReceived,
      paymentMethod: 'cod',
      buyerId: order.buyer?.id ?? null,
      payerName: order.recipientName,
      payerPhone: order.phone,
    }, manager);
  }

  // For a payment collected outside the online provider pipeline — e.g. a
  // Super Agent physically collecting cash at a counter. Skips the normal
  // AWAITING_PAYMENT→PAID transition entirely since the money already
  // changed hands before this is ever called; the invoice is created
  // already PAID, with a receipt number issued immediately. Reuses the
  // same transactional receipt-number generator every other paid invoice
  // uses, so there's one numbering scheme, not a second one.
  async recordManualPayment(
    order: Order,
    params: {
      amount: number;
      paymentMethod: string;
      agentId?: number;
      buyerId?: number | null;
      payerName?: string | null;
      payerPhone?: string | null;
    },
    manager?: EntityManager,
  ): Promise<Invoice> {
    const invoiceNumber = await this.generateInvoiceNumber(manager);
    const receiptNumber = await this.generateReceiptNumber(manager);
    const repo = manager ? manager.getRepository(Invoice) : this.invoiceRepo;
    const invoice = repo.create({
      invoiceNumber,
      order,
      buyer: params.buyerId ? ({ id: params.buyerId } as any) : null,
      payerName: params.payerName || null,
      payerPhone: params.payerPhone || null,
      amount: params.amount,
      status: InvoiceStatus.PAID,
      receiptNumber,
      paymentMethod: params.paymentMethod,
      agentId: params.agentId ?? null,
      paidAt: new Date(),
    } as any);
    return repo.save(invoice) as unknown as Promise<Invoice>;
  }

  async findByOrderId(orderId: number): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findOne({
      where: { order: { id: orderId } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async findByInvoiceNumber(invoiceNumber: string): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findOne({
      where: { invoiceNumber },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  // Security closure pass: the controller's number/:invoiceNumber and
  // order/:orderId JSON routes previously called findByInvoiceNumber/
  // findByOrderId directly with no ownership check at all -- any logged-in
  // user could view any other user's invoice (amount, buyer info) by
  // guessing an orderId or invoice number. Kept as a separate assertion
  // (rather than baking the check into findByOrderId/findByInvoiceNumber
  // themselves) because those two are also called internally by
  // system/admin paths (cancel, markPaid, PDF generation, super-agents and
  // payments services) with no end-user "caller" to check ownership
  // against. The PDF download siblings are deliberately public with the
  // invoice number itself as the access key (documented above them,
  // needed for plain <a href> links); these JSON routes were never meant
  // to follow that model -- findMyInvoices already filters by buyer.id,
  // implying invoices are private to their buyer/seller by design.
  assertInvoiceOwner(invoice: Invoice, user: User): Invoice {
    const isBuyer = invoice.buyer?.id === user.id;
    const isSeller = invoice.order?.seller?.id === user.id;
    if (!isBuyer && !isSeller) {
      throw new ForbiddenException('Not your invoice');
    }
    return invoice;
  }

  async findMyInvoices(userId: number): Promise<Invoice[]> {
    return this.invoiceRepo.find({
      where: { buyer: { id: userId } },
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(): Promise<Invoice[]> {
    const invoices = await this.invoiceRepo.find({
      relations: {
        order: { seller: true, buyer: true, product: true },
        buyer: true,
      },
      order: { createdAt: 'DESC' },
    });

    // Auto-sync invoice status with order payment status
    // Fixes: invoice shows 'awaiting_payment' when order is already 'paid'
    for (const inv of invoices) {
      if (
        inv.order?.paymentStatus === 'paid' &&
        inv.status === InvoiceStatus.AWAITING_PAYMENT
      ) {
        await this.invoiceRepo.update(inv.id, {
          status: InvoiceStatus.PAID,
          paidAt: inv.order.updatedAt || new Date(),
        });
        inv.status = InvoiceStatus.PAID;
      }
    }

    return invoices;
  }

  async markPaymentProcessing(
    invoiceNumber: string,
    paymentMethod: string,
    agentId?: number,
  ): Promise<Invoice> {
    const invoice = await this.findByInvoiceNumber(invoiceNumber);
    if (invoice.status !== InvoiceStatus.AWAITING_PAYMENT) {
      throw new BadRequestException(
        `Invoice cannot be processed. Current status: ${invoice.status}`,
      );
    }
    invoice.status = InvoiceStatus.PAYMENT_PROCESSING;
    invoice.paymentMethod = paymentMethod;
    if (agentId) invoice.agentId = agentId;
    return this.invoiceRepo.save(invoice);
  }

  // S0 Decision 1/5/6: admin/manual "mark paid" is NOT a second, independent
  // financial authority. It creates a real Payment(provider='admin_manual')
  // carrying who/why (actorUserId/reason), then goes through the SAME
  // canonical PaymentConfirmationService every provider webhook uses — the
  // exact same atomic order/invoice transition, the exact same sealed
  // PaymentEvidence. "Invoice PAID" is the CONSEQUENCE of that Payment
  // existing, never a fact recorded independently of it.
  async markPaid(
    invoiceNumber: string,
    transactionReference: string,
    reason: string,
    actorUserId: number,
  ): Promise<Invoice> {
    const invoice = await this.findByInvoiceNumber(invoiceNumber);

    if (invoice.status === InvoiceStatus.PAID)
      throw new BadRequestException('Invoice already paid');
    if (
      ![
        InvoiceStatus.PAYMENT_PROCESSING,
        InvoiceStatus.AWAITING_PAYMENT,
      ].includes(invoice.status)
    ) {
      throw new BadRequestException(
        `Invoice cannot be marked paid. Current status: ${invoice.status}`,
      );
    }
    if (!transactionReference?.trim()) {
      throw new BadRequestException('A transaction/receipt reference is required');
    }
    if (!reason?.trim() || reason.trim().length < 5) {
      throw new BadRequestException('A reason (at least 5 characters) is required to manually confirm a payment');
    }
    if (!invoice.order) {
      throw new BadRequestException('This invoice has no linked order to confirm');
    }

    const obligation = deriveOrderPaymentObligation(invoice.order);
    const amount = Number(invoice.amount);
    const amountMinor = parseAmountToMinor(amount);
    if (amountMinor === null) {
      throw new BadRequestException('Invoice amount is not a valid payable amount');
    }

    const payment = await this.paymentRepo.save(
      this.paymentRepo.create({
        order: { id: invoice.order.id } as any,
        amount,
        provider: 'admin_manual',
        status: GatewayPaymentStatus.PENDING,
        providerRequestId: `ADMIN-${invoice.order.id}-${Date.now()}`,
        metadata: JSON.stringify({
          purpose: obligation.purpose,
          invoiceType: 'order',
          invoiceNumber,
          orderId: invoice.order.id,
          actorUserId,
          reason: reason.trim(),
        }),
      }),
    );

    const outcome = await this.paymentConfirmation.confirmVerifiedPayment(payment.id, {
      status: 'SUCCESS',
      amountMinor,
      currency: 'TZS',
      providerReference: transactionReference,
    });

    if (outcome.status !== 'CONFIRMED') {
      // Decision 10 — a historical contradiction (e.g. the order is no longer PENDING_PAYMENT) is
      // reported, never silently "repaired". The admin_manual Payment itself is still recorded.
      throw new ConflictException(`Manual payment confirmation could not be applied: ${outcome.status}`);
    }

    this.activityEvents.record({
      eventType: 'PAYMENT_MANUALLY_CONFIRMED',
      category: ActivityCategory.PAYMENT,
      actorId: actorUserId,
      actorType: 'admin',
      relatedUserId: invoice.order.seller?.id ?? null,
      targetType: 'invoice',
      targetId: invoice.id,
      metadata: { orderId: invoice.order.id, amount, transactionReference, reason: reason.trim(), provider: 'admin_manual' },
    });

    // Receipt numbering stays a best-effort follow-up, same non-transactional shape this codebase
    // already used before S0 (its own counter transaction is independent of the confirmation above).
    if (!invoice.receiptNumber) {
      try {
        await this.invoiceRepo.update(invoice.id, { receiptNumber: await this.generateReceiptNumber() });
      } catch (err: any) {
        this.logger.warn(`Receipt number generation failed for invoice ${invoiceNumber} (non-critical): ${err.message}`);
      }
    }

    // S0 x I2G integration gate: PaymentConfirmationService.applyOrderTransitionIn deliberately
    // leaves a digital order's completion/escrow columns untouched for this classification — the
    // canonical release (the ONE writer of escrow RELEASED / fundsReleasedAt) happens here instead.
    if (outcome.orderTransition === 'DIGITAL_COMPLETED') {
      try {
        const now = new Date();
        // I2G: canonical release; an unroutable digital order stays paid-but-held (BLOCKED entry recorded).
        try {
          await this.orderRelease.releaseSellerProceeds({
            orderId: invoice.order.id,
            source: 'INVOICE_PAID',
            orderUpdate: { paymentStatus: OrderPaymentStatus.PAID, status: OrderStatus.COMPLETED, deliveredAt: now, completedAt: now },
          });
        } catch (e) {
          // The outer catch below already logs+swallows (this is a best-effort post-confirmation
          // side effect; the Payment itself already recorded SUCCESS) — a BLOCKED release still
          // needs the order's paymentStatus persisted so it isn't left at PENDING_PAYMENT forever.
          if (e instanceof MoneyRoutingBlockedException) {
            await this.orderRepo.update(invoice.order.id, { paymentStatus: OrderPaymentStatus.PAID, status: OrderStatus.PAID } as any);
          }
          throw e;
        }

        if (invoice.buyer?.id) {
          await this.reputationService
            .award(invoice.buyer.id, ReputationEventType.ORDER_COMPLETED, {
              sourceEntityType: 'order',
              sourceEntityId: invoice.order.id,
            })
            .catch(() => {});
        }
        if (invoice.order.seller?.id) {
          await this.reputationService
            .award(invoice.order.seller.id, ReputationEventType.ORDER_COMPLETED, {
              sourceEntityType: 'order',
              sourceEntityId: invoice.order.id,
              commerceProfileId: (invoice.order as any).commerceProfileId ?? null,
            })
            .catch(() => {});
        }
      } catch (err) {
        this.logger.warn(`Digital order reputation award failed: ${err.message}`);
      }
    }

    const refreshed = await this.findByInvoiceNumber(invoiceNumber);
    this.logger.log(
      `Invoice ${invoiceNumber} manually confirmed PAID by admin #${actorUserId} (ref: ${transactionReference}, orderTransition: ${outcome.orderTransition}).`,
    );
    const paidSellerProfile = refreshed.order?.seller
      ? await this.commerceProfiles
          .findForUserByType(refreshed.order.seller.id, CommerceProfileType.BUSINESS)
          .catch(() => null)
      : null;
    this.activityEvents.record({
      eventType: 'INVOICE_PAID',
      category: ActivityCategory.PAYMENT,
      actorId: refreshed.buyer?.id ?? null,
      actorType: 'buyer',
      businessId: paidSellerProfile?.id ?? null,
      relatedUserId: refreshed.order?.seller?.id ?? null,
      targetType: 'invoice',
      targetId: refreshed.id,
      metadata: { orderId: refreshed.order?.id, amount: refreshed.amount },
    });
    return refreshed;
  }

  async cancel(invoiceNumber: string): Promise<Invoice> {
    const invoice = await this.findByInvoiceNumber(invoiceNumber);
    if (
      [InvoiceStatus.PAID, InvoiceStatus.CANCELLED].includes(invoice.status)
    ) {
      throw new BadRequestException('Invoice cannot be cancelled');
    }
    invoice.status = InvoiceStatus.CANCELLED;
    return this.invoiceRepo.save(invoice);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async expireInvoices() {
    try {
      const now = new Date();
      // ✅ Single bulk UPDATE instead of fetch-all + save-each
      // Much faster and won't timeout on large tables
      const result = await this.invoiceRepo
        .createQueryBuilder()
        .update(Invoice)
        .set({ status: InvoiceStatus.EXPIRED, expiredAt: now })
        .where('status = :status', { status: InvoiceStatus.AWAITING_PAYMENT })
        .andWhere('dueDate < :now', { now })
        .execute();

      if (result.affected && result.affected > 0) {
        this.logger.log(`Auto-expired ${result.affected} invoices`);
      }
    } catch (err) {
      this.logger.error(`expireInvoices failed: ${err.message}`);
    }
  }

  async verifyReceipt(receiptNumber: string) {
    const invoice = await this.invoiceRepo.findOne({
      where: { receiptNumber },
    });
    if (!invoice || invoice.status !== InvoiceStatus.PAID) {
      return { valid: false, message: 'Receipt not found or invalid' };
    }
    return {
      valid: true,
      receiptNumber: invoice.receiptNumber,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount,
      paidAt: invoice.paidAt,
      paymentMethod: invoice.paymentMethod,
      orderId: invoice.order?.id,
    };
  }

  async generateInvoicePDF(invoiceNumber: string): Promise<Buffer> {
    const invoice = await this.findByInvoiceNumber(invoiceNumber);
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      doc.fillColor('#0f172a').rect(0, 0, doc.page.width, 120).fill();
      doc
        .fillColor('#1d4ed8')
        .fontSize(28)
        .font('Helvetica-Bold')
        .text('KenteXa', 50, 35);
      doc
        .fillColor('#94a3b8')
        .fontSize(11)
        .font('Helvetica')
        .text('Marketplace Tanzania', 50, 70);
      doc
        .fillColor('#ffffff')
        .fontSize(11)
        .text('kentexa.com', 400, 50, { align: 'right' })
        .text('support@kentexa.com', 400, 68, { align: 'right' });

      doc
        .fillColor('#0f172a')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text('INVOICE', 50, 145);
      doc
        .fillColor('#1d4ed8')
        .fontSize(13)
        .font('Helvetica')
        .text(invoice.invoiceNumber, 50, 172);

      const statusColors: Record<string, string> = {
        paid: '#16a34a',
        awaiting_payment: '#ca8a04',
        expired: '#dc2626',
        cancelled: '#dc2626',
        payment_processing: '#2563eb',
      };
      doc
        .fillColor(statusColors[invoice.status] || '#64748b')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text(
          `STATUS: ${invoice.status.toUpperCase().replace(/_/g, ' ')}`,
          400,
          145,
          { align: 'right' },
        );

      doc
        .fillColor('#64748b')
        .fontSize(10)
        .text(
          `Date: ${new Date(invoice.createdAt).toLocaleDateString('en-GB')}`,
          400,
          162,
          { align: 'right' },
        )
        .text(
          `Due: ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-GB') : 'N/A'}`,
          400,
          179,
          { align: 'right' },
        );

      doc
        .strokeColor('#e2e8f0')
        .lineWidth(1)
        .moveTo(50, 205)
        .lineTo(550, 205)
        .stroke();

      doc
        .fillColor('#64748b')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('BILL TO:', 50, 225);
      doc
        .fillColor('#0f172a')
        .fontSize(12)
        .font('Helvetica')
        .text(invoice.buyer?.email || 'Customer', 50, 242)
        .text(invoice.order?.phone || 'N/A', 50, 258)
        .text(invoice.order?.deliveryAddress || 'Tanzania', 50, 274);

      doc.fillColor('#0f172a').rect(50, 310, 500, 30).fill();
      doc
        .fillColor('#ffffff')
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('PRODUCT', 60, 320)
        .text('QTY', 350, 320)
        .text('UNIT PRICE', 400, 320)
        .text('TOTAL', 490, 320);

      doc.fillColor('#f8fafc').rect(50, 340, 500, 35).fill();
      doc
        .fillColor('#0f172a')
        .fontSize(10)
        .font('Helvetica')
        .text(invoice.order?.product?.name || 'Product', 60, 352)
        .text(String(invoice.order?.quantity || 1), 360, 352)
        .text(
          `TZS ${Number(invoice.order?.product?.displayPrice || invoice.order?.product?.basePrice || 0).toLocaleString()}`,
          390,
          352,
        )
        .text(`TZS ${Number(invoice.amount).toLocaleString()}`, 470, 352);

      doc
        .strokeColor('#e2e8f0')
        .lineWidth(1)
        .moveTo(50, 385)
        .lineTo(550, 385)
        .stroke();
      doc.fillColor('#0f172a').rect(370, 400, 180, 35).fill();
      doc
        .fillColor('#ffffff')
        .fontSize(13)
        .font('Helvetica-Bold')
        .text('TOTAL:', 380, 412)
        .text(`TZS ${Number(invoice.amount).toLocaleString()}`, 450, 412);

      if (invoice.status === InvoiceStatus.PAID) {
        doc.fillColor('#dcfce7').rect(50, 460, 500, 50).fill();
        doc
          .fillColor('#16a34a')
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('✓ PAID', 70, 472)
          .text(`Receipt: ${invoice.receiptNumber}`, 70, 488);
        doc
          .fillColor('#16a34a')
          .fontSize(10)
          .font('Helvetica')
          .text(
            `Paid on: ${invoice.paidAt ? new Date(invoice.paidAt).toLocaleString() : 'N/A'}`,
            300,
            475,
          )
          .text(`Ref: ${invoice.transactionReference || 'N/A'}`, 300, 492);
      }

      doc
        .fillColor('#0f172a')
        .rect(0, doc.page.height - 80, doc.page.width, 80)
        .fill();
      doc
        .fillColor('#94a3b8')
        .fontSize(10)
        .font('Helvetica')
        .text(
          'Thank you for choosing KenteXa Marketplace!',
          50,
          doc.page.height - 55,
          { align: 'center' },
        )
        .text('kentexa.com | support@kentexa.com', 50, doc.page.height - 38, {
          align: 'center',
        });

      doc.end();
    });
  }

  async generateReceiptPDF(receiptNumber: string): Promise<Buffer> {
    const invoice = await this.invoiceRepo.findOne({
      where: { receiptNumber },
    });
    if (!invoice || invoice.status !== InvoiceStatus.PAID)
      throw new NotFoundException('Receipt not found');

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A5' });
      const buffers: Buffer[] = [];
      doc.on('data', (chunk) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      doc.fillColor('#0f172a').rect(0, 0, doc.page.width, 100).fill();
      doc
        .fillColor('#10b981')
        .fontSize(24)
        .font('Helvetica-Bold')
        .text('✓ RECEIPT', 50, 30);
      doc
        .fillColor('#94a3b8')
        .fontSize(10)
        .font('Helvetica')
        .text('KENTEXA MARKETPLACE', 50, 62);
      doc
        .fillColor('#ffffff')
        .fontSize(10)
        .text('kentexa.com', 0, 50, {
          align: 'right',
          width: doc.page.width - 30,
        });

      doc
        .fillColor('#0f172a')
        .fontSize(16)
        .font('Helvetica-Bold')
        .text(receiptNumber, 50, 120);
      doc
        .fillColor('#64748b')
        .fontSize(10)
        .font('Helvetica')
        .text(`Invoice: ${invoice.invoiceNumber}`, 50, 142)
        .text(
          `Date: ${invoice.paidAt ? new Date(invoice.paidAt).toLocaleString() : 'N/A'}`,
          50,
          158,
        );

      doc
        .strokeColor('#e2e8f0')
        .lineWidth(1)
        .moveTo(50, 180)
        .lineTo(doc.page.width - 50, 180)
        .stroke();

      // A manual payment (cash/mobile_money/bank/other, collected by the
      // seller directly — see recordManualPayment()) never went through a
      // real online gateway, unlike a paymentMethod like 'selcom'/
      // 'vodacom'/'mock'. Everything below reflects that distinction
      // instead of always assuming Kentexa processed the money.
      const MANUAL_METHODS = ['cash', 'mobile_money', 'bank', 'other'];
      const isManualPayment = MANUAL_METHODS.includes(
        (invoice.paymentMethod || '').toLowerCase(),
      );
      const sellerName =
        (invoice.order?.seller as any)?.storeName ||
        invoice.order?.seller?.name ||
        null;

      const details = [
        ...(sellerName ? [{ label: 'Seller', value: sellerName }] : []),
        {
          label: 'Buyer',
          value:
            invoice.payerName ||
            invoice.buyer?.name ||
            invoice.buyer?.email ||
            '—',
        },
        ...(invoice.payerPhone
          ? [{ label: 'Buyer Phone', value: invoice.payerPhone }]
          : []),
        {
          label: 'Product',
          value:
            invoice.order?.product?.name ||
            (invoice.order as any)?.manualProductName ||
            '—',
        },
        { label: 'Quantity', value: String(invoice.order?.quantity || 1) },
        {
          label: 'Order Ref',
          value: (invoice.order as any)?.trackingNumber || '—',
        },
        {
          label: 'Payment Method',
          value: invoice.paymentMethod || '—',
        },
        ...(invoice.transactionReference
          ? [{ label: 'Transaction Ref', value: invoice.transactionReference }]
          : []),
        {
          label: 'Payment Source',
          value: isManualPayment ? 'External / Offline' : 'Kentexa Online',
        },
      ];

      let y = 195;
      details.forEach((item) => {
        doc
          .fillColor('#64748b')
          .fontSize(10)
          .text(item.label + ':', 50, y);
        doc
          .fillColor('#0f172a')
          .fontSize(10)
          .font('Helvetica-Bold')
          .text(item.value, 200, y);
        doc.font('Helvetica');
        y += 20;
      });

      doc
        .strokeColor('#e2e8f0')
        .lineWidth(1)
        .moveTo(50, y + 5)
        .lineTo(doc.page.width - 50, y + 5)
        .stroke();
      doc
        .fillColor('#10b981')
        .fontSize(16)
        .font('Helvetica-Bold')
        .text('AMOUNT PAID:', 50, y + 20)
        .text(`TZS ${Number(invoice.amount).toLocaleString()}`, 200, y + 20);

      doc
        .fillColor('#f0fdf4')
        .rect(50, y + 55, doc.page.width - 100, 40)
        .fill();
      doc
        .fillColor('#16a34a')
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(
          // Never claim Kentexa processed money it never held — a manual
          // payment was collected by the seller directly and only
          // recorded/confirmed through Kentexa.
          isManualPayment
            ? 'Payment recorded and verified by Kentexa — collected directly by the seller'
            : 'Payment verified by Kentexa Payment System',
          60,
          y + 68,
          { align: 'center', width: doc.page.width - 120 },
        );

      doc.end();
    });
  }
}
