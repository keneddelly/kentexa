import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { normalizeTzPhone } from '../common/utils/phone.util';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { RoleContext } from '../role-context/role-context.types';
import { linkIntakeShipment } from '../shipments/intake-shipment';
import { projectShipment } from '../shipments/shipment-projection';
import { customerParcelNumber, customerTrackRef } from '../super-agents/customer-parcel-number';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

/**
 * "Omba bei" (owner 2026-10-26): ask for prices instead of a fixed price.
 *
 *   kind 'vehicle' - hire a whole vehicle (Kirikuu, Canter, Fuso, container truck, bus).
 *                    Transporters with that kind of vehicle reply. An office that owns
 *                    vehicles replies through its transport profile.
 *   kind 'goods'   - send large goods or a container. Offices in the sender's town that
 *                    ticked that goods type ("Bei zangu") reply.
 *
 * Anyone can ask: a customer, or an office (asking as the office). The requester sees
 * the prices side by side and accepts one; then both sides see each other's phone.
 * KenteXa holds no money: the requester pays the one they chose, directly.
 */
export const VEHICLE_TYPES = ['kirikuu', 'canter', 'fuso', 'container_truck', 'bus'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];
/** Which transporter / vehicle kinds (ProviderType) can do each requested vehicle. */
export const VEHICLE_PROVIDER_TYPES: Record<VehicleType, string[]> = {
  kirikuu: ['van', 'truck'],
  canter: ['truck'],
  fuso: ['truck'],
  container_truck: ['truck'],
  bus: ['bus'],
};

export const GOODS_TYPES = ['parcel', 'large', 'container'] as const;
export type GoodsType = (typeof GOODS_TYPES)[number];
/** Goods asked by quotation (small parcels are priced by the engine directly). */
export const QUOTE_GOODS_TYPES: GoodsType[] = ['large', 'container'];

export const QUOTE_MESSAGES = {
  notReady: 'Huduma ya kuomba bei bado haijawashwa. Jaribu tena baadaye.',
  badKind: 'Chagua: gari zima au mzigo mkubwa.',
  badVehicle: 'Chagua aina ya gari.',
  badGoods: 'Chagua: mzigo mkubwa au kontena.',
  badPlace: 'Andika unapotoka na unapokwenda (mji).',
  badDescription: 'Eleza mzigo wako kwa ufupi.',
  badPhone: 'Weka namba sahihi ya simu (mf. 0712345678).',
  badPrice: 'Weka bei sahihi (TZS).',
  notFound: 'Ombi hili halipatikani.',
  notOpen: 'Ombi hili limeshafungwa.',
  notYours: 'Ombi hili si lako.',
  notResponder: 'Ingia kama ofisi au msafirishaji ili kutoa bei.',
  cannotAnswer: 'Huwezi kutoa bei kwa ombi hili.',
  ownRequest: 'Huwezi kutoa bei kwa ombi lako mwenyewe.',
} as const;

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const tz = (v: unknown) => (typeof v === 'string' && v.trim() ? normalizeTzPhone(v) : '');
const sameText = (a: unknown, b: unknown) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

/** The office or transporter answering, worked out from the active role. */
export interface Responder { type: 'office' | 'transport'; id: number; name: string; phone: string | null; city: string | null; goodsTypes: string[]; providerTypes: string[] }

@Injectable()
export class QuoteRequestsService {
  private tablesReady = false;
  private checkedAt = 0;

  constructor(
    private readonly db: DataSource,
    @Optional() private readonly notif?: InAppNotificationService,
  ) {}

  /** The tables exist once migration 1793200000000 ran. */
  async isReady(): Promise<boolean> {
    if (!this.tablesReady && Date.now() - this.checkedAt > 60_000) {
      this.checkedAt = Date.now();
      try {
        const [row] = await this.db.query(`SELECT to_regclass('public.quote_offer') IS NOT NULL AS ok`);
        this.tablesReady = Boolean(row?.ok);
      } catch { this.tablesReady = false; }
    }
    return this.tablesReady;
  }

  private async mustBeReady() {
    if (!(await this.isReady())) throw new BadRequestException(QUOTE_MESSAGES.notReady);
  }

  // ── Office goods types ("Bei zangu") ──────────────────────────────────────

  /** NULL (never set) = small parcels only, what every office does today. */
  static readGoodsTypes(raw: unknown): GoodsType[] {
    const list = Array.isArray(raw) ? raw : null;
    if (!list) return ['parcel'];
    return GOODS_TYPES.filter((g) => list.includes(g));
  }

  private async officeOf(userId: number, roleContext?: RoleContext) {
    if (!roleContext || roleContext.roleType !== AccountRoleType.SUPER_AGENT || roleContext.userId !== userId) return null;
    const [row] = await this.db.query(
      `SELECT id, "businessName", phone, city, "goodsTypes" FROM public.super_agent
        WHERE id = $1 AND "userId" = $2 AND status::text = 'active'`, [roleContext.profileId, userId]);
    return row || null;
  }

  async getGoodsTypes(userId: number, roleContext?: RoleContext) {
    await this.mustBeReady();
    const office = await this.officeOf(userId, roleContext);
    if (!office) throw new ForbiddenException(QUOTE_MESSAGES.notResponder);
    return { goodsTypes: QuoteRequestsService.readGoodsTypes(office.goodsTypes) };
  }

  async setGoodsTypes(userId: number, roleContext: RoleContext | undefined, body: { goodsTypes?: unknown }) {
    await this.mustBeReady();
    const office = await this.officeOf(userId, roleContext);
    if (!office) throw new ForbiddenException(QUOTE_MESSAGES.notResponder);
    const list = Array.isArray(body?.goodsTypes) ? GOODS_TYPES.filter((g) => (body.goodsTypes as unknown[]).includes(g)) : [];
    if (!list.length) throw new BadRequestException('Chagua angalau aina moja ya mzigo.');
    await this.db.query(`UPDATE public.super_agent SET "goodsTypes" = $2::jsonb WHERE id = $1`, [office.id, JSON.stringify(list)]);
    return { goodsTypes: list };
  }

  // ── Asking ────────────────────────────────────────────────────────────────

  async create(userId: number, roleContext: RoleContext | undefined, body: any) {
    await this.mustBeReady();
    const kind = body?.kind === 'vehicle' || body?.kind === 'goods' ? body.kind : null;
    if (!kind) throw new BadRequestException(QUOTE_MESSAGES.badKind);
    const vehicleType = kind === 'vehicle' ? (VEHICLE_TYPES as readonly string[]).includes(body?.vehicleType) ? body.vehicleType : null : null;
    if (kind === 'vehicle' && !vehicleType) throw new BadRequestException(QUOTE_MESSAGES.badVehicle);
    const goodsType = kind === 'goods' ? (QUOTE_GOODS_TYPES as string[]).includes(body?.goodsType) ? body.goodsType : null : null;
    if (kind === 'goods' && !goodsType) throw new BadRequestException(QUOTE_MESSAGES.badGoods);
    const fromCity = clean(body?.fromCity, 100); const toCity = clean(body?.toCity, 100);
    if (!fromCity || !toCity) throw new BadRequestException(QUOTE_MESSAGES.badPlace);
    const fromText = clean(body?.fromText, 200) || fromCity;
    const toText = clean(body?.toText, 200) || toCity;
    const description = clean(body?.description, 1000);
    if (description.length < 3) throw new BadRequestException(QUOTE_MESSAGES.badDescription);
    const phone = tz(body?.phone);
    if (!/^255\d{9}$/.test(phone)) throw new BadRequestException(QUOTE_MESSAGES.badPhone);
    const weight = Number(body?.weightKg); const weightKg = Number.isFinite(weight) && weight > 0 ? Math.round(weight * 100) / 100 : null;
    const date = typeof body?.travelDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.travelDate) ? body.travelDate : null;
    const office = await this.officeOf(userId, roleContext);

    const [row] = await this.db.query(
      `INSERT INTO public.quote_request
         (kind, "requesterUserId", "requesterOfficeId", "fromText", "fromCity", "toText", "toCity", "travelDate",
          "vehicleType", "goodsType", description, "weightKg", phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      [kind, userId, office?.id ?? null, fromText, fromCity, toText, toCity, date, vehicleType, goodsType, description, weightKg, phone]);
    const id = Number(row.id);
    this.notifyResponders({ id, kind, vehicleType, goodsType, fromCity, toCity, requesterUserId: userId }).catch(() => {});
    return { id, status: 'open' };
  }

  /** Tell the transporters / offices who can answer (in-app only: no KenteXa SMS spent). */
  private async notifyResponders(r: { id: number; kind: string; vehicleType: string | null; goodsType: string | null; fromCity: string; toCity: string; requesterUserId: number }) {
    if (!this.notif) return;
    const users = await this.responderUsersFor(r);
    const what = r.kind === 'vehicle' ? `gari zima (${r.vehicleType})` : r.goodsType === 'container' ? 'kontena' : 'mzigo mkubwa';
    for (const u of users.slice(0, 100)) {
      if (u === r.requesterUserId) continue;
      this.notif.notify({ userId: u, type: 'system', title: 'Ombi la bei', icon: '📝',
        body: `Mteja anaomba bei: ${what}, ${r.fromCity} → ${r.toCity}. Toa bei yako.`, actionPage: 'QuoteInbox' }).catch(() => {});
    }
  }

  private async responderUsersFor(r: { kind: string; vehicleType: string | null; goodsType: string | null; fromCity: string }): Promise<number[]> {
    if (r.kind === 'vehicle') {
      const types = VEHICLE_PROVIDER_TYPES[r.vehicleType as VehicleType] || [];
      const rows: any[] = await this.db.query(
        `SELECT DISTINCT tp."userId" FROM public.transport_provider tp
          WHERE tp."userId" IS NOT NULL AND tp.status::text IN ('verified', 'active')
            AND (tp.type::text = ANY($1::text[]) OR EXISTS (SELECT 1 FROM public.vehicle v
                 WHERE v."providerId" = tp.id AND v."isActive" = true AND v.type::text = ANY($1::text[])))`, [types]);
      return rows.map((x) => Number(x.userId));
    }
    const rows: any[] = await this.db.query(
      `SELECT DISTINCT sa."userId" FROM public.super_agent sa
        WHERE sa.status::text = 'active' AND COALESCE(sa."isTrainingOffice", false) = false
          AND lower(trim(sa.city)) = lower(trim($1)) AND COALESCE(sa."goodsTypes", '[]'::jsonb) ? $2`, [r.fromCity, r.goodsType]);
    return rows.map((x) => Number(x.userId));
  }

  /** My requests with the prices I got, best first; phone shown only for the one I accepted. */
  async mine(userId: number) {
    await this.mustBeReady();
    const requests: any[] = await this.db.query(
      `SELECT * FROM public.quote_request WHERE "requesterUserId" = $1 ORDER BY "createdAt" DESC LIMIT 50`, [userId]);
    if (!requests.length) return [];
    const offers: any[] = await this.db.query(
      `SELECT o.*, COALESCE(sa."businessName", tp.name) AS "responderName",
              COALESCE(sa.phone, tp."contactPhone", tp."whatsappPhone") AS "responderPhone"
         FROM public.quote_offer o
         LEFT JOIN public.super_agent sa ON o."responderType" = 'office' AND sa.id = o."responderId"
         LEFT JOIN public.transport_provider tp ON o."responderType" = 'transport' AND tp.id = o."responderId"
        WHERE o."requestId" = ANY($1::int[]) ORDER BY o.price ASC`, [requests.map((r) => r.id)]);
    const trips = await this.tripsFor(requests.filter((r) => r.status === 'accepted').map((r) => Number(r.id)));
    return requests.map((r) => ({
      ...this.publicRequest(r),
      trip: trips.get(Number(r.id)) ?? null,
      offers: offers.filter((o) => Number(o.requestId) === Number(r.id)).map((o) => ({
        id: Number(o.id), responderType: o.responderType, responderName: o.responderName || '—',
        price: Number(o.price), note: o.note || null, status: o.status,
        phone: o.status === 'accepted' ? o.responderPhone || null : null,
      })),
    }));
  }

  async cancel(userId: number, id: number) {
    await this.mustBeReady();
    const r = await this.requestOf(id);
    if (Number(r.requesterUserId) !== userId) throw new ForbiddenException(QUOTE_MESSAGES.notYours);
    if (r.status !== 'open') throw new BadRequestException(QUOTE_MESSAGES.notOpen);
    await this.db.query(`UPDATE public.quote_request SET status = 'cancelled', "updatedAt" = now() WHERE id = $1`, [id]);
    return { id, status: 'cancelled' };
  }

  async accept(userId: number, id: number, offerId: number) {
    await this.mustBeReady();
    return this.db.transaction(async (m) => {
      const [r] = await m.query(`SELECT * FROM public.quote_request WHERE id = $1 FOR UPDATE`, [id]);
      if (!r) throw new NotFoundException(QUOTE_MESSAGES.notFound);
      if (Number(r.requesterUserId) !== userId) throw new ForbiddenException(QUOTE_MESSAGES.notYours);
      if (r.status !== 'open') throw new BadRequestException(QUOTE_MESSAGES.notOpen);
      const [o] = await m.query(`SELECT * FROM public.quote_offer WHERE id = $1 AND "requestId" = $2`, [offerId, id]);
      if (!o) throw new NotFoundException(QUOTE_MESSAGES.notFound);
      await m.query(`UPDATE public.quote_offer SET status = CASE WHEN id = $2 THEN 'accepted' ELSE 'declined' END, "updatedAt" = now()
                      WHERE "requestId" = $1`, [id, offerId]);
      await m.query(`UPDATE public.quote_request SET status = 'accepted', "acceptedOfferId" = $2, "updatedAt" = now() WHERE id = $1`, [id, offerId]);
      const waybill = await this.openTripWaybill(m, r, o);
      this.notif?.notify({ userId: Number(o.responderUserId), type: 'system', title: 'Bei yako imekubaliwa', icon: '✅',
        body: `Mteja amekubali bei yako TZS ${Number(o.price).toLocaleString('en-US')} (${r.fromCity} → ${r.toCity}). Mpigie: ${r.phone}`
          + (waybill ? ` · Namba ya mzigo: ${waybill.number}` : ''),
        actionPage: 'QuoteInbox' }).catch(() => {});
      return { id, status: 'accepted', offerId, waybill: waybill?.number ?? null };
    });
  }

  // ── Answering ─────────────────────────────────────────────────────────────

  /** The office or transporter the caller is acting as, or null. */
  async responderOf(userId: number, roleContext?: RoleContext): Promise<Responder | null> {
    if (!roleContext || roleContext.userId !== userId) return null;
    if (roleContext.roleType === AccountRoleType.SUPER_AGENT) {
      const o = await this.officeOf(userId, roleContext);
      return o ? { type: 'office', id: Number(o.id), name: o.businessName, phone: o.phone ?? null, city: o.city ?? null,
        goodsTypes: QuoteRequestsService.readGoodsTypes(o.goodsTypes), providerTypes: [] } : null;
    }
    if (roleContext.roleType === AccountRoleType.TRANSPORT_PROVIDER) {
      const rows: any[] = await this.db.query(
        `SELECT tp.id, tp.name, COALESCE(tp."contactPhone", tp."whatsappPhone") AS phone, tp.type::text AS type,
                ARRAY(SELECT DISTINCT v.type::text FROM public.vehicle v WHERE v."providerId" = tp.id AND v."isActive" = true) AS vtypes
           FROM public.transport_provider tp
          WHERE tp."userId" = $1 AND tp.status::text IN ('verified', 'active') ORDER BY tp.id`, [userId]);
      if (rows.length !== 1) return null;
      const t = rows[0];
      return { type: 'transport', id: Number(t.id), name: t.name, phone: t.phone ?? null, city: null, goodsTypes: [],
        providerTypes: [...new Set([t.type, ...(t.vtypes || [])].filter(Boolean))] };
    }
    return null;
  }

  static canAnswer(responder: Responder, r: any): boolean {
    if (r.kind === 'vehicle') {
      if (responder.type !== 'transport') return false;
      const types = VEHICLE_PROVIDER_TYPES[r.vehicleType as VehicleType] || [];
      return responder.providerTypes.some((t) => types.includes(t));
    }
    return responder.type === 'office' && responder.goodsTypes.includes(r.goodsType) && sameText(responder.city, r.fromCity);
  }

  /** Open requests this office / transporter can answer, with its own price if it gave one. */
  async inbox(userId: number, roleContext?: RoleContext) {
    await this.mustBeReady();
    const me = await this.responderOf(userId, roleContext);
    if (!me) throw new ForbiddenException(QUOTE_MESSAGES.notResponder);
    const rows: any[] = await this.db.query(
      `SELECT r.*, o.id AS "myOfferId", o.price AS "myPrice", o.status AS "myStatus"
         FROM public.quote_request r
         LEFT JOIN public.quote_offer o ON o."requestId" = r.id AND o."responderType" = $1 AND o."responderId" = $2
        WHERE r.kind = $3 AND r."requesterUserId" <> $4
          AND (r.status = 'open' OR o.id IS NOT NULL)
          AND r."createdAt" > now() - interval '30 days'
        ORDER BY r."createdAt" DESC LIMIT 100`,
      [me.type, me.id, me.type === 'transport' ? 'vehicle' : 'goods', userId]);
    const trips = await this.tripsFor(rows.filter((r) => r.myStatus === 'accepted').map((r) => Number(r.id)));
    return {
      responder: { type: me.type, name: me.name },
      requests: rows.filter((r) => r.myOfferId || QuoteRequestsService.canAnswer(me, r)).map((r) => ({
        ...this.publicRequest(r),
        trip: r.myStatus === 'accepted' ? trips.get(Number(r.id)) ?? null : null,
        // The requester's phone only once they accepted this responder's price.
        phone: r.myStatus === 'accepted' ? r.phone : null,
        myOffer: r.myOfferId ? { id: Number(r.myOfferId), price: Number(r.myPrice), status: r.myStatus } : null,
      })),
    };
  }

  async offer(userId: number, roleContext: RoleContext | undefined, id: number, body: { price?: unknown; note?: unknown }) {
    await this.mustBeReady();
    const me = await this.responderOf(userId, roleContext);
    if (!me) throw new ForbiddenException(QUOTE_MESSAGES.notResponder);
    const price = Math.round(Number(body?.price));
    if (!Number.isFinite(price) || price <= 0 || price > 1_000_000_000) throw new BadRequestException(QUOTE_MESSAGES.badPrice);
    const r = await this.requestOf(id);
    if (Number(r.requesterUserId) === userId) throw new BadRequestException(QUOTE_MESSAGES.ownRequest);
    if (r.status !== 'open') throw new BadRequestException(QUOTE_MESSAGES.notOpen);
    if (!QuoteRequestsService.canAnswer(me, r)) throw new ForbiddenException(QUOTE_MESSAGES.cannotAnswer);
    const note = clean(body?.note, 300) || null;
    const [row] = await this.db.query(
      `INSERT INTO public.quote_offer ("requestId", "responderType", "responderId", "responderUserId", price, note)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT ("requestId", "responderType", "responderId")
       DO UPDATE SET price = EXCLUDED.price, note = EXCLUDED.note, "updatedAt" = now()
       RETURNING id`, [id, me.type, me.id, userId, price, note]);
    this.notif?.notify({ userId: Number(r.requesterUserId), type: 'system', title: 'Umepata bei', icon: '💬',
      body: `${me.name}: TZS ${price.toLocaleString('en-US')} (${r.fromCity} → ${r.toCity}).`, actionPage: 'MyQuoteRequests' }).catch(() => {});
    return { id: Number(row.id), price, status: 'offered' };
  }

  // ── The trip's waybill: the same one every parcel on KenteXa gets ─────────

  static tripTrackingNumber(requestId: number) { return `KTX-QR-${requestId}`; }

  /**
   * Accepted price -> one Parcel + its Shipment through the shared intake
   * (linkIntakeShipment): the same waybill number, tracking page and status
   * projection as any parcel, whichever way it came in. Office (large goods): the
   * office is the parcel's origin office. Inside the accept transaction.
   */
  private async openTripWaybill(m: any, r: any, o: any): Promise<{ parcelId: number; number: string } | null> {
    const tracking = QuoteRequestsService.tripTrackingNumber(Number(r.id));
    const [existing] = await m.query(`SELECT id, "trackingNumber", "waybillNumber", "createdAt" FROM public.parcel WHERE "trackingNumber" = $1`, [tracking]);
    if (existing) return { parcelId: Number(existing.id), number: customerParcelNumber(existing) || tracking };
    const [who] = await m.query(`SELECT name FROM public."user" WHERE id = $1`, [r.requesterUserId]);
    const [resp] = await m.query(
      `SELECT COALESCE(sa."businessName", tp.name) AS name, COALESCE(sa.phone, tp."contactPhone", tp."whatsappPhone") AS phone
         FROM (SELECT 1) x
         LEFT JOIN public.super_agent sa ON $1 = 'office' AND sa.id = $2
         LEFT JOIN public.transport_provider tp ON $1 = 'transport' AND tp.id = $2`, [o.responderType, o.responderId]);
    const name = String(who?.name || 'Mteja').slice(0, 100);
    const what = r.kind === 'vehicle' ? `Gari zima (${r.vehicleType})` : r.goodsType === 'container' ? 'Kontena' : 'Mzigo mkubwa';
    const [p] = await m.query(
      `INSERT INTO public.parcel ("trackingNumber", "senderName", "senderPhone", "recipientName", "buyerPhone",
          "originCity", "destinationCity", "weightKg", description, "estimatedShippingFee", "superAgentId", source, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'quote_request','pending')
       RETURNING id, "trackingNumber", "waybillNumber", "createdAt"`,
      [tracking, name, r.phone, name, r.phone, r.fromCity, r.toCity, r.weightKg ?? 0,
       `${what}: ${String(r.description).slice(0, 400)}`, Number(o.price),
       o.responderType === 'office' ? Number(o.responderId) : null]);
    await m.query(
      `INSERT INTO public.parcel_tracking ("parcelId", status, city, note, "updatedBy", "handlerPhone", "handlerType")
       VALUES ($1, 'pending', $2, $3, $4, $5, $6)`,
      [p.id, r.fromCity, `Bei imekubaliwa: TZS ${Number(o.price).toLocaleString('en-US')} (${r.fromCity} → ${r.toCity})`,
       resp?.name || null, resp?.phone || null, o.responderType === 'office' ? 'super_agent' : 'transport']);
    await linkIntakeShipment(m, { parcelId: Number(p.id), channel: 'self_service', actorUserId: Number(r.requesterUserId) });
    return { parcelId: Number(p.id), number: customerParcelNumber(p) || tracking };
  }

  /**
   * The chosen office / transporter moves the trip on: on the way, then arrived.
   * Written to the same parcel tracking every KenteXa parcel uses.
   */
  async tripStep(userId: number, roleContext: RoleContext | undefined, id: number, step: unknown) {
    await this.mustBeReady();
    const next = step === 'in_transit' ? 'in_transit' : step === 'delivered' ? 'delivered' : null;
    if (!next) throw new BadRequestException('Hatua si sahihi.');
    const me = await this.responderOf(userId, roleContext);
    if (!me) throw new ForbiddenException(QUOTE_MESSAGES.notResponder);
    return this.db.transaction(async (m) => {
      const [r] = await m.query(`SELECT * FROM public.quote_request WHERE id = $1`, [id]);
      if (!r) throw new NotFoundException(QUOTE_MESSAGES.notFound);
      const [o] = r.acceptedOfferId ? await m.query(`SELECT * FROM public.quote_offer WHERE id = $1`, [r.acceptedOfferId]) : [];
      if (r.status !== 'accepted' || !o || o.responderType !== me.type || Number(o.responderId) !== me.id) {
        throw new ForbiddenException('Safari hii si yako.');
      }
      const [p] = await m.query(`SELECT id, status::text AS status, "shipmentId" FROM public.parcel WHERE "trackingNumber" = $1 FOR UPDATE`,
        [QuoteRequestsService.tripTrackingNumber(id)]);
      if (!p) throw new NotFoundException('Namba ya mzigo haipatikani.');
      if (p.status === 'delivered') throw new BadRequestException('Mzigo umeshafika.');
      if (next === 'in_transit' && p.status !== 'pending') throw new BadRequestException('Mzigo uko njiani tayari.');
      await m.query(`UPDATE public.parcel SET status = $2 WHERE id = $1`, [p.id, next]);
      const note = next === 'in_transit' ? `Mzigo uko njiani: ${r.fromCity} → ${r.toCity}` : `Mzigo umefika ${r.toCity}`;
      await m.query(
        `INSERT INTO public.parcel_tracking ("parcelId", status, city, note, "updatedBy", "handlerPhone", "handlerType")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [p.id, next, next === 'delivered' ? r.toCity : r.fromCity, note, me.name, me.phone, me.type === 'office' ? 'super_agent' : 'transport']);
      if (p.shipmentId) await projectShipment(m, Number(p.shipmentId), new Date());
      this.notif?.notify({ userId: Number(r.requesterUserId), type: 'system', title: next === 'delivered' ? 'Mzigo umefika' : 'Mzigo uko njiani',
        icon: next === 'delivered' ? '✅' : '🚚', body: `${me.name}: ${note}.`, actionPage: 'MyQuoteRequests' }).catch(() => {});
      return { id, step: next };
    });
  }

  /** Waybill number, link ref and status of each accepted trip, by request id. */
  private async tripsFor(ids: number[]): Promise<Map<number, { waybill: string; trackRef: string; status: string }>> {
    const out = new Map<number, { waybill: string; trackRef: string; status: string }>();
    if (!ids.length) return out;
    const rows: any[] = await this.db.query(
      `SELECT "trackingNumber", "waybillNumber", "createdAt", status::text AS status FROM public.parcel WHERE "trackingNumber" = ANY($1::text[])`,
      [ids.map((i) => QuoteRequestsService.tripTrackingNumber(i))]).catch(() => []);
    for (const p of rows) {
      const id = Number(String(p.trackingNumber).replace('KTX-QR-', ''));
      out.set(id, { waybill: customerParcelNumber(p) || p.trackingNumber, trackRef: customerTrackRef(p) || p.trackingNumber, status: p.status });
    }
    return out;
  }

  private async requestOf(id: number) {
    const [r] = await this.db.query(`SELECT * FROM public.quote_request WHERE id = $1`, [id]);
    if (!r) throw new NotFoundException(QUOTE_MESSAGES.notFound);
    return r;
  }

  private publicRequest(r: any) {
    return {
      id: Number(r.id), kind: r.kind, status: r.status, vehicleType: r.vehicleType ?? null, goodsType: r.goodsType ?? null,
      fromText: r.fromText, fromCity: r.fromCity, toText: r.toText, toCity: r.toCity,
      travelDate: r.travelDate ? String(r.travelDate instanceof Date ? r.travelDate.toISOString() : r.travelDate).slice(0, 10) : null,
      description: r.description, weightKg: r.weightKg == null ? null : Number(r.weightKg), createdAt: r.createdAt,
    };
  }
}
