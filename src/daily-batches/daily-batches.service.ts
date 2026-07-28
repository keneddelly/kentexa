import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DailyBatch, BatchStatus } from './entities/daily-batch.entity';
import { BatchParcel, BatchParcelStatus } from './entities/batch-parcel.entity';
import { DeliveryZone } from './entities/delivery-zone.entity';
import { Order } from '../orders/entities/order.entity';
import { IntercityRoute } from '../super-agents/entities/intercity-route.entity';
import { Product } from '../products/entities/products.entity';
import { User } from '../users/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DailyBatchesService {
  private readonly BATCH_FEE = 3000;

  // ── Dar es Salaam zone definitions ───────────────────────────────────────
  // Used for seller → buyer distance calculation
  private readonly DAR_ZONES: Record<
    string,
    { rank: number; keywords: string[]; label: string }
  > = {
    zone_central: {
      rank: 1,
      label: 'Kariakoo / Ilala / Upanga',
      keywords: [
        'kariakoo',
        'ilala',
        'upanga',
        'kisutu',
        'gerezani',
        'kivukoni',
        'lumumba',
      ],
    },
    zone_inner: {
      rank: 2,
      label: 'Kinondoni / Sinza / Magomeni / Temeke',
      keywords: [
        'kinondoni',
        'sinza',
        'mwenge',
        'mikocheni',
        'magomeni',
        'mwananyamala',
        'tandale',
        'manzese',
        'kijitonyama',
        'msasani',
        'masaki',
        'oyster bay',
        'temeke',
        'kigamboni',
        'kurasini',
        'mtoni',
        "chang'ombe",
      ],
    },
    zone_mid: {
      rank: 3,
      label: 'Ubungo / Kimara / Mbezi / Mbagala',
      keywords: [
        'ubungo',
        'kimara',
        'makuburi',
        'kibamba',
        'mbezi',
        'mbezi louis',
        'mbezi beach',
        'mbagala',
        'mbagala kuu',
        'yombo',
        'tandika',
      ],
    },
    zone_far: {
      rank: 4,
      label: 'Bunju / Tegeta / Boko / Kigamboni',
      keywords: [
        'bunju',
        'bunju a',
        'bunju b',
        'mbweni',
        'tegeta',
        'boko',
        'kunduchi',
      ],
    },
  };

  // Fee matrix: [sellerRank][buyerRank] → fee in TZS
  // Lower rank = more central. Same zone = cheap, far zones = expensive
  // Default rates — overridden by DB values when admin updates them
  // Based on realistic Dar es Salaam boda rates 2026 (TZS 500-700/km)
  private readonly DEFAULT_FEE_MATRIX: Record<string, number> = {
    '1-1': 3000, // central → central    (~3km avg, e.g. Kariakoo→Ilala)
    '1-2': 6000, // central → inner      (~8km,  e.g. Kariakoo→Sinza)
    '1-3': 10000, // central → mid        (~14km, e.g. Kariakoo→Mbagala)
    '1-4': 15000, // central → far        (~24km, e.g. Kariakoo→Bunju)
    '2-1': 5000, // inner → central      (~7km,  e.g. Sinza→Kariakoo)
    '2-2': 4000, // inner → inner        (~5km,  e.g. Sinza→Kinondoni)
    '2-3': 8000, // inner → mid          (~10km, e.g. Sinza→Mbagala)
    '2-4': 13000, // inner → far          (~20km, e.g. Sinza→Bunju)
    '3-1': 9000, // mid → central        (~13km, e.g. Mbagala→Kariakoo)
    '3-2': 7000, // mid → inner          (~9km,  e.g. Mbagala→Temeke)
    '3-3': 4000, // mid → mid            (~5km,  e.g. Mbagala→Kimara)
    '3-4': 10000, // mid → far            (~14km, e.g. Kimara→Bunju)
    '4-1': 14000, // far → central        (~23km, e.g. Bunju→Kariakoo)
    '4-2': 12000, // far → inner          (~18km, e.g. Bunju→Sinza)
    '4-3': 9000, // far → mid            (~13km, e.g. Bunju→Kimara)
    '4-4': 5000, // far → far            (~6km,  e.g. Bunju→Tegeta)
  };

  // Runtime matrix — loaded from DB on first use, falls back to defaults
  private runtimeMatrix: Record<string, number> | null = null;

  private detectZoneRank(address: string | null): number {
    if (!address) return 1; // default to central
    const lower = address.toLowerCase();
    for (const zone of Object.values(this.DAR_ZONES)) {
      if (zone.keywords.some((kw) => lower.includes(kw))) return zone.rank;
    }
    return 2; // default to inner if Dar but no specific match
  }

  private detectZoneLabel(address: string | null): string {
    if (!address) return 'Kariakoo / Ilala';
    const lower = address.toLowerCase();
    for (const zone of Object.values(this.DAR_ZONES)) {
      if (zone.keywords.some((kw) => lower.includes(kw))) return zone.label;
    }
    return 'Dar es Salaam';
  }

  private async loadFeeMatrix(): Promise<Record<string, number>> {
    if (this.runtimeMatrix) return this.runtimeMatrix;
    try {
      // Load overrides from DB — admin can update these via /boda-rates
      // rateKey format: 'matrix_1_2' for central→inner
      const dbRates = await this.productRepo.manager
        .getRepository('BodaRateCard')
        .find({ where: { category: 'matrix', isActive: true } } as any)
        .catch(() => []);

      if (dbRates && dbRates.length > 0) {
        this.runtimeMatrix = { ...this.DEFAULT_FEE_MATRIX };
        for (const r of dbRates as any[]) {
          // Convert 'matrix_1_2' → '1-2'
          const key = r.rateKey.replace('matrix_', '').replace('_', '-');
          this.runtimeMatrix[key] = r.fee;
        }
      } else {
        this.runtimeMatrix = { ...this.DEFAULT_FEE_MATRIX };
      }
    } catch {
      this.runtimeMatrix = { ...this.DEFAULT_FEE_MATRIX };
    }
    return this.runtimeMatrix;
  }

  private async calculateBodaFee(
    sellerAddress: string | null,
    buyerAddress: string | null,
  ): Promise<number> {
    const matrix = await this.loadFeeMatrix();
    const sellerRank = this.detectZoneRank(sellerAddress);
    const buyerRank = this.detectZoneRank(buyerAddress);
    const key = `${sellerRank}-${buyerRank}`;
    return matrix[key] || 10000;
  }
  private readonly logger = new Logger(DailyBatchesService.name);

  constructor(
    @InjectRepository(DailyBatch) private batchRepo: Repository<DailyBatch>,
    @InjectRepository(BatchParcel) private parcelRepo: Repository<BatchParcel>,
    @InjectRepository(DeliveryZone) private zoneRepo: Repository<DeliveryZone>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Product) private productRepo: Repository<Product>,
    @InjectRepository(IntercityRoute)
    private routeRepo: Repository<IntercityRoute>,
    private notificationsService: NotificationsService,
  ) {}

  // ── Zone detection — match a delivery address to a known zone ────────────
  async detectZone(
    deliveryAddress: string | null,
  ): Promise<DeliveryZone | null> {
    if (!deliveryAddress) return null;
    const zones = await this.zoneRepo.find({ where: { isActive: true } });
    const addressLower = deliveryAddress.toLowerCase();

    for (const zone of zones) {
      const keywords = zone.addressKeywords?.length
        ? zone.addressKeywords
        : [zone.name];
      for (const kw of keywords) {
        if (addressLower.includes(kw.toLowerCase())) {
          return zone;
        }
      }
    }
    return null;
  }

  // ── Get or create today's (or tomorrow's, if cutoff passed) open batch ───
  async getOrCreateOpenBatch(): Promise<DailyBatch> {
    const now = new Date();

    // Look for today's batch first
    let batch = await this.batchRepo.findOne({
      where: { runDate: this.dateOnly(now) as any, status: BatchStatus.OPEN },
    });

    // If today's batch exists but cutoff has passed, look for/create tomorrow's
    if (batch && now > new Date(batch.cutoffTime)) {
      batch = null;
    }

    if (!batch) {
      // Determine the next valid run date — today if before cutoff hour, else tomorrow
      const targetDate = new Date(now);
      const cutoffHour = 7; // 7am production cutoff — orders must be paid before 7am to join today's batch
      if (now.getHours() >= cutoffHour) {
        targetDate.setDate(targetDate.getDate() + 1);
      }

      const existing = await this.batchRepo.findOne({
        where: { runDate: this.dateOnly(targetDate) as any },
      });
      if (existing) return existing;

      const cutoffTime = new Date(targetDate);
      cutoffTime.setHours(cutoffHour, 0, 0, 0);

      const departureTime = new Date(targetDate);
      departureTime.setHours(23, 30, 0, 0); // 11:30pm during testing — change to 8 for production

      batch = await this.batchRepo.save(
        this.batchRepo.create({
          runDate: this.dateOnly(targetDate) as any,
          status: BatchStatus.OPEN,
          cutoffTime,
          plannedDepartureTime: departureTime,
        }),
      );
      this.logger.log(
        `Created new daily batch for ${this.dateOnly(targetDate)}`,
      );
    }

    return batch;
  }

  private dateOnly(d: Date): string {
    return new Date(d).toISOString().split('T')[0];
  }

  // ── Seller/Agent: create offline order + auto-assign to batch ────────────
  // For walk-in/cash sales that never went through KenteXa checkout.
  // Creates a minimal already-paid Order behind the scenes so everything
  // downstream (tracking, notifications, batch logic) works identically
  // to a normal online order — no special-casing needed elsewhere.
  async createOfflineOrderAndAssign(
    creator: User, // the seller or Super Agent creating this
    data: {
      productName: string;
      amount: number;
      buyerName: string;
      buyerPhone: string;
      deliveryAddress: string;
      quantity?: number;
      notes?: string;
    },
  ) {
    if (!data.productName?.trim())
      throw new BadRequestException('Product name is required');
    if (!data.amount || data.amount <= 0)
      throw new BadRequestException('Amount is required');
    if (!data.buyerName?.trim())
      throw new BadRequestException('Buyer name is required');
    if (!data.buyerPhone?.trim())
      throw new BadRequestException('Buyer phone is required');
    if (!data.deliveryAddress?.trim())
      throw new BadRequestException('Delivery address is required');

    const zone = await this.detectZone(data.deliveryAddress);
    if (!zone) {
      throw new BadRequestException(
        `Delivery address "${data.deliveryAddress}" doesn't match any known batch zone.`,
      );
    }

    const amount = Number(data.amount);
    const quantity = data.quantity || 1;
    // Offline sales — seller already has the cash, no platform fee deducted
    // (they can be charged a flat listing/usage fee separately if needed later)
    const order = (await this.orderRepo.save(
      this.orderRepo.create({
        buyer: null,
        product: null,
        seller: creator,
        quantity,
        baseAmount: amount,
        totalAmount: amount,
        deliveryFeeAmount: 0,
        platformFeeAmount: 0,
        sellerAmount: amount,
        deliveryAddress: data.deliveryAddress.trim(),
        phone: data.buyerPhone.trim(),
        recipientName: data.buyerName.trim(),
        manualProductName: data.productName.trim(),
        manualBuyerName: data.buyerName.trim(),
        manualBuyerPhone: data.buyerPhone.trim(),
        createdByUserId: creator.id,
        source: 'offline' as any,
        status: 'paid' as any, // already paid — cash collected at point of sale
        paymentStatus: 'paid' as any,
        escrowStatus: null,
        payoutStatus: 'released' as any, // seller already has the cash physically
        shippingMethod: 'agent',
        shippingNote: data.notes || null,
      } as any),
    )) as unknown as Order;

    const batch = await this.getOrCreateOpenBatch();
    const trackingNumber = `KTX-OFFLINE-${batch.id}-${order.id}`;

    const parcel = await this.parcelRepo.save(
      this.parcelRepo.create({
        batch,
        order,
        zone,
        status: BatchParcelStatus.AWAITING_HANDOVER,
        trackingNumber,
      }),
    );

    // Update order with tracking number
    await this.orderRepo.update(order.id, {
      trackingNumber,
    });

    return {
      success: true,
      orderId: order.id,
      batchId: batch.id,
      runDate: batch.runDate,
      cutoffTime: batch.cutoffTime,
      plannedDepartureTime: batch.plannedDepartureTime,
      zoneName: zone.name,
      zoneAgent:
        zone.zoneAgent?.businessName || zone.zoneAgent?.user?.name || null,
      estimatedArrival: new Date(
        batch.plannedDepartureTime.getTime() +
          zone.etaMinutesFromDeparture * 60000,
      ),
      trackingNumber,
      parcelId: parcel.id,
      message: `Offline order created and assigned to ${zone.name} batch. Hand off at Kariakoo hub before ${new Date(batch.cutoffTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`,
    };
  }

  // ── Seller: hand off parcel — assigns to today's/tomorrow's batch ────────
  async assignOrderToBatch(orderId: number, seller: User) {
    const order = await this.orderRepo.findOne({
      where: { id: orderId },
      relations: { seller: true, buyer: true, product: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.seller?.id !== seller.id)
      throw new BadRequestException('Not your order');

    // ── Prevent duplicates — check if already assigned to any batch ──────────
    const existing = await this.parcelRepo.findOne({
      where: { order: { id: orderId } },
      relations: { batch: true, zone: true },
    });
    if (existing) {
      return {
        success: true,
        alreadyAssigned: true,
        batchId: existing.batch.id,
        runDate: existing.batch.runDate,
        cutoffTime: existing.batch.cutoffTime,
        plannedDepartureTime: existing.batch.plannedDepartureTime,
        zoneName: existing.zone.name,
        trackingNumber: existing.trackingNumber,
        parcelId: existing.id,
        message: `Agizo hili limeshapangiliwa kwenye van ya ${existing.zone.name}. Tracking: ${existing.trackingNumber}`,
      };
    }

    const zone = await this.detectZone(order.deliveryAddress);
    if (!zone) {
      throw new BadRequestException(
        `Delivery address "${order.deliveryAddress}" doesn't match any known batch zone. Use a different shipping method.`,
      );
    }

    const batch = await this.getOrCreateOpenBatch();

    // Generate a simple tracking reference for this batch parcel
    const trackingNumber = `KTX-BATCH-${batch.id}-${order.id}`;

    const parcel = await this.parcelRepo.save(
      this.parcelRepo.create({
        batch,
        order,
        zone,
        status: BatchParcelStatus.AWAITING_HANDOVER,
        trackingNumber,
      }),
    );

    // Update order with tracking number and advance status to preparing
    await this.orderRepo.update(order.id, {
      trackingNumber,
      status: 'preparing' as any,
      shippingMethod: 'kentexa_delivery',
    });

    return {
      success: true,
      batchId: batch.id,
      runDate: batch.runDate,
      cutoffTime: batch.cutoffTime,
      plannedDepartureTime: batch.plannedDepartureTime,
      zoneName: zone.name,
      zoneAgent:
        zone.zoneAgent?.businessName || zone.zoneAgent?.user?.name || null,
      estimatedArrival: new Date(
        batch.plannedDepartureTime.getTime() +
          zone.etaMinutesFromDeparture * 60000,
      ),
      trackingNumber,
      parcelId: parcel.id,
      message: `Parcel assigned to ${this.dateOnly(batch.runDate) === this.dateOnly(new Date()) ? "today's" : "tomorrow's"} van run to ${zone.name}. Hand off at Kariakoo hub before ${new Date(batch.cutoffTime).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`,
    };
  }

  // ── Hub: mark parcel physically received at Kariakoo ──────────────────────
  async markReceivedAtHub(parcelId: number) {
    const parcel = await this.parcelRepo.findOne({
      where: { id: parcelId },
      relations: { order: { buyer: true } },
    });
    if (!parcel) throw new NotFoundException('Parcel not found');

    await this.parcelRepo.update(parcelId, {
      status: BatchParcelStatus.AT_HUB,
      handedOverAt: new Date(),
    });

    return { success: true, message: 'Parcel marked as received at hub.' };
  }

  // ── Dispatcher: get today's manifest (all parcels in current batch, grouped by zone) ──
  async getTodaysManifest() {
    // Find the most recent batch that is open, cutoff, departed or in_progress
    // Don't restrict to today's date only — batches created for tomorrow
    // should still be visible to the dispatcher
    const batch = await this.batchRepo.findOne({
      where: [
        { status: BatchStatus.OPEN },
        { status: BatchStatus.CUTOFF },
        { status: BatchStatus.DEPARTED },
        { status: BatchStatus.IN_PROGRESS },
      ],
      relations: {
        parcels: { order: { buyer: true, product: true }, zone: true },
      },
      order: { createdAt: 'DESC' },
    });

    // If no active batch, check for today's completed batch
    if (!batch) {
      const today = this.dateOnly(new Date());
      const completedBatch = await this.batchRepo.findOne({
        where: { runDate: today as any, status: BatchStatus.COMPLETED },
        relations: {
          parcels: { order: { buyer: true, product: true }, zone: true },
        },
      });
      if (!completedBatch) return { batch: null, zones: [], totalParcels: 0 };

      return this.buildManifestResponse(completedBatch);
    }

    return this.buildManifestResponse(batch);
  }

  private buildManifestResponse(batch: DailyBatch) {
    const zoneMap = new Map<number, any>();
    for (const p of batch.parcels) {
      if (!p.zone) continue;
      const zoneId = p.zone.id;
      if (!zoneMap.has(zoneId)) {
        zoneMap.set(zoneId, {
          zoneId,
          zoneName: p.zone.name,
          zoneAgent:
            p.zone.zoneAgent?.businessName ||
            p.zone.zoneAgent?.user?.name ||
            'Unassigned',
          routeOrder: p.zone.routeOrder,
          etaMinutes: p.zone.etaMinutesFromDeparture,
          parcels: [],
        });
      }
      zoneMap.get(zoneId).parcels.push({
        parcelId: p.id,
        orderId: p.order?.id,
        trackingNumber: p.trackingNumber,
        status: p.status,
        productName:
          p.order?.product?.name || p.order?.manualProductName || '—',
        recipientName:
          p.order?.recipientName ||
          p.order?.buyer?.name ||
          p.order?.manualBuyerName ||
          '—',
        recipientPhone:
          p.order?.phone ||
          p.order?.buyer?.phone ||
          p.order?.manualBuyerPhone ||
          '—',
        deliveryAddress: p.order?.deliveryAddress,
        zoneName: p.zone.name,
      });
    }

    const zones = Array.from(zoneMap.values()).sort(
      (a, b) => a.routeOrder - b.routeOrder,
    );

    return {
      batch: {
        id: batch.id,
        runDate: batch.runDate,
        status: batch.status,
        cutoffTime: batch.cutoffTime,
        plannedDepartureTime: batch.plannedDepartureTime,
        actualDepartureTime: batch.actualDepartureTime,
        driverName: batch.driverName,
        driverPhone: batch.driverPhone,
        vehicleInfo: batch.vehicleInfo,
      },
      zones,
      totalParcels: batch.parcels.length,
    };
  }

  // ── Dispatcher: assign driver/vehicle and mark van departed ───────────────
  async departVan(
    batchId: number,
    data: { driverName?: string; driverPhone?: string; vehicleInfo?: string },
  ) {
    const batch = await this.batchRepo.findOne({
      where: { id: batchId },
      relations: { parcels: { order: { buyer: true } } },
    });
    if (!batch) throw new NotFoundException('Batch not found');
    if (
      batch.status !== BatchStatus.OPEN &&
      batch.status !== BatchStatus.CUTOFF
    ) {
      throw new BadRequestException('Batch already departed or completed');
    }

    await this.batchRepo.update(batchId, {
      status: BatchStatus.DEPARTED,
      actualDepartureTime: new Date(),
      driverName: data.driverName || null,
      driverPhone: data.driverPhone || null,
      vehicleInfo: data.vehicleInfo || null,
    });

    // Mark all parcels in this batch as ON_VAN
    await this.parcelRepo
      .createQueryBuilder()
      .update(BatchParcel)
      .set({ status: BatchParcelStatus.ON_VAN })
      .where('batchId = :batchId', { batchId })
      .execute();

    // Notify buyers — email only, this is a status update not a critical event
    for (const parcel of batch.parcels) {
      try {
        await this.notificationsService.parcelDispatched(
          { email: parcel.order.buyer?.email, name: parcel.order.buyer?.name },
          parcel.trackingNumber || `Order #${parcel.order.id}`,
          'Kariakoo',
          parcel.order.deliveryAddress || 'your area',
        );
      } catch (e) {
        console.error('Dispatch notification failed:', e.message);
      }
    }

    return {
      success: true,
      message: `Van departed with ${batch.parcels.length} parcels.`,
    };
  }

  // ── Zone agent: mark zone arrival, parcels now ready for last-mile ────────
  async markZoneArrival(batchId: number, zoneId: number) {
    const result = await this.parcelRepo
      .createQueryBuilder()
      .update(BatchParcel)
      .set({
        status: BatchParcelStatus.AT_ZONE,
        arrivedAtZoneAt: new Date(),
      })
      .where('batchId = :batchId AND zoneId = :zoneId', { batchId, zoneId })
      .execute();

    return {
      success: true,
      updated: result.affected || 0,
      message: 'Zone marked as arrived. Parcels ready for last-mile delivery.',
    };
  }

  // ── Zone agent: mark individual parcel delivered ───────────────────────────
  async markParcelDelivered(parcelId: number) {
    const parcel = await this.parcelRepo.findOne({
      where: { id: parcelId },
      relations: { order: { buyer: true } },
    });
    if (!parcel) throw new NotFoundException('Parcel not found');

    await this.parcelRepo.update(parcelId, {
      status: BatchParcelStatus.DELIVERED,
      deliveredAt: new Date(),
    });

    // SMS — mandatory delivered/ready event
    await this.notificationsService.delivered(
      {
        email: parcel.order.buyer?.email,
        phone: parcel.order.buyer?.phone,
        name: parcel.order.buyer?.name,
      },
      parcel.order.id,
      parcel.trackingNumber || `Order #${parcel.order.id}`,
    );

    return {
      success: true,
      message: 'Parcel marked delivered. Buyer notified.',
    };
  }

  // ── Get batch status for a buyer's tracking page ──────────────────────────
  async getParcelStatusForOrder(orderId: number) {
    const parcel = await this.parcelRepo.findOne({
      where: { order: { id: orderId } },
      relations: { batch: true, zone: true },
      order: { createdAt: 'DESC' },
    });
    if (!parcel) return null;

    return {
      status: parcel.status,
      zoneName: parcel.zone.name,
      zoneAgent:
        parcel.zone.zoneAgent?.businessName ||
        parcel.zone.zoneAgent?.user?.name ||
        null,
      batchRunDate: parcel.batch.runDate,
      batchStatus: parcel.batch.status,
      plannedDepartureTime: parcel.batch.plannedDepartureTime,
      estimatedArrival: new Date(
        new Date(parcel.batch.plannedDepartureTime).getTime() +
          parcel.zone.etaMinutesFromDeparture * 60000,
      ),
      handedOverAt: parcel.handedOverAt,
      arrivedAtZoneAt: parcel.arrivedAtZoneAt,
      deliveredAt: parcel.deliveredAt,
      trackingNumber: parcel.trackingNumber,
    };
  }

  // ── Admin: manage zones ────────────────────────────────────────────────────
  async createZone(data: {
    name: string;
    city: string;
    routeOrder: number;
    etaMinutesFromDeparture: number;
    zoneAgentId?: number;
    addressKeywords?: string[];
  }) {
    const zone = await this.zoneRepo.save(
      this.zoneRepo.create({
        name: data.name,
        city: data.city,
        routeOrder: data.routeOrder,
        etaMinutesFromDeparture: data.etaMinutesFromDeparture,
        zoneAgent: data.zoneAgentId ? ({ id: data.zoneAgentId } as any) : null,
        addressKeywords: data.addressKeywords || [data.name],
        isActive: true,
      }),
    );
    return zone;
  }

  async getZones() {
    return this.zoneRepo.find({
      where: { isActive: true },
      order: { routeOrder: 'ASC' },
    });
  }

  async updateZone(
    id: number,
    data: Partial<{
      name: string;
      routeOrder: number;
      etaMinutesFromDeparture: number;
      zoneAgentId: number;
      addressKeywords: string[];
      isActive: boolean;
    }>,
  ) {
    const zone = await this.zoneRepo.findOne({ where: { id } });
    if (!zone) throw new NotFoundException('Zone not found');

    const updatePayload: any = { ...data };
    if (data.zoneAgentId !== undefined) {
      updatePayload.zoneAgent = { id: data.zoneAgentId };
      delete updatePayload.zoneAgentId;
    }

    await this.zoneRepo.update(id, updatePayload);
    return this.zoneRepo.findOne({ where: { id } });
  }

  // ── Get available delivery methods — reads zone keywords from DB ──────────
  // Called by checkout to show buyer the correct options based on their address
  async getDeliveryMethods(buyerAddress: string, productId: number) {
    const lower = (buyerAddress || '').toLowerCase();

    // Load all active zones from DB — use their actual keywords
    const zones = await this.zoneRepo.find({ where: { isActive: true } });

    // Check general Dar es Salaam keywords
    // CORE DAR ES SALAAM KEYWORDS — hardcoded, comprehensive
    // These determine isSameCity (show boda option)
    // Zone keywords from DB determine which specific zone (show van option)
    const DAR_AREA_KEYWORDS = [
      // City center & Ilala
      'kariakoo',
      'ilala',
      'kisutu',
      'upanga',
      'gerezani',
      'kivukoni',
      // Kinondoni
      'kinondoni',
      'mikocheni',
      'mwenge',
      'sinza',
      'kijitonyama',
      'mwananyamala',
      'magomeni',
      'tandale',
      'manzese',
      'kigogo',
      // Ubungo
      'ubungo',
      'kimara',
      'makuburi',
      'kibamba',
      // Mbezi area
      'mbezi',
      'mbezi louis',
      'mbezi beach',
      // Temeke south
      'temeke',
      'mbagala',
      'mbagala kuu',
      'kigamboni',
      "chang'ombe",
      'mtoni',
      'kurasini',
      'tandika',
      'yombo',
      // Far north
      'bunju',
      'bunju a',
      'bunju b',
      'mbweni',
      'tegeta',
      'boko',
      'kunduchi',
      // Msasani peninsula
      'msasani',
      'masaki',
      'oyster bay',
      // General
      'dar es salaam',
      'salaam',
      'dsm',
    ];

    const buyerInDar =
      DAR_AREA_KEYWORDS.some((kw) => lower.includes(kw)) ||
      lower.startsWith('dar') ||
      /\bdar\b/.test(lower);

    // Get product details for pricing
    let deliveryFee = 0;
    let basePrice = 0;
    let sellerCity: string | null = null;

    try {
      const product = await this.productRepo.findOne({
        where: { id: productId },
      });
      if (product) {
        deliveryFee = Number(product.deliveryFee || 0);
        basePrice = Number(product.basePrice || 0);
        sellerCity = (product as any).sellerCity || null;
      }
    } catch (e) {
      this.logger.error(
        'getDeliveryMethods product fetch failed: ' + e.message,
      );
    }

    // If seller city is not set, assume Dar es Salaam (most sellers are in Dar)
    // Seller can update their city in product settings
    const sellerInDar = !sellerCity || sellerCity.toLowerCase().includes('dar');
    const isSameCity = buyerInDar && sellerInDar;

    this.logger.log(
      `DeliveryMethods: address="${buyerAddress}" buyerInDar=${buyerInDar} sellerCity="${sellerCity}" isSameCity=${isSameCity} zones=${zones.length}`,
    );

    // Find matching batch zone from DB keywords
    let matchedZone: DeliveryZone | null = null;
    for (const zone of zones) {
      const keywords = (zone.addressKeywords || [zone.name]).map((k) =>
        k.toLowerCase().trim(),
      );
      if (keywords.some((kw) => kw && lower.includes(kw))) {
        matchedZone = zone;
        break;
      }
    }

    // For areas in Dar but not in any zone — show boda only (no van)
    // For areas in a seeded zone — show boda + van

    if (!isSameCity) {
      // Look up route table for ETA, transit city, expected arrival
      let routeInfo: any = null;
      try {
        const buyerCityGuess = this.guessCityFromAddress(buyerAddress);
        const origin = sellerCity || 'Dar es Salaam';
        if (buyerCityGuess) {
          routeInfo = await this.routeRepo
            .findOne({
              where: {
                originCity: origin,
                destinationCity: buyerCityGuess,
                isActive: true,
              },
            })
            .catch(() => null);
        }
        // Fallback: any active route from origin
        if (!routeInfo) {
          routeInfo = await this.routeRepo
            .findOne({
              where: { originCity: origin, isActive: true },
            })
            .catch(() => null);
        }
      } catch (e) {
        console.error('Route lookup failed:', e.message);
      }

      const estimatedDays = routeInfo?.estimatedDays ?? 2;
      const transitCity = routeInfo?.transitCity ?? null;
      const expectedArrival = this.calcExpectedArrival(estimatedDays);

      return {
        isSameCity: false,
        batchZone: null,
        sellerCity,
        methods: [
          {
            key: 'agent',
            label: 'KenteXa Super Agent',
            icon: '🏢',
            fee: deliveryFee,
            totalPrice: basePrice + deliveryFee,
            desc: 'Utoaji wa mkoa — kupitia mtandao wa Super Agents wa KenteXa',
            estimatedDays,
            transitCity,
            expectedArrival,
            leg1Days: routeInfo?.leg1Days ?? null,
            leg2Days: routeInfo?.leg2Days ?? null,
          },
        ],
      };
    }

    const bodaFee = await this.calculateBodaFee(sellerCity, buyerAddress);
    const sellerZone = this.detectZoneLabel(sellerCity);
    const buyerZone = this.detectZoneLabel(buyerAddress);
    const sameZone =
      this.detectZoneRank(sellerCity) === this.detectZoneRank(buyerAddress);

    const methods: any[] = [
      {
        key: 'boda',
        label: 'Boda Boda',
        icon: '🛵',
        fee: bodaFee,
        totalPrice: basePrice + bodaFee,
        desc: sameZone
          ? `Mnunuzi yuko eneo lako (${buyerZone}) — karibu sana`
          : `Kutoka ${sellerZone} hadi ${buyerZone}`,
        sellerZone,
        buyerZone,
        sameZone,
      },
    ];

    if (matchedZone) {
      const deptHour = 8; // 8am departure
      const etaHour =
        deptHour + Math.floor(matchedZone.etaMinutesFromDeparture / 60);
      const etaMin = matchedZone.etaMinutesFromDeparture % 60;
      const etaStr = `${String(etaHour).padStart(2, '0')}:${String(etaMin).padStart(2, '0')} AM`;

      methods.push({
        key: 'kentexa_delivery',
        label: 'KenteXa Delivery',
        icon: '🚐',
        fee: this.BATCH_FEE,
        totalPrice: basePrice + this.BATCH_FEE,
        desc: `Van ya KenteXa inakuja ${matchedZone.name} kila siku — TZS ${this.BATCH_FEE.toLocaleString()} tu`,
        batchZone: matchedZone.name,
        cutoffTime: '7:00 AM',
        estimatedArrival: etaStr,
      });
    }

    return {
      isSameCity: true,
      batchZone: matchedZone?.name || null,
      methods,
    };
  }

  // ── Boda fee suggestions for seller product listing ──────────────────────
  // Returns KenteXa suggested boda fees per zone
  // Seller picks one of these when listing — shown to Dar buyers at checkout
  async getBodaFeeSuggestions(sellerAddress?: string) {
    const sellerRank = this.detectZoneRank(sellerAddress || null);
    const sellerLabel = this.detectZoneLabel(sellerAddress || null);

    const zones = [
      {
        rank: 1,
        label: 'Kariakoo / Ilala / Upanga',
        note: 'Eneo la kati — dakika 5-15',
      },
      {
        rank: 2,
        label: 'Kinondoni / Sinza / Temeke',
        note: 'Kati — dakika 15-30',
      },
      {
        rank: 3,
        label: 'Ubungo / Kimara / Mbagala',
        note: 'Umbali wa kati — dakika 30-50',
      },
      {
        rank: 4,
        label: 'Bunju / Tegeta / Boko',
        note: 'Mbali sana — dakika 60+',
      },
    ];

    const matrix = await this.loadFeeMatrix();
    const suggestions = zones
      .map((z) => {
        const key = `${sellerRank}-${z.rank}`;
        const fee = matrix[key] || 10000;
        return {
          zone: z.label,
          note: z.note,
          maxFee: fee,
          minFee: Math.max(1500, fee - 2000),
          isSameZone: sellerRank === z.rank,
        };
      })
      .sort((a, b) => a.maxFee - b.maxFee);

    const maxFee = Math.max(...suggestions.map((s) => s.maxFee));

    return {
      suggestions,
      sellerZone: sellerLabel,
      recommended: maxFee,
      note: `Unatuma kutoka ${sellerLabel}. Chagua bei ya eneo la mbali zaidi la mnunuzi wako — mfumo utatumia bei halisi kulingana na anwani ya mnunuzi wakati wa kununua.`,
    };
  }

  // ── Cron: auto-mark cutoff passed (runs every 15 min) ──────────────────────
  @Cron(CronExpression.EVERY_10_MINUTES)
  async autoCutoffCheck() {
    try {
      const now = new Date();
      const result = await this.batchRepo
        .createQueryBuilder()
        .update(DailyBatch)
        .set({ status: BatchStatus.CUTOFF })
        .where('status = :status', { status: BatchStatus.OPEN })
        .andWhere('cutoffTime < :now', { now })
        .execute();

      if (result.affected && result.affected > 0) {
        this.logger.log(
          `Auto-marked ${result.affected} batch(es) as cutoff passed`,
        );
      }
    } catch (err) {
      this.logger.error(`autoCutoffCheck failed: ${err.message}`);
    }
  }
  // ── Stale escrow alert — runs every morning at 8am ───────────────────────
  // If any paid order has been holding escrow for more than 7 days and hasn't
  // been confirmed/released, flag it. Operator gets notified by console log
  // (and email if notificationsService supports it).
  // This protects against forgotten payouts which erode seller trust.
  @Cron('0 8 * * *') // 8am every day
  async checkStaleEscrow() {
    try {
      const STALE_DAYS = 7;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - STALE_DAYS);

      const staleOrders = await this.orderRepo
        .createQueryBuilder('o')
        .leftJoinAndSelect('o.seller', 'seller')
        .where('o.paymentStatus = :paid', { paid: 'paid' })
        .andWhere('o.status NOT IN (:...done)', {
          done: ['confirmed', 'cancelled', 'refunded', 'delivered'],
        })
        .andWhere("o.source != 'offline'") // offline orders never hold escrow
        .andWhere('o.updatedAt < :cutoff', { cutoff })
        .getMany();

      if (staleOrders.length === 0) return;

      const totalStaleAmount = staleOrders.reduce(
        (s, o) => s + Number(o.totalAmount || 0),
        0,
      );

      // Log prominently — visible in PM2/NestJS logs
      console.warn(
        `
⚠️  KENTEXA STALE ESCROW ALERT ⚠️
` +
          `${staleOrders.length} orders holding TZS ${totalStaleAmount.toLocaleString()} for 7+ days.
` +
          `Order IDs: ${staleOrders.map((o) => `#${o.id}`).join(', ')}
` +
          `ACTION REQUIRED: Review and release via Admin → Payouts → Pending
`,
      );

      // Email the admin (uses the first seller's email as proxy for now)
      // Replace with a dedicated admin notification when mail service supports it
      try {
        await this.notificationsService.orderPlaced(
          {
            email: process.env.ADMIN_EMAIL || 'thekeneddelly@gmail.com',
            name: 'KenteXa Admin',
          },
          staleOrders[0].id,
          `STALE ESCROW ALERT: ${staleOrders.length} orders (TZS ${totalStaleAmount.toLocaleString()}) need release`,
          totalStaleAmount,
        );
      } catch (e) {
        console.error('Stale escrow admin alert failed:', e.message);
      }
    } catch (err) {
      console.error('Stale escrow check failed:', err.message);
    }
  }

  // ── Helpers for delivery method detection ──────────────────────────────────

  private guessCityFromAddress(address: string): string | null {
    const lower = (address || '').toLowerCase();
    const CITIES = [
      'dar es salaam',
      'mwanza',
      'arusha',
      'moshi',
      'dodoma',
      'mbeya',
      'tanga',
      'morogoro',
      'kigoma',
      'tabora',
      'songea',
      'iringa',
      'zanzibar',
      'lindi',
      'mtwara',
      'shinyanga',
      'singida',
      'musoma',
      'bukoba',
      'sumbawanga',
      'babati',
      'kibaha',
      'njombe',
      'kasulu',
      'mpanda',
      'masasi',
      'korogwe',
      'geita',
      'bariadi',
      'chato',
      'sengerema',
      'mbinga',
    ];
    for (const city of CITIES) {
      if (lower.includes(city))
        return city
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ');
    }
    return null;
  }

  private calcExpectedArrival(estimatedDays: number): string {
    const date = new Date();
    date.setDate(date.getDate() + estimatedDays);
    // Skip weekends for business days
    while (date.getDay() === 0 || date.getDay() === 6) {
      date.setDate(date.getDate() + 1);
    }
    return date.toISOString().split('T')[0];
  }

  // ── Auto-release escrow — runs every morning at 8am ───────────────────────
  // Orders marked delivered where autoReleaseAt has passed and buyer never
  // confirmed — escrow released automatically to protect seller.
  // Local orders: 3 days. Intercity orders: 5 days.
  @Cron('0 8 * * *')
  async autoReleaseEscrow() {
    try {
      const now = new Date();

      const overdueOrders = await this.orderRepo
        .createQueryBuilder('o')
        .leftJoinAndSelect('o.seller', 'seller')
        .leftJoinAndSelect('o.buyer', 'buyer')
        .where('o.status = :delivered', { delivered: 'delivered' })
        .andWhere('o.paymentStatus = :paid', { paid: 'paid' })
        .andWhere('o.escrowStatus = :holding', { holding: 'holding' })
        .andWhere("o.source != 'offline'") // offline orders never hold escrow
        .andWhere("o.source != 'offline_intercity'") // same
        .andWhere('o.autoReleaseAt IS NOT NULL')
        .andWhere('o.autoReleaseAt < :now', { now })
        .getMany();

      if (overdueOrders.length === 0) return;

      console.log(
        `[Auto-Release] Processing ${overdueOrders.length} overdue orders...`,
      );

      for (const order of overdueOrders) {
        try {
          await this.orderRepo.update(order.id, {
            status: 'completed',
            escrowStatus: 'released',
            payoutStatus: 'released',
            completedAt: now,
            fundsReleasedAt: now,
            autoConfirmAt: now, // marks as auto-released, not buyer-confirmed
          } as any);

          // Notify both parties via notifications service
          await this.notificationsService
            .orderCompleted(
              {
                email: order.seller?.email,
                phone: order.seller?.phone,
                name: order.seller?.name || 'Muuzaji',
              },
              {
                email: order.buyer?.email,
                phone: order.buyer?.phone,
                name: order.buyer?.name || 'Mteja',
              },
              order.id,
              Number(order.sellerAmount || 0),
            )
            .catch(() => {});

          console.log(
            `[Auto-Release] Order #${order.id} released to seller ${order.seller?.name}`,
          );
        } catch (err) {
          console.error(
            `[Auto-Release] Failed for order #${order.id}:`,
            err.message,
          );
        }
      }

      console.log(
        `[Auto-Release] Done. Released ${overdueOrders.length} orders.`,
      );
    } catch (err) {
      console.error('[Auto-Release] Cron failed:', err.message);
    }
  }
}
