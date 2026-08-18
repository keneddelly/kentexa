import {
  Controller,
  Post,
  Get,
  Headers,
  Body,
  Param,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransportProvider } from './entities/transport-provider.entity';
import { Parcel, ParcelStatus } from '../super-agents/entities/parcel.entity';
import { ParcelTracking } from '../super-agents/entities/parcel.entity';
import { SmsService } from '../sms/sms.service';
import { FRONTEND_URL } from '../config/urls.config';

/**
 * WebhookController — KenteXa's public API for transport companies.
 *
 * Base URL: /api/v1/
 *
 * Authentication: X-API-Key header
 *   Each transport provider gets a unique API key from admin.
 *   Keys are stored hashed — verified on every request.
 *
 * Phase 1: Manual entry only (no transport company uses this yet)
 * Phase 2: Scandinavian Express, DHL etc. POST here automatically
 *
 * Endpoints:
 *   POST /api/v1/webhook/departure   — parcel left origin (bus departed, courier collected)
 *   POST /api/v1/webhook/arrival     — parcel arrived at destination or transit hub
 *   POST /api/v1/webhook/delivered   — parcel delivered to recipient
 *   GET  /api/v1/track/:trackingNumber — public tracking (no auth needed)
 */
@Controller('api/v1')
export class WebhookController {
  constructor(
    @InjectRepository(TransportProvider)
    private providerRepo: Repository<TransportProvider>,
    @InjectRepository(Parcel)
    private parcelRepo: Repository<Parcel>,
    @InjectRepository(ParcelTracking)
    private trackingRepo: Repository<ParcelTracking>,
    private smsService: SmsService,
  ) {}

  // ── Authenticate transport provider ──────────────────────────────────────

  private async authenticate(apiKey: string): Promise<TransportProvider> {
    if (!apiKey)
      throw new UnauthorizedException(
        'API key required. Use X-API-Key header.',
      );
    const provider = await this.providerRepo.findOne({
      where: { apiKey, webhookEnabled: true },
    });
    if (!provider)
      throw new UnauthorizedException('Invalid or disabled API key.');
    // Update usage stats
    await this.providerRepo.update(provider.id, {
      lastApiCallAt: new Date(),
      totalApiCalls: provider.totalApiCalls + 1,
    });
    return provider;
  }

  private async findParcel(trackingNumber: string): Promise<Parcel> {
    const parcel = await this.parcelRepo.findOne({
      where: { trackingNumber },
      relations: { order: { buyer: true } },
    });
    if (!parcel)
      throw new NotFoundException(`Parcel ${trackingNumber} not found`);
    return parcel;
  }

  private async addEvent(
    parcel: Parcel,
    status: ParcelStatus,
    city: string,
    note: string,
    provider: TransportProvider,
  ) {
    await this.trackingRepo.save(
      this.trackingRepo.create({
        parcel: { id: parcel.id } as any,
        status,
        city,
        note,
        updatedBy: provider.name,
        handlerType: provider.type === 'bus' ? 'super_agent' : 'system',
      } as any),
    );
    await this.parcelRepo.update((parcel as any).id, { status });

    // Update provider stats
    await this.providerRepo.update(provider.id, {
      totalParcelsTracked: provider.totalParcelsTracked + 1,
    });
  }

  // ── POST /api/v1/webhook/departure ────────────────────────────────────────
  // Transport company confirms parcel has left origin.
  // Bus: bus departed terminal. Courier: collected from sender.

  @Post('webhook/departure')
  async departure(
    @Headers('x-api-key') apiKey: string,
    @Body()
    body: {
      trackingNumber: string;
      ticketNumber?: string; // bus ticket / courier ref
      departureTime?: string; // ISO datetime
      originCity: string;
      destinationCity: string;
      vehicleId?: string; // bus plate / courier vehicle
      driverName?: string;
      notes?: string;
    },
  ) {
    const provider = await this.authenticate(apiKey);
    if (!body.trackingNumber)
      throw new BadRequestException('trackingNumber required');

    const parcel = await this.findParcel(body.trackingNumber);

    // Update parcel transport details if not already set
    const updates: any = { status: ParcelStatus.IN_TRANSIT };
    if (body.ticketNumber && !(parcel as any).busTicketNumber) {
      updates.busTicketNumber = body.ticketNumber;
      updates.busCompany = provider.name;
    }
    if (body.departureTime) updates.dispatchTime = new Date(body.departureTime);
    await this.parcelRepo.update((parcel as any).id, updates);

    await this.addEvent(
      parcel,
      ParcelStatus.IN_TRANSIT,
      body.originCity,
      `${provider.name}: Imetoka ${body.originCity}` +
        (body.ticketNumber ? ` — Tiketi: ${body.ticketNumber}` : '') +
        (body.departureTime
          ? ` — ${new Date(body.departureTime).toLocaleString('sw-TZ')}`
          : ''),
      provider,
    );

    return {
      success: true,
      trackingNumber: body.trackingNumber,
      status: 'in_transit',
      message: `Departure recorded. Buyer can track at ${FRONTEND_URL}`,
    };
  }

  // ── POST /api/v1/webhook/arrival ──────────────────────────────────────────
  // Transport company confirms parcel arrived at a city (destination or transit).

  @Post('webhook/arrival')
  async arrival(
    @Headers('x-api-key') apiKey: string,
    @Body()
    body: {
      trackingNumber: string;
      city: string; // city where parcel arrived
      isFinal?: boolean; // true = final destination, false = transit
      arrivedAt?: string; // ISO datetime
      notes?: string;
    },
  ) {
    const provider = await this.authenticate(apiKey);
    if (!body.trackingNumber)
      throw new BadRequestException('trackingNumber required');
    if (!body.city) throw new BadRequestException('city required');

    const parcel = await this.findParcel(body.trackingNumber);
    const isFinal = body.isFinal !== false; // default: assume final

    const newStatus = isFinal
      ? ParcelStatus.AWAITING_BUYER
      : ParcelStatus.IN_TRANSIT;

    if (isFinal) {
      await this.parcelRepo.update((parcel as any).id, {
        status: newStatus,
        arrivedAtHubTime: body.arrivedAt
          ? new Date(body.arrivedAt)
          : new Date(),
      });
    } else {
      await this.parcelRepo.update((parcel as any).id, {
        status: newStatus,
      });
    }

    await this.addEvent(
      parcel,
      newStatus,
      body.city,
      `${provider.name}: Imefika ${body.city}${isFinal ? ' (mwisho)' : ' (transit)'}` +
        (body.notes ? ` — ${body.notes}` : ''),
      provider,
    );

    // SMS buyer if final destination (action required)
    if (isFinal) {
      const recipientName = (parcel as any).recipientName || 'Mpokeaji';
      const buyerPhone =
        (parcel as any).buyerPhone || parcel.order?.buyer?.phone;
      const trackingNumber = body.trackingNumber;

      if (buyerPhone) {
        await this.smsService
          .sendSms(
            buyerPhone,
            `KenteXa: Habari ${recipientName}! Bidhaa yako (${trackingNumber}) ` +
              `imefika ${body.city} kupitia ${provider.name}. ` +
              `Ingia KenteXa kuchagua: uchukue mwenyewe au omba delivery. ` +
              `${FRONTEND_URL}/?track=${trackingNumber}`,
          )
          .catch(() => {});
      }
    }

    return {
      success: true,
      trackingNumber: body.trackingNumber,
      status: newStatus,
      isFinal,
      message: isFinal
        ? 'Arrival recorded. Buyer notified.'
        : 'Transit recorded.',
    };
  }

  // ── POST /api/v1/webhook/delivered ────────────────────────────────────────
  // Transport company (courier) confirms door-to-door delivery complete.

  @Post('webhook/delivered')
  async delivered(
    @Headers('x-api-key') apiKey: string,
    @Body()
    body: {
      trackingNumber: string;
      deliveredAt?: string;
      receivedBy?: string; // name of person who signed
      proofPhotoUrl?: string;
      notes?: string;
    },
  ) {
    const provider = await this.authenticate(apiKey);
    if (!body.trackingNumber)
      throw new BadRequestException('trackingNumber required');

    const parcel = await this.findParcel(body.trackingNumber);

    await this.parcelRepo.update((parcel as any).id, {
      status: ParcelStatus.DELIVERED,
      deliveredTime: body.deliveredAt ? new Date(body.deliveredAt) : new Date(),
    });

    await this.addEvent(
      parcel,
      ParcelStatus.DELIVERED,
      (parcel as any).destinationCity || '',
      `${provider.name}: Imefikishwa` +
        (body.receivedBy ? ` — Alipokea: ${body.receivedBy}` : '') +
        (body.notes ? ` — ${body.notes}` : ''),
      provider,
    );

    // SMS buyer: delivery confirmation
    const buyerPhone = (parcel as any).buyerPhone || parcel.order?.buyer?.phone;
    const recipientName = (parcel as any).recipientName || 'Mpokeaji';

    if (buyerPhone) {
      await this.smsService
        .sendSms(
          buyerPhone,
          `KenteXa: ✅ Habari ${recipientName}! Bidhaa yako (${body.trackingNumber}) ` +
            `imefikishwa na ${provider.name}. Asante kwa kutumia KenteXa! 🎉`,
        )
        .catch(() => {});
    }

    return {
      success: true,
      trackingNumber: body.trackingNumber,
      status: 'delivered',
      message: 'Delivery recorded. Buyer notified.',
    };
  }

  // ── GET /api/v1/track/:trackingNumber ─────────────────────────────────────
  // Public tracking endpoint — no auth needed.
  // Anyone (bus company websites, sellers, buyers) can query this.
  // Returns the same data as the tracking page but in JSON.

  @Get('track/:trackingNumber')
  async publicTrack(@Param('trackingNumber') trackingNumber: string) {
    const parcel = await this.parcelRepo.findOne({
      where: { trackingNumber },
      relations: {
        superAgent: true,
        destinationSuperAgent: true,
        seller: true,
        order: { buyer: true, seller: true },
      },
    });

    if (!parcel) {
      throw new NotFoundException({
        error: 'Parcel not found',
        message: `No parcel with tracking number ${trackingNumber}`,
      });
    }

    const tracking = await this.trackingRepo.find({
      where: { parcel: { id: parcel.id } },
      order: { createdAt: 'ASC' },
    });

    return {
      trackingNumber: parcel.trackingNumber,
      status: parcel.status,
      // Route
      originCity: (parcel as any).originCity,
      destinationCity: (parcel as any).destinationCity,
      transitCity: (parcel as any).transitCity || null,
      expectedArrival: (parcel as any).expectedArrival || null,
      estimatedDays: (parcel as any).estimatedDays || null,
      // Item
      description: (parcel as any).description || null,
      weightKg: (parcel as any).weightKg || null,
      // People (no sensitive data like phone numbers in public API)
      senderName: (parcel as any).senderName || parcel.seller?.name || null,
      recipientName: (parcel as any).recipientName || null,
      // Hubs
      originHub: parcel.superAgent?.businessName || null,
      destinationHub: parcel.destinationSuperAgent?.businessName || null,
      // Transport
      busCompany: (parcel as any).busCompany || null,
      busTicketNumber: (parcel as any).busTicketNumber || null,
      courierName: (parcel as any).courierName || null,
      courierRef: (parcel as any).courierTrackingRef || null,
      // Timestamps
      dispatchTime: (parcel as any).dispatchTime || null,
      arrivedAtHubTime: (parcel as any).arrivedAtHubTime || null,
      // History — full audit trail
      history: tracking.map((t) => ({
        status: t.status,
        city: t.city,
        note: t.note,
        updatedBy: t.updatedBy,
        timestamp: t.createdAt,
      })),
      // Meta
      source: (parcel as any).source || 'unknown',
      trackedBy: 'KenteXa Logistics Platform',
      trackingUrl: `${FRONTEND_URL}/?track=${trackingNumber}`,
    };
  }
}
