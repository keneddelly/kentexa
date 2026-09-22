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
  OrderStatus,
  OrderPaymentMethod,
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
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import { CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';
import { WalletService } from '../wallet/wallet.service';
import { ReputationService } from '../reputation/reputation.service';
import { ReputationEventType } from '../reputation/entities/reputation-event.entity';
import { ConversationService } from '../business/conversation.service';
import { BusinessCustomerService } from '../business/business-customer.service';
import { CommunicationEngineService } from '../communication/communication-engine.service';
import { PaymentConfirmationService, ConfirmationOutcome } from './payment-confirmation.service';
import { deriveOrderPaymentObligation } from './order-payment-obligation';
import { parseAmountToMinor, minorToNumber } from './payment-money';
import { generateProviderReference } from './provider-reference';
import { isProviderEnabled } from './enabled-providers';
import { ProviderVerification } from './providers/payment-provider.interface';

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
  // For a COD invoice this is the UPFRONT amount actually chargeable right
  // now via the payment gateway — never the full transaction total. Every
  // caller that initiates a real payment (customerPayInvoice/
  // agentInitiatePayment) must keep charging exactly `amount`, not
  // `fullAmount`, or a COD buyer would be charged the whole price upfront.
  amount: number;
  dueDate: Date | null;
  status: string;
  isCod?: boolean;
  fullAmount?: number;
  remainingBalance?: number;
}

// NOT_YET_SETTLED is deliberately excluded — a provider PENDING/PROCESSING result is not a failure
// and must never reset an invoice for retry (that would let a second payment attempt race the first).
const FAILURE_OUTCOMES = new Set([
  'PROVIDER_NOT_SUCCESS',
  'AMOUNT_MISMATCH',
  'CURRENCY_MISMATCH',
  'REFERENCE_REUSED',
  'MISSING_PROVIDER_REFERENCE',
  'OBLIGATION_MISMATCH',
  'PURPOSE_MISMATCH',
  'OBLIGATION_UNRESOLVABLE',
]);

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  /** S0 Decision 12 — no reconciliation poller; this is the only rate limit needed: an explicit,
   * admin-triggered re-verify of one payment, throttled per payment so a mis-click can't hammer the provider. */
  private readonly lastVerifyAttemptAt = new Map<number, number>();
  private static readonly VERIFY_COOLDOWN_MS = 15_000;

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
    private activityEvents: ActivityEventService,
    private commerceProfiles: CommerceProfilesService,
    private walletService: WalletService,
    private reputationService: ReputationService,
    private conversationService: ConversationService,
    private businessCustomerService: BusinessCustomerService,
    private communicationEngine: CommunicationEngineService,
    private paymentConfirmation: PaymentConfirmationService,
  ) {}

  // ── Provider selection ──────────────────────────────────────────────────
  // S0: provider IMPLEMENTATION (the adapter exists in code) and provider
  // ACTIVATION (it may actually be used against a real checkout) are
  // separate. In production, a provider is reachable ONLY when it is both
  // recognised here AND present in PAYMENTS_ENABLED_PROVIDERS (default
  // EMPTY) — so simply deploying this code activates nothing.
  private getProvider(provider: string): IPaymentProvider {
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`[DEV] Using mock payment provider instead of ${provider}`);
      return this.mockAgentService;
    }
    const normalized = (provider || '').toLowerCase();
    if (!isProviderEnabled(normalized)) {
      throw new BadRequestException(`Payment provider "${provider}" is not enabled`);
    }
    if (normalized === 'clickpesa') return this.clickPesaService;
    if (normalized === 'selcom') return this.selcomService;
    if (USE_INDIVIDUAL_NETWORKS) {
      if (normalized === 'vodacom') return this.vodacomService;
      if (normalized === 'airtel') return this.airtelService;
    }
    throw new BadRequestException(`Payment provider "${provider}" is not supported`);
  }

  /** Never throws — used from unauthenticated webhook routes, where a disabled/unknown provider is just ignored, not a 500. */
  private getProviderSafe(provider: string): IPaymentProvider | null {
    try {
      return this.getProvider(provider);
    } catch {
      return null;
    }
  }

  // ── Canonical post-confirmation side effects (notifications only — every
  // financial write already happened inside PaymentConfirmationService's
  // own transaction). Only ever called for a CONFIRMED outcome, and only
  // fires the notification matching what ACTUALLY transitioned, so a retry
  // that lands on ALREADY_CONFIRMED/INELIGIBLE never DOUBLE-notifies anyone.
  //
  // C7 correction — documented limitation, not a guarantee: this is NOT
  // retry-safe delivery. If a notification call below throws on the ONE
  // winning confirmation (the only time this method ever runs for that
  // Payment), a later provider retry of the same webhook finds the Payment
  // already SUCCESS and returns { message: 'OK' } from handleCallback/
  // agentPaymentCallback WITHOUT calling this method again — the financial
  // state is correct and exactly-once, but that one notification is simply
  // never redelivered. Each notification step below is independently
  // try/caught and logged, so a failure is visible in logs, but nothing
  // here or in the callback response should be read as promising automatic
  // redelivery. Real redelivery needs an outbox/durable-queue, which is
  // explicitly deferred to S1/S2 (Decision 14) — this is the smallest
  // correct thing to say about it in S0, not a fix for it. ──────────────
  private async dispatchConfirmationSideEffects(outcome: ConfirmationOutcome): Promise<void> {
    if (outcome.status !== 'CONFIRMED') return;
    if (outcome.orderId) {
      if (outcome.orderTransition === 'DIGITAL_COMPLETED') {
        await this.sendDigitalOrderCompletedNotifications(outcome.orderId);
      } else if (outcome.orderTransition === 'ORDER_PAID' || outcome.orderTransition === 'COD_DEPOSIT_CONFIRMED') {
        await this.sendOrderPaidNotifications(outcome.orderId);
      }
      // INELIGIBLE — the order itself was not touched (Decision 10/11): no notification.
    } else if (outcome.classifiedInvoiceNumber && outcome.classifiedTransitioned) {
      await this.sendClassifiedInvoicePaidNotifications(outcome.classifiedInvoiceNumber);
    }
  }

  /** Shared tail for every source that can carry an agentId (agent-collected payments) — agent commission only ever runs on a genuine CONFIRMED transition, and a failed verification resets the invoice for retry exactly as before. */
  private async finalizeAgentAwareConfirmation(
    payment: Payment,
    outcome: ConfirmationOutcome,
    providerName: string,
    agentId: number | null,
  ): Promise<void> {
    if (outcome.status === 'CONFIRMED') {
      await this.dispatchConfirmationSideEffects(outcome);
      if (agentId) {
        const fresh = await this.paymentRepo.findOne({ where: { id: payment.id } });
        const orderInvoice = outcome.orderId
          ? await this.invoiceRepo.findOne({ where: { order: { id: outcome.orderId } } })
          : null;
        await this.recordAgentCommission(
          agentId,
          Number(payment.amount),
          fresh?.providerReference || `KNT-TXN-${Date.now()}`,
          providerName,
          orderInvoice,
          outcome.orderId,
        );
      }
    } else if (FAILURE_OUTCOMES.has(outcome.status)) {
      let meta: any = {};
      try {
        meta = payment.metadata ? JSON.parse(payment.metadata) : {};
      } catch {
        /* ignore */
      }
      if (meta.invoiceType === 'order' && meta.orderId) {
        await this.invoiceRepo.update({ order: { id: meta.orderId } }, { status: InvoiceStatus.AWAITING_PAYMENT, agentId: null });
      }
    }
  }

  // ── Order-paid notifications (extracted from the old autoConfirmOrder —
  // the order/invoice DB transition itself now happens exclusively inside
  // PaymentConfirmationService; this method is notification-only) ────────
  private async sendOrderPaidNotifications(orderId: number): Promise<void> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: { buyer: true, seller: true, product: true },
    });
    if (!order) return;

    if (order.buyer && order.seller) {
      try {
        const invoice = await this.invoiceRepo.findOne({ where: { order: { id: orderId } } }).catch(() => null);
        if (invoice) {
          const customer = await this.businessCustomerService.findOrCreateForChat(order.seller.id, {
            id: order.buyer.id,
            name: order.buyer.name || 'Mnunuzi',
            phone: order.buyer.phone,
            email: order.buyer.email,
          });
          const convo = await this.conversationService.getOrCreateConversation(order.seller.id, customer.id);
          await this.conversationService.addInvoiceMessage(convo.id, {
            invoiceNumber: invoice.invoiceNumber,
            amount: Number(order.totalAmount || 0),
            paid: true,
            orderId: order.id,
          });
        }
      } catch (err: any) {
        this.logger.warn(`Invoice-paid chat message failed for order #${orderId} (non-critical): ${err.message}`);
      }
    }

    const isCod = order.paymentMethod === OrderPaymentMethod.COD;

    // Receipt numbering — best-effort follow-up, same non-transactional shape this codebase already
    // used before S0 (the counter's own transaction is independent of the confirmation transaction).
    try {
      const invoice = await this.invoiceRepo.findOne({ where: { order: { id: orderId } } });
      if (invoice && !invoice.receiptNumber) {
        await this.invoiceRepo.update(invoice.id, { receiptNumber: await this.invoicesService.generateReceiptNumber() });
      }
    } catch (err: any) {
      this.logger.warn(`Receipt number generation failed for order #${orderId} (non-critical): ${err.message}`);
    }

    try {
      await this.notificationsService.orderPaid(
        { email: order.buyer?.email, phone: order.buyer?.phone, name: order.buyer?.name },
        { email: order.seller?.email, phone: order.seller?.phone, name: order.seller?.name },
        order.id,
        order.product?.name || 'Product',
        Number(order.totalAmount || 0),
        isCod
          ? { upfrontAmount: Number(order.codUpfrontAmount || 0), remainingBalance: Number(order.codRemainingBalance || 0) }
          : undefined,
      );
    } catch (err: any) {
      this.logger.warn(`Failed to send orderPaid notifications for order #${orderId}: ${err.message}`);
    }

    try {
      const recipients = [
        order.buyer ? { userId: order.buyer.id, role: 'buyer', actionPage: 'MyOrders', actionParam: String(order.id) } : null,
        order.seller ? { userId: order.seller.id, role: 'seller', actionPage: 'SellerOrders', actionParam: String(order.id) } : null,
      ].filter((r): r is NonNullable<typeof r> => r !== null);

      await this.communicationEngine.dispatch({
        eventType: isCod ? 'ORDER_PAID_COD' : 'ORDER_PAID',
        sourceType: 'order',
        sourceId: order.id,
        recipients,
        context: {
          orderId: order.id,
          productName: order.product?.name || 'Product',
          amount: Number(order.totalAmount || 0),
          upfrontAmount: Number(order.codUpfrontAmount || 0),
          remainingBalance: Number(order.codRemainingBalance || 0),
        },
      });
    } catch (err: any) {
      this.logger.warn(`Communication engine dispatch failed for order #${orderId}: ${err.message}`);
    }
  }

  // ── Digital-order-completed notifications (extracted from the old
  // completeDigitalOrder — the order transition itself now happens
  // exclusively inside PaymentConfirmationService) ────────────────────────
  private async sendDigitalOrderCompletedNotifications(orderId: number): Promise<void> {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: { buyer: true, seller: true, product: true },
    });
    if (!order) return;
    this.logger.log(`Digital order #${order.id} auto-completed after payment`);

    if (order.seller?.id) {
      await this.walletService
        .creditFromEscrowRelease(order.seller.id, order.id, Number(order.sellerAmount || 0))
        .catch(() => {});
    }

    try {
      if (order.buyer?.id) {
        await this.reputationService.award(order.buyer.id, ReputationEventType.ORDER_COMPLETED, {
          sourceEntityType: 'order',
          sourceEntityId: order.id,
        });
      }
      if (order.seller?.id) {
        await this.reputationService.award(order.seller.id, ReputationEventType.ORDER_COMPLETED, {
          sourceEntityType: 'order',
          sourceEntityId: order.id,
          commerceProfileId: (order as any).commerceProfileId ?? null,
        });
      }
    } catch {
      /* non-critical */
    }

    try {
      await this.notificationsService.orderCompleted(
        { email: order.seller?.email, phone: order.seller?.phone, name: order.seller?.name },
        { email: order.buyer?.email, phone: order.buyer?.phone, name: order.buyer?.name },
        order.id,
        Number(order.sellerAmount || 0),
      );
    } catch (err: any) {
      this.logger.warn(`Failed to send orderCompleted notifications for order #${order.id}: ${err.message}`);
    }

    try {
      const recipients = [
        order.buyer ? { userId: order.buyer.id, role: 'buyer', actionPage: 'MyOrders', actionParam: String(order.id) } : null,
        order.seller ? { userId: order.seller.id, role: 'seller', actionPage: 'SellerOrders', actionParam: String(order.id) } : null,
      ].filter((r): r is NonNullable<typeof r> => r !== null);

      await this.communicationEngine.dispatch({
        eventType: 'ORDER_COMPLETED',
        sourceType: 'order',
        sourceId: order.id,
        recipients,
        context: { orderId: order.id, productName: order.product?.name || 'Product', sellerAmount: Number(order.sellerAmount || 0) },
      });
    } catch (err: any) {
      this.logger.warn(`Communication engine dispatch failed for completed digital order #${order.id}: ${err.message}`);
    }

    const sellerProfile = order.seller?.id
      ? await this.commerceProfiles.findForUserByType(order.seller.id, CommerceProfileType.BUSINESS).catch(() => null)
      : null;
    this.activityEvents.record({
      eventType: 'ORDER_COMPLETED',
      category: ActivityCategory.COMMERCE,
      actorId: order.buyer?.id ?? null,
      actorType: 'buyer',
      businessId: sellerProfile?.id ?? null,
      relatedUserId: order.seller?.id ?? null,
      targetType: 'order',
      targetId: order.id,
      metadata: { totalAmount: order.totalAmount, digital: true },
    });
  }

  // ── Classified/manual-invoice-paid notifications (extracted from the old
  // markClassifiedInvoicePaidFromWebhook — the status flip itself now
  // happens exclusively inside PaymentConfirmationService) ───────────────
  private async sendClassifiedInvoicePaidNotifications(invoiceNumber: string): Promise<void> {
    try {
      const fullInvoice = await this.classifiedInvoiceRepo.findOne({
        where: { invoiceNumber },
        relations: { buyer: true, seller: true },
      });
      if (fullInvoice) {
        const msgParts = (fullInvoice.buyerMessage || '').split(' | ');
        const buyerName = msgParts.find((p) => p.startsWith('Name:'))?.replace('Name: ', '') || fullInvoice.buyer?.name || 'Customer';
        const buyerPhone = msgParts.find((p) => p.startsWith('Phone:'))?.replace('Phone: ', '') || fullInvoice.buyer?.phone || null;
        await this.notificationsService.classifiedInvoicePaid(
          { email: fullInvoice.buyer?.email, phone: buyerPhone, name: buyerName },
          { email: fullInvoice.seller?.email, phone: fullInvoice.seller?.phone, name: fullInvoice.seller?.name },
          invoiceNumber,
          Number(fullInvoice.amount || 0),
        );
      }
    } catch (err: any) {
      this.logger.warn(`Failed to send classifiedInvoicePaid notifications: ${err.message}`);
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

    this.logger.log(`Escrow released for order #${orderId} by admin #${adminId}`);

    try {
      if (order.seller) {
        await this.notificationsService.orderCompleted(
          { email: order.seller.email, phone: order.seller.phone, name: order.seller.name },
          { email: order.buyer?.email, phone: order.buyer?.phone, name: order.buyer?.name },
          order.id,
          Number(order.sellerAmount || order.totalAmount || 0),
        );

        const recipients = [
          order.buyer ? { userId: order.buyer.id, role: 'buyer', actionPage: 'MyOrders', actionParam: String(order.id) } : null,
          { userId: order.seller.id, role: 'seller', actionPage: 'SellerOrders', actionParam: String(order.id) },
        ].filter((r): r is NonNullable<typeof r> => r !== null);

        await this.communicationEngine.dispatch({
          eventType: 'ORDER_COMPLETED',
          sourceType: 'order',
          sourceId: order.id,
          recipients,
          context: { orderId: order.id, productName: order.product?.name || 'Product', sellerAmount: Number(order.sellerAmount || order.totalAmount || 0) },
        });
      }
    } catch {
      /* non-critical */
    }
  }

  // ── Get payout summary for admin ─────────────────────────────────────────
  async getPayoutSummary(): Promise<{ pendingEscrow: number; releasedToday: number; totalReleased: number; pendingOrders: number }> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [pending, releasedToday, totalReleased] = await Promise.all([
      this.orderRepo.createQueryBuilder('o').select('SUM(o.sellerAmount)', 'total').where("o.escrowStatus = 'holding'").andWhere("o.paymentStatus = 'paid'").getRawOne(),
      this.orderRepo.createQueryBuilder('o').select('SUM(o.sellerAmount)', 'total').where("o.escrowStatus = 'released'").andWhere('o.fundsReleasedAt >= :today', { today }).getRawOne(),
      this.orderRepo.createQueryBuilder('o').select('SUM(o.sellerAmount)', 'total').where("o.escrowStatus = 'released'").getRawOne(),
    ]);

    const pendingCount = await this.orderRepo.count({ where: { paymentStatus: 'paid' as any, escrowStatus: 'holding' as any } });

    return {
      pendingEscrow: Number(pending?.total || 0),
      releasedToday: Number(releasedToday?.total || 0),
      totalReleased: Number(totalReleased?.total || 0),
      pendingOrders: pendingCount,
    };
  }

  async lookupAnyInvoice(invoiceNumber: string): Promise<InvoiceLookupResult> {
    if (!invoiceNumber || typeof invoiceNumber !== 'string' || !invoiceNumber.trim()) {
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
      const parsedName = msgParts.find((p) => p.startsWith('Name:'))?.replace('Name: ', '') || classifiedInvoice.buyer?.name || '—';
      const parsedPhone = msgParts.find((p) => p.startsWith('Phone:'))?.replace('Phone: ', '') || classifiedInvoice.buyer?.phone || '—';

      return {
        invoiceNumber: classifiedInvoice.invoiceNumber ?? invoiceNumber,
        invoiceType: isManual ? 'manual' : 'classified',
        invoiceId: classifiedInvoice.id,
        orderId: null,
        customerName: parsedName,
        customerPhone: parsedPhone,
        productName: classifiedInvoice.invoiceDescription || classifiedInvoice.classified?.title || '—',
        sellerName: classifiedInvoice.seller?.name || classifiedInvoice.seller?.email || '—',
        quantity: 1,
        amount: classifiedInvoice.isCod ? Number(classifiedInvoice.codUpfrontAmount || 0) : Number(classifiedInvoice.amount),
        dueDate: classifiedInvoice.dueDate,
        status: classifiedInvoice.status,
        isCod: classifiedInvoice.isCod,
        fullAmount: Number(classifiedInvoice.amount),
        remainingBalance: classifiedInvoice.isCod ? Number(classifiedInvoice.codRemainingBalance || 0) : 0,
      };
    }

    throw new NotFoundException(`Invoice ${cleanInvoiceNumber} not found. Please check the invoice number and try again.`);
  }

  private validatePayable(invoice: InvoiceLookupResult): void {
    if (invoice.status === 'paid') throw new BadRequestException('This invoice is already paid');
    if (invoice.status === 'cancelled') throw new BadRequestException('This invoice has been cancelled');
    if (invoice.status === 'expired') throw new BadRequestException('This invoice has expired');
  }

  private async assertNoPendingPaymentForInvoice(invoiceNumber: string): Promise<void> {
    const existingPending = await this.paymentRepo
      .createQueryBuilder('p')
      .where('p.status = :status', { status: PaymentStatus.PENDING })
      .andWhere('p.metadata LIKE :needle', { needle: `%"invoiceNumber":"${invoiceNumber}"%` })
      .getOne();
    if (existingPending) {
      throw new BadRequestException('A payment is already in progress for this invoice. Check your phone, or wait a moment before retrying.');
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
    const paymentAgentProfile = await this.commerceProfiles.findForUserByType(agent.user.id, CommerceProfileType.AGENT).catch(() => null);
    this.activityEvents.record({
      eventType: 'COMMISSION_EARNED',
      category: ActivityCategory.AGENT,
      businessId: paymentAgentProfile?.id ?? null,
      relatedUserId: agent.user.id,
      targetType: 'agent_transaction',
      metadata: { commissionAmount: commission, source: paymentMethod, orderId: orderId ?? null },
    });

    agent.totalEarnings = Number(agent.totalEarnings) + commission;
    agent.totalTransactions = Number(agent.totalTransactions) + 1;
    agent.totalEarningsPayments = Number(agent.totalEarningsPayments) + commission;
    agent.pendingEarnings = Number(agent.pendingEarnings) + commission;
    await this.agentRepo.save(agent);

    if (orderId) {
      const payout = await this.payoutRepo.findOne({ where: { order: { id: orderId } } });
      if (payout) {
        payout.agentCommission = commission;
        payout.sellerAmount = parseFloat((Number(payout.sellerAmount) - commission).toFixed(2));
        await this.payoutRepo.save(payout);
      }
      const order = await this.orderRepo.findOne({ where: { id: orderId } });
      if (order) {
        await this.orderRepo.update(orderId, {
          agentCommissionAmount: commission,
          sellerAmount: parseFloat((Number(order.totalAmount) - Number(order.platformFeeAmount) - commission).toFixed(2)),
        });
      }
    }
  }

  // ── Payment initiation — the amount is ALWAYS the server-derived
  // obligation (deriveOrderPaymentObligation), never a frontend value; the
  // reference is ALWAYS our own compliant generator, never built inline
  // per-call-site (Decision 8). ───────────────────────────────────────────
  async initiatePayment(dto: InitiatePaymentDto, user: User) {
    const order = await this.orderRepo.findOne({ where: { id: dto.orderId, buyer: { id: user.id } } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException('This order is not currently payable');
    }

    const existingPending = await this.paymentRepo.findOne({ where: { order: { id: order.id }, status: PaymentStatus.PENDING } });
    if (existingPending) {
      throw new BadRequestException('A payment is already in progress for this order. Check your phone, or wait a moment before retrying.');
    }

    const obligation = deriveOrderPaymentObligation(order);
    if (obligation.purpose === 'COD_DEPOSIT' && obligation.requiredMinor === 0) {
      // S0 Decision 9: zero-upfront COD is never activated through the online-payment path.
      throw new BadRequestException('This order does not require an online payment');
    }
    const amount = minorToNumber(obligation.requiredMinor);
    const provider = this.getProvider(dto.provider);
    const reference = generateProviderReference();

    // C3: the canonical invoice for this order (if any) is stamped into the Payment's own
    // metadata now, so PaymentEvidence's exact-invoice-binding check has something real to compare
    // against later — not left to default to "no invoice expected" just because this code path
    // never looked it up.
    const orderInvoice = await this.invoiceRepo.findOne({ where: { order: { id: order.id } } });

    // C1: the Payment row is created PENDING and durable, bound to the order, with our own
    // provider-compliant reference as providerRequestId, BEFORE the provider is ever contacted. A
    // webhook racing the initiation call can already find this row; a crash between the DB write
    // and the provider call is a stuck PENDING payment (safely re-verifiable / expires), never a
    // provider charge with no Kentexa record at all.
    const payment = await this.paymentRepo.save(
      this.paymentRepo.create({
        order,
        user,
        phone: dto.phone,
        amount,
        provider: dto.provider,
        status: PaymentStatus.PENDING,
        providerRequestId: reference,
        metadata: JSON.stringify({ purpose: obligation.purpose, invoiceType: 'order', orderId: order.id, invoiceNumber: orderInvoice?.invoiceNumber ?? null }),
      }),
    );

    let response;
    try {
      response = await provider.initiatePayment({
        phone: dto.phone,
        amount,
        reference,
        description: `Payment for Order #${order.id} on Kentexa`,
      });
    } catch (err: any) {
      await this.paymentRepo.update(payment.id, { status: PaymentStatus.FAILED, failureReason: err.message || 'Provider request failed' });
      throw new BadRequestException('Payment initiation failed');
    }

    if (!response.success) {
      await this.paymentRepo.update(payment.id, { status: PaymentStatus.FAILED, failureReason: response.message });
      throw new BadRequestException(response.message);
    }
    // Every adapter is designed to echo our own reference back — but if a future provider ever
    // assigns its own id instead, the SAME row is updated to match what its callback will carry,
    // never a second row.
    if (response.providerRequestId && response.providerRequestId !== reference) {
      await this.paymentRepo.update(payment.id, { providerRequestId: response.providerRequestId });
    }

    return { message: response.message, providerRequestId: response.providerRequestId || reference, provider: dto.provider };
  }

  // ── Provider webhooks — SIGNAL ONLY. The callback body never confirms
  // anything by itself; it only identifies which Payment to go re-verify
  // with the provider's own authoritative query (Decision 3). ───────────
  async handleCallback(body: any, providerName: string) {
    this.logger.log(`Callback from ${providerName}`, JSON.stringify(body));
    const provider = this.getProviderSafe(providerName);
    if (!provider) return { message: 'OK' };

    const signal = provider.parseCallbackSignal(body);
    if (!signal) {
      this.logger.warn(`Callback from ${providerName} carried no identifiable reference`);
      return { message: 'OK' };
    }

    const payment = await this.paymentRepo.findOne({ where: { providerRequestId: signal.providerRequestId } });
    if (!payment) {
      this.logger.warn(`No payment found for requestId: ${signal.providerRequestId}`);
      return { message: 'OK' };
    }
    if (payment.status === PaymentStatus.SUCCESS) {
      this.logger.log(`Callback for already-settled payment ${signal.providerRequestId} ignored`);
      return { message: 'OK' };
    }

    const verification = await provider.verifyPayment(signal.providerRequestId);
    const outcome = await this.paymentConfirmation.confirmVerifiedPayment(payment.id, verification);
    await this.dispatchConfirmationSideEffects(outcome);
    return { message: 'OK' };
  }

  async customerPayInvoice(invoiceNumber: string | undefined, phone: string, provider: string, user: User, orderId?: number) {
    if (!invoiceNumber?.trim() && orderId) {
      let existing = await this.invoiceRepo.findOne({ where: { order: { id: orderId } } });
      if (!existing) {
        const order = await this.orderRepo.findOne({ where: { id: orderId } });
        if (!order) throw new NotFoundException(`Order #${orderId} not found`);
        existing = await this.invoicesService.createForOrder(order);
      }
      invoiceNumber = existing.invoiceNumber;
    }

    if (!invoiceNumber?.trim()) throw new BadRequestException('Invoice number is required');
    if (!phone?.trim()) throw new BadRequestException('Phone number is required');
    const found = await this.lookupAnyInvoice(invoiceNumber);
    this.validatePayable(found);
    await this.assertNoPendingPaymentForInvoice(invoiceNumber);

    let purpose: 'ORDER_FULL' | 'COD_DEPOSIT' | 'CLASSIFIED_INVOICE' = 'CLASSIFIED_INVOICE';
    if (found.invoiceType === 'order' && found.orderId) {
      const order = await this.orderRepo.findOne({ where: { id: found.orderId } });
      purpose = order ? deriveOrderPaymentObligation(order).purpose : 'ORDER_FULL';
    }

    const providerService = this.getProvider(provider);
    const reference = generateProviderReference();
    const meta = JSON.stringify({
      invoiceType: found.invoiceType,
      invoiceNumber: found.invoiceNumber,
      invoiceId: found.invoiceId,
      orderId: found.orderId,
      purpose,
    });

    // C1: durable, order-bound Payment created BEFORE the provider is contacted — see
    // initiatePayment()'s own comment for the full rationale.
    const payment = await this.paymentRepo.save(
      this.paymentRepo.create({
        user,
        amount: found.amount,
        provider,
        status: PaymentStatus.PENDING,
        providerRequestId: reference,
        phone,
        metadata: meta,
        // S0 fix: bind the Payment to its Order for an order-type invoice — this is what makes the
        // NORMAL (non-agent) webhook route actually able to confirm a real Kentexa checkout order.
        ...(found.invoiceType === 'order' && found.orderId ? { order: { id: found.orderId } as any } : {}),
      }),
    );

    let response;
    try {
      response = await providerService.initiatePayment({
        phone,
        amount: found.amount,
        reference,
        description: `Kentexa payment for invoice ${invoiceNumber}`,
      });
    } catch (err: any) {
      await this.paymentRepo.update(payment.id, { status: PaymentStatus.FAILED, failureReason: err.message || 'Provider request failed' });
      throw new BadRequestException('Payment initiation failed');
    }
    if (!response.success) {
      await this.paymentRepo.update(payment.id, { status: PaymentStatus.FAILED, failureReason: response.message });
      throw new BadRequestException(response.message);
    }
    if (response.providerRequestId && response.providerRequestId !== reference) {
      await this.paymentRepo.update(payment.id, { providerRequestId: response.providerRequestId });
    }

    if (found.invoiceType === 'order') {
      await this.invoiceRepo.update({ invoiceNumber }, { status: InvoiceStatus.PAYMENT_PROCESSING, paymentMethod: provider });
    }

    return {
      success: true,
      message: response.message,
      providerRequestId: response.providerRequestId || reference,
      invoiceNumber,
      amount: found.amount,
      phone,
      provider,
    };
  }

  async agentLookupInvoice(invoiceNumber: string, agentUser: User): Promise<InvoiceLookupResult> {
    if (!invoiceNumber?.trim()) throw new BadRequestException('Invoice number is required');
    const agent = await this.agentRepo.findOne({ where: { user: { id: agentUser.id } } });
    if (!agent) throw new BadRequestException('You are not a registered agent');
    if ((agent as any).status !== 'approved') throw new BadRequestException('Your agent account is not approved');
    const found = await this.lookupAnyInvoice(invoiceNumber);
    this.validatePayable(found);
    return found;
  }

  async agentInitiatePayment(invoiceNumber: string, agentPhone: string, provider: string, agentUser: User) {
    if (!invoiceNumber?.trim()) throw new BadRequestException('Invoice number is required');
    if (!agentPhone?.trim()) throw new BadRequestException('Phone number is required');
    const agent = await this.agentRepo.findOne({ where: { user: { id: agentUser.id } } });
    if (!agent) throw new BadRequestException('You are not a registered agent');
    if ((agent as any).status !== 'approved') throw new BadRequestException('Your agent account is not approved');

    const found = await this.lookupAnyInvoice(invoiceNumber);
    this.validatePayable(found);
    await this.assertNoPendingPaymentForInvoice(invoiceNumber);

    let purpose: 'ORDER_FULL' | 'COD_DEPOSIT' | 'CLASSIFIED_INVOICE' = 'CLASSIFIED_INVOICE';
    if (found.invoiceType === 'order' && found.orderId) {
      const order = await this.orderRepo.findOne({ where: { id: found.orderId } });
      purpose = order ? deriveOrderPaymentObligation(order).purpose : 'ORDER_FULL';
    }

    const reference = generateProviderReference();
    const providerService = this.getProvider(provider);
    const meta = JSON.stringify({
      invoiceType: found.invoiceType,
      invoiceNumber: found.invoiceNumber,
      invoiceId: found.invoiceId,
      orderId: found.orderId,
      agentId: agent.id,
      purpose,
    });

    // C1: durable, order-bound Payment created BEFORE the provider is contacted.
    const payment = await this.paymentRepo.save(
      this.paymentRepo.create({
        amount: found.amount,
        provider,
        status: PaymentStatus.PENDING,
        providerRequestId: reference,
        phone: agentPhone,
        metadata: meta,
        ...(found.invoiceType === 'order' && found.orderId ? { order: { id: found.orderId } as any } : {}),
      }),
    );

    let response;
    try {
      response = await providerService.initiatePayment({
        phone: agentPhone,
        amount: found.amount,
        reference,
        description: `Kentexa agent payment for invoice ${invoiceNumber}`,
      });
    } catch (err: any) {
      await this.paymentRepo.update(payment.id, { status: PaymentStatus.FAILED, failureReason: err.message || 'Provider request failed' });
      throw new BadRequestException('Payment initiation failed');
    }
    if (!response.success) {
      await this.paymentRepo.update(payment.id, { status: PaymentStatus.FAILED, failureReason: response.message });
      throw new BadRequestException(response.message);
    }
    if (response.providerRequestId && response.providerRequestId !== reference) {
      await this.paymentRepo.update(payment.id, { providerRequestId: response.providerRequestId });
    }

    if (found.invoiceType === 'order') {
      await this.invoiceRepo.update({ invoiceNumber }, { status: InvoiceStatus.PAYMENT_PROCESSING, paymentMethod: provider, agentId: agent.id });
    }

    return {
      success: true,
      message: response.message,
      providerRequestId: response.providerRequestId || reference,
      invoiceNumber,
      amount: found.amount,
      agentPhone,
      provider,
    };
  }

  async agentPaymentCallback(body: any, providerName: string) {
    this.logger.log(`Agent callback from ${providerName}`, JSON.stringify(body));
    const providerService = this.getProviderSafe(providerName);
    if (!providerService) return { message: 'OK' };

    const signal = providerService.parseCallbackSignal(body);
    if (!signal) return { message: 'OK' };

    const payment = await this.paymentRepo.findOne({ where: { providerRequestId: signal.providerRequestId } });
    if (!payment) {
      this.logger.warn(`No payment found for requestId: ${signal.providerRequestId}`);
      return { message: 'OK' };
    }
    if (payment.status === PaymentStatus.SUCCESS) {
      this.logger.log(`Agent callback for already-settled payment ${signal.providerRequestId} ignored`);
      return { message: 'OK' };
    }

    let meta: any = {};
    try {
      meta = JSON.parse((payment as any).metadata || '{}');
    } catch (e: any) {
      this.logger.warn(`Failed to parse payment metadata: ${e.message}`);
    }

    const verification = await providerService.verifyPayment(signal.providerRequestId);
    const outcome = await this.paymentConfirmation.confirmVerifiedPayment(payment.id, verification);
    await this.finalizeAgentAwareConfirmation(payment, outcome, providerName, meta.agentId ?? null);

    this.logger.log(`Payment confirmation processed: ${signal.providerRequestId} -> ${outcome.status}`);
    return { message: 'OK' };
  }

  async mockAgentCallback(providerRequestId: string) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Mock payment confirmation is not available in production.');
    }
    const payment = await this.paymentRepo.findOne({ where: { providerRequestId } });
    if (!payment) throw new NotFoundException(`No pending payment found for ${providerRequestId}`);

    // Dev-only convenience: the "verification" here is built from OUR OWN already-stored Payment
    // amount, never from anything the caller supplies — see MockAgentService's own comment.
    const verification: ProviderVerification = {
      status: 'SUCCESS',
      amountMinor: parseAmountToMinor(payment.amount),
      currency: 'TZS',
      providerReference: `MOCK-TXN-${Date.now()}`,
    };
    let meta: any = {};
    try {
      meta = payment.metadata ? JSON.parse(payment.metadata) : {};
    } catch {
      /* ignore */
    }
    const outcome = await this.paymentConfirmation.confirmVerifiedPayment(payment.id, verification);
    await this.finalizeAgentAwareConfirmation(payment, outcome, 'mock', meta.agentId ?? null);
    return { message: 'OK' };
  }

  // ── Admin: explicit re-verify (Decision 12 — the deliberately-small
  // alternative to a reconciliation poller). Rate-limited per payment. ───
  async adminVerifyPayment(paymentId: number): Promise<{ message: string; outcome: ConfirmationOutcome }> {
    const now = Date.now();
    const last = this.lastVerifyAttemptAt.get(paymentId) || 0;
    if (now - last < PaymentsService.VERIFY_COOLDOWN_MS) {
      throw new BadRequestException('Verification was already attempted recently for this payment — try again shortly.');
    }
    this.lastVerifyAttemptAt.set(paymentId, now);

    const payment = await this.paymentRepo.findOne({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status === PaymentStatus.SUCCESS) {
      return { message: 'Already confirmed', outcome: { status: 'ALREADY_CONFIRMED', paymentId } };
    }
    if (!payment.providerRequestId) throw new BadRequestException('Payment has no provider reference to verify');

    const provider = this.getProvider(payment.provider);
    const verification = await provider.verifyPayment(payment.providerRequestId);
    const outcome = await this.paymentConfirmation.confirmVerifiedPayment(payment.id, verification);

    let meta: any = {};
    try {
      meta = payment.metadata ? JSON.parse(payment.metadata) : {};
    } catch {
      /* ignore */
    }
    await this.finalizeAgentAwareConfirmation(payment, outcome, payment.provider, meta.agentId ?? null);

    return { message: 'Verification complete', outcome };
  }

  async getMyPayments(user: User) {
    return this.paymentRepo.find({ where: { user: { id: user.id } }, order: { createdAt: 'DESC' } });
  }

  async getAllPayments() {
    return this.paymentRepo.find({ order: { createdAt: 'DESC' }, relations: { order: { product: true }, user: true }, take: 200 });
  }

  async getPaymentByOrder(orderId: number, user: User) {
    const payment = await this.paymentRepo.findOne({ where: { order: { id: orderId }, user: { id: user.id } } });
    if (!payment) throw new NotFoundException('Payment not found for this order');
    return payment;
  }

  async publicLookupInvoice(invoiceNumber: string): Promise<InvoiceLookupResult> {
    return this.lookupAnyInvoice(invoiceNumber);
  }

  async getAgentDashboard(agentUser: User) {
    const agent = await this.agentRepo.findOne({ where: { user: { id: agentUser.id } } });
    if (!agent) throw new NotFoundException('Agent profile not found');

    const transactions = await this.agentTransactionRepo.find({
      where: { agent: { id: agent.id } },
      order: { createdAt: 'DESC' },
      take: 20,
      relations: { invoice: { order: { buyer: true } } },
    });

    const confirmed = transactions.filter((t) => t.status === AgentTransactionStatus.CONFIRMED);
    const pending = transactions.filter((t) => t.status === AgentTransactionStatus.PENDING);

    return {
      stats: {
        totalTransactions: transactions.length,
        confirmedEarnings: confirmed.reduce((s, t) => s + Number(t.commissionAmount), 0),
        pendingEarnings: pending.reduce((s, t) => s + Number(t.commissionAmount), 0),
        commissionRate: Number(agent.commissionRate ?? 2.5),
      },
      recentTransactions: transactions,
    };
  }
}
