import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus } from './entities/payment.entity';
import {
  Order,
  PaymentStatus as OrderPaymentStatus,
} from '../orders/entities/order.entity';
import { Invoice, InvoiceStatus } from '../invoices/entities/invoice.entity';
import { InvoicesService } from '../invoices/invoices.service';
import {
  ClassifiedInvoiceRequest,
  ClassifiedInvoiceStatus,
} from '../classifieds/entities/classified-invoice-request.entity';
import { Agent } from '../agents/entities/agent.entity';
import {
  AgentTransaction,
  AgentTransactionStatus,
} from '../agents/entities/agent-transaction.entity';
import { Payout } from '../payouts/entities/payout.entity';
import { User } from '../users/entities/user.entity';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { VodacomService } from './providers/vodacom/vodacom.service';
import { AirtelService } from './providers/airtel/airtel.service';
import { SelcomService } from './providers/selcom/selcom.service';
import { IPaymentProvider } from './providers/payment-provider.interface';
import { MockAgentService } from './providers/mock/mock-agent.service';
import { ClickPesaService } from './providers/clickpesa/clickpesa.service';
import { NotificationsService } from '../notifications/notifications.service';

const USE_INDIVIDUAL_NETWORKS = false;

export interface InvoiceLookupResult {
  invoiceNumber: string;
  invoiceType: 'order' | 'classified' | 'manual';
  invoiceId: number;
  orderId: number | null;
  customerName: string;
  customerPhone: string;
  productName: string;
  sellerName: string;
  quantity: number;
  amount: number;
  dueDate: Date | null;
  status: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment) private paymentRepo: Repository<Payment>,
    @InjectRepository(Payout) private payoutRepo: Repository<Payout>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Invoice) private invoiceRepo: Repository<Invoice>,
    @InjectRepository(ClassifiedInvoiceRequest)
    private classifiedInvoiceRepo: Repository<ClassifiedInvoiceRequest>,
    @InjectRepository(Agent) private agentRepo: Repository<Agent>,
    @InjectRepository(AgentTransaction)
    private agentTransactionRepo: Repository<AgentTransaction>,
    private vodacomService: VodacomService,
    private airtelService: AirtelService,
    private selcomService: SelcomService,
    private mockAgentService: MockAgentService,
    private clickPesaService: ClickPesaService,
    private notificationsService: NotificationsService,
    private invoicesService: InvoicesService,
  ) {}

  private getProvider(provider: string): IPaymentProvider {
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(
        `[DEV] Using mock payment provider instead of ${provider}`,
      );
      return this.mockAgentService;
    }
    // "mock" is NOT honored here in production — this is the one line that
    // let anyone mark a payment SUCCESS for free by passing provider:"mock".
    // Every request in production goes to a real provider, full stop.
    // ClickPesa is opt-in only (explicit provider:"clickpesa") — the
    // USE_INDIVIDUAL_NETWORKS default below is untouched, so nothing that
    // already relies on landing on Selcom changes behavior.
    if (provider === 'clickpesa') {
      return this.clickPesaService;
    }
    if (USE_INDIVIDUAL_NETWORKS) {
      switch (provider) {
        case 'vodacom':
          return this.vodacomService;
        case 'airtel':
          return this.airtelService;
        default:
          return this.selcomService;
      }
    }
    return this.selcomService;
  }

  private generateReceiptNumber(): string {
    const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `KNT-RCP-${new Date().getFullYear()}-${rand}`;
  }

  // ── Auto-confirm order after payment + send notifications ─────────────────
  private async autoConfirmOrder(orderId: number): Promise<void> {
    await this.orderRepo.update(orderId, {
      paymentStatus: 'paid' as any,
      status: 'paid' as any,
    });
    this.logger.log(`Order #${orderId} auto-confirmed after payment`);

    // 📱 SMS (1 of 3 allowed) + 📧 Email — to BOTH buyer and seller
    try {
      const order = await this.orderRepo.findOne({
        where: { id: orderId },
        relations: { buyer: true, seller: true, product: true },
      });
      if (order) {
        await this.notificationsService.orderPaid(
          {
            email: order.buyer?.email,
            phone: order.buyer?.phone,
            name: order.buyer?.name,
          },
          {
            email: order.seller?.email,
            phone: order.seller?.phone,
            name: order.seller?.name,
          },
          order.id,
          order.product?.name || 'Product',
          Number(order.totalAmount || 0),
        );
      }
    } catch (err) {
      this.logger.warn(
        `Failed to send orderPaid notifications for order #${orderId}: ${err.message}`,
      );
    }
  }

  // ── Escrow release (admin triggers) ─────────────────────────────────────
  async releaseEscrow(orderId: number, adminId: number): Promise<void> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: { seller: true, buyer: true, product: true },
    });
    if (!order) throw new NotFoundException(`Order #${orderId} not found`);

    await this.orderRepo.update(orderId, {
      escrowStatus: 'released' as any,
      payoutStatus: 'released',
      fundsReleasedAt: new Date(),
    });

    this.logger.log(
      `Escrow released for order #${orderId} by admin #${adminId}`,
    );

    // Notify seller
    try {
      if (order.seller) {
        await this.notificationsService.orderCompleted(
          {
            email: order.seller.email,
            phone: order.seller.phone,
            name: order.seller.name,
          },
          {
            email: order.buyer?.email,
            phone: order.buyer?.phone,
            name: order.buyer?.name,
          },
          order.id,
          Number(order.sellerAmount || order.totalAmount || 0),
        );
      }
    } catch {
      /* non-critical */
    }
  }

  // ── Get payout summary for admin ─────────────────────────────────────────
  async getPayoutSummary(): Promise<{
    pendingEscrow: number;
    releasedToday: number;
    totalReleased: number;
    pendingOrders: number;
  }> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [pending, releasedToday, totalReleased] = await Promise.all([
      this.orderRepo
        .createQueryBuilder('o')
        .select('SUM(o.sellerAmount)', 'total')
        .where("o.escrowStatus = 'held'")
        .andWhere("o.paymentStatus = 'paid'")
        .getRawOne(),
      this.orderRepo
        .createQueryBuilder('o')
        .select('SUM(o.sellerAmount)', 'total')
        .where("o.escrowStatus = 'released'")
        .andWhere('o.fundsReleasedAt >= :today', { today })
        .getRawOne(),
      this.orderRepo
        .createQueryBuilder('o')
        .select('SUM(o.sellerAmount)', 'total')
        .where("o.escrowStatus = 'released'")
        .getRawOne(),
    ]);

    const pendingCount = await this.orderRepo.count({
      where: {
        paymentStatus: 'paid' as any,
        escrowStatus: 'held' as any,
      },
    });

    return {
      pendingEscrow: Number(pending?.total || 0),
      releasedToday: Number(releasedToday?.total || 0),
      totalReleased: Number(totalReleased?.total || 0),
      pendingOrders: pendingCount,
    };
  }

  async lookupAnyInvoice(invoiceNumber: string): Promise<InvoiceLookupResult> {
    if (
      !invoiceNumber ||
      typeof invoiceNumber !== 'string' ||
      !invoiceNumber.trim()
    ) {
      throw new BadRequestException('Invoice number is required');
    }
    const cleanInvoiceNumber = invoiceNumber.trim();

    const orderInvoice = await this.invoiceRepo.findOne({
      where: { invoiceNumber: cleanInvoiceNumber },
      relations: { order: { buyer: true, product: true } },
    });
    if (orderInvoice) {
      return {
        invoiceNumber: orderInvoice.invoiceNumber,
        invoiceType: 'order',
        invoiceId: orderInvoice.id,
        orderId: orderInvoice.order?.id ?? null,
        customerName: orderInvoice.order?.buyer?.name || '—',
        customerPhone: orderInvoice.order?.buyer?.phone || '—',
        productName: orderInvoice.order?.product?.name || '—',
        sellerName: '—',
        quantity: orderInvoice.order?.quantity ?? 1,
        amount: Number(orderInvoice.amount),
        dueDate: orderInvoice.dueDate,
        status: orderInvoice.status,
      };
    }

    const classifiedInvoice = await this.classifiedInvoiceRepo.findOne({
      where: { invoiceNumber: cleanInvoiceNumber },
      relations: { buyer: true, seller: true, classified: true },
    });
    if (classifiedInvoice) {
      const isManual = !classifiedInvoice.buyer;
      const msgParts = (classifiedInvoice.buyerMessage || '').split(' | ');
      const parsedName =
        msgParts.find((p) => p.startsWith('Name:'))?.replace('Name: ', '') ||
        classifiedInvoice.buyer?.name ||
        '—';
      const parsedPhone =
        msgParts.find((p) => p.startsWith('Phone:'))?.replace('Phone: ', '') ||
        classifiedInvoice.buyer?.phone ||
        '—';

      return {
        invoiceNumber: classifiedInvoice.invoiceNumber ?? invoiceNumber,
        invoiceType: isManual ? 'manual' : 'classified',
        invoiceId: classifiedInvoice.id,
        orderId: null,
        customerName: parsedName,
        customerPhone: parsedPhone,
        productName:
          classifiedInvoice.invoiceDescription ||
          classifiedInvoice.classified?.title ||
          '—',
        sellerName:
          classifiedInvoice.seller?.name ||
          classifiedInvoice.seller?.email ||
          '—',
        quantity: 1,
        amount: Number(classifiedInvoice.amount),
        dueDate: classifiedInvoice.dueDate,
        status: classifiedInvoice.status,
      };
    }

    throw new NotFoundException(
      `Invoice ${cleanInvoiceNumber} not found. Please check the invoice number and try again.`,
    );
  }

  private validatePayable(invoice: InvoiceLookupResult): void {
    if (invoice.status === 'paid')
      throw new BadRequestException('This invoice is already paid');
    if (invoice.status === 'cancelled')
      throw new BadRequestException('This invoice has been cancelled');
    if (invoice.status === 'expired')
      throw new BadRequestException('This invoice has expired');
  }

  // Invoice-based payments (customer/agent) don't have a single order row
  // to check like initiatePayment() does, so this looks for a PENDING
  // payment already carrying this invoice number in its metadata instead —
  // without it, a double-tap fires two independent STK pushes for the same
  // invoice.
  private async assertNoPendingPaymentForInvoice(
    invoiceNumber: string,
  ): Promise<void> {
    const existingPending = await this.paymentRepo
      .createQueryBuilder('p')
      .where('p.status = :status', { status: PaymentStatus.PENDING })
      .andWhere('p.metadata LIKE :needle', {
        needle: `%"invoiceNumber":"${invoiceNumber}"%`,
      })
      .getOne();
    if (existingPending) {
      throw new BadRequestException(
        'A payment is already in progress for this invoice. Check your phone, or wait a moment before retrying.',
      );
    }
  }

  private async recordAgentCommission(
    agentId: number,
    amount: number,
    transactionRef: string,
    paymentMethod: string,
    invoice?: Invoice | null,
    orderId?: number | null,
  ): Promise<void> {
    const agent = await this.agentRepo.findOne({ where: { id: agentId } });
    if (!agent) return;

    const commissionRate = Number(agent.commissionRate ?? 2.5);
    const commission = parseFloat(((amount * commissionRate) / 100).toFixed(2));

    await this.agentTransactionRepo.save(
      this.agentTransactionRepo.create({
        agent,
        ...(invoice ? { invoice } : {}),
        invoiceAmount: amount,
        commissionRate,
        commissionAmount: commission,
        transactionReference: transactionRef,
        paymentMethod,
        status: AgentTransactionStatus.CONFIRMED,
      }),
    );

    agent.totalEarnings = Number(agent.totalEarnings) + commission;
    agent.totalTransactions = Number(agent.totalTransactions) + 1;
    await this.agentRepo.save(agent);

    if (orderId) {
      const payout = await this.payoutRepo.findOne({
        where: { order: { id: orderId } },
      });
      if (payout) {
        payout.agentCommission = commission;
        payout.sellerAmount = parseFloat(
          (Number(payout.sellerAmount) - commission).toFixed(2),
        );
        await this.payoutRepo.save(payout);
      }
      const order = await this.orderRepo.findOne({ where: { id: orderId } });
      if (order) {
        await this.orderRepo.update(orderId, {
          agentCommissionAmount: commission,
          sellerAmount: parseFloat(
            (
              Number(order.totalAmount) -
              Number(order.platformFeeAmount) -
              commission
            ).toFixed(2),
          ),
        });
      }
    }
  }

  async initiatePayment(dto: InitiatePaymentDto, user: User) {
    const order = await this.orderRepo.findOne({
      where: { id: dto.orderId, buyer: { id: user.id } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.paymentStatus === OrderPaymentStatus.PAID)
      throw new BadRequestException('Order already paid');

    // A double-tap on "pay" (or a slow first STK push) previously fired a
    // second, fully independent payment request for the same order — no
    // check stopped it. This blocks a new one while one is still pending.
    const existingPending = await this.paymentRepo.findOne({
      where: { order: { id: order.id }, status: PaymentStatus.PENDING },
    });
    if (existingPending) {
      throw new BadRequestException(
        'A payment is already in progress for this order. Check your phone, or wait a moment before retrying.',
      );
    }

    const provider = this.getProvider(dto.provider);
    const reference = `KNT-ORD-${order.id}-${Date.now()}`;
    const response = await provider.initiatePayment({
      phone: dto.phone,
      amount: Number(order.totalAmount),
      reference,
      description: `Payment for Order #${order.id} on Kentexa`,
    });

    const payment = this.paymentRepo.create({
      order,
      user,
      phone: dto.phone,
      amount: order.totalAmount,
      provider: dto.provider,
      status: response.success ? PaymentStatus.PENDING : PaymentStatus.FAILED,
      providerRequestId: response.providerRequestId,
      failureReason: response.success ? null : response.message,
    });
    await this.paymentRepo.save(payment);
    if (!response.success) throw new BadRequestException(response.message);

    return {
      message: response.message,
      providerRequestId: response.providerRequestId,
      provider: dto.provider,
    };
  }

  async handleCallback(body: any, providerName: string) {
    this.logger.log(`Callback from ${providerName}`, JSON.stringify(body));
    const provider = this.getProvider(providerName);
    const result = provider.parseCallback(body);

    const payment = await this.paymentRepo.findOne({
      where: { providerRequestId: result.providerRequestId },
    });
    if (!payment) {
      this.logger.warn(
        `No payment found for requestId: ${result.providerRequestId}`,
      );
      return { message: 'OK' };
    }

    // Idempotency — a settled payment is terminal. Without this, a
    // duplicated webhook delivery (normal for mobile-money providers) or a
    // forged replay re-runs order confirmation every time it arrives.
    if (payment.status === PaymentStatus.SUCCESS) {
      this.logger.log(
        `Callback for already-settled payment ${result.providerRequestId} ignored`,
      );
      return { message: 'OK' };
    }

    if (result.success) {
      payment.status = PaymentStatus.SUCCESS;
      payment.providerReference = result.providerReference ?? null;
      await this.paymentRepo.save(payment);
      if (payment.order) {
        await this.autoConfirmOrder(payment.order.id);
      }
    } else {
      payment.status = PaymentStatus.FAILED;
      payment.failureReason = result.failureReason ?? null;
      await this.paymentRepo.save(payment);
    }
    return { message: 'OK' };
  }

  async getMyPayments(user: User) {
    return this.paymentRepo.find({
      where: { user: { id: user.id } },
      order: { createdAt: 'DESC' },
    });
  }

  // ── Admin: all payments across all users ─────────────────────────────────
  async getAllPayments() {
    return this.paymentRepo.find({
      order: { createdAt: 'DESC' },
      relations: { order: { product: true }, user: true },
      take: 200,
    });
  }

  async getPaymentByOrder(orderId: number, user: User) {
    const payment = await this.paymentRepo.findOne({
      where: { order: { id: orderId }, user: { id: user.id } },
    });
    if (!payment)
      throw new NotFoundException('Payment not found for this order');
    return payment;
  }

  async publicLookupInvoice(
    invoiceNumber: string,
  ): Promise<InvoiceLookupResult> {
    return this.lookupAnyInvoice(invoiceNumber);
  }

  async customerPayInvoice(
    invoiceNumber: string | undefined,
    phone: string,
    provider: string,
    user: User,
    orderId?: number,
  ) {
    // ── Self-heal: if invoiceNumber is missing/blank but we have an orderId
    // (checkout always knows this), look up — or create on the spot — the
    // invoice for that order. This covers the case where invoice creation
    // silently failed at order-placement time, which previously left the
    // buyer stuck on "Invoice number is required" with no way to pay at all.
    if (!invoiceNumber?.trim() && orderId) {
      let existing = await this.invoiceRepo.findOne({
        where: { order: { id: orderId } },
      });
      if (!existing) {
        const order = await this.orderRepo.findOne({ where: { id: orderId } });
        if (!order) throw new NotFoundException(`Order #${orderId} not found`);
        existing = await this.invoicesService.createForOrder(order);
      }
      invoiceNumber = existing.invoiceNumber;
    }

    if (!invoiceNumber?.trim())
      throw new BadRequestException('Invoice number is required');
    if (!phone?.trim())
      throw new BadRequestException('Phone number is required');
    const found = await this.lookupAnyInvoice(invoiceNumber);
    this.validatePayable(found);
    await this.assertNoPendingPaymentForInvoice(invoiceNumber);

    const reference = `KNT-CUST-${found.invoiceId}-${Date.now()}`;
    const providerService = this.getProvider(provider);
    const response = await providerService.initiatePayment({
      phone,
      amount: found.amount,
      reference,
      description: `Kentexa payment for invoice ${invoiceNumber}`,
    });
    if (!response.success) throw new BadRequestException(response.message);

    const meta = JSON.stringify({
      invoiceType: found.invoiceType,
      invoiceNumber: found.invoiceNumber,
      invoiceId: found.invoiceId,
      orderId: found.orderId,
    });

    const payment = this.paymentRepo.create({
      user,
      amount: found.amount,
      provider: provider,
      status: PaymentStatus.PENDING,
      providerRequestId: response.providerRequestId,
      phone,
      metadata: meta,
    });
    await this.paymentRepo.save(payment);

    if (found.invoiceType === 'order') {
      await this.invoiceRepo.update(
        { invoiceNumber },
        { status: InvoiceStatus.PAYMENT_PROCESSING, paymentMethod: provider },
      );
    }

    return {
      success: true,
      message: response.message,
      providerRequestId: response.providerRequestId,
      invoiceNumber,
      amount: found.amount,
      phone,
      provider,
    };
  }

  async agentLookupInvoice(
    invoiceNumber: string,
    agentUser: User,
  ): Promise<InvoiceLookupResult> {
    if (!invoiceNumber?.trim())
      throw new BadRequestException('Invoice number is required');
    const agent = await this.agentRepo.findOne({
      where: { user: { id: agentUser.id } },
    });
    if (!agent) throw new BadRequestException('You are not a registered agent');
    if ((agent as any).status !== 'approved')
      throw new BadRequestException('Your agent account is not approved');
    const found = await this.lookupAnyInvoice(invoiceNumber);
    this.validatePayable(found);
    return found;
  }

  async agentInitiatePayment(
    invoiceNumber: string,
    agentPhone: string,
    provider: string,
    agentUser: User,
  ) {
    if (!invoiceNumber?.trim())
      throw new BadRequestException('Invoice number is required');
    if (!agentPhone?.trim())
      throw new BadRequestException('Phone number is required');
    const agent = await this.agentRepo.findOne({
      where: { user: { id: agentUser.id } },
    });
    if (!agent) throw new BadRequestException('You are not a registered agent');
    if ((agent as any).status !== 'approved')
      throw new BadRequestException('Your agent account is not approved');

    const found = await this.lookupAnyInvoice(invoiceNumber);
    this.validatePayable(found);
    await this.assertNoPendingPaymentForInvoice(invoiceNumber);
    const reference = `KNT-AGT-${found.invoiceId}-${Date.now()}`;
    const providerService = this.getProvider(provider);
    const response = await providerService.initiatePayment({
      phone: agentPhone,
      amount: found.amount,
      reference,
      description: `Kentexa agent payment for invoice ${invoiceNumber}`,
    });
    if (!response.success) throw new BadRequestException(response.message);

    const meta = JSON.stringify({
      invoiceType: found.invoiceType,
      invoiceNumber: found.invoiceNumber,
      invoiceId: found.invoiceId,
      orderId: found.orderId,
      agentId: agent.id,
    });

    const payment = this.paymentRepo.create({
      amount: found.amount,
      provider: provider,
      status: PaymentStatus.PENDING,
      providerRequestId: response.providerRequestId,
      phone: agentPhone,
      metadata: meta,
    });
    await this.paymentRepo.save(payment);

    if (found.invoiceType === 'order') {
      await this.invoiceRepo.update(
        { invoiceNumber },
        {
          status: InvoiceStatus.PAYMENT_PROCESSING,
          paymentMethod: provider,
          agentId: agent.id,
        },
      );
    }

    return {
      success: true,
      message: response.message,
      providerRequestId: response.providerRequestId,
      invoiceNumber,
      amount: found.amount,
      agentPhone,
      provider,
    };
  }

  async agentPaymentCallback(body: any, providerName: string) {
    this.logger.log(
      `Agent callback from ${providerName}`,
      JSON.stringify(body),
    );
    const providerService = this.getProvider(providerName);
    const result = providerService.parseCallback(body);

    const payment = await this.paymentRepo.findOne({
      where: { providerRequestId: result.providerRequestId },
      relations: { order: { buyer: true, product: true } },
    });

    if (!payment) {
      this.logger.warn(
        `No payment found for requestId: ${result.providerRequestId}`,
      );
      return { message: 'OK' };
    }

    // Idempotency — see handleCallback() above for why this matters. Without
    // it, a replayed/duplicated callback re-runs recordAgentCommission()
    // and double-credits agent earnings on every redelivery.
    if (payment.status === PaymentStatus.SUCCESS) {
      this.logger.log(
        `Agent callback for already-settled payment ${result.providerRequestId} ignored`,
      );
      return { message: 'OK' };
    }

    let meta: any = {};
    try {
      meta = JSON.parse((payment as any).metadata || '{}');
    } catch (e) {
      this.logger.warn(`Failed to parse payment metadata: ${e.message}`);
    }

    const invoiceType = meta.invoiceType || 'order';
    const invoiceNumber = meta.invoiceNumber || null;
    const orderId = meta.orderId || payment.order?.id || null;
    const agentId = meta.agentId || null;

    if (!result.success) {
      payment.status = PaymentStatus.FAILED;
      payment.failureReason = result.failureReason ?? null;
      await this.paymentRepo.save(payment);
      if (invoiceType === 'order' && orderId) {
        await this.invoiceRepo.update(
          { order: { id: orderId } },
          { status: InvoiceStatus.AWAITING_PAYMENT, agentId: null },
        );
      }
      return { message: 'OK' };
    }

    const transactionRef = result.providerReference ?? `KNT-TXN-${Date.now()}`;
    payment.status = PaymentStatus.SUCCESS;
    payment.providerReference = transactionRef;
    await this.paymentRepo.save(payment);

    let orderInvoice: Invoice | null = null;

    if (invoiceType === 'order' && orderId) {
      // ✅ AUTO-CONFIRM — also sends orderPaid SMS + email to buyer & seller
      await this.autoConfirmOrder(orderId);

      orderInvoice = await this.invoiceRepo.findOne({
        where: { order: { id: orderId } },
      });
      if (orderInvoice) {
        orderInvoice.status = InvoiceStatus.PAID;
        orderInvoice.paidAt = new Date();
        orderInvoice.transactionReference = transactionRef;
        orderInvoice.receiptNumber = this.generateReceiptNumber();
        orderInvoice.paymentMethod = providerName;
        await this.invoiceRepo.save(orderInvoice);
      }
    } else if (
      (invoiceType === 'classified' || invoiceType === 'manual') &&
      invoiceNumber
    ) {
      await this.classifiedInvoiceRepo.update(
        { invoiceNumber },
        {
          status: ClassifiedInvoiceStatus.PAID,
          paidAt: new Date(),
          transactionReference: transactionRef,
          paymentMethod: providerName,
        },
      );

      // 📱 SMS (1 of 3 allowed event — orderPaid equivalent for classifieds) + 📧 Email
      try {
        const fullInvoice = await this.classifiedInvoiceRepo.findOne({
          where: { invoiceNumber },
          relations: { buyer: true, seller: true },
        });
        if (fullInvoice) {
          const msgParts = (fullInvoice.buyerMessage || '').split(' | ');
          const buyerName =
            msgParts
              .find((p) => p.startsWith('Name:'))
              ?.replace('Name: ', '') ||
            fullInvoice.buyer?.name ||
            'Customer';
          const buyerPhone =
            msgParts
              .find((p) => p.startsWith('Phone:'))
              ?.replace('Phone: ', '') ||
            fullInvoice.buyer?.phone ||
            null;
          await this.notificationsService.classifiedInvoicePaid(
            {
              email: fullInvoice.buyer?.email,
              phone: buyerPhone,
              name: buyerName,
            },
            {
              email: fullInvoice.seller?.email,
              phone: fullInvoice.seller?.phone,
              name: fullInvoice.seller?.name,
            },
            invoiceNumber,
            Number(fullInvoice.amount || 0),
          );
        }
      } catch (err) {
        this.logger.warn(
          `Failed to send classifiedInvoicePaid notifications: ${err.message}`,
        );
      }
    }

    if (agentId) {
      await this.recordAgentCommission(
        agentId,
        Number(payment.amount),
        transactionRef,
        providerName,
        orderInvoice,
        orderId,
      );
    }

    this.logger.log(
      `Payment confirmed & order auto-confirmed: ${transactionRef} type=${invoiceType}`,
    );
    return { message: 'OK' };
  }

  async mockAgentCallback(providerRequestId: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException(
        'Mock payment confirmation is not available in production.',
      );
    }
    return this.agentPaymentCallback(
      {
        status: 'SUCCESS',
        providerRequestId,
        transactionId: `MOCK-TXN-${Date.now()}`,
      },
      'mock',
    );
  }

  async getAgentDashboard(agentUser: User) {
    const agent = await this.agentRepo.findOne({
      where: { user: { id: agentUser.id } },
    });
    if (!agent) throw new NotFoundException('Agent profile not found');

    const transactions = await this.agentTransactionRepo.find({
      where: { agent: { id: agent.id } },
      order: { createdAt: 'DESC' },
      take: 20,
      relations: { invoice: { order: { buyer: true } } },
    });

    const confirmed = transactions.filter(
      (t) => t.status === AgentTransactionStatus.CONFIRMED,
    );
    const pending = transactions.filter(
      (t) => t.status === AgentTransactionStatus.PENDING,
    );

    return {
      stats: {
        totalTransactions: transactions.length,
        confirmedEarnings: confirmed.reduce(
          (s, t) => s + Number(t.commissionAmount),
          0,
        ),
        pendingEarnings: pending.reduce(
          (s, t) => s + Number(t.commissionAmount),
          0,
        ),
        commissionRate: Number(agent.commissionRate ?? 2.5),
      },
      recentTransactions: transactions,
    };
  }
}
