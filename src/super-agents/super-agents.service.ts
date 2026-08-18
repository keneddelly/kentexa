import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  SuperAgent,
  SuperAgentStatus,
  CITY_CODES,
  TANZANIA_CITIES,
} from './entities/super-agent.entity';
import { IntercityRoute } from './entities/intercity-route.entity';
import { TANZANIA_ROUTE_SEEDS } from '../database/seed-routes';
import { Parcel, ParcelStatus, ParcelTracking } from './entities/parcel.entity';
import { ShippingRate } from './entities/shipping-rate.entity';
import { BulkShipment } from './entities/bulk-shipment.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { Agent } from '../agents/entities/agent.entity';
import { AgentTransaction } from '../agents/entities/agent-transaction.entity';
import {
  Order,
  OrderSource,
  OrderStatus,
} from '../orders/entities/order.entity';
import { BatchParcel } from '../daily-batches/entities/batch-parcel.entity';
import { SmsService } from '../sms/sms.service';
import { BusinessCustomerService } from '../business/business-customer.service';
import { mergeActiveRole } from '../users/utils/merge-active-role.util';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import {
  CommerceProfileType,
  CommerceProfileStatus,
} from '../commerce-profiles/entities/commerce-profile.entity';
import { TransportAssignment } from '../transport/entities/transport-assignment.entity';
import { InvoicesService } from '../invoices/invoices.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Payment, PaymentStatus } from '../payments/entities/payment.entity';
import { FRONTEND_URL } from '../config/urls.config';

// Default Kentexa platform fee per Super-Agent-collected counter order,
// past the free-order allowance. Real per-agent columns
// (SuperAgent.platformFeePerOrder/billingThreshold) default to this value
// but can be overridden per Super Agent — never branch on a specific
// agent's id/name in code. Accrues onto SuperAgent.outstandingBalance,
// paid down via recordBillingPayment() below.
export const SUPER_AGENT_PLATFORM_FEE = 1000;

@Injectable()
export class SuperAgentsService {
  constructor(
    @InjectRepository(SuperAgent)
    private superAgentRepo: Repository<SuperAgent>,
    @InjectRepository(TransportAssignment)
    private transportAssignmentRepo: Repository<TransportAssignment>,
    @InjectRepository(Parcel) private parcelRepo: Repository<Parcel>,
    @InjectRepository(ParcelTracking)
    private trackingRepo: Repository<ParcelTracking>,
    @InjectRepository(ShippingRate) private rateRepo: Repository<ShippingRate>,
    @InjectRepository(BulkShipment) private bulkRepo: Repository<BulkShipment>,
    @InjectRepository(IntercityRoute)
    private routeRepo: Repository<IntercityRoute>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Agent) private agentRepo: Repository<Agent>,
    @InjectRepository(AgentTransaction)
    private agentTransactionRepo: Repository<AgentTransaction>,
    @InjectRepository(BatchParcel)
    private batchParcelRepo: Repository<BatchParcel>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Payment) private paymentRepo: Repository<Payment>,
    private smsService: SmsService,
    private dataSource: DataSource,
    private businessCustomerService: BusinessCustomerService,
    private inAppNotif: InAppNotificationService,
    private commerceProfiles: CommerceProfilesService,
    private invoicesService: InvoicesService,
    private auditLog: AuditLogService,
  ) {}

  // ── Generate tracking number KTX-DAR-MZA-000001 ──────────────────────────
  // ── Generate agent code SA-DAR-001 ────────────────────────────────────────
  // ── Generate bulk shipment code ───────────────────────────────────────────
  private generateBulkCode(
    originCity: string,
    destinationCity: string,
  ): string {
    const originCode =
      CITY_CODES[originCity] || originCity.substring(0, 3).toUpperCase();
    const destCode =
      CITY_CODES[destinationCity] ||
      destinationCity.substring(0, 3).toUpperCase();
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `BULK-${originCode}-${destCode}-${date}-${rand}`;
  }

  // ── Add tracking event ────────────────────────────────────────────────────
  private async addTrackingEvent(
    parcel: Parcel,
    status: ParcelStatus,
    city: string,
    note: string,
    updatedBy: string,
    handlerInfo?: {
      phone?: string;
      location?: string;
      type?: 'super_agent' | 'local_agent' | 'system';
    },
  ) {
    await this.trackingRepo
      .save(
        this.trackingRepo.create({
          parcel,
          status,
          city,
          note,
          updatedBy,
          handlerPhone: handlerInfo?.phone || null,
          handlerLocation: handlerInfo?.location || null,
          handlerType: handlerInfo?.type || 'system',
        } as any),
      )
      .catch((e) => console.warn('Tracking event save failed:', e.message));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUPER AGENT REGISTRATION
  // ══════════════════════════════════════════════════════════════════════════

  async apply(
    user: User,
    dto: {
      businessName: string;
      city: string;
      address: string;
      phone: string;
      governmentId: string;
      governmentIdImage?: string;
    },
  ) {
    const existing = await this.superAgentRepo.findOne({
      where: { user: { id: user.id } },
    });
    if (existing)
      throw new BadRequestException(
        'You already have a super agent application',
      );
    if (!TANZANIA_CITIES.includes(dto.city))
      throw new BadRequestException(`Invalid city: ${dto.city}`);

    const cityCode =
      CITY_CODES[dto.city] || dto.city.substring(0, 3).toUpperCase();
    const agentCode = `SA-${cityCode}-${Date.now().toString(36).toUpperCase().slice(-4)}`;

    const agent = this.superAgentRepo.create({
      user,
      agentCode,
      cityCode,
      businessName: dto.businessName,
      city: dto.city,
      address: dto.address,
      phone: dto.phone,
      governmentId: dto.governmentId,
      governmentIdImage: dto.governmentIdImage || null,
      status: SuperAgentStatus.PENDING,
      commissionRate: 10,
      shippingRates: {},
    });

    const saved = await this.superAgentRepo.save(agent);

    try {
      await this.commerceProfiles.createProfile({
        ownerId: user.id,
        type: CommerceProfileType.HUB,
        displayName: saved.businessName,
        usernameSeed: saved.businessName,
        photoUrl: user.avatarUrl,
        location: saved.city,
        status: CommerceProfileStatus.PENDING,
        superAgentId: saved.id,
      });
    } catch {}

    return saved;
  }

  async getMyProfile(user: User) {
    const agent = await this.superAgentRepo.findOne({
      where: { user: { id: user.id } },
    });
    if (!agent) throw new NotFoundException('Super agent profile not found');
    return agent;
  }

  // ── Public: hub info for CommerceProfile.js — never earnings/rates ───────
  async findPublicByUserId(userId: number) {
    const agent = await this.superAgentRepo.findOne({
      where: { user: { id: userId } },
    });
    if (!agent || agent.status !== SuperAgentStatus.ACTIVE) return null;
    return {
      businessName: agent.businessName,
      city: agent.city,
      cityCode: agent.cityCode,
      agentCode: agent.agentCode,
      rating: Number(agent.rating),
      totalRatings: agent.totalRatings,
      totalParcelsHandled: agent.totalParcelsHandled,
      totalParcelsDelivered: agent.totalParcelsDelivered,
      coverageCitiesOrigin: agent.coverageCitiesOrigin,
      coverageCitiesDestination: agent.coverageCitiesDestination,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SHIPPING RATES (set by super agent)
  // ══════════════════════════════════════════════════════════════════════════

  async setShippingRates(
    user: User,
    rates: {
      destinationCity: string;
      ratePerKg: number;
      minimumCharge: number;
      estimatedDays: number;
    }[],
  ) {
    const agent = await this.getMyProfile(user);
    if (agent.status !== SuperAgentStatus.ACTIVE)
      throw new ForbiddenException('Your account must be active to set rates');

    for (const rate of rates) {
      if (!TANZANIA_CITIES.includes(rate.destinationCity)) continue;
      const existing = await this.rateRepo.findOne({
        where: {
          superAgent: { id: agent.id },
          originCity: agent.city,
          destinationCity: rate.destinationCity,
        },
      });
      if (existing) {
        existing.ratePerKg = rate.ratePerKg;
        existing.minimumCharge = rate.minimumCharge;
        existing.estimatedDays = rate.estimatedDays;
        await this.rateRepo.save(existing);
      } else {
        await this.rateRepo.save(
          this.rateRepo.create({
            superAgent: agent,
            originCity: agent.city,
            destinationCity: rate.destinationCity,
            ratePerKg: rate.ratePerKg,
            minimumCharge: rate.minimumCharge,
            estimatedDays: rate.estimatedDays,
          }),
        );
      }
    }
    return { message: 'Shipping rates updated successfully' };
  }

  async getShippingRates(city: string) {
    return this.rateRepo.find({
      where: { originCity: city, isActive: true },
      order: { destinationCity: 'ASC' },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SHIPPING CALCULATOR
  // ══════════════════════════════════════════════════════════════════════════

  // ── Estimate shipping fee at product-posting time ─────────────────────────
  // Seller doesn't know the buyer's destination yet, so we return a
  // min/avg/max range across all active routes from their origin city.
  async estimateShippingFromOrigin(originCity: string, weightKg: number) {
    const rates = await this.rateRepo.find({
      where: { originCity, isActive: true },
    });

    if (!rates.length) {
      return {
        available: false,
        message: `No shipping rates configured yet for ${originCity}. Enter your shipping fee manually.`,
      };
    }

    const costs = rates.map((rate) => {
      const calculated = weightKg * Number(rate.ratePerKg);
      return Math.max(calculated, Number(rate.minimumCharge));
    });

    const min = Math.min(...costs);
    const max = Math.max(...costs);
    const avg = parseFloat(
      (costs.reduce((s, c) => s + c, 0) / costs.length).toFixed(2),
    );

    return {
      available: true,
      originCity,
      weightKg,
      routeCount: rates.length,
      min: Math.round(min),
      max: Math.round(max),
      suggested: Math.round(avg),
    };
  }

  async calculateShipping(
    originCity: string,
    destinationCity: string,
    weightKg: number,
  ) {
    const rate = await this.rateRepo.findOne({
      where: { originCity, destinationCity, isActive: true },
      relations: { superAgent: true },
    });

    if (!rate) {
      return {
        available: false,
        message: `No shipping rate available from ${originCity} to ${destinationCity}`,
      };
    }

    const calculated = weightKg * Number(rate.ratePerKg);
    const total = Math.max(calculated, Number(rate.minimumCharge));

    return {
      available: true,
      originCity,
      destinationCity,
      weightKg,
      ratePerKg: Number(rate.ratePerKg),
      minimumCharge: Number(rate.minimumCharge),
      shippingCost: total,
      estimatedDays: rate.estimatedDays,
      superAgentName: rate.superAgent?.businessName,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PARCEL MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  // Seller creates parcel when handing over to super agent

  // ── Create offline intercity order + parcel ──────────────────────────────
  // For BiS/seller customers who paid outside KenteXa (M-Pesa direct)
  // Creates a paid order + parcel + sends SMS tracking to customer
  async createOfflineIntercityOrder(
    superAgentUser: User,
    dto: {
      // Sender — walk-in at the counter (no KenteXa account needed)
      senderName: string;
      senderPhone: string;
      // Recipient
      recipientName: string;
      recipientPhone: string;
      destinationCity: string;
      deliveryAddress: string;
      // Parcel details
      description: string; // what's inside — "nguo", "vifaa vya ujenzi" etc
      weightKg?: number;
      parcelSize?: string; // small | medium | large
      declaredValue?: number; // optional — for insurance
      // Fee collected at counter
      shippingFeeCollected: number;
      paymentMethod?: string; // cash | mpesa | airtel
      notes?: string;
    },
  ) {
    const superAgent = await this.superAgentRepo.findOne({
      where: { user: { id: superAgentUser.id } },
    });
    if (!superAgent)
      throw new BadRequestException('Super Agent profile not found');

    this.assertNotBillingBlocked(superAgent);

    const originCity = superAgent.city;
    const destinationCity = dto.destinationCity;
    const weightKg = dto.weightKg || 0.5;

    // 1. Create a minimal order record — for tracking purposes only
    //    No seller, no product, no escrow. source = 'offline_intercity'
    const order = this.orderRepo.create({
      source: 'offline_intercity' as any,
      manualBuyerName: dto.recipientName,
      manualBuyerPhone: dto.recipientPhone,
      manualProductName: dto.description,
      deliveryAddress: dto.deliveryAddress,
      phone: dto.recipientPhone,
      quantity: 1,
      totalAmount: dto.shippingFeeCollected,
      baseAmount: dto.shippingFeeCollected,
      sellerAmount: 0, // no seller
      platformFeeAmount: 0, // KenteXa commission tracked separately on parcel
      deliveryAmount: 0,
      paymentStatus: 'paid' as any,
      status: 'preparing' as any,
      shippingMethod: 'agent',
      seller: null,
      notes: dto.notes || null,
      createdByUserId: superAgentUser.id,
      shippingFeeCollected: dto.shippingFeeCollected,
      shippingFeeCollectedByAgentId: superAgent.id,
      shippingFeeCollectedAt: new Date(),
    } as any);

    const savedOrder = await this.orderRepo.save(order as any);
    const trackingNumber = `KTX-ORD-${savedOrder.id}`;
    await this.orderRepo.update(savedOrder.id, { trackingNumber });

    // 2. Super agent earnings = commission % of fee collected
    const commissionRate = Number(superAgent.commissionRate || 10);
    const agentEarnings = parseFloat(
      ((dto.shippingFeeCollected * commissionRate) / 100).toFixed(2),
    );

    // 3. Find destination Super Agent and look up route for transit city
    const destAgent = await this.superAgentRepo.findOne({
      where: { city: destinationCity, status: SuperAgentStatus.ACTIVE },
    });

    // Check if route has a transit city (e.g. Dar→Mbinga via Songea)
    const route = await this.routeRepo.findOne({
      where: { originCity, destinationCity, isActive: true },
    });
    const transitCity = (route as any)?.transitCity || null;

    // Calculate expected arrival date
    const estimatedDays = route?.estimatedDays || 2;
    const expectedArrival = new Date();
    expectedArrival.setDate(expectedArrival.getDate() + estimatedDays);
    const expectedArrivalStr = expectedArrival.toISOString().split('T')[0];

    // 3b. Founding-pilot free-order check — computed once per created
    // parcel, never re-run on a retry of an already-succeeded request, so
    // a duplicate/replayed submission can't consume the allowance twice.
    const isFreeOrder = superAgent.freeOrdersUsed < superAgent.freeOrdersGranted;
    const feePerOrder =
      Number(superAgent.platformFeePerOrder) || SUPER_AGENT_PLATFORM_FEE;
    const platformFeeCharged = isFreeOrder ? 0 : feePerOrder;
    const platformFeeWaived = isFreeOrder ? feePerOrder : 0;

    // 4. Create parcel
    const parcel = this.parcelRepo.create({
      trackingNumber,
      order: savedOrder,
      seller: null,
      buyer: null,
      senderName: dto.senderName,
      senderPhone: dto.senderPhone,
      superAgent: superAgent,
      destinationSuperAgent: destAgent || null,
      originCity,
      destinationCity,
      transitCity,
      expectedArrival: expectedArrivalStr,
      deliveryAddress: dto.deliveryAddress,
      recipientName: dto.recipientName,
      buyerPhone: dto.recipientPhone,
      weightKg,
      parcelSize: dto.parcelSize || 'small',
      description: dto.description,
      estimatedShippingFee: dto.shippingFeeCollected,
      actualShippingFee: dto.shippingFeeCollected,
      superAgentEarnings: agentEarnings,
      platformFeeCharged,
      platformFeeWaived,
      status: ParcelStatus.RECEIVED_AT_HUB, // already at hub — super agent has it
    } as any);

    const savedParcel = (await this.parcelRepo.save(
      parcel as any,
    )) as unknown as Parcel;

    // Aggregate the free-order/fee counters onto the Super Agent's own
    // record — same tracked-only principle as the parcel-level fields above.
    // totalEarnings/totalParcelsHandled were missing here entirely — every
    // counter order registered through this endpoint (the flagship
    // walk-in flow) permanently undercounted both on the admin dashboard,
    // since this is the only write site for this specific event.
    await this.superAgentRepo.update(superAgent.id, {
      freeOrdersUsed: isFreeOrder
        ? superAgent.freeOrdersUsed + 1
        : superAgent.freeOrdersUsed,
      totalPlatformFeesCharged:
        Number(superAgent.totalPlatformFeesCharged) + platformFeeCharged,
      totalPlatformFeesWaived:
        Number(superAgent.totalPlatformFeesWaived) + platformFeeWaived,
      totalEarnings: Number(superAgent.totalEarnings) + agentEarnings,
      totalParcelsHandled: superAgent.totalParcelsHandled + 1,
      paidOrders: isFreeOrder
        ? superAgent.paidOrders
        : superAgent.paidOrders + 1,
      outstandingBalance: isFreeOrder
        ? Number(superAgent.outstandingBalance)
        : Number(superAgent.outstandingBalance) + platformFeeCharged,
    });

    // 5. Tracking event
    await this.addTrackingEvent(
      savedParcel,
      ParcelStatus.RECEIVED_AT_HUB,
      originCity,
      `Imepokewa na ${superAgent.businessName} — ${originCity}. Inasubiri kutumwa kwenda ${destinationCity}.`,
      superAgent.businessName,
      {
        phone: superAgent.phone || (superAgent as any).user?.phone,
        location: superAgent.address || originCity,
        type: 'super_agent',
      },
    );

    // 6. Receipt — evidence the Super Agent received the sender's cash.
    // Reuses the same transactional receipt-number generator every other
    // paid invoice in the app uses; created already PAID since the money
    // changed hands before this call ever ran.
    const invoice = await this.invoicesService.recordManualPayment(
      savedOrder,
      {
        amount: dto.shippingFeeCollected,
        paymentMethod: dto.paymentMethod || 'cash',
        agentId: superAgent.id,
      },
    );

    // 7. SMS #1 — to the SENDER only, confirming the cash payment was
    // received. Never to the receiver — that SMS fires later, from
    // dispatchParcel(), only once the parcel actually leaves for transport.
    let senderSmsSent = false;
    try {
      senderSmsSent = await this.smsService.sendSms(
        dto.senderPhone,
        `SUPER AGENT ${superAgent.businessName}\n\n` +
          `Malipo yako ya TZS ${dto.shippingFeeCollected.toLocaleString()} yamepokewa kwa kifurushi ${trackingNumber}.\n\n` +
          `Risiti: ${invoice.receiptNumber}\n` +
          `Imepokewa na: ${superAgent.businessName}\n\n` +
          `Verified by Kentexa`,
      );
    } catch (e: any) {
      console.warn('Sender payment SMS failed:', e?.message);
    }

    // Payment/receipt/parcel are already committed above — this is purely
    // the audit trail + SMS-attempt record, and never blocks the response.
    await this.auditLog
      .record({
        actorId: superAgentUser.id,
        actorRole: 'super_agent',
        action: 'parcel.payment_received',
        entityType: 'parcel',
        entityId: savedParcel.id,
        newValue: {
          receiptNumber: invoice.receiptNumber,
          amount: dto.shippingFeeCollected,
          senderPhone: dto.senderPhone,
          senderSmsSent,
          platformFeeCharged,
          platformFeeWaived,
        },
      })
      .catch(() => {});

    return {
      success: true,
      orderId: savedOrder.id,
      trackingNumber,
      originCity,
      destinationCity,
      destinationAgent: destAgent?.businessName || null,
      shippingFeeCollected: dto.shippingFeeCollected,
      agentEarnings,
      receiptNumber: invoice.receiptNumber,
      receipt: {
        receiptNumber: invoice.receiptNumber,
        parcelReference: trackingNumber,
        senderName: dto.senderName,
        senderPhone: dto.senderPhone,
        receiverName: dto.recipientName,
        receiverPhone: dto.recipientPhone,
        amountPaid: dto.shippingFeeCollected,
        paymentMethod: dto.paymentMethod || 'cash',
        superAgentName: superAgent.businessName,
        superAgentCity: superAgent.city,
        status: 'paid',
        paidAt: invoice.paidAt,
        verifiedByKentexa: true,
      },
      senderSmsSent,
      message: senderSmsSent
        ? `Kifurushi kimesajiliwa. SMS ya malipo imetumwa kwa ${dto.senderPhone}.`
        : `Kifurushi kimesajiliwa. Risiti: ${invoice.receiptNumber}. SMS ya malipo haikutumwa — jaribu tena.`,
      billing: {
        isFreeOrder,
        platformFeeCharged,
        platformFeeWaived,
        outstandingBalance:
          Number(superAgent.outstandingBalance) + (isFreeOrder ? 0 : platformFeeCharged),
      },
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AUTO-ASSIGNMENT — find the right Super Agent for a city
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Find the best active Super Agent for a given city.
   * Priority: highest rating → most parcels delivered (experience).
   * Used at order creation to auto-assign origin and destination agents.
   */
  async findAgentForCity(city: string): Promise<SuperAgent | null> {
    const agents = await this.superAgentRepo.find({
      where: { status: SuperAgentStatus.ACTIVE, city },
    });
    if (!agents.length) return null;

    // Sort by rating desc, then by experience desc
    agents.sort((a, b) => {
      const ratingDiff = Number(b.rating) - Number(a.rating);
      if (Math.abs(ratingDiff) > 0.1) return ratingDiff;
      return b.totalParcelsDelivered - a.totalParcelsDelivered;
    });
    return agents[0];
  }

  /**
   * Get the route information between two cities.
   * Returns estimated days, fee, and transport method.
   */
  async getRoute(
    originCity: string,
    destinationCity: string,
  ): Promise<IntercityRoute | null> {
    return this.routeRepo.findOne({
      where: { originCity, destinationCity, isActive: true },
    });
  }

  /**
   * Called after every successful delivery — updates agent rating and stats.
   * onTime: whether the parcel arrived within estimatedDays.
   * newRating: 1-5 score from the buyer/system (null = no explicit rating).
   */
  async recordDelivery(
    agentId: number,
    onTime: boolean,
    newRating?: number,
  ): Promise<void> {
    const agent = await this.superAgentRepo.findOne({ where: { id: agentId } });
    if (!agent) return;

    const updates: Partial<SuperAgent> = {
      totalParcelsDelivered: agent.totalParcelsDelivered + 1,
      totalParcelsDelayed: onTime
        ? agent.totalParcelsDelayed
        : agent.totalParcelsDelayed + 1,
    };

    if (newRating != null && newRating >= 1 && newRating <= 5) {
      // Rolling weighted average: keeps history without storing every rating
      const totalR = agent.totalRatings + 1;
      const newAvg =
        (Number(agent.rating) * agent.totalRatings + newRating) / totalR;
      updates.rating = parseFloat(newAvg.toFixed(2));
      updates.totalRatings = totalR;
    }

    await this.superAgentRepo.update(agentId, updates);
  }

  /**
   * Record a lost parcel against this agent's stats.
   */
  async recordLostParcel(agentId: number): Promise<void> {
    await this.superAgentRepo.increment({ id: agentId }, 'totalParcelsLost', 1);
    // Lost parcels also penalise rating — deduct 0.5 points (capped at 1.0 minimum)
    const agent = await this.superAgentRepo.findOne({ where: { id: agentId } });
    if (!agent) return;
    const penalised = Math.max(1.0, Number(agent.rating) - 0.5);
    await this.superAgentRepo.update(agentId, { rating: penalised });
  }

  /**
   * Record a complaint against this agent.
   */
  async recordComplaint(agentId: number): Promise<void> {
    await this.superAgentRepo.increment({ id: agentId }, 'totalComplaints', 1);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERCITY ROUTE MANAGEMENT (admin)
  // ══════════════════════════════════════════════════════════════════════════

  async getAllRoutes() {
    return this.routeRepo.find({
      order: { originCity: 'ASC', destinationCity: 'ASC' },
    });
  }

  async seedRoutes() {
    let seeded = 0;
    let skipped = 0;
    for (const route of TANZANIA_ROUTE_SEEDS) {
      const existing = await this.routeRepo.findOne({
        where: {
          originCity: route.originCity,
          destinationCity: route.destinationCity,
        },
      });
      if (!existing) {
        await this.routeRepo.save(
          this.routeRepo.create({ ...route, isActive: true } as any),
        );
        seeded++;
      } else {
        skipped++;
      }
    }
    return { seeded, skipped, total: TANZANIA_ROUTE_SEEDS.length };
  }

  async upsertRoute(dto: {
    originCity: string;
    destinationCity: string;
    estimatedDays: number;
    baseShippingFee: number;
    perKgFee?: number;
    primaryTransport?: string;
    notes?: string;
    isActive?: boolean;
    transitCity?: string;
    leg1Days?: number;
    leg2Days?: number;
  }) {
    const existing = await this.routeRepo.findOne({
      where: {
        originCity: dto.originCity,
        destinationCity: dto.destinationCity,
      },
    });
    if (existing) {
      await this.routeRepo.update(existing.id, { ...dto });
      return this.routeRepo.findOne({ where: { id: existing.id } });
    }
    return this.routeRepo.save(
      this.routeRepo.create({ ...dto, isActive: dto.isActive ?? true } as any),
    );
  }

  async deleteRoute(id: number) {
    await this.routeRepo.delete(id);
    return { message: 'Route deleted' };
  }

  // totalParcelsDelivered/totalParcelsDelayed were dead columns — only ever
  // written by recordDelivery(), which nothing in the codebase calls. This
  // computes both live from real Parcel rows instead, the same proven
  // approach getDashboard() already uses for its own "delivered" count
  // (just a true full count here, not that method's take:50 cap). A
  // delivered parcel counts as delayed when it arrived after its own
  // expectedArrival date.
  private async getLiveDeliveryStats(
    superAgentId: number,
  ): Promise<{ delivered: number; delayed: number; onTimeRate: number | null }> {
    const [delivered, deliveredParcels] = await Promise.all([
      this.parcelRepo.count({
        where: { superAgent: { id: superAgentId }, status: ParcelStatus.DELIVERED },
      }),
      this.parcelRepo.find({
        where: { superAgent: { id: superAgentId }, status: ParcelStatus.DELIVERED },
        select: { expectedArrival: true, deliveredTime: true },
      }),
    ]);
    const delayed = deliveredParcels.filter(
      (p) =>
        p.expectedArrival &&
        p.deliveredTime &&
        new Date(p.deliveredTime) > new Date(p.expectedArrival),
    ).length;
    const onTimeRate =
      delivered > 0
        ? parseFloat((((delivered - delayed) / delivered) * 100).toFixed(1))
        : null;
    return { delivered, delayed, onTimeRate };
  }

  async getAgentPerformance(agentId: number) {
    const agent = await this.superAgentRepo.findOne({ where: { id: agentId } });
    if (!agent) throw new NotFoundException('Agent not found');
    const { delivered, delayed, onTimeRate } =
      await this.getLiveDeliveryStats(agentId);
    const handled = agent.totalParcelsHandled;
    const successRate =
      handled > 0 ? parseFloat(((delivered / handled) * 100).toFixed(1)) : null;
    return {
      agentId,
      city: agent.city,
      businessName: agent.businessName,
      agentCode: agent.agentCode,
      status: agent.status,
      // rating/totalRatings/totalParcelsLost/totalComplaints have no
      // submission mechanism anywhere in the app yet (no one can rate a
      // Super Agent or file a complaint against one today) — returned as
      // the column default until that feature exists, not fabricated.
      rating: Number(agent.rating),
      totalRatings: agent.totalRatings,
      totalParcelsHandled: handled,
      totalParcelsDelivered: delivered,
      totalParcelsLost: agent.totalParcelsLost,
      totalParcelsDelayed: delayed,
      totalComplaints: agent.totalComplaints,
      onTimeRate,
      successRate,
      totalEarnings: Number(agent.totalEarnings),
      pendingEarnings: Number(agent.pendingEarnings),
      commissionRate: Number(agent.commissionRate),
    };
  }

  async getAllAgentsPerformance() {
    const agents = await this.superAgentRepo.find({
      order: { city: 'ASC', rating: 'DESC' } as any,
    });
    return Promise.all(
      agents.map(async (agent) => {
        const { delivered } = await this.getLiveDeliveryStats(agent.id);
        return {
          id: agent.id,
          city: agent.city,
          businessName: agent.businessName,
          agentCode: agent.agentCode,
          status: agent.status,
          rating: Number(agent.rating),
          totalParcelsHandled: agent.totalParcelsHandled,
          totalParcelsDelivered: delivered,
          totalParcelsLost: agent.totalParcelsLost,
          totalComplaints: agent.totalComplaints,
          totalEarnings: Number(agent.totalEarnings),
          pendingEarnings: Number(agent.pendingEarnings),
        };
      }),
    );
  }

  async findAll() {
    return this.superAgentRepo.find({ order: { createdAt: 'DESC' } });
  }

  async approve(id: number) {
    const agent = await this.superAgentRepo.findOne({ where: { id } });
    if (!agent) throw new NotFoundException('Super agent not found');
    agent.status = SuperAgentStatus.ACTIVE;
    const saved = await this.superAgentRepo.save(agent);
    if (agent.user) {
      await this.userRepo.update(agent.user.id, {
        role: UserRole.SUPER_AGENT,
        activeRoles: mergeActiveRole(agent.user.activeRoles, 'super_agent'),
      });
    }
    await this.commerceProfiles
      .syncStatusByLink('superAgentId', id, CommerceProfileStatus.ACTIVE)
      .catch(() => {});
    return saved;
  }

  async suspend(id: number, reason: string) {
    const agent = await this.superAgentRepo.findOne({ where: { id } });
    if (!agent) throw new NotFoundException('Super agent not found');
    agent.status = SuperAgentStatus.SUSPENDED;
    agent.rejectionReason = reason;
    await this.commerceProfiles
      .syncStatusByLink('superAgentId', id, CommerceProfileStatus.SUSPENDED)
      .catch(() => {});
    return this.superAgentRepo.save(agent);
  }

  async getCities() {
    return { cities: TANZANIA_CITIES, cityCodes: CITY_CODES };
  }

  // ── Admin: courier cost reimbursement ledger ────────────────────────────────
  // Shows what each Super Agent is owed (or owes back) for courier costs they
  // fronted, so admin can settle via their float/wallet.

  // ── Admin: mark a parcel's or bulk shipment's courier cost as settled ───────

  // ══════════════════════════════════════════════════════════════════════════
  // COLLECTION FEE CONFIG — admin-managed per-city collection fees
  // Stored as IntercityRoute rows with destinationCity = '_collection_fee'
  // so we don't need a new entity. originCity = the city, baseShippingFee = urban, perKgFee = rural.
  // ══════════════════════════════════════════════════════════════════════════

  async getCollectionFees() {
    const rows = await this.routeRepo.find({
      where: { destinationCity: '_collection_fee' },
    });
    return rows.map((r) => ({
      city: r.originCity,
      urbanFee: Number(r.baseShippingFee),
      ruralFee: Number(r.perKgFee),
    }));
  }

  async setCollectionFee(city: string, urbanFee: number, ruralFee: number) {
    const existing = await this.routeRepo.findOne({
      where: { originCity: city, destinationCity: '_collection_fee' },
    });
    if (existing) {
      await this.routeRepo.update(existing.id, {
        baseShippingFee: urbanFee,
        perKgFee: ruralFee,
      });
    } else {
      await this.routeRepo.save(
        this.routeRepo.create({
          originCity: city,
          destinationCity: '_collection_fee',
          estimatedDays: 0,
          baseShippingFee: urbanFee,
          perKgFee: ruralFee,
          isActive: true,
          notes: 'Collection fee config — not a transport route',
        } as any),
      );
    }
    return { city, urbanFee, ruralFee };
  }

  async getCollectionFeeForCity(
    city: string,
    isRural: boolean,
  ): Promise<number> {
    const row = await this.routeRepo.findOne({
      where: { originCity: city, destinationCity: '_collection_fee' },
    });
    if (row)
      return isRural ? Number(row.perKgFee) : Number(row.baseShippingFee);
    return isRural ? 3000 : 1500; // system defaults
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TRACKING — public, no auth
  // ══════════════════════════════════════════════════════════════════════════

  async trackParcel(trackingNumber: string) {
    const parcel = await this.parcelRepo.findOne({
      where: { trackingNumber },
      relations: {
        order: { buyer: true, seller: true, product: true },
        superAgent: true,
        destinationSuperAgent: true,
      },
    });
    if (!parcel)
      throw new NotFoundException(`Kifurushi ${trackingNumber} hakipatikani`);

    const tracking = await this.trackingRepo.find({
      where: { parcel: { id: parcel.id } },
      order: { createdAt: 'DESC' },
    });

    return {
      trackingNumber: parcel.trackingNumber,
      status: parcel.status,
      originCity: (parcel as any).originCity,
      destinationCity: (parcel as any).destinationCity,
      transitCity: (parcel as any).transitCity || null,
      expectedArrival: (parcel as any).expectedArrival || null,
      estimatedDays: (parcel as any).estimatedDays || null,
      // Sender
      senderName: (parcel as any).senderName || parcel.seller?.name || null,
      senderPhone: (parcel as any).senderPhone || parcel.seller?.phone || null,
      // Recipient
      recipientName: (parcel as any).recipientName,
      deliveryAddress: (parcel as any).deliveryAddress,
      // Item
      description:
        (parcel as any).description ||
        (parcel.order as any)?.manualProductName ||
        null,
      weightKg: (parcel as any).weightKg || null,
      parcelSize: (parcel as any).parcelSize || null,
      declaredValue: (parcel as any).declaredValue || null,
      // Origin hub
      originAgent: parcel.superAgent?.businessName || null,
      originAgentPhone: parcel.superAgent?.user?.phone || null,
      // Destination hub
      destinationAgent: parcel.destinationSuperAgent?.businessName || null,
      destinationAgentPhone: parcel.destinationSuperAgent?.user?.phone || null,
      // Transport — from parcel directly (seller_shipment) or from order (online)
      busCompany:
        (parcel as any).busCompany || (parcel.order as any)?.busCompany || null,
      busTicketNumber:
        (parcel as any).busTicketNumber ||
        (parcel.order as any)?.busTicketNumber ||
        null,
      busDeparture: (parcel as any).busDeparture || null,
      courierName:
        (parcel as any).courierName ||
        (parcel.order as any)?.courierName ||
        null,
      courierTrackingRef:
        (parcel as any).courierTrackingRef ||
        (parcel.order as any)?.externalTrackingRef ||
        null,
      // Seller info for WhatsApp button
      sellerWhatsApp: parcel.order?.seller
        ? (parcel.order.seller as any).storeWhatsApp
        : null,
      sellerStoreName: parcel.order?.seller
        ? (parcel.order.seller as any).storeName
        : null,
      // Dispatch info
      dispatchTime: (parcel as any).dispatchTime || null,
      arrivedAtHubTime: (parcel as any).arrivedAtHubTime || null,
      history: tracking.map((t) => ({
        status: t.status,
        city: t.city,
        note: t.note,
        updatedBy: t.updatedBy,
        handlerPhone: (t as any).handlerPhone || null,
        handlerLocation: (t as any).handlerLocation || null,
        handlerType: (t as any).handlerType || null,
        createdAt: t.createdAt,
      })),
    };
  }

  async trackByOrderId(orderId: number) {
    const parcel = await this.parcelRepo.findOne({
      where: { order: { id: orderId } },
      relations: {
        order: { buyer: true, seller: true, product: true },
        superAgent: true,
      },
    });
    if (parcel) return this.trackParcel(parcel.trackingNumber || '');

    // Fallback: check batch parcel
    const batchParcel = await this.batchParcelRepo
      ?.findOne({
        where: { order: { id: orderId } },
        relations: { order: true, zone: true },
      })
      .catch(() => null);

    if (batchParcel) {
      return {
        trackingNumber: batchParcel.trackingNumber,
        status: batchParcel.status,
        originCity: 'Dar es Salaam',
        destinationCity: 'Dar es Salaam',
        deliveryAddress: batchParcel.order?.deliveryAddress,
        zoneName: (batchParcel.zone as any)?.name,
        history: [],
      };
    }

    throw new NotFoundException(`Hakuna kifurushi kwa agizo #${orderId}`);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DASHBOARD — what the Super Agent sees on login
  // ══════════════════════════════════════════════════════════════════════════

  async getDashboard(user: User) {
    const agent = await this.superAgentRepo.findOne({
      where: { user: { id: user.id } },
    });
    if (!agent) return { status: 'not_applied' };

    const [originParcels, destParcels] = await Promise.all([
      this.parcelRepo.find({
        where: { superAgent: { id: agent.id } },
        relations: {
          order: { buyer: true, seller: true, product: true },
          destinationSuperAgent: true,
        },
        order: { createdAt: 'DESC' } as any,
        take: 50,
      }),
      this.parcelRepo.find({
        where: { destinationSuperAgent: { id: agent.id } },
        relations: {
          order: { buyer: true, seller: true, product: true },
          superAgent: true,
        },
        order: { createdAt: 'DESC' } as any,
        take: 50,
      }),
    ]);

    // Merge, deduplicate, add role
    const parcelMap = new Map<string, any>();
    for (const p of originParcels) {
      if (!p.trackingNumber) continue;
      parcelMap.set(p.trackingNumber, { ...p, myRole: 'origin' });
    }
    for (const p of destParcels) {
      if (!p.trackingNumber) continue;
      if (parcelMap.has(p.trackingNumber)) {
        parcelMap.get(p.trackingNumber).myRole = 'both';
      } else {
        parcelMap.set(p.trackingNumber, { ...p, myRole: 'destination' });
      }
    }

    const parcels = [...parcelMap.values()];

    const stats = {
      pending: parcels.filter(
        (p) =>
          [
            'pending',
            'received_at_hub',
            'verified',
            'ready_for_dispatch',
          ].includes(p.status) && p.myRole !== 'destination',
      ).length,
      receivedAtHub: parcels.filter((p) => p.status === 'received_at_hub')
        .length,
      inTransit: parcels.filter((p) =>
        ['dispatched', 'in_transit'].includes(p.status),
      ).length,
      arrivedAtHub: parcels.filter(
        (p) => p.status === 'arrived_at_hub' && p.myRole === 'destination',
      ).length,
      delivered: parcels.filter((p) => p.status === 'delivered').length,
      totalParcels: parcels.length,
      totalEarnings: Number(agent.totalEarnings),
      pendingEarnings: Number(agent.pendingEarnings),
    };

    return {
      agent: {
        id: agent.id,
        city: agent.city,
        businessName: agent.businessName,
        agentCode: agent.agentCode,
        status: agent.status,
        commissionRate: Number(agent.commissionRate),
        totalEarnings: Number(agent.totalEarnings),
        pendingEarnings: Number(agent.pendingEarnings),
        rating: Number(agent.rating),
        billing: {
          freeOrdersGranted: agent.freeOrdersGranted,
          freeOrdersUsed: agent.freeOrdersUsed,
          freeOrdersRemaining: Math.max(
            0,
            agent.freeOrdersGranted - agent.freeOrdersUsed,
          ),
          paidOrders: agent.paidOrders,
          platformFeePerOrder: Number(agent.platformFeePerOrder),
          totalPlatformFeesCharged: Number(agent.totalPlatformFeesCharged),
          totalPlatformFeesWaived: Number(agent.totalPlatformFeesWaived),
          outstandingBalance: Number(agent.outstandingBalance),
          billingThreshold: Number(agent.billingThreshold),
          billingBlocked:
            Number(agent.outstandingBalance) >= Number(agent.billingThreshold),
        },
      },
      stats,
      parcels,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PARCEL OPERATIONS
  // ══════════════════════════════════════════════════════════════════════════

  async createParcel(
    user: User,
    dto: {
      orderId?: number;
      trackingNumber?: string;
      destinationCity: string;
      recipientName: string;
      recipientPhone: string;
      deliveryAddress: string;
      description?: string;
      weightKg?: number;
    },
  ) {
    const agent = await this.superAgentRepo.findOne({
      where: { user: { id: user.id } },
    });
    if (!agent) throw new BadRequestException('Super Agent profile not found');

    const tn =
      dto.trackingNumber || this.generateTrackingNumber(agent.city || 'KTX');

    const destAgent = await this.superAgentRepo.findOne({
      where: { city: dto.destinationCity, status: SuperAgentStatus.ACTIVE },
    });

    const parcel = await this.parcelRepo.save(
      this.parcelRepo.create({
        trackingNumber: tn,
        superAgent: agent,
        destinationSuperAgent: destAgent || null,
        order: dto.orderId ? ({ id: dto.orderId } as any) : null,
        originCity: agent.city,
        destinationCity: dto.destinationCity,
        recipientName: dto.recipientName,
        buyerPhone: dto.recipientPhone,
        deliveryAddress: dto.deliveryAddress,
        description: dto.description || null,
        weightKg: dto.weightKg || null,
        status: ParcelStatus.PENDING,
      } as any),
    );

    await this.addTrackingEvent(
      parcel as any,
      ParcelStatus.PENDING,
      agent.city || '',
      'Kifurushi kimeandaliwa',
      agent.businessName,
    );
    return parcel;
  }

  async receiveParcel(
    user: User,
    trackingNumber: string,
    dto: {
      weightKg?: number;
      parcelSize?: string;
      actualShippingFee?: number;
      notes?: string;
    },
  ) {
    const parcel = await this.parcelRepo.findOne({
      where: { trackingNumber },
      relations: { order: true, superAgent: true },
    });
    if (!parcel) throw new NotFoundException('Parcel not found');

    await this.parcelRepo.update(parcel.id, {
      status: ParcelStatus.RECEIVED_AT_HUB,
      weightKg: dto.weightKg || (parcel as any).weightKg,
      parcelSize: dto.parcelSize || (parcel as any).parcelSize,
      actualShippingFee: dto.actualShippingFee || null,
    } as any);

    const agent = await this.superAgentRepo.findOne({
      where: { user: { id: user.id } },
    });
    await this.addTrackingEvent(
      parcel,
      ParcelStatus.RECEIVED_AT_HUB,
      agent?.city || '',
      dto.notes || 'Kifurushi kimepokelewa kwenye hub',
      agent?.businessName || user.name || '',
      {
        phone: agent?.phone || user.phone || undefined,
        location: agent?.address || agent?.city,
        type: 'super_agent',
      },
    );

    // Increment parcels handled
    if (agent) {
      await this.superAgentRepo.increment(
        { id: agent.id },
        'totalParcelsHandled',
        1,
      );
    }

    return { message: 'Parcel received at hub', trackingNumber };
  }

  async dispatchParcel(
    user: User,
    trackingNumber: string,
    dto: {
      // Transport type
      transportType?: string; // 'bus' | 'courier' | 'agent'
      // Bus fields
      busCompany?: string;
      busTicketNumber?: string;
      busDeparture?: string;
      // Courier fields
      courierName?: string;
      courierCost?: number;
      courierCostReceipt?: string;
      courierTrackingRef?: string;
      transportRef?: string; // legacy alias
      // Agent assignment
      localAgentId?: number;
      // Real registered TransportProvider, via an already-created
      // TransportAssignment — the alternative to typing a free-text
      // company name below. Optional and additive: every existing
      // busCompany/courierName-based dispatch keeps working exactly as
      // before if this is omitted.
      transportAssignmentId?: number;
      // Manual transport handoff — driver/vehicle info
      driverName?: string;
      driverPhone?: string;
      vehicleNumber?: string;
      // Structured departure/arrival — separate date+time fields so the
      // receiver SMS can state them precisely, rather than relying on
      // busDeparture's single free-text string.
      departureDate?: string;
      departureTime?: string;
      expectedArrivalDate?: string;
      expectedArrivalTime?: string;
      // Other
      dispatchMode?: string;
      notes?: string;
    },
  ) {
    const parcel = await this.parcelRepo.findOne({
      where: { trackingNumber },
      relations: {
        order: { buyer: true },
        superAgent: true,
        destinationSuperAgent: true,
      },
    });
    if (!parcel) throw new NotFoundException('Parcel not found');

    // Ownership check — a Super Agent may only dispatch parcels registered
    // under their own hub; ADMIN can act on any parcel. This did not exist
    // anywhere in the parcel-action code paths before.
    const agent = await this.assertOwnsParcel(user, parcel);

    const updates: any = {
      status: ParcelStatus.DISPATCHED,
      dispatchTime: new Date(),
    };

    // Bus details
    if (dto.busCompany) updates.busCompany = dto.busCompany;
    if (dto.busTicketNumber) updates.busTicketNumber = dto.busTicketNumber;
    // Structured departure fields, combined into busDeparture's existing
    // free-text column when supplied — takes priority over a manually
    // typed busDeparture string, since it's the more precise input.
    if (dto.departureDate || dto.departureTime) {
      updates.busDeparture = [dto.departureDate, dto.departureTime]
        .filter(Boolean)
        .join(', ');
    } else if (dto.busDeparture) {
      updates.busDeparture = dto.busDeparture;
    }
    // The Super Agent's real, booked arrival estimate is more accurate
    // than expectedArrival's route-based guess computed at registration
    // time — override it here once actually known.
    if (dto.expectedArrivalDate) {
      updates.expectedArrival = dto.expectedArrivalDate;
    }
    // Courier details
    if (dto.courierName) updates.courierName = dto.courierName;
    if (dto.courierTrackingRef)
      updates.courierTrackingRef = dto.courierTrackingRef;
    if (dto.courierCost) updates.courierCost = dto.courierCost;
    if (dto.courierCostReceipt)
      updates.courierCostReceipt = dto.courierCostReceipt;
    if (dto.transportRef) updates.transportRef = dto.transportRef;
    // Manual driver/vehicle details
    if (dto.driverName) updates.driverName = dto.driverName;
    if (dto.driverPhone) updates.driverPhone = dto.driverPhone;
    if (dto.vehicleNumber) updates.vehicleNumber = dto.vehicleNumber;

    // Real registered provider, via a TransportAssignment this super
    // agent already created and had accepted — links the assignment back
    // to this specific parcel (idempotent: only sets it if not already
    // linked) and surfaces the provider's real name as courierName/
    // transportRef purely for display, without touching any legacy field
    // the caller also supplied.
    let linkedProviderName: string | null = null;
    if (dto.transportAssignmentId) {
      const assignment = await this.transportAssignmentRepo.findOne({
        where: { id: dto.transportAssignmentId },
        relations: { provider: true },
      });
      if (assignment && assignment.assignedById === user.id) {
        if (!assignment.parcelRefId) {
          await this.transportAssignmentRepo.update(assignment.id, {
            parcelRefId: parcel.id,
            parcelId: parcel.id,
            trackingNumber: parcel.trackingNumber,
          });
        }
        linkedProviderName = assignment.provider?.name || null;
        if (linkedProviderName && !dto.courierName && !dto.busCompany) {
          updates.courierName = linkedProviderName;
        }
        if (!dto.transportRef) {
          updates.transportRef = `TA-${assignment.id}`;
        }
      }
    }

    if (dto.localAgentId) {
      const localAgent = await this.agentRepo.findOne({
        where: { id: dto.localAgentId },
        relations: { user: true },
      });
      if (localAgent) {
        updates.localAgentId = localAgent.user?.id;
        updates.localAgentName = localAgent.fullName;
      }
    }

    await this.parcelRepo.update(parcel.id, updates);

    // Build human-readable tracking note
    let trackNote = 'Imetumwa';
    if (dto.busCompany) {
      trackNote = `Imetumwa via basi — ${dto.busCompany}`;
      if (dto.busTicketNumber) trackNote += ` — Tiketi: ${dto.busTicketNumber}`;
      if (dto.busDeparture) trackNote += ` — Kuondoka: ${dto.busDeparture}`;
    } else if (dto.courierName) {
      trackNote = `Imetumwa via courier — ${dto.courierName}`;
      if (dto.courierTrackingRef)
        trackNote += ` — Ref: ${dto.courierTrackingRef}`;
    } else if (linkedProviderName) {
      trackNote = `Imetumwa via ${linkedProviderName} (msafirishaji aliyesajiliwa)`;
    } else if (dto.localAgentId) {
      trackNote = `Imepewa wakala wa mtaa kwa uwasilishaji`;
    }

    await this.addTrackingEvent(
      parcel,
      ParcelStatus.DISPATCHED,
      agent?.city || '',
      trackNote,
      agent?.businessName || user.name || '',
      {
        phone: agent?.phone || user.phone || undefined,
        location: agent?.city || undefined,
        type: 'super_agent',
      },
    );

    // SMS #2 — to the RECEIVER only, and only now, at actual handoff to
    // transport. Never fires at registration time, and never goes to the
    // sender — that SMS already fired from createOfflineIntercityOrder().
    // Every line is optional and only appears if the Super Agent actually
    // supplied that detail — never sends an empty field.
    let receiverSmsSent = false;
    const transportName = dto.busCompany || dto.courierName || linkedProviderName;
    const vehicleLine = dto.vehicleNumber ? `Namba ya gari: ${dto.vehicleNumber}` : null;
    const driverLine = dto.driverName
      ? `Dereva: ${dto.driverName}${dto.driverPhone ? ` (${dto.driverPhone})` : ''}`
      : null;
    const referenceLine =
      dto.busTicketNumber || dto.courierTrackingRef || dto.transportRef
        ? `Tiketi/Rejea: ${dto.busTicketNumber || dto.courierTrackingRef || dto.transportRef}`
        : null;
    const departureLine = updates.busDeparture
      ? `Kuondoka: ${updates.busDeparture}`
      : null;
    const arrivalDate = dto.expectedArrivalDate || (parcel as any).expectedArrival;
    const arrivalLine = arrivalDate
      ? `Kufika: ${arrivalDate}${dto.expectedArrivalTime ? `, ${dto.expectedArrivalTime}` : ''}`
      : null;
    const destHubLine = parcel.destinationSuperAgent?.businessName
      ? `Hub ya Kupokea: ${parcel.destinationSuperAgent.businessName}`
      : null;
    if (parcel.buyerPhone) {
      try {
        receiverSmsSent = await this.smsService.sendSms(
          parcel.buyerPhone,
          `SUPER AGENT ${agent?.businessName || ''}\n\n` +
            `Habari ${parcel.recipientName || ''}, kifurushi kutoka kwa ${parcel.senderName || ''} kimeshatumwa kutoka ${parcel.originCity} kwenda ${parcel.destinationCity}.\n\n` +
            `Kifurushi: ${trackingNumber}\n` +
            [
              transportName ? `Usafiri: ${transportName}` : null,
              vehicleLine,
              driverLine,
              referenceLine,
              departureLine,
              arrivalLine,
              `Njia: ${parcel.originCity} → ${parcel.destinationCity}`,
              destHubLine,
            ]
              .filter(Boolean)
              .join('\n') +
            `\n\nFuatilia: ${FRONTEND_URL}/?track=${trackingNumber}\n\n` +
            `Verified by Kentexa`,
        );
      } catch (e: any) {
        console.warn('Receiver shipment SMS failed:', e?.message);
      }
    }

    await this.auditLog
      .record({
        actorId: user.id,
        actorRole: 'super_agent',
        action: 'parcel.shipment_confirmed',
        entityType: 'parcel',
        entityId: parcel.id,
        previousValue: { status: parcel.status },
        newValue: {
          status: ParcelStatus.DISPATCHED,
          busCompany: dto.busCompany || null,
          courierName: dto.courierName || null,
          driverName: dto.driverName || null,
          vehicleNumber: dto.vehicleNumber || null,
          receiverPhone: parcel.buyerPhone,
          receiverSmsSent,
        },
      })
      .catch(() => {});

    return {
      message: 'Parcel dispatched',
      trackingNumber,
      receiverSmsSent,
    };
  }

  // Shared ownership check for the resend actions below — a Super Agent
  // may only act on their own hub's parcels; ADMIN may act on any.
  private async assertOwnsParcel(user: User, parcel: Parcel) {
    const agent = await this.superAgentRepo.findOne({
      where: { user: { id: user.id } },
    });
    const isAdmin =
      user.role === UserRole.ADMIN ||
      (user as any).activeRoles?.includes(UserRole.ADMIN);
    if (!isAdmin && parcel.superAgent?.id !== agent?.id) {
      throw new ForbiddenException(
        'You can only act on parcels registered under your own hub.',
      );
    }
    return agent;
  }

  // Billing gate — blocks new order registration once a Super Agent's
  // outstandingBalance reaches their billingThreshold (per-agent columns,
  // default 10,000/agent — never a hardcoded id/name check). Must be called
  // at the top of every endpoint that creates a new billable parcel.
  private assertNotBillingBlocked(superAgent: SuperAgent) {
    const balance = Number(superAgent.outstandingBalance);
    const threshold = Number(superAgent.billingThreshold);
    if (balance >= threshold) {
      throw new ForbiddenException(
        `Huduma imesimamishwa: deni la TZS ${balance.toLocaleString()} limefikia kiwango cha juu (TZS ${threshold.toLocaleString()}). ` +
          `Tafadhali lipa deni lako ili kuendelea kutumia huduma.`,
      );
    }
  }

  // "SMS failure must never invalidate a successful transaction... allow
  // retry" — these two re-run the exact same message a second (or third)
  // time without touching parcel status or re-charging/re-counting
  // anything; each attempt gets its own audit-log entry.
  async resendSenderSms(user: User, trackingNumber: string) {
    const parcel = await this.parcelRepo.findOne({
      where: { trackingNumber },
      relations: { order: true, superAgent: true },
    });
    if (!parcel) throw new NotFoundException('Parcel not found');
    await this.assertOwnsParcel(user, parcel);
    if (!parcel.senderPhone)
      throw new BadRequestException('This parcel has no sender phone on file.');

    const invoice = parcel.order
      ? await this.invoicesService.findByOrderId(parcel.order.id).catch(() => null)
      : null;

    let senderSmsSent = false;
    try {
      senderSmsSent = await this.smsService.sendSms(
        parcel.senderPhone,
        `SUPER AGENT ${parcel.superAgent?.businessName || ''}\n\n` +
          `Malipo yako ya TZS ${Number(parcel.actualShippingFee).toLocaleString()} yamepokewa kwa kifurushi ${trackingNumber}.\n\n` +
          (invoice?.receiptNumber ? `Risiti: ${invoice.receiptNumber}\n` : '') +
          `Imepokewa na: ${parcel.superAgent?.businessName || ''}\n\n` +
          `Verified by Kentexa`,
      );
    } catch (e: any) {
      console.warn('Resend sender SMS failed:', e?.message);
    }

    await this.auditLog
      .record({
        actorId: user.id,
        actorRole: 'super_agent',
        action: 'parcel.payment_sms_resent',
        entityType: 'parcel',
        entityId: parcel.id,
        newValue: { senderPhone: parcel.senderPhone, senderSmsSent },
      })
      .catch(() => {});

    return { senderSmsSent };
  }

  async resendReceiverSms(user: User, trackingNumber: string) {
    const parcel = await this.parcelRepo.findOne({
      where: { trackingNumber },
      relations: { superAgent: true },
    });
    if (!parcel) throw new NotFoundException('Parcel not found');
    await this.assertOwnsParcel(user, parcel);
    if (!parcel.buyerPhone)
      throw new BadRequestException('This parcel has no receiver phone on file.');
    if (parcel.status === ParcelStatus.PENDING || parcel.status === ParcelStatus.RECEIVED_AT_HUB) {
      throw new BadRequestException(
        'This parcel has not been dispatched yet — nothing to resend.',
      );
    }

    const transportLine = parcel.busCompany
      ? `Usafiri: ${parcel.busCompany}${parcel.vehicleNumber ? ` (${parcel.vehicleNumber})` : ''}`
      : parcel.courierName
        ? `Usafiri: ${parcel.courierName}`
        : null;
    const referenceLine =
      parcel.busTicketNumber || parcel.courierTrackingRef || parcel.transportRef
        ? `Rejea: ${parcel.busTicketNumber || parcel.courierTrackingRef || parcel.transportRef}`
        : null;

    let receiverSmsSent = false;
    try {
      receiverSmsSent = await this.smsService.sendSms(
        parcel.buyerPhone,
        `SUPER AGENT ${parcel.superAgent?.businessName || ''}\n\n` +
          `Habari ${parcel.recipientName || ''}, kifurushi kutoka kwa ${parcel.senderName || ''} kimeshatumwa.\n\n` +
          `Kifurushi: ${trackingNumber}\n` +
          [transportLine, `Njia: ${parcel.originCity} → ${parcel.destinationCity}`, referenceLine]
            .filter(Boolean)
            .join('\n') +
          `\n\nVerified by Kentexa`,
      );
    } catch (e: any) {
      console.warn('Resend receiver SMS failed:', e?.message);
    }

    await this.auditLog
      .record({
        actorId: user.id,
        actorRole: 'super_agent',
        action: 'parcel.shipment_sms_resent',
        entityType: 'parcel',
        entityId: parcel.id,
        newValue: { receiverPhone: parcel.buyerPhone, receiverSmsSent },
      })
      .catch(() => {});

    return { receiverSmsSent };
  }

  // Admin-only — grants a Super Agent's founding-pilot free-order
  // allowance. Additive: repeated calls just set a new total, they don't
  // stack, so re-running this with the same count is a no-op.
  async grantFreeOrders(superAgentId: number, count: number) {
    const agent = await this.superAgentRepo.findOne({
      where: { id: superAgentId },
    });
    if (!agent) throw new NotFoundException('Super Agent not found');
    await this.superAgentRepo.update(superAgentId, {
      freeOrdersGranted: count,
    });
    return {
      superAgentId,
      freeOrdersGranted: count,
      freeOrdersUsed: agent.freeOrdersUsed,
    };
  }

  // Admin-only — records that a Super Agent paid down their outstanding
  // platform-fee balance (cash/mobile money collected outside the online
  // provider pipeline, same operational model as InvoicesService.
  // recordManualPayment()). No Invoice is created here — a billing payment
  // isn't tied to any single order, and Invoice.order is non-nullable — so
  // this writes directly to Payment (order: null is already supported) and
  // reduces the real balance. Rejects overpayment beyond the current debt.
  async recordBillingPayment(
    superAgentId: number,
    params: { amount: number; paymentMethod: string; adminUserId: number },
  ) {
    const agent = await this.superAgentRepo.findOne({
      where: { id: superAgentId },
      relations: { user: true },
    });
    if (!agent) throw new NotFoundException('Super Agent not found');
    const balance = Number(agent.outstandingBalance);
    if (params.amount <= 0)
      throw new BadRequestException('Amount must be greater than zero');
    if (params.amount > balance)
      throw new BadRequestException(
        `Payment (TZS ${params.amount}) exceeds outstanding balance (TZS ${balance})`,
      );

    const payment = await this.paymentRepo.save(
      this.paymentRepo.create({
        order: null,
        user: agent.user || null,
        phone: agent.phone || agent.user?.phone || '',
        amount: params.amount,
        provider: params.paymentMethod || 'admin_manual',
        status: PaymentStatus.SUCCESS,
        metadata: JSON.stringify({
          type: 'super_agent_billing',
          superAgentId: agent.id,
          recordedByAdminId: params.adminUserId,
        }),
      } as any),
    );

    const newBalance = balance - params.amount;
    await this.superAgentRepo.update(superAgentId, {
      outstandingBalance: newBalance,
    });

    await this.auditLog
      .record({
        actorId: params.adminUserId,
        actorRole: 'admin',
        action: 'super_agent.billing_payment_recorded',
        entityType: 'super_agent',
        entityId: agent.id,
        newValue: {
          amount: params.amount,
          paymentMethod: params.paymentMethod,
          balanceBefore: balance,
          balanceAfter: newBalance,
          paymentId: (payment as any).id,
        },
      })
      .catch(() => {});

    return {
      superAgentId,
      amountPaid: params.amount,
      outstandingBalance: newBalance,
      billingBlocked: newBalance >= Number(agent.billingThreshold),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOCAL AGENT — last-mile delivery
  // ══════════════════════════════════════════════════════════════════════════

  async getIncomingParcels(city: string) {
    return this.parcelRepo.find({
      where: {
        destinationSuperAgent: { city },
        status: ParcelStatus.ARRIVED_AT_HUB,
        localAgentId: null as any,
      },
      relations: {
        order: { product: true, buyer: true },
        destinationSuperAgent: true,
      },
      order: { arrivedAtHubTime: 'ASC' } as any,
    });
  }

  async getMyDeliveries(userId: string) {
    return this.parcelRepo.find({
      where: { localAgentId: userId },
      relations: { order: { product: true, buyer: true } },
      order: { claimedAt: 'DESC' } as any,
    });
  }

  async claimParcel(user: User, trackingNumber: string) {
    const parcel = await this.parcelRepo.findOne({ where: { trackingNumber } });
    if (!parcel) throw new NotFoundException('Parcel not found');
    if ((parcel as any).localAgentId)
      throw new BadRequestException('Already claimed');
    if (parcel.status !== ParcelStatus.ARRIVED_AT_HUB) {
      throw new BadRequestException(
        `Cannot claim — status is ${parcel.status}`,
      );
    }

    const agentProfile = await this.agentRepo.findOne({
      where: { user: { id: user.id } },
    });

    // Atomic conditional update — the read above is only for the friendly
    // error messages. This WHERE clause is what actually prevents two
    // agents claiming the same parcel in the same race window.
    const result = await this.parcelRepo
      .createQueryBuilder()
      .update()
      .set({
        localAgentId: String(user.id),
        localAgentName: agentProfile?.fullName || user.name,
        claimedAt: new Date(),
      } as any)
      .where('id = :id', { id: parcel.id })
      .andWhere('"localAgentId" IS NULL')
      .andWhere('status = :status', { status: ParcelStatus.ARRIVED_AT_HUB })
      .execute();
    if (!result.affected) {
      throw new BadRequestException(
        'Already claimed by another agent, or no longer available.',
      );
    }

    await this.addTrackingEvent(
      parcel,
      parcel.status,
      (parcel as any).destinationCity || '',
      'Kimechukuliwa na wakala wa mtaa',
      agentProfile?.fullName || user.name || '',
      {
        phone: user.phone || undefined,
        location: agentProfile?.city || (parcel as any).destinationCity,
        type: 'local_agent',
      },
    );
    return { message: 'Parcel claimed', trackingNumber };
  }

  async updateMyDeliveryStatus(
    user: User,
    trackingNumber: string,
    status: ParcelStatus,
    note?: string,
  ) {
    const parcel = await this.parcelRepo.findOne({
      where: { trackingNumber },
      relations: { order: { buyer: true } },
    });
    if (!parcel) throw new NotFoundException('Parcel not found');
    if ((parcel as any).localAgentId !== String(user.id))
      throw new ForbiddenException('Not your delivery');

    // A retried/duplicate PATCH to DELIVERED on an already-delivered parcel
    // must not double-credit the agent — there was no guard here before,
    // unlike the equivalent buyer-confirms-receipt path in orders.service.ts.
    const alreadyDelivered =
      status === ParcelStatus.DELIVERED &&
      parcel.status === ParcelStatus.DELIVERED;

    const updates: any = { status };
    if (status === ParcelStatus.DELIVERED) {
      updates.deliveredTime = new Date();
      updates.buyerConfirmed = true;
    }
    await this.parcelRepo.update(parcel.id, updates);

    const agentProfile = await this.agentRepo.findOne({
      where: { user: { id: user.id } },
    });
    const city = (parcel as any).destinationCity || '';
    await this.addTrackingEvent(
      parcel,
      status,
      city,
      note || status,
      agentProfile?.fullName || user.name || '',
      {
        phone: user.phone || undefined,
        location: agentProfile?.city || city,
        type: 'local_agent',
      },
    );

    if (status === ParcelStatus.DELIVERED && !alreadyDelivered) {
      // Track delivery count and earnings for agent's own records.
      // KenteXa does NOT pay local agents — they are independent and earn
      // directly from the Super Agent or seller who hired them.
      // totalEarningsDeliveries = informational record of what they've earned.
      // pendingEarnings is NOT used for local agent deliveries.
      if (agentProfile) {
        const commission = Number(agentProfile.deliveryCommission || 500);
        await this.agentRepo.update(agentProfile.id, {
          totalDeliveriesCompleted: agentProfile.totalDeliveriesCompleted + 1,
          totalEarningsDeliveries:
            Number(agentProfile.totalEarningsDeliveries) + commission,
          totalEarnings: Number(agentProfile.totalEarnings) + commission,
          // Note: pendingEarnings NOT incremented — KenteXa doesn't owe this
        });
      }
      // SMS buyer
      const buyerPhone =
        (parcel as any).buyerPhone || parcel.order?.buyer?.phone;
      const recipientName =
        (parcel as any).recipientName || parcel.order?.buyer?.name || 'Mteja';
      if (buyerPhone) {
        await this.smsService
          .sendSms(
            buyerPhone,
            `KenteXa: Habari ${recipientName}! Kifurushi chako (${trackingNumber}) kimefikishwa. Asante! 🎉`,
          )
          .catch(() => {});
      }
    }

    return { message: 'Status updated', trackingNumber, status };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BULK SHIPMENTS
  // ══════════════════════════════════════════════════════════════════════════

  async createBulkShipment(
    user: User,
    dto: {
      destinationCity: string;
      trackingNumbers: string[];
      notes?: string;
    },
  ) {
    const agent = await this.superAgentRepo.findOne({
      where: { user: { id: user.id } },
    });
    if (!agent) throw new BadRequestException('Super Agent profile not found');

    const shipment = await this.bulkRepo.save(
      this.bulkRepo.create({
        superAgent: agent,
        destinationCity: dto.destinationCity,
        notes: dto.notes || null,
        status: 'open',
        parcelCount: dto.trackingNumbers.length,
      } as any),
    );

    return {
      shipmentId: (shipment as any).id,
      parcelCount: dto.trackingNumbers.length,
    };
  }

  async dispatchBulkShipment(
    user: User,
    shipmentId: number,
    dto: {
      courierName: string;
      courierCost: number;
      courierCostReceipt?: string;
      transportRef?: string;
    },
  ) {
    const shipment = await this.bulkRepo.findOne({ where: { id: shipmentId } });
    if (!shipment) throw new NotFoundException('Bulk shipment not found');

    await this.bulkRepo.update(shipmentId, {
      status: 'dispatched',
      courierName: dto.courierName,
      courierCost: dto.courierCost,
      courierCostReceipt: dto.courierCostReceipt || null,
      transportRef: dto.transportRef || null,
      dispatchedAt: new Date(),
    } as any);

    return { message: 'Bulk shipment dispatched', shipmentId };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COURIER COST LEDGER
  // ══════════════════════════════════════════════════════════════════════════

  async getCourierCostLedger() {
    // Was parcelRepo-only — bulk-shipment courier costs (totalShippingCost)
    // never appeared here at all, even though dispatchBulkShipment stores
    // them, so admin had no visibility into unsettled bulk courier costs.
    const [parcels, bulkShipments] = await Promise.all([
      this.parcelRepo.find({
        where: { agentPaidOut: false },
        relations: { superAgent: true },
        order: { dispatchTime: 'DESC' } as any,
      }),
      this.bulkRepo.find({
        where: { agentPaidOut: false } as any,
        relations: { superAgent: true },
        order: { dispatchTime: 'DESC' } as any,
      }),
    ]);

    const parcelRows = parcels
      .filter((p) => Number((p as any).courierCost || 0) > 0)
      .map((p) => ({
        type: 'parcel' as const,
        id: p.trackingNumber,
        trackingNumber: p.trackingNumber,
        agentName: p.superAgent?.businessName,
        agentCity: p.superAgent?.city,
        courierCost: Number((p as any).courierCost),
        courierName: (p as any).courierName,
        transportRef: (p as any).transportRef,
        dispatchTime: (p as any).dispatchTime,
        costFlagged: (p as any).costFlagged,
        costNote: (p as any).costNote,
      }));

    const bulkRows = bulkShipments
      .filter((b) => Number(b.totalShippingCost || 0) > 0)
      .map((b) => ({
        type: 'bulk' as const,
        id: String(b.id),
        trackingNumber: b.shipmentCode,
        agentName: b.superAgent?.businessName,
        agentCity: b.superAgent?.city,
        courierCost: Number(b.totalShippingCost),
        courierName: b.transportCompany,
        transportRef: b.transportRef,
        dispatchTime: b.dispatchTime,
        costFlagged: b.costFlagged,
        costNote: b.costNote,
      }));

    return [...parcelRows, ...bulkRows].sort((a, b) => {
      const at = a.dispatchTime ? new Date(a.dispatchTime).getTime() : 0;
      const bt = b.dispatchTime ? new Date(b.dispatchTime).getTime() : 0;
      return bt - at;
    });
  }

  async markCostSettled(type: 'parcel' | 'bulk', id: string) {
    if (type === 'parcel') {
      await this.parcelRepo.update(
        { trackingNumber: id },
        {
          agentPaidOut: true,
        },
      );
    } else {
      // BulkShipment's real column is agentPaidOut — courierCostSettled
      // isn't a column on this entity at all, so this silently did
      // nothing (typed through `as any`) for every bulk-settle attempt.
      await this.bulkRepo.update(Number(id), {
        agentPaidOut: true,
      });
    }
    return { message: 'Marked as settled' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  private generateTrackingNumber(city: string): string {
    const cityCode = (city || 'KTX')
      .slice(0, 3)
      .toUpperCase()
      .replace(/\s/g, '');
    const ts = Date.now().toString(36).toUpperCase();
    return `KTX-${cityCode}-${ts}`;
  }

  private generateAgentCode(city: string, id: number): string {
    const code = (city || 'KTX').slice(0, 3).toUpperCase().replace(/\s/g, '');
    return `SA-${code}-${String(id).padStart(3, '0')}`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // UPDATE PARCEL STATUS — used by Super Agent dashboard status modal
  // Handles every status transition in the intercity flow including
  // transit hubs (e.g. Songea receiving and re-dispatching to Mbinga)
  // ══════════════════════════════════════════════════════════════════════════

  async updateParcelStatus(
    user: User,
    trackingNumber: string,
    dto: {
      status: ParcelStatus;
      city: string;
      note?: string;
    },
  ) {
    const parcel = await this.parcelRepo.findOne({
      where: { trackingNumber },
      relations: {
        order: { buyer: true },
        superAgent: true,
        destinationSuperAgent: true,
      },
    });
    if (!parcel)
      throw new NotFoundException(`Kifurushi ${trackingNumber} hakipatikani`);

    // Build update payload
    const updates: any = { status: dto.status };
    if (dto.status === ParcelStatus.ARRIVED_AT_HUB) {
      updates.arrivedAtHubTime = new Date();
    }
    if (dto.status === ParcelStatus.DELIVERED) {
      updates.deliveredTime = new Date();
      updates.buyerConfirmed = true;
    }

    await this.parcelRepo.update(parcel.id, updates);

    // Add tracking history event
    // Get handler details for tracking event
    const handlerAgent = await this.superAgentRepo
      .findOne({ where: { user: { id: user.id } } })
      .catch(() => null);
    await this.addTrackingEvent(
      parcel,
      dto.status,
      dto.city,
      dto.note || this.statusLabel(dto.status, dto.city),
      handlerAgent?.businessName || user.name || 'Super Agent',
      {
        phone: handlerAgent?.phone || user.phone || undefined,
        location: handlerAgent?.address || dto.city,
        type: 'super_agent',
      },
    );

    // ── SMS to buyer/recipient on key status changes ──────────────────────
    const buyerPhone = (parcel as any).buyerPhone || parcel.order?.buyer?.phone;
    const recipientName =
      (parcel as any).recipientName || parcel.order?.buyer?.name || 'Mteja';
    const destCity = (parcel as any).destinationCity || '';

    if (buyerPhone) {
      // Only send SMS for action-required moments — saves cost
      // ARRIVED_AT_HUB: buyer needs to decide pickup vs delivery
      // DELIVERED: order complete confirmation
      const smsMap: Partial<Record<ParcelStatus, string>> = {
        [ParcelStatus.ARRIVED_AT_HUB]:
          `KenteXa: Habari ${recipientName}! Kifurushi chako (${trackingNumber}) ` +
          `kimefika ${dto.city}. Ingia KenteXa kuchagua: chukua mwenyewe au omba delivery. ` +
          `${FRONTEND_URL}/?track=${trackingNumber}`,

        [ParcelStatus.DELIVERED]:
          `KenteXa: ✅ Kifurushi chako (${trackingNumber}) kimefikishwa. ` +
          `Asante kwa kutumia KenteXa! 🎉`,
      };
      if (smsMap[dto.status]) {
        await this.smsService
          .sendSms(buyerPhone, smsMap[dto.status]!)
          .catch((e) => console.warn('SMS failed:', e.message));
      }
    }

    // ── When parcel arrives at hub — notify local agents in that city ─────
    // This covers BOTH the final destination AND any transit hub.
    // At a transit hub the parcel will be re-dispatched by the local Super Agent.
    // At the final destination local agents get notified to claim for last-mile.
    if (dto.status === ParcelStatus.ARRIVED_AT_HUB) {
      const isFinalDestination = dto.city === destCity;

      if (isFinalDestination) {
        // Notify local delivery agents to claim the parcel
        // Only online agents receive the broadcast — offline agents opted out
        try {
          const localAgents = await this.agentRepo.find({
            where: {
              city: dto.city,
              status: 'approved' as any,
              isOnline: true,
            },
            relations: { user: true },
          });

          // If no online agents found, fall back to ALL approved agents in city
          // so the parcel is never stranded with no one notified
          const agentsToNotify =
            localAgents.length > 0
              ? localAgents
              : await this.agentRepo.find({
                  where: { city: dto.city, status: 'approved' as any },
                  relations: { user: true },
                });

          // Agent sees new job in dashboard (no SMS — cost saving)

          if (agentsToNotify.length > 0) {
            await this.addTrackingEvent(
              parcel,
              dto.status,
              dto.city,
              `Mawakala ${agentsToNotify.length} wamearifiwa katika ${dto.city}`,
              'System',
            );
          }
        } catch (e) {
          console.warn('Local agent notification failed:', e.message);
        }
      } else {
        // Transit hub — the parcel is passing through, not final stop
        // Add a clear transit event so buyer sees it in tracking
        await this.addTrackingEvent(
          parcel,
          dto.status,
          dto.city,
          `Imefika kituo cha ${dto.city} (transit) — itaendelea kwenda ${destCity}`,
          user.name || 'Super Agent',
        );
      }
    }

    return { message: 'Hali imesasishwa', trackingNumber, status: dto.status };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SELLER SHIPMENT METHODS
  // Seller creates a shipment for any offline sale (WhatsApp, cash, Instagram)
  // Shipping goes through KenteXa Super Agent network.
  // TZS 1,000 platform fee activates tracking.
  // ══════════════════════════════════════════════════════════════════════════

  async createSellerShipment(
    seller: User,
    dto: {
      classifiedId?: number;
      description: string;
      weightKg?: number;
      parcelSize?: string;
      recipientName: string;
      recipientPhone: string;
      destinationCity: string;
      deliveryAddress: string;
      regionId?: number;
      regionName?: string;
      districtId?: number;
      districtName?: string;
      wardId?: number;
      wardName?: string;
      originCity: string;
      transportMethod: string;
      busCompany?: string;
      busTicketNumber?: string;
      busDeparture?: string;
      courierName?: string;
      courierTrackingRef?: string;
      needsCollection?: boolean;
      notes?: string;
      // Product/price info from SellerShipment form
      totalValue?: number;
      items?: Array<{
        name: string;
        qty: number;
        price: number;
        weight?: number;
      }>;
    },
  ) {
    const isSameCity =
      dto.originCity.toLowerCase() === dto.destinationCity.toLowerCase();

    let transitCity: string | null = null;
    let estimatedDays = 1;
    let expectedArrivalStr: string;

    if (isSameCity) {
      estimatedDays = 1;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expectedArrivalStr = tomorrow.toISOString().split('T')[0];
    } else {
      const route = await this.routeRepo
        .findOne({
          where: {
            originCity: dto.originCity,
            destinationCity: dto.destinationCity,
            isActive: true,
          },
        })
        .catch(() => null);
      transitCity = (route as any)?.transitCity || null;
      estimatedDays = route?.estimatedDays || 2;
      const arrival = new Date();
      arrival.setDate(arrival.getDate() + estimatedDays);
      expectedArrivalStr = arrival.toISOString().split('T')[0];
    }

    const destAgent =
      dto.transportMethod === 'super_agent'
        ? await this.superAgentRepo
            .findOne({
              where: { city: dto.destinationCity, status: 'active' as any },
            })
            .catch(() => null)
        : null;

    const order = (await this.orderRepo.save(
      this.orderRepo.create({
        source: OrderSource.SELLER_SHIPMENT as any,
        seller: { id: seller.id } as any,
        manualBuyerName: dto.recipientName,
        manualBuyerPhone: dto.recipientPhone,
        manualProductName: dto.description,
        deliveryAddress: dto.deliveryAddress,
        phone: dto.recipientPhone,
        quantity: dto.items?.reduce((s, i) => s + (i.qty || 1), 0) || 1,
        totalAmount:
          dto.totalValue ||
          dto.items?.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0) ||
          0,
        baseAmount:
          dto.totalValue ||
          dto.items?.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0) ||
          0,
        // ── ZERO FEE RULE FOR MANUAL SHIPMENTS ─────────────────────────────
        // Same rule as createOnBehalf: the buyer already paid the seller
        // directly (offline sale) — KenteXa never holds this money, so
        // there's no platform commission and no payout owed. The TZS 1,000
        // tracking fee is a separate, already-paid charge (see
        // /payments/invoice/pay, purpose: 'platform_tracking_fee') — it is
        // not deducted from a payout here.
        platformFeeAmount: 0,
        sellerAmount: 0,
        // Buyer already paid the seller directly (offline sale) — same
        // model as createOnBehalf, so this is "paid" from creation, not
        // pending. Otherwise it silently never counts toward the seller's
        // dashboard revenue total, which only sums paymentStatus === 'paid'.
        paymentStatus: 'paid' as any,
        status: 'preparing' as any,
        shippingMethod: dto.transportMethod || 'super_agent',
        notes: dto.notes || null,
        createdByUserId: seller.id,
      } as any),
    )) as any;

    const trackingNumber = `KTX-SHP-${order.id}`;
    await this.orderRepo.update(order.id, { trackingNumber });

    // Notify seller (confirmation of their own action — useful for batch tracking)
    try {
      await this.inAppNotif.shipmentCreatedById(
        null, // buyerId - buyer may not have KenteXa account
        trackingNumber,
        dto.description || 'Bidhaa',
      );
    } catch {
      /* non-critical */
    }

    // ── Auto-create/update BusinessCustomer record ────────────────────────
    // This ensures manual shipments show in "Wateja Wangu" with correct order count
    try {
      await this.businessCustomerService.upsertFromOrder({
        sellerId: seller.id,
        userId: null, // manual order — buyer may not have KenteXa account
        name: dto.recipientName || 'Mteja',
        phone: dto.recipientPhone || null,
        address: dto.deliveryAddress || null,
        regionId: dto.regionId || null,
        region: dto.regionName || null,
        districtId: dto.districtId || null,
        district: dto.districtName || null,
        wardId: dto.wardId || null,
        ward: dto.wardName || null,
        orderAmount: 1000, // platform fee for manual shipment
        channel: 'manual',
      });
    } catch (e) {
      console.error(
        'BusinessCustomer upsert failed (non-critical):',
        e.message,
      );
    }

    const parcel = (await this.parcelRepo.save(
      this.parcelRepo.create({
        trackingNumber,
        source: 'seller_shipment',
        order: order,
        seller: seller,
        senderName: seller.name,
        senderPhone: seller.phone,
        destinationSuperAgent: destAgent || null,
        originCity: dto.originCity,
        destinationCity: dto.destinationCity,
        transitCity,
        expectedArrival: expectedArrivalStr,
        deliveryAddress: dto.deliveryAddress,
        recipientName: dto.recipientName,
        buyerPhone: dto.recipientPhone,
        description: dto.description,
        weightKg: dto.weightKg || null,
        parcelSize: dto.parcelSize || 'small',
        classifiedId: dto.classifiedId || null,
        transportMethod: dto.transportMethod,
        busCompany: dto.busCompany || null,
        busTicketNumber: dto.busTicketNumber || null,
        courierName: dto.courierName || null,
        courierTrackingRef: dto.courierTrackingRef || null,
        platformFeePaid: false,
        status: ParcelStatus.PENDING,
      } as any) as any,
    )) as unknown as Parcel;

    await this.addTrackingEvent(
      parcel,
      ParcelStatus.PENDING,
      dto.originCity,
      'Agizo limeundwa. Inasubiri ada ya mfumo kulipwa.',
      seller.name || 'Muuzaji',
      {
        phone: seller.phone || undefined,
        location: dto.originCity || undefined,
        type: 'system',
      },
    );

    // No SMS here — this used to fire a receiver notification immediately
    // on creation, before the parcel had even been physically handed to
    // transport. The equivalent of "shipment confirmed" for this flow is
    // updateShipmentTransport() (seller/agent uploads transport details and
    // the parcel moves to IN_TRANSIT) — the receiver SMS now fires there
    // instead, matching the same registration/shipment split already
    // applied to createOfflineIntercityOrder()/dispatchParcel().

    return {
      success: true,
      orderId: order.id,
      trackingNumber,
      originCity: dto.originCity,
      destinationCity: dto.destinationCity,
      transitCity,
      expectedArrival: expectedArrivalStr,
      estimatedDays,
      message: 'Agizo limeundwa. Lipa TZS 1,000 ili kuamsha ufuatiliaji.',
    };
  }

  // ── Seller or agent uploads transport details after pickup ───────────────

  async updateShipmentTransport(
    user: User,
    trackingNumber: string,
    dto: {
      busCompany?: string;
      busTicketNumber?: string;
      busDeparture?: string;
      courierName?: string;
      courierTrackingRef?: string;
      notes?: string;
    },
  ) {
    const parcel = await this.parcelRepo.findOne({
      where: { trackingNumber },
      relations: { order: true, seller: true, destinationSuperAgent: true },
    });
    if (!parcel) throw new NotFoundException('Parcel not found');

    // Prevent duplicate — if already in transit, reject
    if (
      (parcel as any).status === ParcelStatus.IN_TRANSIT ||
      (parcel as any).status === ParcelStatus.DELIVERED ||
      (parcel as any).status === ParcelStatus.DISPATCHED
    ) {
      throw new BadRequestException(
        `Maelezo ya usafiri yameshawekwa. Kifurushi kiko ${(parcel as any).status}.`,
      );
    }

    // Update parcel with transport details and mark in transit
    await this.parcelRepo.update((parcel as any).id, {
      busCompany: dto.busCompany || (parcel as any).busCompany,
      busTicketNumber: dto.busTicketNumber || (parcel as any).busTicketNumber,
      busDeparture: dto.busDeparture || null,
      courierName: dto.courierName || (parcel as any).courierName,
      courierTrackingRef:
        dto.courierTrackingRef || (parcel as any).courierTrackingRef,
      status: ParcelStatus.IN_TRANSIT,
      dispatchTime: new Date(),
    });

    // Also update the linked order status so seller dashboard reflects change
    if (parcel.order?.id) {
      await this.orderRepo.update(parcel.order.id, {
        status: OrderStatus.IN_TRANSIT,
      });
    }

    await this.addTrackingEvent(
      parcel,
      ParcelStatus.IN_TRANSIT,
      (parcel as any).originCity || '',
      `Imetumwa via ${dto.busCompany || dto.courierName || 'usafiri'}` +
        (dto.busTicketNumber ? ` — Tiketi: ${dto.busTicketNumber}` : '') +
        (dto.courierTrackingRef ? ` — Ref: ${dto.courierTrackingRef}` : ''),
      user.name || 'Muuzaji',
      {
        phone: user.phone || undefined,
        location: (parcel as any).originCity || undefined,
        type: 'system',
      },
    );

    // Shipment-confirmed SMS to the receiver — now, at actual handoff to
    // transport, never at creation. Branded as the seller's own store (this
    // flow is the seller's own shipment, not necessarily handled by a
    // registered Super Agent), falling back to the destination hub's name
    // if one was assigned and the seller has no store branding set.
    let receiverSmsSent = false;
    if ((parcel as any).buyerPhone) {
      const brand =
        (parcel.seller as any)?.storeName ||
        parcel.seller?.name ||
        (parcel as any).destinationSuperAgent?.businessName ||
        'KenteXa Network';
      const transportLine = dto.busCompany
        ? `Usafiri: ${dto.busCompany}`
        : dto.courierName
          ? `Usafiri: ${dto.courierName}`
          : null;
      const referenceLine =
        dto.busTicketNumber || dto.courierTrackingRef
          ? `Rejea: ${dto.busTicketNumber || dto.courierTrackingRef}`
          : null;
      const departureLine = dto.busDeparture ? `Kuondoka: ${dto.busDeparture}` : null;
      try {
        receiverSmsSent = await this.smsService.sendSms(
          (parcel as any).buyerPhone,
          `${brand}\n\n` +
            `Habari ${(parcel as any).recipientName || ''}, kifurushi kutoka kwa ${parcel.seller?.name || ''} kimeshatumwa.\n\n` +
            `Kifurushi: ${trackingNumber}\n` +
            [
              transportLine,
              departureLine,
              `Njia: ${(parcel as any).originCity} → ${(parcel as any).destinationCity}`,
              referenceLine,
            ]
              .filter(Boolean)
              .join('\n') +
            `\n\nFuatilia: ${FRONTEND_URL}/?track=${trackingNumber}\n\n` +
            `Verified by Kentexa`,
        );
      } catch (e: any) {
        console.warn('Seller-shipment receiver SMS failed:', e?.message);
      }
    }

    await this.auditLog
      .record({
        actorId: user.id,
        actorRole: 'seller',
        action: 'parcel.shipment_confirmed',
        entityType: 'parcel',
        entityId: (parcel as any).id,
        newValue: {
          busCompany: dto.busCompany || null,
          courierName: dto.courierName || null,
          receiverPhone: (parcel as any).buyerPhone,
          receiverSmsSent,
        },
      })
      .catch(() => {});

    return { message: 'Maelezo ya usafiri yamehifadhiwa', trackingNumber, receiverSmsSent };
  }

  // ── Seller or Super Agent confirms arrival at destination ────────────────

  async confirmShipmentArrived(
    user: User,
    trackingNumber: string,
    dto: {
      city: string;
      note?: string;
    },
  ) {
    const parcel = await this.parcelRepo.findOne({
      where: { trackingNumber },
      relations: { destinationSuperAgent: true, superAgent: true },
    });
    if (!parcel) throw new NotFoundException('Parcel not found');

    await this.parcelRepo.update((parcel as any).id, {
      status: ParcelStatus.AWAITING_BUYER,
      arrivedAtHubTime: new Date(),
    });

    await this.addTrackingEvent(
      parcel,
      ParcelStatus.AWAITING_BUYER,
      dto.city,
      dto.note || `Imefika ${dto.city}. Inasubiri uamuzi wa mpokeaji.`,
      user.name || 'Muuzaji',
      {
        phone: user.phone || undefined,
        location: dto.city || undefined,
        type: 'super_agent',
      },
    );

    const recipientName = (parcel as any).recipientName || 'Mpokeaji';
    const arrivalBrand =
      (parcel as any).destinationSuperAgent?.businessName ||
      (parcel as any).superAgent?.businessName ||
      'KenteXa Network';

    // SMS 2: Buyer action required (essential)
    if ((parcel as any).buyerPhone) {
      await this.smsService
        .sendSms(
          (parcel as any).buyerPhone,
          `SUPER AGENT ${arrivalBrand}\n\n` +
            `Habari ${recipientName}! Bidhaa yako (${trackingNumber}) ` +
            `imefika ${dto.city}. Ingia KenteXa kuchagua: uchukue mwenyewe au omba delivery.\n\n` +
            `Fuatilia: ${FRONTEND_URL}/?track=${trackingNumber}\n\n` +
            `Verified by Kentexa`,
        )
        .catch(() => {});
    }

    // Agents see this new job in their dashboard on next refresh by querying
    // available jobs directly — no broadcast/SMS needed here (cost saving).

    return {
      message: 'Umesajili kuwasili. SMS imetumwa kwa mpokeaji.',
      trackingNumber,
    };
  }

  // ── Buyer requests last-mile delivery ────────────────────────────────────

  async buyerRequestDelivery(
    buyer: User,
    trackingNumber: string,
    dto: {
      agentId: number;
      agreedFee: number;
      address?: string;
    },
  ) {
    const parcel = await this.parcelRepo.findOne({ where: { trackingNumber } });
    if (!parcel) throw new NotFoundException('Parcel not found');

    const agent = await this.agentRepo.findOne({
      where: { id: dto.agentId },
      relations: { user: true },
    });
    if (!agent) throw new NotFoundException('Agent not found');

    await this.parcelRepo.update((parcel as any).id, {
      localAgentId: String(agent.user?.id || dto.agentId),
      localAgentName: agent.fullName,
      agreedDeliveryFee: dto.agreedFee,
      buyerRequestedDelivery: true,
      deliveryAddress: dto.address || (parcel as any).deliveryAddress,
      status: ParcelStatus.ARRIVED_AT_HUB,
      claimedAt: new Date(),
    });

    await this.addTrackingEvent(
      parcel,
      ParcelStatus.ARRIVED_AT_HUB,
      (parcel as any).destinationCity || '',
      `Mpokeaji ameomba delivery na ${agent.fullName} kwa TZS ${dto.agreedFee.toLocaleString()}`,
      buyer.name || 'Mpokeaji',
      {
        phone: buyer.phone || undefined,
        location: (parcel as any).destinationCity || undefined,
        type: 'system',
      },
    );

    // SMS 3: Chosen agent gets notified (essential)
    if (agent.user?.phone) {
      await this.smsService
        .sendSms(
          agent.user.phone,
          `KenteXa: Habari ${agent.fullName}! Mpokeaji amekuomba ufanye delivery ya ` +
            `kifurushi ${trackingNumber} kwa TZS ${dto.agreedFee.toLocaleString()}. ` +
            `Ingia dashibodini kupokea maelezo. ${FRONTEND_URL}`,
        )
        .catch(() => {});
    }

    return { message: 'Ombi la delivery limetumwa kwa wakala', trackingNumber };
  }

  // ── Buyer chooses self-pickup ─────────────────────────────────────────────

  async buyerSelfPickup(buyer: User, trackingNumber: string) {
    const parcel = await this.parcelRepo.findOne({ where: { trackingNumber } });
    if (!parcel) throw new NotFoundException('Parcel not found');

    await this.parcelRepo.update((parcel as any).id, {
      status: ParcelStatus.SELF_PICKUP,
      buyerRequestedDelivery: false,
      deliveredTime: new Date(),
      buyerConfirmed: true,
    });

    await this.addTrackingEvent(
      parcel,
      ParcelStatus.SELF_PICKUP,
      (parcel as any).destinationCity || '',
      'Mpokeaji amechagua kuchukua mwenyewe',
      buyer.name || 'Mpokeaji',
      { type: 'system' },
    );

    return {
      message: 'Umesajili kwamba utachukua mwenyewe. Asante!',
      trackingNumber,
    };
  }

  // ── Get seller's shipments ────────────────────────────────────────────────

  async getMyShipments(seller: User) {
    return this.parcelRepo.find({
      where: { seller: { id: seller.id }, source: 'seller_shipment' },
      relations: { order: true },
      order: { createdAt: 'DESC' } as any,
    });
  }

  // ── Get buyer's incoming parcels by phone ─────────────────────────────────

  async getBuyerParcels(phone: string) {
    const parcels = await this.parcelRepo.find({
      where: { buyerPhone: phone },
      order: { createdAt: 'DESC' } as any,
      take: 20,
    });
    return parcels.map((p) => ({
      trackingNumber: p.trackingNumber,
      status: p.status,
      originCity: (p as any).originCity,
      destinationCity: (p as any).destinationCity,
      description: (p as any).description,
      senderName: (p as any).senderName,
      expectedArrival: (p as any).expectedArrival,
      buyerRequestedDelivery: (p as any).buyerRequestedDelivery,
    }));
  }

  private statusLabel(status: ParcelStatus, city: string): string {
    const labels: Partial<Record<ParcelStatus, string>> = {
      [ParcelStatus.COLLECTION_REQUESTED]: 'Ombi la kukusanya limewasilishwa',
      [ParcelStatus.COLLECTED_BY_AGENT]: 'Imekusanywa na wakala',
      [ParcelStatus.RECEIVED_AT_HUB]: `Imepokewa kwenye hub — ${city}`,
      [ParcelStatus.VERIFIED]: 'Imethibitishwa',
      [ParcelStatus.READY_FOR_DISPATCH]: 'Iko tayari kutumwa',
      [ParcelStatus.DISPATCHED]: `Imetumwa kutoka ${city}`,
      [ParcelStatus.IN_TRANSIT]: 'Ipo njiani',
      [ParcelStatus.ARRIVED_AT_HUB]: `Imefika ${city}`,
    };
    return labels[status] || status?.replace(/_/g, ' ') || 'Unknown';
  }
  // ── Admin: Hub Management ─────────────────────────────────────────────────

  async adminGetAllSuperAgents(status?: string): Promise<SuperAgent[]> {
    const where: any = status ? { status } : {};
    return this.superAgentRepo.find({
      where,
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });
  }

  async adminAssignHub(
    superAgentId: number,
    dto: {
      hubCity: string;
      hubName: string;
      hubAddress?: string;
      coverageZones?: string[];
    },
  ): Promise<SuperAgent> {
    const sa = await this.superAgentRepo.findOne({
      where: { id: superAgentId },
    });
    if (!sa) throw new NotFoundException('Super Agent hajapatikana');
    (sa as any).hubCity = dto.hubCity;
    (sa as any).hubName = dto.hubName;
    (sa as any).hubAddress = dto.hubAddress || null;
    (sa as any).coverageZones = dto.coverageZones || [];
    return this.superAgentRepo.save(sa);
  }

  async adminGetHubSummary(): Promise<
    {
      city: string;
      count: number;
      agents: { id: number; name: string; hubName: string }[];
    }[]
  > {
    const all = await this.superAgentRepo.find({
      where: { status: 'approved' as any },
      relations: { user: true },
    });
    const cities: Record<string, any> = {};
    for (const sa of all) {
      const city = (sa as any).hubCity || sa.city || 'Haijapewa';
      if (!cities[city]) cities[city] = { city, count: 0, agents: [] };
      cities[city].count++;
      cities[city].agents.push({
        id: sa.id,
        name: (sa as any).businessName || sa.user?.name || '—',
        hubName: (sa as any).hubName || '—',
      });
    }
    return Object.values(cities);
  }

  // ── Inter-hub Transfer ────────────────────────────────────────────────────
  async transferToHub(
    superAgentId: number,
    trackingNumber: string,
    dto: {
      destinationHub: string;
      destinationCity: string;
      transportMode?: string;
      note?: string;
    },
  ) {
    const sa = await this.superAgentRepo.findOne({
      where: { user: { id: superAgentId } },
      relations: { user: true },
    });
    if (!sa) throw new NotFoundException('Super Agent hajapatikana');

    const parcel = await this.parcelRepo.findOne({ where: { trackingNumber } });
    if (!parcel)
      throw new NotFoundException(`Kifurushi ${trackingNumber} hakijapatikana`);

    // Update parcel status
    await this.parcelRepo.update(parcel.id, {
      status: ParcelStatus.TRANSFERRED_HUB,
    });

    // Add tracking event
    await this.addTrackingEvent(
      parcel,
      ParcelStatus.TRANSFERRED_HUB,
      sa.city,
      dto.note ||
        `Kimehamishiwa kituo cha ${dto.destinationHub}, ${dto.destinationCity}`,
      sa.user?.name || 'Super Agent',
      { type: 'super_agent', location: sa.city },
    );

    return {
      success: true,
      message: `Kifurushi ${trackingNumber} kimehamishiwa ${dto.destinationHub}`,
      trackingNumber,
      destinationHub: dto.destinationHub,
      destinationCity: dto.destinationCity,
    };
  }
}
