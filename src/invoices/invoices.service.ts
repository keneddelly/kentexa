import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { InvoiceCounter } from './entities/invoice-counter.entity';
import { ReceiptCounter } from './entities/receipt-counter.entity';
import { Order } from '../orders/entities/order.entity';
import { Cron, CronExpression } from '@nestjs/schedule';
import PDFDocument from 'pdfkit';

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
    private dataSource: DataSource,
  ) {}

  async generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    return await this.dataSource.transaction(async (manager) => {
      let counter = await manager.findOne(InvoiceCounter, { where: { year } });
      if (!counter)
        counter = manager.create(InvoiceCounter, { year, lastSequence: 0 });
      counter.lastSequence += 1;
      await manager.save(InvoiceCounter, counter);
      return `KNT-INV-${year}-${String(counter.lastSequence).padStart(5, '0')}`;
    });
  }

  async generateReceiptNumber(): Promise<string> {
    const year = new Date().getFullYear();
    return await this.dataSource.transaction(async (manager) => {
      let counter = await manager.findOne(ReceiptCounter, { where: { year } });
      if (!counter)
        counter = manager.create(ReceiptCounter, { year, lastSequence: 0 });
      counter.lastSequence += 1;
      await manager.save(ReceiptCounter, counter);
      return `KNT-RCP-${year}-${String(counter.lastSequence).padStart(5, '0')}`;
    });
  }

  async createForOrder(order: Order): Promise<Invoice> {
    const invoiceNumber = await this.generateInvoiceNumber();
    const dueDate = new Date();
    dueDate.setHours(dueDate.getHours() + 24);

    const invoice = this.invoiceRepo.create({
      invoiceNumber,
      order,
      buyer: order.buyer || null,
      amount: order.totalAmount,
      status: InvoiceStatus.AWAITING_PAYMENT,
      dueDate,
    } as any);
    return this.invoiceRepo.save(invoice) as unknown as Promise<Invoice>;
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
    },
  ): Promise<Invoice> {
    const invoiceNumber = await this.generateInvoiceNumber();
    const receiptNumber = await this.generateReceiptNumber();
    const invoice = this.invoiceRepo.create({
      invoiceNumber,
      order,
      buyer: params.buyerId ? ({ id: params.buyerId } as any) : null,
      amount: params.amount,
      status: InvoiceStatus.PAID,
      receiptNumber,
      paymentMethod: params.paymentMethod,
      agentId: params.agentId ?? null,
      paidAt: new Date(),
    } as any);
    return this.invoiceRepo.save(invoice) as unknown as Promise<Invoice>;
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

  async markPaid(
    invoiceNumber: string,
    transactionReference: string,
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

    const receiptNumber = await this.generateReceiptNumber();
    invoice.status = InvoiceStatus.PAID;
    invoice.transactionReference = transactionReference;
    invoice.receiptNumber = receiptNumber;
    invoice.paidAt = new Date();

    const saved = await this.invoiceRepo.save(invoice);

    // ✅ AUTO-CONFIRM — update both paymentStatus AND status
    // No admin approval needed — system confirms automatically
    await this.orderRepo.update(invoice.order.id, {
      paymentStatus: 'paid' as any,
      status: 'paid' as any,
    });

    this.logger.log(
      `Invoice ${invoiceNumber} PAID & Order auto-confirmed. Receipt: ${receiptNumber}`,
    );
    return saved;
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

      const details = [
        { label: 'Buyer', value: invoice.buyer?.email || '—' },
        { label: 'Product', value: invoice.order?.product?.name || '—' },
        { label: 'Quantity', value: String(invoice.order?.quantity || 1) },
        { label: 'Payment Method', value: invoice.paymentMethod || '—' },
        {
          label: 'Transaction Ref',
          value: invoice.transactionReference || '—',
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
        .text('Payment verified by KenteXa Payment System', 60, y + 68, {
          align: 'center',
          width: doc.page.width - 120,
        });

      doc.end();
    });
  }
}
