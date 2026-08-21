import { randomBytes } from 'crypto';
import { Cron } from '@nestjs/schedule';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  Order,
  OrderStatus,
  PaymentStatus,
  EscrowStatus,
  OrderSource,
} from './entities/order.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { ProductsService } from '../products/products.service';
import { InventoryMovementReason } from '../inventory/entities/inventory-movement.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { InvoicesService } from '../invoices/invoices.service';
import { Payout } from '../payouts/entities/payout.entity';
import { Review } from '../store/review.entity';
import {
  Parcel,
  ParcelStatus,
  ParcelTracking,
} from '../super-agents/entities/parcel.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { Agent } from '../agents/entities/agent.entity';
import {
  AgentTransaction,
  AgentTransactionStatus,
} from '../agents/entities/agent-transaction.entity';
import { NotificationsService } from '../notifications/notifications.service';

const CATEGORY_COMMISSION: Record<string, number> = {
  electronics: 10,
  fashion: 12,
  vehicles: 5,
  food: 10,
  home_garden: 10,
  health_beauty: 10,
  baby_kids: 10,
  sports: 10,
  agriculture: 8,
  security: 8,
  books: 10,
  arts: 10,
  general: 10,
  property: 0,
  services: 0,
};

const getCommissionRate = (category: string): number =>
  CATEGORY_COMMISSION[category] ?? 10;

import { ParcelCollectionsService } from '../parcel-collections/parcel-collections.service';
import { SmsService } from '../sms/sms.service';
import { BusinessCustomerService } from '../business/business-customer.service';
import { SellerScopeService } from '../business/seller-scope.service';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { ReputationService } from '../reputation/reputation.service';
import { ReputationEventType } from '../reputation/entities/reputation-event.entity';
import { WalletService } from '../wallet/wallet.service';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import { CommerceProfileScopeService } from '../commerce-profiles/commerce-profile-scope.service';
import { CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';
import { FRONTEND_URL } from '../config/urls.config';

const calcCommission = (baseAmount: number, category: string) => {
  const TRACKING_FEE = 1000; // TZS 1,000 flat per order — same fee as offline tracking
  const rate = getCommissionRate(category);
  // KenteXa earns:
  //   1. Category % of product price (marketplace commission)
  //   2. TZS 1,000 flat tracking fee (same as offline — covers SMS + system cost)
  // Shipping fee goes entirely to the Super Agent — KenteXa does not take a cut of it
  const categoryFee = parseFloat(((baseAmount * rate) / 100).toFixed(2));
  const platformFee = parseFloat((categoryFee + TRACKING_FEE).toFixed(2));
  // Seller receives full product price minus the marketplace commission
  // Shipping fee is handled separately — paid directly to Super Agent
  const sellerAmount = parseFloat((baseAmount - categoryFee).toFixed(2));
  return { rate, platformFee, sellerAmount };
};

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order) private repo: Repository<Order>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Payout) private payoutRepo: Repository<Payout>,
    @InjectRepository(Parcel) private parcelRepo: Repository<Parcel>,
    @InjectRepository(ParcelTracking)
    private parcelTrackingRepo: Repository<ParcelTracking>,
    @InjectRepository(SuperAgent)
    private superAgentRepo: Repository<SuperAgent>,
    @InjectRepository(Agent) private agentRepo: Repository<Agent>,
    @InjectRepository(AgentTransaction)
    private agentTransactionRepo: Repository<AgentTransaction>,
    @InjectRepository(Review) private reviewRepo: Repository<Review>,
    private productsService: ProductsService,
    private invoicesService: InvoicesService,
    private notificationsService: NotificationsService,
    private reputationService: ReputationService,
    private collectionsService: ParcelCollectionsService,
    private smsService: SmsService,
    private businessCustomerService: BusinessCustomerService,
    private inAppNotif: InAppNotificationService,
    private sellerScope: SellerScopeService,
    private walletService: WalletService,
    private commerceProfiles: CommerceProfilesService,
    private profileScope: CommerceProfileScopeService,
  ) {}

  // ── Create Order ──────────────────────────────────────────────────────────
  async create(dto: CreateOrderDto, user: User) {
    const product = await this.productsService.findOne(dto.productId);
    if (!product.isAvailable)
      throw new BadRequestException('Product not available');
    if (product.stock < dto.quantity)
      throw new BadRequestException('Insufficient stock');

    const basePrice = Number(product.basePrice || 0);
    const chosenMethod =
      (dto as any).shippingMethod || product.shippingMethod || 'agent';

    // Pricing logic:
    // - Dar intra-city (boda/kentexa_delivery): basePrice + bodaFee or flat van fee
    // - Intercity (agent/bus/courier): basePrice + deliveryFee (baked in by seller)
    const bodaFee = Number((product as any).bodaFee || 0);
    const BATCH_FEE = 3000;

    let deliveryFee: number;
    if (chosenMethod === 'boda') {
      // Use bodaFee from DTO if provided (checkout sends it), else product bodaFee
      deliveryFee =
        (dto as any).deliveryFee !== undefined
          ? Number((dto as any).deliveryFee)
          : bodaFee;
    } else if (chosenMethod === 'kentexa_delivery') {
      deliveryFee = BATCH_FEE;
    } else {
      // Intercity — use product's delivery fee
      deliveryFee = Number(product.deliveryFee || 0);
    }

    // ── Collection fee — added to total when seller requests agent pickup ────
    // Buyer pays this as part of delivery, seller not penalised for rural area.
    const needsCollection = Boolean((dto as any).needsCollection);
    const isRuralCollection = Boolean((dto as any).isRuralCollection);
    const collectionFee = needsCollection
      ? Number((dto as any).collectionFee || (isRuralCollection ? 3000 : 1500))
      : 0;

    const totalAmount =
      (basePrice + deliveryFee) * dto.quantity + collectionFee;
    const baseAmount = basePrice * dto.quantity;
    const deliveryAmount = deliveryFee * dto.quantity;
    const category = product.category || 'general';
    const commission = calcCommission(baseAmount, category);

    const order = this.repo.create({
      buyer: user,
      product,
      seller: product.seller ?? null,
      quantity: dto.quantity,
      totalAmount,
      baseAmount,
      deliveryFeeAmount: deliveryAmount,
      platformFeePercent: commission.rate,
      platformFeeAmount: commission.platformFee,
      agentCommissionAmount: 0,
      sellerAmount: commission.sellerAmount,
      deliveryAddress: dto.deliveryAddress,
      phone: dto.phone,
      recipientName: dto.recipientName || null,
      shippingMethod: chosenMethod,
      status: OrderStatus.PENDING_PAYMENT,
      paymentStatus: PaymentStatus.PENDING,
      escrowStatus: EscrowStatus.HOLDING,
      payoutStatus: 'pending',
      // Collection fields
      needsCollection: needsCollection,
      isRuralCollection: isRuralCollection,
      collectionFee: collectionFee > 0 ? collectionFee : null,
      sellerPickupAddress: needsCollection
        ? (dto as any).sellerPickupAddress || null
        : null,
    } as any);

    const saved = (await this.repo.save(order)) as unknown as Order;
    // Set permanent tracking number immediately — KTX-ORD-{id} is the single source of truth
    await this.repo.update(saved.id, {
      trackingNumber: `KTX-ORD-${saved.id}`,
    });
    await this.productsService.decreaseStock(
      product.id,
      dto.quantity,
      InventoryMovementReason.KENTEXA_ONLINE,
      { referenceType: 'order', referenceId: saved.id, userId: user.id },
    );

    let invoiceNumber: string | null = null;
    try {
      const invoice = await this.invoicesService.createForOrder(saved);
      invoiceNumber = invoice.invoiceNumber;
    } catch (err) {
      // Previously this was silently swallowed, which left the order in a
      // state where checkout's "Pay Online" button had no invoice number to
      // send — the buyer would see "Invoice number is required" with no way
      // to recover. We now log the full error so this is diagnosable, and
      // the payment endpoint has a self-healing fallback (by orderId) so a
      // transient invoice-creation failure here doesn't permanently strand
      // the order — see customerPayInvoice() in payments.service.ts.
      console.error(
        `Invoice creation failed for order #${saved.id}:`,
        err.message,
        err.stack,
      );
    }

    if (product.seller) {
      try {
        await this.payoutRepo.save(
          this.payoutRepo.create({
            seller: product.seller,
            order: saved,
            orderTotal: totalAmount,
            platformFeeAmount: commission.platformFee,
            agentCommission: 0,
            sellerAmount: commission.sellerAmount,
            status: 'pending',
          } as any),
        );
      } catch (err) {
        console.error('Payout creation failed:', err.message);
      }
    }

    // Order placed — email only
    await this.notificationsService.orderPlaced(
      { email: user.email, name: user.name },
      saved.id,
      product.name,
      totalAmount,
    );

    // Auto-assign to daily batch if buyer chose KenteXa delivery
    let batchInfo: any = null;
    if (chosenMethod === 'kentexa_delivery') {
      try {
        // DailyBatchesService is imported lazily to avoid circular dependency
        // We store a flag on the order — batch assignment happens via webhook/cron
        // For now, we store shippingMethod as 'kentexa_delivery' and the
        // dispatcher can assign it via GET /daily-batches/assign/:orderId
        await this.repo.update(saved.id, {
          shippingNote: 'Assigned for KenteXa Dar batch delivery',
        });
        batchInfo = {
          message: 'Order queued for KenteXa batch delivery',
          orderId: saved.id,
        };
      } catch (err) {
        console.error('Batch auto-assign failed:', err.message);
      }
    }

    // ── Create collection request if seller needs agent pickup ───────────────
    if (needsCollection) {
      try {
        const sellerCity =
          (product.seller as any)?.businessLocation?.split(',')[0]?.trim() ||
          (product as any).sellerCity ||
          'Unknown';
        await this.collectionsService.createCollectionRequest(
          saved,
          (dto as any).sellerPickupAddress ||
            (product.seller as any)?.sellerPickupAddress ||
            (product.seller as any)?.businessLocation ||
            '',
          sellerCity,
          isRuralCollection,
          collectionFee,
        );
      } catch (err) {
        console.error(
          `Collection request failed for order #${saved.id}:`,
          err.message,
        );
      }
    }

    // Auto-assign origin Super Agent for intercity orders
    // for the seller's city and link them to the order automatically.
    // This removes the need for admin to manually match agents to orders.
    if (chosenMethod === 'agent') {
      try {
        const sellerCity =
          (product.seller as any)?.businessLocation?.split(',')[0]?.trim() ||
          'Dar es Salaam';
        const originAgent = await this.superAgentRepo.findOne({
          where: { city: sellerCity, status: 'active' as any },
          order: {
            rating: 'DESC',
            totalParcelsDelivered: 'DESC',
          },
        });
        if (originAgent) {
          await this.repo.update(saved.id, {
            originSuperAgentId: originAgent.id,
          } as any);
        }

        // Also look up the destination city Super Agent based on delivery address
        const destCity =
          dto.deliveryAddress
            ?.split(',')
            .map((p: string) => p.trim())
            .find((p: string) => p.length > 2) || null;
        if (destCity && destCity !== sellerCity) {
          const destAgent = await this.superAgentRepo.findOne({
            where: { city: destCity, status: 'active' as any },
            order: {
              rating: 'DESC',
              totalParcelsDelivered: 'DESC',
            },
          });
          if (destAgent) {
            await this.repo.update(saved.id, {
              destinationSuperAgentId: destAgent.id,
            } as any);
          }
        }
      } catch (err) {
        console.error(
          'Super Agent auto-assign failed (non-critical):',
          err.message,
        );
      }
    }

    // ── Auto-create/update BusinessCustomer record ─────────────────────────
    // This is how sellers get their CRM populated automatically
    // No manual work needed — every order auto-updates the customer database
    try {
      const sellerId: number | undefined =
        (saved.seller as any)?.id ?? (product.seller as any)?.id;
      if (sellerId) {
        await this.businessCustomerService.upsertFromOrder({
          sellerId,
          userId: user.id || null,
          name:
            (dto as any).recipientName ||
            user.name ||
            (dto as any).manualBuyerName ||
            'Mteja',
          phone: (dto as any).phone || user.phone || null,
          email: user.email || null,
          address: (dto as any).deliveryAddress || null,
          district: (dto as any).districtName || null,
          region: (dto as any).regionName || null,
          orderAmount: Number(saved.totalAmount || 0),
          channel: 'kentexa',
        });
      }
    } catch (e) {
      console.error(
        'BusinessCustomer upsert failed (non-critical):',
        e.message,
      );
    }

    // Notify seller of new order
    try {
      if (saved.seller?.id) {
        await this.inAppNotif.orderPlacedById(
          saved.seller.id,
          saved.id,
          saved.trackingNumber || `KTX-ORD-${saved.id}`,
          saved.product?.name || (saved as any).manualProductName || 'Bidhaa',
        );
      }
    } catch {
      /* non-critical */
    }

    return { ...saved, invoiceNumber, batchInfo };
  }

  // ── Seller: Upload shipping proof ────────────────────────────────────────────
  async uploadShippingProof(
    orderId: number,
    seller: User,
    data: {
      trackingNumber: string;
      shippingReceiptImage: string;
      shippingProductImage: string;
      courierName?: string;
      shippingNote?: string;
      shippingMethod?: string;
    },
  ) {
    const order = await this.repo.findOne({
      where: { id: orderId },
      relations: { seller: true, product: true, buyer: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.seller?.id !== seller.id)
      throw new ForbiddenException('Not your order');
    if (![OrderStatus.PAID, OrderStatus.PREPARING].includes(order.status)) {
      throw new BadRequestException('Order must be paid before shipping');
    }

    const chosenMethod =
      data.shippingMethod || order.shippingMethod || 'direct';
    const deliveryFee = Number((order as any).deliveryFeeAmount || 0);
    const platformFee = Number(order.platformFeeAmount || 0);
    const baseAmount = Number((order as any).baseAmount || 0);

    const usedKentexaAgent = chosenMethod === 'agent';
    const sellerAmount = usedKentexaAgent
      ? parseFloat((baseAmount - platformFee).toFixed(2))
      : parseFloat((baseAmount - platformFee + deliveryFee).toFixed(2));

    // trackingNumber is KTX-ORD-{id} set at creation — NEVER overwrite it
    // External references (bus ticket, courier ref) go in dedicated fields
    await this.repo.update(orderId, {
      status: OrderStatus.PREPARING,
      courierName: data.courierName || null,
      externalTrackingRef: data.trackingNumber || null, // store as external ref only
      shipmentProofUrl: data.shippingReceiptImage,
      shippingReceiptImage: data.shippingReceiptImage,
      shippingProductImage: data.shippingProductImage,
      shippingNote: data.shippingNote || null,
      shippingMethod: chosenMethod,
      sellerAmount,
    });

    // Shipping proof uploaded — email only
    await this.notificationsService.shippingProofUploaded(
      { email: order.buyer?.email, name: order.buyer?.name },
      orderId,
      data.trackingNumber,
      data.courierName || chosenMethod,
    );

    return {
      message: 'Shipping proof uploaded. Mark as shipped when ready.',
      shippingMethod: chosenMethod,
      sellerAmount,
      breakdown: {
        baseAmount,
        deliveryFee: chosenMethod === 'direct' ? deliveryFee : 0,
        platformFee: -platformFee,
        agentDeliveryFee: chosenMethod === 'agent' ? -deliveryFee : 0,
        yourAmount: sellerAmount,
      },
    };
  }

  // ── Seller: Mark as shipped ───────────────────────────────────────────────
  async markShipped(orderId: number, seller: User) {
    const order = await this.repo.findOne({
      where: { id: orderId },
      relations: { seller: true, buyer: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.seller?.id !== seller.id)
      throw new ForbiddenException('Not your order');
    if (order.status !== OrderStatus.PREPARING)
      throw new BadRequestException('Upload shipping proof first');

    await this.repo.update(orderId, {
      status: OrderStatus.IN_TRANSIT,
      shippedAt: new Date(),
    });

    // Out for delivery — email only
    await this.notificationsService.outForDelivery(
      { email: order.buyer?.email, name: order.buyer?.name },
      order.trackingNumber || `Order #${orderId}`,
    );

    return { message: 'Order marked as shipped. Buyer notified.' };
  }

  // ── Seller: Hand to Super Agent ───────────────────────────────────────────
  async sellerHandToSuperAgent(
    orderId: number,
    seller: User,
    data: {
      superAgentCity: string;
      notes?: string;
    },
  ) {
    const order = await this.repo.findOne({
      where: { id: orderId },
      relations: { seller: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.seller?.id !== seller.id)
      throw new ForbiddenException('Not your order');
    if (order.status !== OrderStatus.PAID)
      throw new BadRequestException('Order must be paid');

    await this.repo.update(orderId, {
      status: OrderStatus.PREPARING,
      shippingMethod: 'agent',
      shippingNote:
        data.notes || `Handed to Super Agent in ${data.superAgentCity}`,
    });

    return {
      message: `Imerekodiwa. Peleka kifurushi kwa Super Agent — nambari ya ufuatiliaji: KTX-ORD-${orderId}`,
      orderId,
      status: OrderStatus.PREPARING,
    };
  }

  // ── Super Agent: Look up order before receiving ───────────────────────────
  async lookupForAgent(orderId: number) {
    const order = await this.repo.findOne({
      where: { id: orderId },
      relations: { seller: true, buyer: true, product: true },
    });
    if (!order) throw new NotFoundException(`Order #${orderId} not found`);
    if (!['paid', 'preparing'].includes(order.status)) {
      throw new BadRequestException(
        `Order status is ${order.status}. Must be paid or preparing.`,
      );
    }

    const addressParts = (order.deliveryAddress || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const guessedCity = addressParts[0] || null;

    return {
      orderId: order.id,
      productName:
        order.product?.name || (order as any).manualProductName || '—',
      recipientName:
        (order as any).recipientName ||
        (order as any).manualBuyerName ||
        order.buyer?.name ||
        '—',
      buyerName: order.buyer?.name || (order as any).manualBuyerName || '—',
      buyerPhone:
        order.phone ||
        order.buyer?.phone ||
        (order as any).manualBuyerPhone ||
        '—',
      deliveryAddress: order.deliveryAddress || '—',
      destinationCity: (order as any).destinationCity || null,
      guessedCity,
      // Payment info — Super Agent must see this clearly
      source: order.source || 'online',
      paymentStatus: order.paymentStatus,
      deliveryFeeAmount: Number((order as any).deliveryFeeAmount || 0),
      shippingFee: Number((order as any).deliveryFeeAmount || 0),
      totalAmount: Number(order.totalAmount || 0),
      // For display clarity
      isOnlinePaid: order.source === 'online' && order.paymentStatus === 'paid',
      isOffline: ['offline', 'offline_intercity', 'seller_shipment'].includes(
        order.source,
      ),
      sellerName: (order.seller as any)?.storeName || order.seller?.name || '—',
      sellerPhone: order.seller?.phone || '—',
      isManualOrder: order.source !== 'online',
    };
  }

  // ── Super Agent: Receive parcel & generate tracking ───────────────────────
  async superAgentReceiveOrder(
    orderId: number,
    superAgent: User,
    rawData?: {
      originCity?: string;
      destinationCity?: string;
      weightKg?: number;
      parcelPhoto?: string;
      notes?: string;
      actualShippingFee?: number; // for NORMAL orders: escrow fee reconciliation
      shippingFeeCollected?: number; // for MANUAL orders: cash collected from seller right now
    },
  ) {
    // The "Pokea Agizo la KenteXa" button never actually sent a body at all
    // — every data.* read below threw "Cannot read properties of undefined"
    // the moment a real request hit this method (masked until now by the
    // separate ParseIntPipe bug that 400'd before ever reaching here).
    // Default to {} and fall back to the order's own known city fields so
    // the Super Agent isn't required to retype what Kentexa already knows.
    const data = rawData || {};

    const order = await this.repo.findOne({
      where: { id: orderId },
      relations: { seller: true, buyer: true, product: true },
    });
    if (!order) throw new NotFoundException(`Order #${orderId} not found`);
    if (!['paid', 'preparing'].includes(order.status)) {
      throw new BadRequestException(
        `Order status is ${order.status}. Must be paid or preparing.`,
      );
    }

    const superAgentProfile = await this.superAgentRepo.findOne({
      where: { user: { id: superAgent.id } },
    });

    const guessedDestinationCity =
      (order as any).destinationCity ||
      (order.deliveryAddress || '').split(',')[0]?.trim() ||
      null;
    const originCity = data.originCity || superAgentProfile?.city || '';
    const destinationCity = data.destinationCity || guessedDestinationCity || '';

    // ── Tracking number: ONE per order, set at creation, NEVER regenerated.
    // Previously this method generated a brand-new KTX-DAR-MZA-XXXXXX number
    // here, which broke the "one order, one tracking number" rule and meant
    // the SMS the buyer already received pointed to a dead/different code.
    const trackingNumber = order.trackingNumber || `KTX-ORD-${order.id}`;

    // SELLER_SHIPMENT orders are just as "manual" as OFFLINE ones — no
    // escrow was ever held, platformFee/sellerAmount are already zero from
    // creation — so they need the same no-reconciliation treatment. This
    // used to only check for 'offline', silently running SELLER_SHIPMENT
    // orders through the escrow-reconciliation branch below (harmless
    // there since deliveryFeeAmount is always 0 for them, but wrong in
    // spirit and confusing in the audit log).
    const isManualOrder =
      order.source === ('offline' as any) ||
      order.source === ('seller_shipment' as any);

    let actualFee = 0;
    let feeDifference = 0;
    let sellerAmountAdjustment = 0;
    let shippingFeeFlagged = false;
    let shippingFeeNote: string | null = null;
    let newSellerAmount = Number(order.sellerAmount || 0);

    if (isManualOrder) {
      // ── MANUAL ORDER: no escrow, no estimate to reconcile against.
      // The fee is simply whatever cash the seller hands the agent right now.
      // It never touches sellerAmount/platformFee — those stay at zero,
      // because KenteXa never held the customer's payment in the first place.
      actualFee = Number(data.shippingFeeCollected || 0);
      shippingFeeNote =
        actualFee > 0
          ? `Mauzo ya nje: TZS ${actualFee.toLocaleString()} ilipokewa taslimu na Super Agent wakati wa kupokea kifurushi.`
          : null;
    } else {
      // ── NORMAL ORDER: existing escrow reconciliation logic, unchanged.
      const estimatedFee = Number((order as any).deliveryFeeAmount || 0);
      actualFee =
        data.actualShippingFee != null && data.actualShippingFee !== 0
          ? Number(data.actualShippingFee)
          : estimatedFee;
      feeDifference = parseFloat((actualFee - estimatedFee).toFixed(2));

      const threshold = Math.max(2000, estimatedFee * 0.2);

      if (feeDifference > threshold) {
        const excessOverThreshold = parseFloat(
          (feeDifference - threshold).toFixed(2),
        );
        sellerAmountAdjustment = -excessOverThreshold;
        shippingFeeFlagged = true;
        shippingFeeNote =
          `Shipping fee was TZS ${actualFee.toLocaleString()} vs seller's estimate of TZS ${estimatedFee.toLocaleString()} ` +
          `(+TZS ${feeDifference.toLocaleString()}). TZS ${threshold.toLocaleString()} absorbed by KenteXa; ` +
          `remaining TZS ${excessOverThreshold.toLocaleString()} deducted from seller payout. Flagged for review.`;
      } else if (feeDifference < -threshold) {
        shippingFeeNote =
          `Shipping fee was TZS ${actualFee.toLocaleString()} vs seller's estimate of TZS ${estimatedFee.toLocaleString()} ` +
          `(${feeDifference.toLocaleString()}). Difference absorbed by KenteXa.`;
      } else if (feeDifference !== 0) {
        shippingFeeNote =
          `Shipping fee adjusted from TZS ${estimatedFee.toLocaleString()} to TZS ${actualFee.toLocaleString()} ` +
          `(${feeDifference > 0 ? '+' : ''}${feeDifference.toLocaleString()}) — within acceptable range, absorbed by KenteXa.`;
      }

      newSellerAmount =
        sellerAmountAdjustment !== 0
          ? parseFloat(
              (
                Number(order.sellerAmount || 0) + sellerAmountAdjustment
              ).toFixed(2),
            )
          : Number(order.sellerAmount || 0);
    }

    const orderUpdate: any = {
      status: OrderStatus.IN_TRANSIT,
      trackingNumber, // re-affirm, never overwrite with a new value
      shippingMethod: 'agent',
      shippingNote:
        data.notes || `Received at ${originCity} Super Agent hub`,
      shippingProductImage: data.parcelPhoto || null,
      shippedAt: new Date(),
    };

    if (isManualOrder) {
      orderUpdate.shippingFeeCollected = actualFee;
      orderUpdate.shippingFeeCollectedByAgentId = null; // set below once we have superAgentProfile.id
      orderUpdate.shippingFeeCollectedAt = new Date();
      // sellerAmount / platformFee intentionally left untouched — both remain 0
    } else {
      orderUpdate.actualShippingFee = actualFee;
      orderUpdate.deliveryFeeAmount = actualFee;
      orderUpdate.sellerAmount = newSellerAmount;
      orderUpdate.shippingFeeFlagged = shippingFeeFlagged;
      orderUpdate.shippingFeeNote = shippingFeeNote;
    }

    if (isManualOrder && superAgentProfile) {
      orderUpdate.shippingFeeCollectedByAgentId = superAgentProfile.id;
    }

    await this.repo.update(orderId, orderUpdate);

    // Parcel dispatched (in transit) — email only
    await this.notificationsService.parcelDispatched(
      { email: order.buyer?.email, name: order.buyer?.name },
      trackingNumber,
      originCity,
      destinationCity,
    );

    // ── Earnings: record what the Super Agent earns on this parcel.
    // IMPORTANT: KenteXa does NOT pay Super Agents — they are independent businesses.
    // For offline/manual orders: the cash was collected directly from the sender.
    // For online orders: the shipping fee is arranged between seller and Super Agent.
    // This field is informational only — for reporting and the Super Agent's own dashboard.
    // KenteXa never releases this money — it flows outside the platform.
    let superAgentEarnings = 0;
    if (superAgentProfile) {
      if (isManualOrder) {
        // Whole cash amount — Super Agent already has it in hand
        superAgentEarnings = actualFee;
        // Track on their profile for their own records (not a KenteXa payable)
        if (actualFee > 0) {
          await this.superAgentRepo.update(superAgentProfile.id, {
            totalEarnings: Number(superAgentProfile.totalEarnings) + actualFee,
            totalParcelsHandled: superAgentProfile.totalParcelsHandled + 1,
          });
        }
      } else {
        // Online order: commission % of shipping fee — informational only
        // The seller's shipping fee covers this; KenteXa does not pay it out
        const agentCommissionRate = Number(
          (superAgentProfile as any).commissionRate || 0,
        );
        superAgentEarnings = parseFloat(
          ((actualFee * agentCommissionRate) / 100).toFixed(2),
        );
        // Do NOT update superAgent.totalEarnings here — KenteXa doesn't owe this
        // Super Agent earns directly from the shipping fee arrangement with seller
      }
    }

    // Orders created via createSellerShipment()/createOfflineIntercityOrder()
    // already have their own Parcel row (same trackingNumber, unique) from
    // the moment they were created — this used to always try to INSERT a
    // second one, which silently failed on the unique constraint (caught
    // below) and left the parcel's actual superAgent/status untouched, so
    // "receiving" one of those orders here looked like it worked but
    // never actually attached this agent to the real parcel record.
    // Update-if-exists makes this the single, idempotent "attach this
    // agent + mark received" step regardless of which flow created the
    // order.
    try {
      const existingParcel = await this.parcelRepo.findOne({
        where: { trackingNumber },
      });
      const parcelFields: any = {
        status: ParcelStatus.RECEIVED_AT_HUB,
        superAgent: superAgentProfile || null,
        originCity,
        destinationCity,
        weightKg: data.weightKg || existingParcel?.weightKg || null,
        actualShippingFee: actualFee,
        superAgentEarnings,
        parcelPhoto: data.parcelPhoto || existingParcel?.parcelPhoto || null,
        handoverTime: new Date(),
        notes: data.notes || existingParcel?.notes || null,
      };
      if (existingParcel) {
        await this.parcelRepo.update(existingParcel.id, parcelFields);
      } else {
        await this.parcelRepo.save(
          this.parcelRepo.create({
            trackingNumber, // same number as the order — never a fresh one
            order: order,
            seller: order.seller,
            buyer: order.buyer,
            deliveryAddress: order.deliveryAddress,
            buyerPhone: order.phone || order.buyer?.phone || null,
            recipientName: order.recipientName || order.buyer?.name || null,
            estimatedShippingFee: isManualOrder
              ? null
              : Number((order as any).deliveryFeeAmount || 0),
            shippingMargin: isManualOrder
              ? null
              : parseFloat(
                  (
                    Number((order as any).deliveryFeeAmount || 0) - actualFee
                  ).toFixed(2),
                ),
            ...parcelFields,
          } as any),
        );
      }
    } catch (err) {
      console.error('Parcel record creation failed:', err.message);
    }

    return {
      message: isManualOrder
        ? `Kifurushi kimepokewa! TZS ${actualFee.toLocaleString()} taslimu imerekodiwa kama mapato yako.`
        : `Parcel received! Tracking number confirmed.`,
      trackingNumber,
      orderId,
      status: OrderStatus.IN_TRANSIT,
      originCity,
      destinationCity,
      buyerPhone: order.buyer?.phone || order.phone,
      buyerName: order.buyer?.name || '—',
      recipientName: order.recipientName || order.buyer?.name || '—',
      productName: order.product?.name || '—',
      isManualOrder,
      shippingFeeCollected: isManualOrder ? actualFee : null,
      estimatedShippingFee: isManualOrder
        ? null
        : Number((order as any).deliveryFeeAmount || 0),
      actualShippingFee: isManualOrder ? null : actualFee,
      feeDifference: isManualOrder ? null : feeDifference,
      sellerAmountAdjustment: isManualOrder ? null : sellerAmountAdjustment,
      shippingFeeFlagged: isManualOrder ? false : shippingFeeFlagged,
      shippingFeeNote,
      newSellerAmount: isManualOrder ? 0 : newSellerAmount,
    };
  }

  // ── Agent: Mark received ──────────────────────────────────────────────────
  async agentMarkReceived(orderId: number, agent: User, note?: string) {
    const order = await this.repo.findOne({
      where: { id: orderId },
      relations: { buyer: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (
      ![OrderStatus.IN_TRANSIT, OrderStatus.PREPARING].includes(order.status)
    ) {
      throw new BadRequestException('Order not in transit');
    }

    await this.repo.update(orderId, {
      status: OrderStatus.READY_PICKUP,
      agentReceivedAt: new Date(),
      agentNote: note || null,
      agentId: String(agent.id),
    });

    // Award reputation to agent for on-time delivery
    try {
      const agentUser = await this.userRepo?.findOne?.({
        where: { id: agent.id },
      });
      if (agentUser) {
        await this.reputationService.award(
          agentUser.id,
          ReputationEventType.DELIVERY_ON_TIME,
          { sourceEntityType: 'order', sourceEntityId: orderId },
        );
      }
    } catch {
      /* non-critical */
    }

    // SMS (mandatory, 3rd allowed event) + Email — goods ready for pickup
    await this.notificationsService.delivered(
      {
        email: order.buyer?.email,
        phone: order.buyer?.phone,
        name: order.buyer?.name,
      },
      orderId,
      order.trackingNumber || `Order #${orderId}`,
    );

    return { message: 'Agent received confirmed. Buyer notified to collect.' };
  }

  // ── Buyer: Confirm receipt ────────────────────────────────────────────────
  async buyerConfirm(orderId: number, buyer: User) {
    const order = await this.repo.findOne({
      where: { id: orderId },
      relations: { buyer: true, seller: true, product: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.buyer || order.buyer.id !== buyer.id)
      throw new ForbiddenException('Not your order');
    if (
      ![
        OrderStatus.DELIVERED,
        OrderStatus.READY_PICKUP,
        OrderStatus.IN_TRANSIT,
      ].includes(order.status)
    ) {
      throw new BadRequestException('Order not yet delivered');
    }

    await this.repo.update(orderId, {
      status: OrderStatus.COMPLETED,
      buyerConfirmedAt: new Date(),
      deliveredAt: new Date(),
      completedAt: new Date(),
      payoutStatus: 'released',
      escrowStatus: EscrowStatus.RELEASED,
      fundsReleasedAt: new Date(),
    });

    // Order completed — email only (3rd SMS slot already used at "delivered" stage)
    // Award reputation — order completed
    try {
      const ord = await this.repo.findOne({
        where: { id: orderId },
        relations: { buyer: true, seller: true },
      });
      if (ord?.buyer?.id)
        await this.reputationService.award(
          ord.buyer.id,
          ReputationEventType.ORDER_COMPLETED,
          { sourceEntityType: 'order', sourceEntityId: orderId },
        );
      if (ord?.seller?.id)
        await this.reputationService.award(
          ord.seller.id,
          ReputationEventType.ORDER_COMPLETED,
          { sourceEntityType: 'order', sourceEntityId: orderId },
        );
    } catch {
      /* non-critical */
    }

    if (order.seller?.id) {
      await this.walletService
        .creditFromEscrowRelease(
          order.seller.id,
          orderId,
          Number(order.sellerAmount || 0),
        )
        .catch(() => {});
      // This path never collects a rating (buyer just confirms receipt),
      // so this only increments completedOrders — but it must still run
      // here, since this is a real order completion that confirmViaToken
      // never sees.
      await this.updateSellerCompletionStats(order.seller.id).catch(() => {});
    }

    await this.notificationsService.orderCompleted(
      { email: order.seller?.email, name: order.seller?.name },
      { email: order.buyer?.email, name: order.buyer?.name },
      orderId,
      Number(order.sellerAmount || 0),
    );

    // 📈 Social proof — increment product's sales count
    if (order.product?.id) {
      await this.productsService.incrementSalesCount(order.product.id);
    }

    if (order.trackingNumber) {
      try {
        const parcel = await this.parcelRepo.findOne({
          where: { trackingNumber: order.trackingNumber },
        });
        if (parcel && parcel.status !== ParcelStatus.DELIVERED) {
          await this.parcelRepo.update(parcel.id, {
            status: ParcelStatus.DELIVERED,
            deliveredTime: new Date(),
            buyerConfirmed: true,
          });

          await this.parcelTrackingRepo.save(
            this.parcelTrackingRepo.create({
              parcel,
              status: ParcelStatus.DELIVERED,
              city: parcel.destinationCity,
              note: 'Buyer confirmed receipt on order page',
              updatedBy: 'Buyer',
            }),
          );

          if (parcel.localAgentId) {
            const localAgent = await this.agentRepo.findOne({
              where: { user: { id: Number(parcel.localAgentId) } },
            });
            if (localAgent) {
              const alreadyCredited = await this.agentTransactionRepo.findOne({
                where: {
                  transactionReference: order.trackingNumber,
                  paymentMethod: 'last_mile_delivery',
                },
              });
              if (!alreadyCredited) {
                const platformFee = Number(order.platformFeeAmount || 0);
                if (platformFee > 0) {
                  const commissionRate = Number(
                    localAgent.commissionRate ?? 2.5,
                  );
                  const commission = parseFloat(
                    ((platformFee * commissionRate) / 100).toFixed(2),
                  );
                  if (commission > 0) {
                    await this.agentTransactionRepo.save(
                      this.agentTransactionRepo.create({
                        agent: localAgent,
                        invoiceAmount: platformFee,
                        commissionRate,
                        commissionAmount: commission,
                        transactionReference: order.trackingNumber,
                        paymentMethod: 'last_mile_delivery',
                        status: AgentTransactionStatus.CONFIRMED,
                      } as any),
                    );
                    localAgent.totalEarnings =
                      Number(localAgent.totalEarnings || 0) + commission;
                    localAgent.totalTransactions =
                      Number(localAgent.totalTransactions || 0) + 1;
                    // Same commission event the super-agents.service.ts
                    // self-report path credits — these two were previously
                    // only updated there, never here, so the delivery
                    // count/earnings breakdown undercounted whenever a
                    // delivery was credited via this buyer-confirms path
                    // instead of the agent self-reporting one.
                    localAgent.totalDeliveriesCompleted =
                      Number(localAgent.totalDeliveriesCompleted || 0) + 1;
                    localAgent.totalEarningsDeliveries =
                      Number(localAgent.totalEarningsDeliveries || 0) + commission;
                    await this.agentRepo.save(localAgent);
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.error(
          'Failed to sync parcel status on buyer confirm:',
          err.message,
        );
      }
    }

    return {
      message: 'Confirmed! Payment will be released to seller within 24 hours.',
    };
  }

  // ── Generate confirmation token & send WhatsApp to buyer ─────────────────
  // Works for ALL order types: online, offline, manual, invoice, walk-in
  // No buyer login required — token link is enough

  async generateConfirmationLink(
    orderId: number,
    seller: User,
  ): Promise<{
    confirmationUrl: string;
    buyerPhone: string | null;
  }> {
    const order = await this.repo.findOne({
      where: { id: orderId },
      relations: { seller: true, buyer: true, product: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    // Allow seller OR admin OR an authorized team member to generate
    const isSeller =
      (order.seller as any)?.id === seller.id ||
      (order as any).createdByUserId === seller.id;
    const isAdmin = seller.role === 'admin';
    const isAuthorizedStaff =
      !isSeller &&
      !isAdmin &&
      (order.seller as any)?.id &&
      (await this.sellerScope.isAuthorizedFor(
        seller,
        (order.seller as any).id,
        'canCreateOrders',
      ));
    if (!isSeller && !isAdmin && !isAuthorizedStaff)
      throw new ForbiddenException('Not your order');

    // Generate secure random token (24 chars)
    const token = randomBytes(18).toString('hex'); // 36-char hex
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7); // expires in 7 days

    await this.repo.update(orderId, {
      confirmationToken: token,
      confirmationTokenExpiry: expiry,
      status: OrderStatus.DELIVERED,
      deliveredAt: new Date(),
    });

    const baseUrl = FRONTEND_URL;
    const confirmationUrl = `${baseUrl}/?confirm=${order.trackingNumber || orderId}&token=${token}`;

    // Send WhatsApp to buyer
    const buyerPhone =
      order.buyer?.phone ||
      (order as any).manualBuyerPhone ||
      (order as any).phone ||
      (order as any).recipientPhone ||
      null;
    const buyerName =
      order.buyer?.name ||
      (order as any).manualBuyerName ||
      (order as any).recipientName ||
      'Mteja';
    const productName =
      order.product?.name ||
      (order as any).manualProductName ||
      (order as any).description ||
      'bidhaa yako';
    const storeName =
      (order.seller as any)?.storeName ||
      (order.seller as any)?.businessName ||
      seller.name;

    if (buyerPhone) {
      const msg = [
        `Habari ${buyerName}! 🎉`,
        ``,
        `*${storeName}* anasema bidhaa yako imefika.`,
        ``,
        `📦 *${productName}*`,
        ``,
        `Je, umepokea bidhaa yako?`,
        `Bonyeza hapa kuthibitisha — inachukua sekunde moja:`,
        confirmationUrl,
        ``,
        `⚠️ Kama hujapokea au kuna tatizo, bonyeza pia kiungo hicho ili kuripoti.`,
        ``,
        `Asante kwa kutumia KenteXa! 🙏`,
      ].join('\n');

      try {
        await this.smsService.sendSms(buyerPhone, msg);
      } catch (e) {
        // Non-fatal — link still generated
        console.error('WhatsApp send failed:', e.message);
      }
    }

    return { confirmationUrl, buyerPhone };
  }

  // ── Validate token (public — no auth needed) ─────────────────────────────

  async getOrderByConfirmationToken(token: string) {
    const order = await this.repo.findOne({
      where: { confirmationToken: token },
      relations: { seller: true, buyer: true, product: true },
    });
    if (!order)
      throw new NotFoundException('Kiungo hakipatikani au kimekwisha muda');

    const expiry = (order as any).confirmationTokenExpiry;
    if (expiry && new Date() > new Date(expiry)) {
      throw new BadRequestException(
        'Kiungo kimekwisha muda. Omba muuzaji akutumie kipya.',
      );
    }
    if (order.status === OrderStatus.COMPLETED) {
      return {
        alreadyConfirmed: true,
        orderId: order.id,
        productName:
          order.product?.name || (order as any).manualProductName || 'Bidhaa',
        storeName:
          (order.seller as any)?.storeName ||
          (order.seller as any)?.businessName ||
          'Muuzaji',
        rating: (order as any).buyerRating,
        review: (order as any).buyerReview,
      };
    }

    return {
      alreadyConfirmed: false,
      orderId: order.id,
      productId: order.product?.id || null,
      trackingNumber: order.trackingNumber,
      productName:
        order.product?.name || (order as any).manualProductName || 'Bidhaa',
      description: (order as any).description,
      storeName:
        (order.seller as any)?.storeName ||
        (order.seller as any)?.businessName ||
        'Muuzaji',
      sellerPhone:
        order.seller?.phone || (order.seller as any)?.user?.phone || null,
      deliveredAt: (order as any).deliveredAt,
      source: (order as any).source,
    };
  }

  // Shared by every order-completion path (confirmViaToken, buyerConfirm,
  // autoConfirmDeliveredOrders, resolveDispute-favoring-seller) — an order
  // completing "silently" through any path other than confirmViaToken used
  // to leave User.completedOrders/rating/reviewsCount stale, since this
  // update used to live only inside confirmViaToken itself. Recomputes
  // rating/reviewsCount from real Order.buyerRating values (never
  // recalculated from a stale running average) and always increments
  // completedOrders, rating math or not.
  private async updateSellerCompletionStats(
    sellerId: number,
    rating?: number | null,
  ): Promise<void> {
    if (rating) {
      try {
        const ratingResult = await this.repo
          .createQueryBuilder('o')
          .select('AVG(o.buyerRating)', 'avg')
          .addSelect('COUNT(o.buyerRating)', 'count')
          .where('o.seller.id = :sid', { sid: sellerId })
          .andWhere('o.buyerRating IS NOT NULL')
          .getRawOne();

        if (ratingResult) {
          const avg = parseFloat(ratingResult.avg || '0');
          const count = parseInt(ratingResult.count || '0');
          await this.userRepo.update(sellerId, {
            rating: parseFloat(avg.toFixed(1)),
            reviewsCount: count,
            completedOrders: () => '"completedOrders" + 1',
          });
        }
      } catch (e) {
        console.error('Seller rating update failed:', e.message);
      }
    } else {
      await this.userRepo
        .update(sellerId, {
          completedOrders: () => '"completedOrders" + 1',
        } as any)
        .catch(() => {});
    }
  }

  // ── Confirm delivery via token (public — no auth needed) ─────────────────

  async confirmViaToken(
    token: string,
    data: {
      confirmed: boolean;
      rating?: number; // 1-5
      review?: string;
      reportNote?: string; // if not confirmed, what is the problem
    },
  ): Promise<{ success: boolean; message: string }> {
    const order = await this.repo.findOne({
      where: { confirmationToken: token },
      relations: { seller: true, buyer: true, product: true },
    });
    if (!order) throw new NotFoundException('Kiungo hakipatikani');

    const expiry = (order as any).confirmationTokenExpiry;
    if (expiry && new Date() > new Date(expiry)) {
      throw new BadRequestException('Kiungo kimekwisha muda');
    }
    if (order.status === OrderStatus.COMPLETED) {
      return { success: true, message: 'Umeshakuthibitisha bidhaa hii.' };
    }

    if (data.confirmed) {
      // ── CONFIRMED ─────────────────────────────────────────────────────────
      const isOnlineOrder =
        (order as any).source === 'online' || order.paymentStatus === 'paid';

      await this.repo.update(order.id, {
        status: OrderStatus.COMPLETED,
        buyerConfirmedAt: new Date(),
        completedAt: new Date(),
        confirmationToken: null, // invalidate token
        buyerRating: data.rating || null,
        buyerReview: data.review || null,
        reviewedAt: data.rating ? new Date() : null,
        // Release escrow for online orders only
        ...(isOnlineOrder
          ? {
              payoutStatus: 'released',
              escrowStatus: EscrowStatus.RELEASED,
              fundsReleasedAt: new Date(),
            }
          : {}),
      });

      // Notify seller
      const sellerPhone =
        order.seller?.phone || (order.seller as any)?.user?.phone;
      const productName =
        order.product?.name || (order as any).manualProductName || 'Bidhaa';
      const stars = '⭐'.repeat(data.rating || 0);
      const sellerId = (order.seller as any)?.id;
      if (sellerId && isOnlineOrder) {
        await this.walletService
          .creditFromEscrowRelease(
            sellerId,
            order.id,
            Number(order.sellerAmount || 0),
          )
          .catch(() => {});
      }
      // In-app notification
      if (sellerId) {
        await this.inAppNotif.orderConfirmed(
          sellerId,
          order.id,
          productName,
          data.rating || undefined,
          data.review || undefined,
        );
        if (isOnlineOrder) {
          await this.inAppNotif.payoutReleasedById(
            sellerId,
            Number(order.sellerAmount || 0),
            order.id,
          );
        }
        if (data.rating) {
          await this.inAppNotif.reviewReceived(
            sellerId,
            data.rating,
            productName,
            order.product?.id,
          );
        }
      }

      if (sellerPhone) {
        const msg = [
          `✅ Imethibitishwa! Mnunuzi amepokea bidhaa yako.`,
          ``,
          `📦 ${productName}`,
          data.rating ? `${stars} (${data.rating}/5)` : null,
          data.review ? `"${data.review}"` : null,
          ``,
          isOnlineOrder
            ? `💰 Malipo yako ya TZS ${Number(order.sellerAmount || 0).toLocaleString()} yatatoka ndani ya saa 24.`
            : `📋 Agizo limekamilika. Rekodi imehifadhiwa.`,
        ]
          .filter(Boolean)
          .join('\n');

        await this.smsService.sendSms(sellerPhone, msg).catch(() => {});
      }

      // Increment sales count
      if (order.product?.id) {
        await this.productsService
          .incrementSalesCount(order.product.id)
          .catch(() => {});
      }

      // ── Update seller's aggregate rating ──────────────────────────────────
      if (order.seller?.id) {
        await this.updateSellerCompletionStats(order.seller.id, data.rating);
      }

      return {
        success: true,
        message: data.rating
          ? `Asante! Umepokea bidhaa na kutoa tathmini ya nyota ${data.rating}.`
          : 'Asante! Umekakiri kupokea bidhaa yako.',
      };
    } else {
      // ── DISPUTED ──────────────────────────────────────────────────────────
      await this.repo.update(order.id, {
        status: OrderStatus.DISPUTED,
        confirmationToken: null,
      });

      // Notify admin
      const sellerPhoneD =
        order.seller?.phone || (order.seller as any)?.user?.phone;
      const sellerIdD = (order.seller as any)?.id;
      if (sellerIdD) {
        await this.inAppNotif.disputeRaisedById(
          sellerIdD,
          order.id,
          order.trackingNumber || String(order.id),
        );
      }
      const sellerPhone = sellerPhoneD;
      if (sellerPhone) {
        await this.smsService
          .sendSms(
            sellerPhone,
            `⚠️ Mnunuzi amesema hajapokea bidhaa. KenteXa itashughulikia. Agizo: ${order.trackingNumber || order.id}`,
          )
          .catch(() => {});
      }

      return {
        success: false,
        message:
          'Tatizo limeripotiwa. KenteXa itawasiliana nawe hivi karibuni.',
      };
    }
  }

  // ── Auto-confirm cron (runs daily at 8 AM) ────────────────────────────────
  // Auto-confirms delivered orders that buyer hasn't confirmed after:
  //   Local/offline: 3 days
  //   Intercity:     5 days

  @Cron('0 8 * * *')
  async autoConfirmDeliveredOrders() {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

    // Find delivered orders not yet confirmed
    const deliveredOrders = await this.repo.find({
      where: { status: OrderStatus.DELIVERED },
      relations: { seller: true, product: true },
    });

    let count = 0;
    for (const order of deliveredOrders) {
      const deliveredAt = (order as any).deliveredAt || order.updatedAt;
      if (!deliveredAt) continue;

      const isIntercity =
        (order as any).source === 'intercity' ||
        (order as any).shippingMethod === 'bus' ||
        (order as any).shippingMethod === 'courier';
      const threshold = isIntercity ? fiveDaysAgo : threeDaysAgo;

      if (new Date(deliveredAt) < threshold) {
        await this.repo.update(order.id, {
          status: OrderStatus.COMPLETED,
          buyerConfirmedAt: now,
          completedAt: now,
          autoConfirmed: true,
          confirmationToken: null,
          payoutStatus: 'released',
          escrowStatus: EscrowStatus.RELEASED,
          fundsReleasedAt: now,
        });

        if (order.seller?.id) {
          await this.walletService
            .creditFromEscrowRelease(
              order.seller.id,
              order.id,
              Number(order.sellerAmount || 0),
            )
            .catch(() => {});
          // Every order this cron auto-completes is a real completion the
          // buyer never acted on — the majority-of-volume case this
          // undercount was missing entirely.
          await this.updateSellerCompletionStats(order.seller.id).catch(() => {});
        }

        // Notify seller
        const sellerPhone =
          order.seller?.phone || (order.seller as any)?.user?.phone;
        if (sellerPhone) {
          await this.smsService
            .sendSms(
              sellerPhone,
              `⏰ Agizo #${order.trackingNumber || order.id} imethibitishwa otomatiki (mnunuzi hakujibu siku ${isIntercity ? 5 : 3}).\n💰 Malipo yatatoka hivi karibuni.`,
            )
            .catch(() => {});
        }
        count++;
      }
    }
    if (count > 0) console.log(`Auto-confirmed ${count} delivered orders`);
  }

  // ── Buyer: Raise dispute ──────────────────────────────────────────────────
  async raiseDispute(
    orderId: number,
    buyer: User,
    data: { reason: string; image?: string },
  ) {
    const order = await this.repo.findOne({
      where: { id: orderId },
      relations: { buyer: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!order.buyer || order.buyer.id !== buyer.id)
      throw new ForbiddenException('Not your order');
    if (
      ![
        OrderStatus.DELIVERED,
        OrderStatus.READY_PICKUP,
        OrderStatus.IN_TRANSIT,
      ].includes(order.status)
    ) {
      throw new BadRequestException('Cannot dispute at this stage');
    }

    await this.repo.update(orderId, {
      status: OrderStatus.DISPUTED,
      disputeReason: data.reason,
      disputeImage: data.image || null,
      disputedAt: new Date(),
      disputeOpenedAt: new Date(),
      escrowStatus: EscrowStatus.DISPUTED,
    });

    return { message: 'Dispute raised. Seller will respond within 24 hours.' };
  }

  // ── Admin: Resolve dispute ────────────────────────────────────────────────
  async resolveDispute(
    orderId: number,
    admin: User,
    data: { resolution: string; favour: 'buyer' | 'seller' },
  ) {
    const order = await this.repo.findOne({
      where: { id: orderId },
      relations: { seller: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.DISPUTED)
      throw new BadRequestException('No active dispute');

    const isSeller = data.favour === 'seller';
    await this.repo.update(orderId, {
      status: isSeller ? OrderStatus.COMPLETED : OrderStatus.CANCELLED,
      payoutStatus: isSeller ? 'released' : 'refunded',
      escrowStatus: isSeller ? EscrowStatus.RELEASED : EscrowStatus.REFUNDED,
      disputeResolution: data.resolution,
      buyerConfirmedAt: new Date(),
      fundsReleasedAt: isSeller ? new Date() : null,
    });

    // A dispute resolved in the seller's favour is a real completion too —
    // was never reflected in the seller's completedOrders/rating.
    if (isSeller && order.seller?.id) {
      await this.updateSellerCompletionStats(order.seller.id).catch(() => {});
    }

    return { message: `Dispute resolved in favour of ${data.favour}.` };
  }

  // ── Get My Orders ─────────────────────────────────────────────────────────
  async findMyOrders(user: User): Promise<Order[]> {
    return this.repo.find({
      where: { buyer: { id: user.id } },
      order: { createdAt: 'DESC' },
    });
  }

  // ── Get All Orders (Admin) ────────────────────────────────────────────────
  async findAll(): Promise<any[]> {
    const orders = await this.repo.find({ order: { createdAt: 'DESC' } });

    // offline_intercity orders (Super Agent counter sales) never have a
    // seller — createOfflineIntercityOrder() sets seller: null by design,
    // since there's no seller in that flow at all. The admin list showed a
    // blank "Muuzaji" column for these, indistinguishable from a data
    // error, and nothing separated them from seller_shipment orders
    // either. Resolve the Super Agent that actually handled each one via
    // shippingFeeCollectedByAgentId so the admin can see who's behind it.
    const agentIds = [
      ...new Set(
        orders
          .filter(
            (o: any) =>
              o.source === OrderSource.OFFLINE_INTERCITY &&
              o.shippingFeeCollectedByAgentId,
          )
          .map((o: any) => o.shippingFeeCollectedByAgentId),
      ),
    ];
    const agents = agentIds.length
      ? await this.superAgentRepo.find({ where: { id: In(agentIds) } })
      : [];
    const agentMap = new Map(agents.map((a) => [a.id, a]));

    return orders.map((o: any) => ({
      ...o,
      handlingSuperAgent: o.shippingFeeCollectedByAgentId
        ? {
            id: o.shippingFeeCollectedByAgentId,
            businessName:
              agentMap.get(o.shippingFeeCollectedByAgentId)?.businessName ||
              null,
          }
        : null,
    }));
  }

  // ── Financial Reconciliation — operator's money dashboard ─────────────────
  // Shows: escrow held, pending payouts, fees earned, by period.
  // This is the operator's financial health check — run daily.
  async getFinancialSummary() {
    const orders = await this.repo.find({
      where: { paymentStatus: 'paid' as any },
      relations: { seller: true, product: true },
    });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Was `source !== 'offline'` for "online" — that silently folded
    // seller_shipment and offline_intercity orders into the online bucket
    // too, since neither literally equals 'offline'. Bucketed properly by
    // the real OrderSource values now.
    const online = orders.filter((o: any) => o.source === OrderSource.ONLINE);
    const offline = orders.filter(
      (o: any) =>
        o.source === OrderSource.OFFLINE ||
        o.source === OrderSource.OFFLINE_INTERCITY ||
        !o.source,
    );
    const invoiceOrders = orders.filter(
      (o: any) => o.source === OrderSource.SELLER_SHIPMENT,
    );

    // Escrow = money KenteXa is still holding for the seller. Was checking
    // o.status against 'confirmed'/'refunded' — neither is a real
    // OrderStatus value (only 'cancelled' is), so this never matched
    // correctly. escrowStatus is the field that actually tracks this.
    const pendingRelease = online.filter(
      (o: any) => o.escrowStatus === EscrowStatus.HOLDING,
    );
    const releasedToday = online.filter(
      (o: any) =>
        o.escrowStatus === EscrowStatus.RELEASED &&
        o.fundsReleasedAt &&
        new Date(o.fundsReleasedAt) >= startOfToday,
    );

    // Platform fees earned — a completed sale is DELIVERED or COMPLETED
    // (not the non-existent 'confirmed'); DELIVERED is included since fee
    // recognition shouldn't wait on the buyer confirming/the auto-confirm
    // cron running days later.
    const isFeeEligible = (o: any) =>
      [OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(o.status);
    const completedOnline = online.filter(isFeeEligible);

    const totalEscrowHeld = pendingRelease.reduce(
      (s, o) => s + Number(o.sellerAmount || 0),
      0,
    );
    const releasedTodayTotal = releasedToday.reduce(
      (s, o) => s + Number(o.sellerAmount || 0),
      0,
    );
    const totalPlatformFees = completedOnline.reduce(
      (s, o) => s + Number(o.platformFeeAmount || 0),
      0,
    );
    const totalOrderVolume = online.reduce(
      (s, o) => s + Number(o.totalAmount || 0),
      0,
    );
    const totalPendingPayouts = pendingRelease.reduce(
      (s, o) => s + Number(o.sellerAmount || 0),
      0,
    );

    // This month
    const thisMonth = online.filter(
      (o) => new Date(o.createdAt) >= startOfMonth,
    );
    const monthFees = thisMonth
      .filter(isFeeEligible)
      .reduce((s, o) => s + Number(o.platformFeeAmount || 0), 0);
    const monthVolume = thisMonth.reduce(
      (s, o) => s + Number(o.totalAmount || 0),
      0,
    );

    // This week
    const thisWeek = online.filter((o) => new Date(o.createdAt) >= startOfWeek);
    const weekFees = thisWeek
      .filter(isFeeEligible)
      .reduce((s, o) => s + Number(o.platformFeeAmount || 0), 0);
    const weekVolume = thisWeek.reduce(
      (s, o) => s + Number(o.totalAmount || 0),
      0,
    );

    // Last 7 days, bucketed by day — for the admin revenue chart. Built
    // from ALL paid orders (online + offline), not just online, since the
    // chart is meant to show total platform activity.
    const dailyRevenue: { date: string; revenue: number; orders: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date(startOfToday);
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const dayOrders = orders.filter((o: any) => {
        const created = new Date(o.createdAt);
        return created >= dayStart && created < dayEnd;
      });
      dailyRevenue.push({
        date: dayStart.toISOString().slice(0, 10),
        revenue: parseFloat(
          dayOrders
            .reduce((s: number, o: any) => s + Number(o.totalAmount || 0), 0)
            .toFixed(2),
        ),
        orders: dayOrders.length,
      });
    }

    // Top sellers by completed revenue — across online + offline, since a
    // seller's real activity isn't limited to one channel. Never existed
    // before; the admin "Top Sellers" tab had nothing computing this.
    const completedAll = orders.filter(isFeeEligible);
    const sellerTotals = new Map<
      number,
      { sellerId: number; name: string; ordersCount: number; totalRevenue: number }
    >();
    for (const o of completedAll as any[]) {
      if (!o.seller?.id) continue;
      const entry = sellerTotals.get(o.seller.id) || {
        sellerId: o.seller.id,
        name: o.seller.storeName || o.seller.name || 'Muuzaji',
        ordersCount: 0,
        totalRevenue: 0,
      };
      entry.ordersCount += 1;
      entry.totalRevenue += Number(o.sellerAmount || 0);
      sellerTotals.set(o.seller.id, entry);
    }
    const topSellers = [...sellerTotals.values()]
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10)
      .map((s) => ({ ...s, totalRevenue: parseFloat(s.totalRevenue.toFixed(2)) }));

    // Order counts by status
    const byStatus = online.reduce((acc: any, o: any) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {});

    return {
      // Escrow
      totalEscrowHeld: parseFloat(totalEscrowHeld.toFixed(2)),
      pendingEscrow: parseFloat(totalEscrowHeld.toFixed(2)),
      totalPendingPayouts: parseFloat(totalPendingPayouts.toFixed(2)),
      pendingReleaseCount: pendingRelease.length,
      releasedToday: parseFloat(releasedTodayTotal.toFixed(2)),

      // Revenue
      totalPlatformFees: parseFloat(totalPlatformFees.toFixed(2)),
      platformFees: parseFloat(totalPlatformFees.toFixed(2)),
      totalOrderVolume: parseFloat(totalOrderVolume.toFixed(2)),
      totalRevenue: parseFloat(totalOrderVolume.toFixed(2)),
      gmv: parseFloat(totalOrderVolume.toFixed(2)),

      // This month
      monthFees: parseFloat(monthFees.toFixed(2)),
      monthVolume: parseFloat(monthVolume.toFixed(2)),
      monthRevenue: parseFloat(monthVolume.toFixed(2)),
      monthOrders: thisMonth.length,

      // This week
      weekFees: parseFloat(weekFees.toFixed(2)),
      weekVolume: parseFloat(weekVolume.toFixed(2)),
      weekRevenue: parseFloat(weekVolume.toFixed(2)),
      weekOrders: thisWeek.length,

      // Counts
      totalOnlineOrders: online.length,
      totalOfflineOrders: offline.length,
      onlineOrders: online.length,
      offlineOrders: offline.length,
      invoiceOrders: invoiceOrders.length,
      totalOrders: online.length + offline.length + invoiceOrders.length,
      byStatus,

      // New
      dailyRevenue,
      topSellers,
    };
  }

  // ── Seller rating — called after buyer confirms delivery ──────────────────
  async rateSellerForOrder(
    orderId: number,
    buyer: User,
    rating: number,
    comment?: string,
  ) {
    const order = await this.repo.findOne({
      where: { id: orderId },
      relations: { seller: true, buyer: true, product: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.buyer?.id !== buyer.id)
      throw new ForbiddenException('Not your order');
    if (
      ![OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(order.status)
    ) {
      throw new BadRequestException('Order must be delivered before rating');
    }
    if (rating < 1 || rating > 5)
      throw new BadRequestException('Rating must be 1–5');

    const seller = order.seller;
    if (!seller) throw new BadRequestException('No seller on this order');

    const existing = await this.reviewRepo.findOne({
      where: { order: { id: orderId }, buyer: { id: buyer.id } },
    });
    if (existing) throw new BadRequestException('You already rated this order');

    const businessProfile = await this.commerceProfiles
      .findForUserByType(seller.id, CommerceProfileType.BUSINESS)
      .catch(() => null);

    await this.reviewRepo.save(
      this.reviewRepo.create({
        buyer: { id: buyer.id } as User,
        seller: { id: seller.id } as User,
        order: { id: orderId } as Order,
        rating,
        comment: comment || null,
        verified: true,
        commerceProfileId: businessProfile?.id ?? null,
      }),
    );

    if (businessProfile) {
      await this.commerceProfiles
        .recordReview(businessProfile.id, rating)
        .catch(() => {});
    }

    // Recalculate seller's aggregate rating from actual review rows
    const allReviews = await this.reviewRepo.find({
      where: { seller: { id: seller.id } },
    });
    const newRating = parseFloat(
      (
        allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length
      ).toFixed(2),
    );

    await this.userRepo.update(seller.id, {
      rating: newRating,
      reviewsCount: allReviews.length,
    });

    // Mark order as rated so buyer can't double-rate
    await this.repo.update(orderId, { sellerRated: true });

    const productName =
      order.product?.name || order.manualProductName || 'bidhaa yako';
    await this.inAppNotif
      .reviewReceived(
        seller.id,
        rating,
        productName,
        order.product?.id,
        businessProfile?.id ?? null,
      )
      .catch(() => {});

    return {
      success: true,
      newRating,
      message: 'Ukadiriaji umepokewa. Asante!',
    };
  }

  // ── Get Order Detail ────────────────────────────────────────────────────── ──────────────────────────────────────────────────────
  async getOrderDetail(orderId: number, user: User): Promise<Order> {
    const order = await this.repo.findOne({
      where: { id: orderId },
      relations: { product: true, seller: true, buyer: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    // Allow: buyer, seller, admin, creator of offline order, or an
    // authorized team member of the seller
    const isBuyer = order.buyer && order.buyer.id === user.id;
    const isSeller = order.seller && order.seller.id === user.id;
    const isCreator = order.createdByUserId === user.id;
    const isAdmin = user.role === UserRole.ADMIN;
    const isAuthorizedStaff =
      !isBuyer &&
      !isSeller &&
      !isCreator &&
      !isAdmin &&
      order.seller?.id &&
      (await this.sellerScope.isAuthorizedFor(
        user,
        order.seller.id,
        'canViewOrders',
      ));

    if (!isBuyer && !isSeller && !isCreator && !isAdmin && !isAuthorizedStaff) {
      throw new ForbiddenException('Access denied');
    }

    return order;
  }

  // ── Update Order Status (Admin) ───────────────────────────────────────────
  async updateStatus(id: number, status: OrderStatus): Promise<Order> {
    const order = await this.repo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    order.status = status;
    return this.repo.save(order);
  }

  // ── Cancel Order ──────────────────────────────────────────────────────────
  async cancel(id: number, user: User) {
    const order = await this.repo.findOne({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (
      !order.buyer ||
      (order.buyer.id !== user.id && user.role !== UserRole.ADMIN)
    )
      throw new ForbiddenException('Access denied');
    if (order.status !== OrderStatus.PENDING_PAYMENT)
      throw new BadRequestException('Only pending orders can be cancelled');
    order.status = OrderStatus.CANCELLED;
    await this.repo.save(order);
    try {
      if (order.product)
        await this.productsService.decreaseStock(
          order.product.id,
          -order.quantity,
          InventoryMovementReason.ORDER_CANCELLED,
          { referenceType: 'order', referenceId: order.id, userId: user.id },
        );
    } catch (e) {
      console.error('Stock restoration on cancel failed:', e.message);
    }
    return { message: 'Order cancelled successfully' };
  }

  async findOne(id: number, user: User): Promise<Order> {
    return this.getOrderDetail(id, user);
  }

  // ── Get available delivery methods for buyer address + product ───────────
  async getDeliveryMethods(buyerAddress: string, productId: number) {
    const product = await this.productsService.findOne(productId);

    const DAR_KEYWORDS = [
      'kariakoo',
      'ilala',
      'kisutu',
      'upanga',
      'kinondoni',
      'mikocheni',
      'mwenge',
      'sinza',
      'ubungo',
      'kimara',
      'mbezi',
      'temeke',
      'mbagala',
      'kigamboni',
      'bunju',
      'tegeta',
      'boko',
      'kunduchi',
      'msasani',
      'masaki',
      'oyster bay',
      'dar es salaam',
      'dar',
      'dsm',
      'mwananyamala',
      'magomeni',
      'tandale',
      'manzese',
      'kijitonyama',
      'yombo',
      'tandika',
      'mtoni',
      'kurasini',
      'mbweni',
      'mbezi louis',
      'mbezi beach',
      'kibamba',
      "chang'ombe",
    ];

    const BATCH_ZONES: Record<string, string[]> = {
      Mbagala: ['mbagala', 'yombo', 'tandika'],
      Bunju: ['bunju', 'mbweni', 'boko', 'tegeta'],
      Mbezi: ['mbezi', 'kimara', 'kibamba'],
      Kigamboni: ['kigamboni', 'kurasini', 'mtoni'],
      Kinondoni: [
        'kinondoni',
        'mwenge',
        'mikocheni',
        'sinza',
        'msasani',
        'masaki',
        'oyster bay',
      ],
    };

    const lower = (buyerAddress || '').toLowerCase();
    const buyerInDar = DAR_KEYWORDS.some((kw) => lower.includes(kw));
    const sellerCity = (product as any).sellerCity || 'Dar es Salaam';
    const sellerInDar = !sellerCity || sellerCity.toLowerCase().includes('dar');
    const isSameCity = buyerInDar && sellerInDar;

    let batchZone: string | null = null;
    for (const [zone, keywords] of Object.entries(BATCH_ZONES)) {
      if (keywords.some((kw) => lower.includes(kw))) {
        batchZone = zone;
        break;
      }
    }

    const bodaFee = Number((product as any).bodaFee || 0);
    const deliveryFee = Number(product.deliveryFee || 0);
    const basePrice = Number(product.basePrice || 0);
    const BATCH_FEE = 3000;

    if (!isSameCity) {
      return {
        isSameCity: false,
        batchZone: null,
        methods: [
          {
            key: 'agent',
            label: 'KenteXa Super Agent',
            icon: '🏢',
            fee: deliveryFee,
            totalPrice: basePrice + deliveryFee,
            desc: 'Intercity delivery via KenteXa agent network',
          },
        ],
      };
    }

    const methods: any[] = [
      {
        key: 'boda',
        label: 'Boda Boda',
        icon: '🛵',
        fee: bodaFee,
        totalPrice: basePrice + bodaFee,
        desc: 'Muuzaji atapanga boda boda — utoaji wa siku hiyo hiyo',
      },
    ];

    if (batchZone) {
      methods.push({
        key: 'kentexa_delivery',
        label: 'KenteXa Delivery',
        icon: '🚐',
        fee: BATCH_FEE,
        totalPrice: basePrice + BATCH_FEE,
        desc: `Van ya KenteXa inakuja ${batchZone} kila siku — TZS ${BATCH_FEE.toLocaleString()} tu`,
        batchZone,
        cutoffTime: '7:00 AM',
        estimatedArrival: '10:00 AM',
      });
    }

    return { isSameCity: true, batchZone, methods };
  }

  // ── Seller creates order on behalf of customer ──────────────────────────
  // Customer paid outside KenteXa — seller acts as proxy buyer
  async createOnBehalf(
    seller: User,
    dto: {
      productId: number;
      quantity: number;
      buyerName: string;
      buyerPhone: string;
      deliveryAddress: string;
      shippingMethod?: string;
      notes?: string;
      paymentMethod?: string;
      paymentRef?: string;
      busCompany?: string;
      busTicketNumber?: string;
      externalTrackingRef?: string;
      // Which CommerceProfile (personal vs a specific business) this order
      // was created as — same pattern as createSellerShipment().
      commerceProfileId?: number;
    },
  ) {
    const product = await this.productsService.findOne(dto.productId);
    if (!product) throw new NotFoundException('Product not found');
    if (product.seller?.id !== seller.id)
      throw new ForbiddenException('Not your product');
    if (!product.isAvailable)
      throw new BadRequestException('Product not available');
    if (product.stock < dto.quantity)
      throw new BadRequestException('Insufficient stock');

    let senderDisplayName = (seller as any).storeName || seller.name;
    if (dto.commerceProfileId) {
      const authorized = await this.profileScope.isAuthorizedFor(
        seller.id,
        dto.commerceProfileId,
        'canCreateOrders',
      );
      if (authorized) {
        const profile = await this.commerceProfiles
          .findById(dto.commerceProfileId)
          .catch(() => null);
        if (profile?.displayName) senderDisplayName = profile.displayName;
      }
    }

    const basePrice = Number(product.basePrice || 0);
    const deliveryFee = Number(product.deliveryFee || 0);
    const totalAmount = (basePrice + deliveryFee) * dto.quantity;
    const baseAmount = basePrice * dto.quantity;
    const deliveryAmount = deliveryFee * dto.quantity;
    const chosenMethod =
      dto.shippingMethod || product.shippingMethod || 'agent';

    // ── ZERO FEE RULE FOR MANUAL ORDERS ──────────────────────────────────────
    // The buyer paid the SELLER directly (M-Pesa, cash) — KenteXa never holds
    // this money. There is therefore NO platform fee and NO payout owed to the
    // seller from KenteXa; the seller already has 100% of the sale in hand.
    // We deliberately skip calcCommission() here — using it would silently
    // create a phantom payout obligation that doesn't exist.
    const platformFee = 0;
    const sellerAmount = 0; // KenteXa owes nothing — not "haven't paid yet", genuinely zero

    const order = this.repo.create({
      // No buyer account — use manual fields
      buyer: null,
      manualBuyerName: dto.buyerName,
      manualBuyerPhone: dto.buyerPhone,
      phone: dto.buyerPhone,
      product,
      seller,
      quantity: dto.quantity,
      totalAmount,
      baseAmount,
      deliveryAmount,
      sellerAmount,
      platformFee,
      agentCommissionAmount: 0,
      deliveryAddress: dto.deliveryAddress,
      shippingMethod: chosenMethod,
      // Mark as paid since seller confirmed payment received
      paymentStatus: 'paid' as any,
      status: 'preparing' as any,
      source: 'offline' as any,
      createdByUserId: seller.id,
      notes: dto.notes || null,
      busCompany: dto.busCompany || null,
      busTicketNumber: dto.busTicketNumber || null,
      externalTrackingRef: dto.externalTrackingRef || null,
    } as any);

    const saved = await this.repo.save(order as any);

    // Reduce stock
    await this.productsService.decreaseStock(
      product.id,
      dto.quantity,
      InventoryMovementReason.MANUAL,
      { referenceType: 'order', referenceId: saved.id, userId: seller.id },
    );

    // Generate tracking number
    const trackingNumber = `KTX-ORD-${saved.id}`;
    await this.repo.update(saved.id, { trackingNumber });

    // ── Manual-order payment confirmation ───────────────────────────────
    // Same treatment as createSellerShipment()'s manual-payment flow:
    // a real receipted Invoice (recordManualPayment — the same generator
    // every other manual payment in the app uses) plus a branded SMS to
    // the buyer, never claiming Kentexa processed money the seller
    // collected directly. Fires exactly once, inline in this create call
    // — no separate "mark paid" step exists that could re-trigger it.
    const invoice = await this.invoicesService.recordManualPayment(
      saved as any,
      {
        amount: totalAmount,
        paymentMethod: dto.paymentMethod || 'cash',
        payerName: dto.buyerName,
        payerPhone: dto.buyerPhone,
      },
    );

    let buyerPaymentSmsSent = false;
    try {
      buyerPaymentSmsSent = await this.smsService.sendSms(
        dto.buyerPhone,
        `Habari ${dto.buyerName}, ${senderDisplayName} imepokea malipo yako ya TZS ${totalAmount.toLocaleString()} kwa ${product.name} (Oda: ${trackingNumber}).\n\n` +
          `Risiti: ${invoice.receiptNumber}\n\n` +
          `Verified by Kentexa`,
      );
    } catch (e: any) {
      // Non-fatal — order and receipt already exist regardless
      console.error('Manual order payment SMS failed:', e.message);
    }

    return {
      success: true,
      orderId: saved.id,
      trackingNumber,
      buyerName: dto.buyerName,
      productName: product.name,
      receipt: {
        receiptNumber: invoice.receiptNumber,
        amount: totalAmount,
        paymentMethod: dto.paymentMethod || 'cash',
        buyerPaymentSmsSent,
      },
      sellerStoreName: (seller as any).storeName || seller.name || null,
      totalAmount,
      message: `Agizo #${saved.id} limeundwa. Nambari ${trackingNumber} imetumwa kwa ${dto.buyerPhone}`,
    };
  }

  // ── Admin: force change order status ────────────────────────────────────
  async adminChangeStatus(orderId: number, status: string, admin: User) {
    if (!['admin', 'manager'].includes(admin.role)) {
      throw new ForbiddenException('Admin only');
    }
    const order = await this.repo.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    await this.repo.update(orderId, { status: status as any });

    // If confirming — flag for payout (admin releases via Payouts page)
    if (status === 'confirmed' || status === 'delivered') {
      await this.repo
        .update(orderId, { escrowStatus: 'release_requested' as any })
        .catch(() => {});
    }
    return { message: `Order #${orderId} status changed to ${status}` };
  }

  // ── Find order by tracking number (for boda/personal old format) ─────────
  async findByTrackingNumber(trackingNumber: string) {
    const order = await this.repo.findOne({
      where: { trackingNumber },
      select: {
        id: true,
        trackingNumber: true,
        shippingMethod: true,
        status: true,
      },
    });
    if (!order)
      throw new NotFoundException(
        `Tracking number ${trackingNumber} not found`,
      );
    return {
      id: order.id,
      trackingNumber: order.trackingNumber,
      shippingMethod: order.shippingMethod,
    };
  }
}
