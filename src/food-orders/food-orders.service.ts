import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { isDarEsSalaam } from '../super-agents/office-price';
import { OfficeBodaFeeService } from '../super-agents/office-boda-fee.service';
import { SuperAgentsService } from '../super-agents/super-agents.service';
import { LocationIntelligenceService } from '../location-intelligence/location-intelligence.service';
import { normalizeTzPhone } from '../common/utils/phone.util';
import { assertBusinessWriteTarget } from '../business/business-write-authority';
import type { RoleContext } from '../role-context/role-context.types';
import { LIPA_PROOF_REF, signedLipaProofUrl } from '../orders/lipa-proof';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';

/**
 * Hotel food ordering, part 1 (owner 2026-10-27, approved mockup "KenteXa Hoteli").
 *
 * A hotel is a Business identity. It keeps a menu (food_menu_item) and settings
 * (food_menu_settings); a customer orders to its kitchen (food_order):
 *   - eat here, at a table or a room (a QR code on the table opens the menu with the number);
 *   - pick up.
 * The customer pays the hotel directly - KenteXa holds no money:
 *   - lipa_namba: the hotel's Lipa Namba now, with a payment screenshot the hotel confirms;
 *   - pay_after:  after eating, cash or Lipa Namba to the waiter (eat here only, when the
 *                 hotel allows it);
 *   - cod:        on pickup (only when the hotel allows it: "some hotel allow COD").
 * Kitchen steps: new -> cooking (the hotel says in how many minutes) -> ready -> done;
 * or rejected (by the hotel, with a reason) / cancelled (by the customer, while new).
 * Prices always come from the menu at the moment of ordering, never from the client.
 *
 * Delivery ("Letewa", part 2): a wakala brings the food and the customer pays on delivery
 * (the food plus the delivery fee KenteXa sets from the Dar rate card, cash or the hotel's
 * Lipa Namba at the door). The hotel turns it on and sets once where the wakala collects.
 * When the kitchen accepts, a pay-on-delivery seller shipment is created through the one
 * shipment engine (createSellerShipment): nearby agents see the job, the customer gets the
 * delivery code, the wakala collects the cash. The food order is done when that delivery is.
 */
export const FOOD_MODES = ['dine_in', 'pickup', 'delivery'] as const;
export type FoodMode = (typeof FOOD_MODES)[number];
export type FoodPayment = 'lipa_namba' | 'pay_after' | 'cod';
export const FOOD_READY_MINUTES = { min: 1, max: 240 };

export const FOOD_MESSAGES = {
  notReady: 'Oda za chakula bado hazijawashwa. Jaribu tena baadaye.',
  noMenu: 'Hoteli hii bado haina menyu kwenye KenteXa.',
  closed: 'Hoteli haipokei oda kwa sasa.',
  badMode: 'Chagua kula hapa au kuchukua.',
  modeOff: 'Hoteli hii haitoi huduma hii.',
  badPlace: 'Chagua namba ya meza au chumba.',
  noItems: 'Chagua angalau chakula kimoja.',
  tooMany: 'Oda moja ina vitu vingi mno. Gawanya oda.',
  badQty: 'Idadi ya kila chakula iwe kati ya 1 na 50.',
  itemGone: 'Baadhi ya vyakula havipo leo. Angalia menyu tena.',
  badPayment: 'Chagua jinsi utakavyolipa.',
  paymentOff: 'Hoteli hii hairuhusu njia hii ya kulipa.',
  noLipa: 'Hoteli hii bado haijaweka Lipa Namba.',
  badNote: 'Maelekezo yawe mafupi (herufi 300 au chini).',
  notFound: 'Oda haikupatikana.',
  notYours: 'Huna ruhusa kwa hoteli hii.',
  badStep: 'Oda hii haiwezi kufanyiwa hivyo sasa.',
  badMinutes: 'Chagua dakika kati ya 1 na 240.',
  badReason: 'Andika sababu fupi.',
  noProof: 'Picha ya malipo haikupokelewa. Ipakie tena.',
  notLipa: 'Oda hii hailipwi kwa Lipa Namba.',
  badName: 'Andika jina la chakula (herufi 2 hadi 80).',
  badSection: 'Andika kundi la menyu, mf. Mchana (herufi 2 hadi 40).',
  badPrice: 'Bei iwe namba kubwa kuliko sifuri.',
  badLipa: 'Weka Lipa Namba sahihi (tarakimu 5 hadi 15).',
  badCount: 'Idadi ya meza iwe 0 hadi 500, na vyumba 0 hadi 2,000.',
  noDelivery: 'Hoteli hii bado haiwezi kuleta chakula.',
  badAddress: 'Andika mahali pa kukuletea (herufi 3 hadi 300).',
  badPhone: 'Weka namba sahihi ya simu ya kupokea (mf. 0712345678).',
  noFee: 'Hatuwezi kuweka bei ya kuleta chakula mahali hapa kwa sasa.',
  deliveryCod: 'Chakula kinacholetwa kinalipwa ukipokea.',
  badPickupPlace: 'Chagua mahali hoteli ilipo kwenye orodha ya maeneo.',
  pickupFirst: 'Weka kwanza mahali wakala atachukua chakula.',
} as const;

const OPEN = ['new', 'cooking', 'ready'];
const money = (v: any) => Math.round(Number(v || 0) * 100) / 100;
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max + 1) : '');
const bool = (v: unknown) => v === true || v === 'true';
export const foodOrderCode = (id: number) => `H-${String(id).padStart(4, '0')}`;

export interface FoodSettings {
  businessId: number; enabled: boolean; acceptingOrders: boolean; dineIn: boolean; pickup: boolean;
  payAfterDineIn: boolean; codPickup: boolean; tableCount: number; roomCount: number;
  openingHours: string | null; lipaNamba: string | null; lipaNambaName: string | null;
  delivery?: boolean; pickupPlace?: FoodPickupPlace | null;
}
export interface FoodPickupPlace {
  providerKey: string; providerPlaceId: string; label: string; region: string | null; district: string | null;
}

/** Which ways to pay this hotel offers for this way of serving. Delivery is paid on delivery. */
export function foodPaymentOptions(s: Pick<FoodSettings, 'payAfterDineIn' | 'codPickup'>, mode: FoodMode, hasLipa: boolean): FoodPayment[] {
  if (mode === 'delivery') return ['cod'];
  const out: FoodPayment[] = [];
  if (hasLipa) out.push('lipa_namba');
  if (mode === 'dine_in' && s.payAfterDineIn) out.push('pay_after');
  if (mode === 'pickup' && s.codPickup) out.push('cod');
  return out;
}

@Injectable()
export class FoodOrdersService {
  private ready = false;
  private checkedAt = 0;
  private deliveryCols = false;
  private deliveryCheckedAt = 0;

  constructor(
    private readonly db: DataSource,
    @Optional() private readonly notifications?: InAppNotificationService,
    @Optional() private readonly activity?: ActivityEventService,
    // Delivery reaches the shipment engine, the Dar rate card and the place resolver lazily,
    // so this module does not import (and cycle with) the logistics modules.
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {}

  private lazy<T>(token: any): T | null {
    try { return (this.moduleRef?.get(token, { strict: false }) as T) ?? null; } catch { return null; }
  }

  /** The delivery columns exist once migration 1793500000000 ran. */
  async deliveryReady(): Promise<boolean> {
    if (!(await this.isReady())) return false;
    if (!this.deliveryCols && Date.now() - this.deliveryCheckedAt > 60_000) {
      this.deliveryCheckedAt = Date.now();
      try {
        const [row] = await this.db.query(`SELECT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'food_order' AND column_name = 'shippingOrderId') AS ok`);
        this.deliveryCols = Boolean(row?.ok);
      } catch { this.deliveryCols = false; }
    }
    return this.deliveryCols;
  }

  /** The hotel's city for delivery (only Dar has a KenteXa rate card today). */
  private deliveryCity(s: FoodSettings | null): string | null {
    const p = s?.pickupPlace;
    if (!p) return null;
    const city = p.region || p.label;
    return isDarEsSalaam(city) || isDarEsSalaam(p.label) ? 'Dar es Salaam' : null;
  }

  /** Can this hotel deliver now: switched on, its pickup place set, a rate card for its city. */
  private async canDeliver(s: FoodSettings | null): Promise<boolean> {
    return !!(s?.delivery && s.pickupPlace && this.deliveryCity(s) && (await this.deliveryReady()));
  }

  /** The delivery fee KenteXa sets (Dar rate card, hotel -> address), or null when it cannot. */
  async quoteDeliveryFee(s: FoodSettings | null, address: string): Promise<number | null> {
    if (!(await this.canDeliver(s)) || !address) return null;
    const boda = this.lazy<OfficeBodaFeeService>(OfficeBodaFeeService);
    if (!boda) return null;
    const fee = await boda.feeBetween(s!.pickupPlace!.label, address).catch(() => null);
    return fee != null && Number.isFinite(Number(fee)) && Number(fee) > 0 ? Math.round(Number(fee)) : null;
  }

  /** Delivered by the wakala (the shipping order delivered or completed): the food order is done and paid. */
  private async syncDeliveries(where: string, param: number) {
    if (!(await this.deliveryReady())) return;
    await this.db.query(
      `UPDATE public.food_order f SET status = 'done', "doneAt" = COALESCE(f."doneAt", now()), "paymentStatus" = 'paid',
              "paidAt" = COALESCE(f."paidAt", now()), "updatedAt" = now()
         FROM public."order" o
        WHERE f."shippingOrderId" = o.id AND f.status IN ('cooking', 'ready')
          AND o.status::text IN ('delivered', 'completed') AND ${where}`, [param]).catch(() => undefined);
  }

  async isReady(): Promise<boolean> {
    if (!this.ready && Date.now() - this.checkedAt > 60_000) {
      this.checkedAt = Date.now();
      try {
        const [row] = await this.db.query(`SELECT to_regclass('public.food_order') IS NOT NULL AS ok`);
        this.ready = Boolean(row?.ok);
      } catch { this.ready = false; }
    }
    return this.ready;
  }

  private async mustBeReady() {
    if (!(await this.isReady())) throw new BadRequestException(FOOD_MESSAGES.notReady);
  }

  // ── The hotel identity ────────────────────────────────────────────────────

  private async hotel(businessId: number) {
    const [b] = await this.db.query(
      `SELECT b.id, b."userId" AS "ownerId", COALESCE(NULLIF(b."tradingName", ''), b."legalName") AS name,
              b.logo, b.category, b.district, b.region, b.phone, b.status::text AS status,
              cp.id AS "commerceProfileId", cp.username, cp."photoUrl", COALESCE(cp."isVerified", false) AS "isVerified"
         FROM public.business b
         LEFT JOIN public.commerce_profile cp ON cp."businessId" = b.id AND cp.type::text = 'business'
        WHERE b.id = $1
        ORDER BY cp.id LIMIT 1`, [businessId]);
    return b || null;
  }

  private async settings(businessId: number): Promise<FoodSettings | null> {
    const [s] = await this.db.query(`SELECT * FROM public.food_menu_settings WHERE "businessId" = $1`, [businessId]);
    if (!s) return null;
    const place = typeof s.pickupPlace === 'string' ? (() => { try { return JSON.parse(s.pickupPlace); } catch { return null; } })() : s.pickupPlace;
    return { ...s, tableCount: Number(s.tableCount || 0), roomCount: Number(s.roomCount || 0), delivery: !!s.delivery, pickupPlace: place || null };
  }

  /** The hotel's own Lipa Namba, else the one on the seller profile of the same Business. */
  private async lipa(businessId: number, s: FoodSettings | null): Promise<{ lipaNamba: string | null; lipaNambaName: string | null }> {
    if (s?.lipaNamba) return { lipaNamba: s.lipaNamba, lipaNambaName: s.lipaNambaName };
    const [sp] = await this.db.query(
      `SELECT "lipaNamba", "lipaNambaName" FROM public.seller_profile
        WHERE "businessId" = $1 AND "lipaNamba" IS NOT NULL ORDER BY id LIMIT 1`, [businessId]).catch(() => []);
    return { lipaNamba: sp?.lipaNamba ?? null, lipaNambaName: sp?.lipaNambaName ?? null };
  }

  /** Only the Business owner runs its kitchen and menu (writes also check the acting identity). */
  private async assertOwner(businessId: number, user: { id: number }, roleContext?: RoleContext, write = false) {
    if (write) assertBusinessWriteTarget(businessId, roleContext);
    const h = await this.hotel(businessId);
    if (!h || Number(h.ownerId) !== Number(user.id)) throw new ForbiddenException(FOOD_MESSAGES.notYours);
    return h;
  }

  // ── Public: the menu ─────────────────────────────────────────────────────

  async publicMenu(businessId: number) {
    await this.mustBeReady();
    const [h, s] = await Promise.all([this.hotel(businessId), this.settings(businessId)]);
    if (!h || h.status !== 'active' || !s || !s.enabled) throw new NotFoundException(FOOD_MESSAGES.noMenu);
    const items = await this.db.query(
      `SELECT id, section, name, description, price, "photoUrl", "availableToday"
         FROM public.food_menu_item WHERE "businessId" = $1 AND active = true
        ORDER BY "sortOrder", section, id`, [businessId]);
    const lipa = await this.lipa(businessId, s);
    const sections: { name: string; items: any[] }[] = [];
    for (const it of items) {
      let sec = sections.find((x) => x.name === it.section);
      if (!sec) { sec = { name: it.section, items: [] }; sections.push(sec); }
      sec.items.push({ id: it.id, name: it.name, description: it.description, price: money(it.price), photoUrl: it.photoUrl, availableToday: !!it.availableToday });
    }
    return {
      hotel: {
        businessId: h.id, name: h.name, logo: h.logo || h.photoUrl || null, area: [h.district, h.region].filter(Boolean).join(', ') || null,
        phone: h.phone || null, isVerified: !!h.isVerified, commerceProfileId: h.commerceProfileId, ownerId: h.ownerId, username: h.username,
      },
      settings: {
        acceptingOrders: !!s.acceptingOrders, dineIn: !!s.dineIn, pickup: !!s.pickup,
        payAfterDineIn: !!s.payAfterDineIn, codPickup: !!s.codPickup,
        tableCount: s.tableCount, roomCount: s.roomCount, openingHours: s.openingHours,
        lipaNamba: lipa.lipaNamba, lipaNambaName: lipa.lipaNambaName,
        delivery: await this.canDeliver(s), deliveryFrom: s.pickupPlace?.label ?? null,
      },
      sections,
    };
  }

  /** Public: the delivery fee to an address (null = this hotel cannot deliver there now). */
  async deliveryFee(businessId: number, address: unknown) {
    await this.mustBeReady();
    const s = await this.settings(businessId);
    const to = text(address, 300);
    return { fee: to.length >= 3 ? await this.quoteDeliveryFee(s, to) : null };
  }

  /** For a business's public page: does it have a menu to open ("Menyu" button)? */
  async menuForProfile(commerceProfileId: number) {
    if (!(await this.isReady())) return { businessId: null, hasMenu: false };
    const [row] = await this.db.query(
      `SELECT cp."businessId" FROM public.commerce_profile cp
         JOIN public.food_menu_settings s ON s."businessId" = cp."businessId" AND s.enabled = true
         JOIN public.business b ON b.id = cp."businessId" AND b.status::text = 'active'
        WHERE cp.id = $1 AND cp.type::text = 'business'
          AND EXISTS (SELECT 1 FROM public.food_menu_item i WHERE i."businessId" = cp."businessId" AND i.active = true)`, [commerceProfileId]);
    return row ? { businessId: Number(row.businessId), hasMenu: true } : { businessId: null, hasMenu: false };
  }

  // ── The customer: order, pay, follow ─────────────────────────────────────

  async placeOrder(user: { id: number }, body: Record<string, any>) {
    await this.mustBeReady();
    const businessId = Number(body?.businessId);
    if (!Number.isInteger(businessId) || businessId <= 0) throw new NotFoundException(FOOD_MESSAGES.noMenu);
    const [h, s] = await Promise.all([this.hotel(businessId), this.settings(businessId)]);
    if (!h || h.status !== 'active' || !s || !s.enabled) throw new NotFoundException(FOOD_MESSAGES.noMenu);
    if (!s.acceptingOrders) throw new BadRequestException(FOOD_MESSAGES.closed);

    const mode = body?.mode as FoodMode;
    if (!FOOD_MODES.includes(mode)) throw new BadRequestException(FOOD_MESSAGES.badMode);
    if ((mode === 'dine_in' && !s.dineIn) || (mode === 'pickup' && !s.pickup)) throw new BadRequestException(FOOD_MESSAGES.modeOff);
    let delivery: { address: string; phone: string; fee: number } | null = null;
    if (mode === 'delivery') {
      if (!(await this.canDeliver(s))) throw new BadRequestException(FOOD_MESSAGES.noDelivery);
      const address = text(body?.deliveryAddress, 300);
      if (address.length < 3 || address.length > 300) throw new BadRequestException(FOOD_MESSAGES.badAddress);
      const [me] = await this.db.query(`SELECT phone FROM public."user" WHERE id = $1`, [user.id]).catch(() => []);
      const rawPhone = typeof body?.deliveryPhone === 'string' && body.deliveryPhone.trim() ? body.deliveryPhone : me?.phone;
      const phone = typeof rawPhone === 'string' ? normalizeTzPhone(rawPhone) : '';
      if (!/^255\d{9}$/.test(phone)) throw new BadRequestException(FOOD_MESSAGES.badPhone);
      const fee = await this.quoteDeliveryFee(s, address);
      if (fee == null) throw new BadRequestException(FOOD_MESSAGES.noFee);
      if (body?.paymentMethod !== 'cod') throw new BadRequestException(FOOD_MESSAGES.deliveryCod);
      delivery = { address, phone, fee };
    }
    let placeType: 'table' | 'room' | null = null;
    let placeNumber: number | null = null;
    if (mode === 'dine_in') {
      placeType = body?.placeType === 'room' ? 'room' : body?.placeType === 'table' ? 'table' : null;
      placeNumber = Number(body?.placeNumber);
      // Rooms only at a hotel that has set its rooms; tables up to the count it set (any table up to 500 until then).
      const max = placeType === 'room' ? s.roomCount : (s.tableCount || 500);
      if (!placeType || !Number.isInteger(placeNumber) || placeNumber < 1 || placeNumber > max) {
        throw new BadRequestException(FOOD_MESSAGES.badPlace);
      }
    }

    const raw = Array.isArray(body?.items) ? body.items : [];
    if (!raw.length) throw new BadRequestException(FOOD_MESSAGES.noItems);
    if (raw.length > 30) throw new BadRequestException(FOOD_MESSAGES.tooMany);
    const want = new Map<number, number>();
    for (const r of raw) {
      const id = Number(r?.itemId);
      const qty = Number(r?.qty);
      if (!Number.isInteger(id) || id <= 0) throw new BadRequestException(FOOD_MESSAGES.itemGone);
      if (!Number.isInteger(qty) || qty < 1 || qty > 50) throw new BadRequestException(FOOD_MESSAGES.badQty);
      want.set(id, (want.get(id) || 0) + qty);
    }
    if ([...want.values()].some((q) => q > 50)) throw new BadRequestException(FOOD_MESSAGES.badQty);
    const rows = await this.db.query(
      `SELECT id, name, price FROM public.food_menu_item
        WHERE "businessId" = $1 AND active = true AND "availableToday" = true AND id = ANY($2::int[])`,
      [businessId, [...want.keys()]]);
    if (rows.length !== want.size) throw new BadRequestException(FOOD_MESSAGES.itemGone);
    const items = rows.map((r: any) => ({ itemId: r.id, name: r.name, price: money(r.price), qty: want.get(r.id)! }));
    const total = money(items.reduce((sum: number, i: any) => sum + i.price * i.qty, 0));

    const lipa = await this.lipa(businessId, s);
    const options = foodPaymentOptions(s, mode, !!lipa.lipaNamba);
    const paymentMethod = body?.paymentMethod as FoodPayment;
    if (!['lipa_namba', 'pay_after', 'cod'].includes(paymentMethod)) throw new BadRequestException(FOOD_MESSAGES.badPayment);
    if (!options.includes(paymentMethod)) {
      throw new BadRequestException(paymentMethod === 'lipa_namba' ? FOOD_MESSAGES.noLipa : FOOD_MESSAGES.paymentOff);
    }
    const note = text(body?.note, 300);
    if (note.length > 300) throw new BadRequestException(FOOD_MESSAGES.badNote);

    const [order] = delivery
      ? await this.db.query(
        `INSERT INTO public.food_order ("businessId", "customerId", mode, "placeType", "placeNumber", items, note, "totalAmount", "paymentMethod",
                "deliveryAddress", "deliveryPhone", "deliveryFee")
         VALUES ($1, $2, $3, NULL, NULL, $4::jsonb, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [businessId, user.id, mode, JSON.stringify(items), note || null, total, paymentMethod, delivery.address, delivery.phone, delivery.fee])
      : await this.db.query(
        `INSERT INTO public.food_order ("businessId", "customerId", mode, "placeType", "placeNumber", items, note, "totalAmount", "paymentMethod")
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9) RETURNING *`,
        [businessId, user.id, mode, placeType, placeNumber, JSON.stringify(items), note || null, total, paymentMethod]);

    const where = this.placeLabel(order);
    const count = items.reduce((n: number, i: any) => n + i.qty, 0);
    this.notifications?.notify({
      userId: Number(h.ownerId), type: 'food_order_new', title: `Oda mpya ya chakula · ${where}`,
      body: `${foodOrderCode(order.id)} · vitu ${count} · TZS ${total.toLocaleString('en-US')}`,
      actionPage: 'HotelKitchen', actionParam: String(order.businessId), sourceType: 'food_order', sourceId: order.id,
    }).catch(() => {});
    this.event('FOOD_ORDER_PLACED', user.id, 'customer', businessId, order.id, { mode, paymentMethod, total, count });
    return this.view(order, false);
  }

  async attachProof(user: { id: number }, id: number, body: Record<string, any>) {
    await this.mustBeReady();
    const order = await this.customerOrder(user, id);
    if (order.paymentMethod !== 'lipa_namba') throw new BadRequestException(FOOD_MESSAGES.notLipa);
    if (order.paymentStatus === 'paid' || ['rejected', 'cancelled'].includes(order.status)) throw new BadRequestException(FOOD_MESSAGES.badStep);
    const ref = typeof body?.proofRef === 'string' ? body.proofRef.trim() : '';
    if (!LIPA_PROOF_REF.test(ref)) throw new BadRequestException(FOOD_MESSAGES.noProof);
    const [saved] = await this.db.query(
      `UPDATE public.food_order SET "lipaProofUrl" = $2, "paymentStatus" = 'proof_sent', "paymentNote" = NULL, "updatedAt" = now()
        WHERE id = $1 RETURNING *`, [order.id, ref]);
    const h = await this.hotel(order.businessId);
    if (h) this.notifications?.notify({
      userId: Number(h.ownerId), type: 'food_order_payment', title: `Picha ya malipo · ${foodOrderCode(order.id)}`,
      body: `Thibitisha TZS ${money(order.totalAmount).toLocaleString('en-US')} kwenye Lipa Namba yako.`,
      actionPage: 'HotelKitchen', actionParam: String(order.businessId), sourceType: 'food_order', sourceId: order.id,
    }).catch(() => {});
    this.event('FOOD_ORDER_PAYMENT_PROOF_SENT', user.id, 'customer', order.businessId, order.id, null);
    return this.view(saved, false);
  }

  async myOrders(user: { id: number }) {
    if (!(await this.isReady())) return [];
    await this.syncDeliveries(`f."customerId" = $1`, user.id);
    const rows = await this.db.query(
      `SELECT o.*, COALESCE(NULLIF(b."tradingName", ''), b."legalName") AS "hotelName"
         FROM public.food_order o JOIN public.business b ON b.id = o."businessId"
        WHERE o."customerId" = $1 ORDER BY o."createdAt" DESC LIMIT 50`, [user.id]);
    return rows.map((r: any) => this.view(r, false));
  }

  async getOrder(user: { id: number }, id: number) {
    await this.mustBeReady();
    await this.syncDeliveries(`f.id = $1`, id);
    const [o] = await this.db.query(`SELECT * FROM public.food_order WHERE id = $1`, [id]);
    if (!o) throw new NotFoundException(FOOD_MESSAGES.notFound);
    const h = await this.hotel(o.businessId);
    const isHotel = !!h && Number(h.ownerId) === Number(user.id);
    if (!isHotel && Number(o.customerId) !== Number(user.id)) throw new NotFoundException(FOOD_MESSAGES.notFound);
    const lipa = o.paymentMethod === 'lipa_namba' ? await this.lipa(o.businessId, await this.settings(o.businessId)) : null;
    return {
      ...this.view(o, isHotel),
      hotel: h ? { businessId: h.id, name: h.name, logo: h.logo || h.photoUrl || null, phone: h.phone || null, commerceProfileId: h.commerceProfileId, ownerId: h.ownerId } : null,
      lipaNamba: lipa?.lipaNamba ?? null, lipaNambaName: lipa?.lipaNambaName ?? null,
      viewerIsHotel: isHotel,
    };
  }

  async cancel(user: { id: number }, id: number) {
    await this.mustBeReady();
    const order = await this.customerOrder(user, id);
    if (order.status !== 'new') throw new BadRequestException(FOOD_MESSAGES.badStep);
    const [saved] = await this.db.query(
      `UPDATE public.food_order SET status = 'cancelled', "cancelledAt" = now(), "updatedAt" = now()
        WHERE id = $1 AND status = 'new' RETURNING *`, [order.id]);
    if (!saved) throw new BadRequestException(FOOD_MESSAGES.badStep);
    this.event('FOOD_ORDER_CANCELLED', user.id, 'customer', order.businessId, order.id, null);
    return this.view(saved, false);
  }

  private async customerOrder(user: { id: number }, id: number) {
    const [o] = await this.db.query(`SELECT * FROM public.food_order WHERE id = $1 AND "customerId" = $2`, [id, user.id]);
    if (!o) throw new NotFoundException(FOOD_MESSAGES.notFound);
    return o;
  }

  // ── The hotel: settings and menu ─────────────────────────────────────────

  async hotelSettings(businessId: number, user: { id: number }) {
    await this.mustBeReady();
    const h = await this.assertOwner(businessId, user);
    const s = await this.settings(businessId);
    const lipa = await this.lipa(businessId, s);
    return {
      hotel: { businessId: h.id, name: h.name, logo: h.logo || h.photoUrl || null, category: h.category, commerceProfileId: h.commerceProfileId },
      settings: s ? { ...s, lipaNamba: s.lipaNamba, lipaNambaName: s.lipaNambaName } : null,
      lipaNamba: lipa.lipaNamba, lipaNambaName: lipa.lipaNambaName,
      deliveryAvailable: await this.deliveryReady(),
      deliveryWorks: await this.canDeliver(s),
    };
  }

  async updateSettings(businessId: number, user: { id: number }, body: Record<string, any>, roleContext?: RoleContext) {
    await this.mustBeReady();
    await this.assertOwner(businessId, user, roleContext, true);
    const cur = (await this.settings(businessId)) || {
      enabled: true, acceptingOrders: true, dineIn: true, pickup: true, payAfterDineIn: true, codPickup: false,
      tableCount: 0, roomCount: 0, openingHours: null, lipaNamba: null, lipaNambaName: null,
    } as any;
    const next = { ...cur };
    for (const k of ['enabled', 'acceptingOrders', 'dineIn', 'pickup', 'payAfterDineIn', 'codPickup']) {
      if (body?.[k] !== undefined) next[k] = bool(body[k]);
    }
    const withDelivery = await this.deliveryReady();
    if (withDelivery && body?.pickupPlace !== undefined) {
      const ref = body.pickupPlace;
      if (!ref) next.pickupPlace = null;
      else {
        const resolver = this.lazy<LocationIntelligenceService>(LocationIntelligenceService);
        const place: any = resolver && typeof ref?.providerKey === 'string' && typeof ref?.providerPlaceId === 'string'
          ? await resolver.resolve({ providerKey: ref.providerKey, providerPlaceId: ref.providerPlaceId }).catch(() => null) : null;
        if (!place) throw new BadRequestException(FOOD_MESSAGES.badPickupPlace);
        next.pickupPlace = {
          providerKey: ref.providerKey, providerPlaceId: ref.providerPlaceId, label: place.displayLabel,
          region: place.regionName ?? null, district: place.districtName ?? null,
        };
      }
    }
    if (withDelivery && body?.delivery !== undefined) {
      next.delivery = bool(body.delivery);
      if (next.delivery && !next.pickupPlace) throw new BadRequestException(FOOD_MESSAGES.pickupFirst);
    }
    for (const [k, max] of [['tableCount', 500], ['roomCount', 2000]] as const) {
      if (body?.[k] !== undefined) {
        const n = Number(body[k]);
        if (!Number.isInteger(n) || n < 0 || n > max) throw new BadRequestException(FOOD_MESSAGES.badCount);
        next[k] = n;
      }
    }
    if (body?.openingHours !== undefined) next.openingHours = text(body.openingHours, 120).slice(0, 120) || null;
    if (body?.lipaNamba !== undefined) {
      const digits = String(body.lipaNamba ?? '').replace(/\s+/g, '');
      if (digits && !/^\d{5,15}$/.test(digits)) throw new BadRequestException(FOOD_MESSAGES.badLipa);
      next.lipaNamba = digits || null;
    }
    if (body?.lipaNambaName !== undefined) next.lipaNambaName = text(body.lipaNambaName, 100).slice(0, 100) || null;
    await this.db.query(
      `INSERT INTO public.food_menu_settings ("businessId", enabled, "acceptingOrders", "dineIn", pickup, "payAfterDineIn", "codPickup",
              "tableCount", "roomCount", "openingHours", "lipaNamba", "lipaNambaName")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT ("businessId") DO UPDATE SET enabled = EXCLUDED.enabled, "acceptingOrders" = EXCLUDED."acceptingOrders",
              "dineIn" = EXCLUDED."dineIn", pickup = EXCLUDED.pickup, "payAfterDineIn" = EXCLUDED."payAfterDineIn",
              "codPickup" = EXCLUDED."codPickup", "tableCount" = EXCLUDED."tableCount", "roomCount" = EXCLUDED."roomCount",
              "openingHours" = EXCLUDED."openingHours", "lipaNamba" = EXCLUDED."lipaNamba", "lipaNambaName" = EXCLUDED."lipaNambaName",
              "updatedAt" = now()`,
      [businessId, next.enabled, next.acceptingOrders, next.dineIn, next.pickup, next.payAfterDineIn, next.codPickup,
        next.tableCount, next.roomCount, next.openingHours, next.lipaNamba, next.lipaNambaName]);
    if (withDelivery) {
      await this.db.query(`UPDATE public.food_menu_settings SET delivery = $2, "pickupPlace" = $3::jsonb WHERE "businessId" = $1`,
        [businessId, !!next.delivery, next.pickupPlace ? JSON.stringify(next.pickupPlace) : null]);
    }
    this.event('FOOD_MENU_SETTINGS_UPDATED', user.id, 'business_owner', businessId, businessId, null, 'business');
    return this.hotelSettings(businessId, user);
  }

  async hotelItems(businessId: number, user: { id: number }) {
    await this.mustBeReady();
    await this.assertOwner(businessId, user);
    const rows = await this.db.query(
      `SELECT id, section, name, description, price, "photoUrl", "availableToday", "sortOrder"
         FROM public.food_menu_item WHERE "businessId" = $1 AND active = true ORDER BY "sortOrder", section, id`, [businessId]);
    return rows.map((r: any) => ({ ...r, price: money(r.price), availableToday: !!r.availableToday }));
  }

  private itemFields(body: Record<string, any>, partial: boolean) {
    const out: Record<string, any> = {};
    if (!partial || body?.name !== undefined) {
      const name = text(body?.name, 80);
      if (name.length < 2 || name.length > 80) throw new BadRequestException(FOOD_MESSAGES.badName);
      out.name = name;
    }
    if (!partial || body?.section !== undefined) {
      const section = text(body?.section, 40);
      if (section.length < 2 || section.length > 40) throw new BadRequestException(FOOD_MESSAGES.badSection);
      out.section = section;
    }
    if (!partial || body?.price !== undefined) {
      const price = Number(body?.price);
      if (!Number.isFinite(price) || price <= 0 || price > 10_000_000) throw new BadRequestException(FOOD_MESSAGES.badPrice);
      out.price = money(price);
    }
    if (body?.description !== undefined) out.description = text(body.description, 200).slice(0, 200) || null;
    if (body?.photoUrl !== undefined) {
      const url = typeof body.photoUrl === 'string' ? body.photoUrl.trim() : '';
      out.photoUrl = /^https:\/\/[^\s]{5,500}$/.test(url) ? url : null;
    }
    if (body?.availableToday !== undefined) out.availableToday = bool(body.availableToday);
    return out;
  }

  async createItem(businessId: number, user: { id: number }, body: Record<string, any>, roleContext?: RoleContext) {
    await this.mustBeReady();
    await this.assertOwner(businessId, user, roleContext, true);
    const f = this.itemFields(body, false);
    const [{ n }] = await this.db.query(`SELECT COUNT(*)::int AS n FROM public.food_menu_item WHERE "businessId" = $1 AND active = true`, [businessId]);
    if (Number(n) >= 300) throw new BadRequestException(FOOD_MESSAGES.tooMany);
    const [row] = await this.db.query(
      `INSERT INTO public.food_menu_item ("businessId", section, name, description, price, "photoUrl", "availableToday", "sortOrder")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [businessId, f.section, f.name, f.description ?? null, f.price, f.photoUrl ?? null, f.availableToday ?? true, Number(n)]);
    // A hotel that adds its first dish has food ordering switched on (it can turn it off).
    await this.db.query(`INSERT INTO public.food_menu_settings ("businessId") VALUES ($1) ON CONFLICT ("businessId") DO NOTHING`, [businessId]);
    this.event('FOOD_MENU_ITEM_CREATED', user.id, 'business_owner', businessId, row.id, { section: f.section, price: f.price }, 'food_menu_item');
    return this.hotelItems(businessId, user);
  }

  async updateItem(businessId: number, itemId: number, user: { id: number }, body: Record<string, any>, roleContext?: RoleContext) {
    await this.mustBeReady();
    await this.assertOwner(businessId, user, roleContext, true);
    const f = this.itemFields(body, true);
    const keys = Object.keys(f);
    if (keys.length) {
      const sets = keys.map((k, i) => `"${k}" = $${i + 3}`).join(', ');
      const res = await this.db.query(
        `UPDATE public.food_menu_item SET ${sets}, "updatedAt" = now() WHERE id = $1 AND "businessId" = $2 AND active = true RETURNING id`,
        [itemId, businessId, ...keys.map((k) => f[k])]);
      if (!res.length) throw new NotFoundException(FOOD_MESSAGES.itemGone);
    }
    return this.hotelItems(businessId, user);
  }

  async removeItem(businessId: number, itemId: number, user: { id: number }, roleContext?: RoleContext) {
    await this.mustBeReady();
    await this.assertOwner(businessId, user, roleContext, true);
    await this.db.query(`UPDATE public.food_menu_item SET active = false, "updatedAt" = now() WHERE id = $1 AND "businessId" = $2`, [itemId, businessId]);
    return this.hotelItems(businessId, user);
  }

  // ── The hotel: the kitchen ───────────────────────────────────────────────

  async kitchen(businessId: number, user: { id: number }) {
    await this.mustBeReady();
    const h = await this.assertOwner(businessId, user);
    await this.syncDeliveries(`f."businessId" = $1`, businessId);
    const day = `(now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date`;
    const local = `(("createdAt") AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Dar_es_Salaam')::date`;
    const shipment = (await this.deliveryReady())
      ? `, (SELECT p."shipmentId" FROM public.parcel p WHERE p."orderId" = f."shippingOrderId" ORDER BY p.id LIMIT 1) AS "shipmentId"` : '';
    const rows = await this.db.query(
      `SELECT f.*${shipment} FROM public.food_order f WHERE f."businessId" = $1
          AND (f.status = ANY($2::text[]) OR (f.status = 'done' AND f."doneAt" > now() - interval '3 hours'))
        ORDER BY f."createdAt" ASC LIMIT 200`, [businessId, OPEN]);
    const [sum] = await this.db.query(
      `SELECT COUNT(*) FILTER (WHERE status NOT IN ('rejected', 'cancelled'))::int AS orders,
              COALESCE(SUM("totalAmount") FILTER (WHERE status = 'done'), 0) AS sales,
              COUNT(*) FILTER (WHERE "paymentStatus" = 'proof_sent' AND status NOT IN ('rejected', 'cancelled'))::int AS "toConfirm"
         FROM public.food_order WHERE "businessId" = $1 AND ${local} = ${day}`, [businessId]);
    const s = await this.settings(businessId);
    return {
      hotel: { businessId: h.id, name: h.name, logo: h.logo || h.photoUrl || null },
      acceptingOrders: s ? !!s.acceptingOrders : false,
      hasMenu: !!s,
      today: { orders: Number(sum?.orders || 0), sales: money(sum?.sales), toConfirm: Number(sum?.toConfirm || 0) },
      orders: rows.map((r: any) => this.view(r, true)),
    };
  }

  async step(businessId: number, orderId: number, user: { id: number }, action: string, body: Record<string, any>, roleContext?: RoleContext) {
    await this.mustBeReady();
    await this.assertOwner(businessId, user, roleContext, true);
    const [o] = await this.db.query(`SELECT * FROM public.food_order WHERE id = $1 AND "businessId" = $2`, [orderId, businessId]);
    if (!o) throw new NotFoundException(FOOD_MESSAGES.notFound);
    let sql: string;
    let params: any[] = [orderId];
    let notice: { title: string; body: string } | null = null;
    const where = this.placeLabel(o);
    if (action === 'accept') {
      if (o.status !== 'new') throw new BadRequestException(FOOD_MESSAGES.badStep);
      const m = Number(body?.minutes);
      if (!Number.isInteger(m) || m < FOOD_READY_MINUTES.min || m > FOOD_READY_MINUTES.max) throw new BadRequestException(FOOD_MESSAGES.badMinutes);
      sql = `UPDATE public.food_order SET status = 'cooking', "readyInMinutes" = $2, "acceptedAt" = now(), "updatedAt" = now() WHERE id = $1 AND status = 'new' RETURNING *`;
      params = [orderId, m];
      notice = { title: 'Oda yako inapikwa', body: `Jikoni wamesema: tayari baada ya dakika ${m}.` };
    } else if (action === 'reject') {
      if (!['new', 'cooking'].includes(o.status)) throw new BadRequestException(FOOD_MESSAGES.badStep);
      const reason = text(body?.reason, 200);
      if (reason.length < 2 || reason.length > 200) throw new BadRequestException(FOOD_MESSAGES.badReason);
      sql = `UPDATE public.food_order SET status = 'rejected', "rejectReason" = $2, "updatedAt" = now() WHERE id = $1 AND status IN ('new', 'cooking') RETURNING *`;
      params = [orderId, reason];
      notice = { title: 'Hoteli imekataa oda yako', body: reason };
    } else if (action === 'ready') {
      if (o.status !== 'cooking') throw new BadRequestException(FOOD_MESSAGES.badStep);
      sql = `UPDATE public.food_order SET status = 'ready', "readyAt" = now(), "updatedAt" = now() WHERE id = $1 AND status = 'cooking' RETURNING *`;
      notice = o.mode === 'pickup'
        ? { title: 'Chakula chako kiko tayari', body: 'Pita hotelini kuchukua.' }
        : o.mode === 'delivery'
          ? { title: 'Chakula chako kiko tayari', body: 'Wakala anakileta. Lipa ukipokea.' }
          : { title: 'Chakula chako kiko tayari', body: `Kinaletwa ${where}.` };
    } else if (action === 'dispatch') {
      // Retry sending a delivery to the wakala (the first try failed, e.g. no network).
      if (o.mode !== 'delivery' || !['cooking', 'ready'].includes(o.status) || o.shippingOrderId) throw new BadRequestException(FOOD_MESSAGES.badStep);
      return this.view(await this.dispatchDelivery(o, user.id), true);
    } else if (action === 'done') {
      if (o.status !== 'ready') throw new BadRequestException(FOOD_MESSAGES.badStep);
      // A wakala delivery is finished by the wakala's delivery code, not by the kitchen.
      if (o.mode === 'delivery' && o.shippingOrderId) throw new BadRequestException(FOOD_MESSAGES.badStep);
      // Food handed over unpaid on cash-on-pickup or pay-after is paid at that moment.
      sql = `UPDATE public.food_order SET status = 'done', "doneAt" = now(), "updatedAt" = now(),
               "paymentStatus" = CASE WHEN "paymentMethod" IN ('cod', 'pay_after') THEN 'paid' ELSE "paymentStatus" END,
               "paidAt" = CASE WHEN "paymentMethod" IN ('cod', 'pay_after') AND "paidAt" IS NULL THEN now() ELSE "paidAt" END
             WHERE id = $1 AND status = 'ready' RETURNING *`;
    } else if (action === 'confirm-payment' || action === 'reject-payment') {
      if (o.paymentMethod !== 'lipa_namba') throw new BadRequestException(FOOD_MESSAGES.notLipa);
      if (o.paymentStatus !== 'proof_sent' || ['rejected', 'cancelled'].includes(o.status)) throw new BadRequestException(FOOD_MESSAGES.badStep);
      if (action === 'confirm-payment') {
        sql = `UPDATE public.food_order SET "paymentStatus" = 'paid', "paidAt" = now(), "paymentNote" = NULL, "updatedAt" = now() WHERE id = $1 AND "paymentStatus" = 'proof_sent' RETURNING *`;
        notice = { title: 'Malipo yamethibitishwa', body: `Hoteli imepokea TZS ${money(o.totalAmount).toLocaleString('en-US')}.` };
      } else {
        const reason = text(body?.reason, 200);
        if (reason.length < 2 || reason.length > 200) throw new BadRequestException(FOOD_MESSAGES.badReason);
        sql = `UPDATE public.food_order SET "paymentStatus" = 'rejected', "paymentNote" = $2, "updatedAt" = now() WHERE id = $1 AND "paymentStatus" = 'proof_sent' RETURNING *`;
        params = [orderId, reason];
        notice = { title: 'Malipo hayajathibitishwa', body: `${reason}. Tuma picha sahihi ya malipo.` };
      }
    } else {
      throw new BadRequestException(FOOD_MESSAGES.badStep);
    }
    let [saved] = await this.db.query(sql, params);
    if (!saved) throw new BadRequestException(FOOD_MESSAGES.badStep);
    // Accepted delivery: the wakala job goes out now, so the wakala comes while the food cooks.
    if (action === 'accept' && saved.mode === 'delivery') saved = await this.dispatchDelivery(saved, user.id);
    if (notice) {
      this.notifications?.notify({
        userId: Number(o.customerId), type: `food_order_${action}`, title: notice.title, body: `${foodOrderCode(o.id)} · ${notice.body}`,
        actionPage: 'FoodOrder', actionParam: String(o.id), sourceType: 'food_order', sourceId: o.id,
      }).catch(() => {});
    }
    this.event(`FOOD_ORDER_${action.toUpperCase().replace('-', '_')}`, user.id, 'business_owner', businessId, orderId,
      action === 'accept' ? { minutes: Number(body?.minutes) } : null);
    return this.view(saved, true);
  }

  /**
   * The wakala job for an accepted delivery: a pay-on-delivery seller shipment (one shipment
   * engine) from the hotel's pickup place to the customer, food as the goods and the fee the
   * customer saw. Never throws: a failure is kept on the order for the kitchen to retry.
   */
  async dispatchDelivery(o: any, actorUserId: number) {
    const fail = async (why: string) => {
      const [row] = await this.db.query(
        `UPDATE public.food_order SET "deliveryError" = $2, "updatedAt" = now() WHERE id = $1 RETURNING *`, [o.id, why.slice(0, 200)]);
      return row || o;
    };
    try {
      const engine = this.lazy<SuperAgentsService>(SuperAgentsService);
      const s = await this.settings(o.businessId);
      const city = this.deliveryCity(s);
      if (!engine || !s?.pickupPlace || !city) return fail('Usafiri haupatikani kwa sasa. Jaribu tena.');
      const h = await this.hotel(o.businessId);
      const [owner] = await this.db.query(`SELECT * FROM public."user" WHERE id = $1`, [h?.ownerId]);
      const [customer] = await this.db.query(`SELECT name, phone FROM public."user" WHERE id = $1`, [o.customerId]);
      if (!h || !owner) return fail('Hoteli haikupatikana.');
      const items = (Array.isArray(o.items) ? o.items : JSON.parse(o.items || '[]')) as any[];
      const code = foodOrderCode(o.id);
      const res: any = await engine.createSellerShipment(owner, {
        description: `Chakula ${code}: ${items.map((i) => `${i.qty} x ${i.name}`).join(', ')}`.slice(0, 200),
        recipientName: (customer?.name || 'Mteja').slice(0, 100),
        recipientPhone: o.deliveryPhone,
        destinationCity: city, originCity: city,
        deliveryAddress: o.deliveryAddress,
        transportMethod: 'agent',
        weightKg: 1,
        totalValue: money(o.totalAmount),
        items: items.map((i) => ({ name: String(i.name).slice(0, 80), qty: Number(i.qty), price: money(i.price) })),
        isCod: true, codAmountPaid: 0,
        bodaFee: money(o.deliveryFee),
        pickupPlace: { providerKey: s.pickupPlace.providerKey, providerPlaceId: s.pickupPlace.providerPlaceId },
        notes: `Oda ya chakula ${code} kutoka ${h.name}`.slice(0, 200),
      }, {
        // The hotel's own identity as the sender (its name on the SMS); no seller billing profile.
        legacySellerId: Number(owner.id), workspaceId: null, businessId: Number(h.id), mode: 'legacy',
        commerceProfileId: h.commerceProfileId ?? null,
      } as any);
      const [row] = await this.db.query(
        `UPDATE public.food_order SET "shippingOrderId" = $2, "trackingNumber" = $3, "deliveryError" = NULL, "updatedAt" = now()
          WHERE id = $1 RETURNING *`, [o.id, res?.orderId ?? null, (res?.customerNumber || res?.trackingNumber || null)]);
      this.event('FOOD_ORDER_DELIVERY_DISPATCHED', actorUserId, 'business_owner', o.businessId, o.id,
        { shippingOrderId: res?.orderId ?? null, fee: money(o.deliveryFee) });
      return row || o;
    } catch (err: any) {
      const m = err?.response?.message ?? err?.message;
      return fail(typeof m === 'string' && m ? m : 'Usafiri haukutumwa. Jaribu tena.');
    }
  }

  // ── Shapes ───────────────────────────────────────────────────────────────

  placeLabel(o: { mode: string; placeType?: string | null; placeNumber?: number | null }) {
    if (o.mode === 'pickup') return 'Chukua';
    if (o.mode === 'delivery') return 'Letewa';
    return `${o.placeType === 'room' ? 'Chumba' : 'Meza'} ${o.placeNumber}`;
  }

  view(o: any, forHotel: boolean) {
    const items = Array.isArray(o.items) ? o.items : (() => { try { return JSON.parse(o.items); } catch { return []; } })();
    return {
      id: o.id, code: foodOrderCode(o.id), businessId: o.businessId, hotelName: o.hotelName ?? undefined,
      mode: o.mode, placeType: o.placeType, placeNumber: o.placeNumber, place: this.placeLabel(o),
      items, note: o.note, total: money(o.totalAmount),
      deliveryAddress: o.deliveryAddress ?? null, deliveryPhone: forHotel ? (o.deliveryPhone ?? null) : undefined,
      deliveryFee: o.deliveryFee != null ? money(o.deliveryFee) : null,
      trackingNumber: o.trackingNumber ?? null, deliveryError: o.deliveryError ?? null,
      shipmentId: o.shipmentId != null ? Number(o.shipmentId) : null,
      paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus, paymentNote: o.paymentNote,
      status: o.status, readyInMinutes: o.readyInMinutes, rejectReason: o.rejectReason,
      createdAt: o.createdAt, acceptedAt: o.acceptedAt, readyAt: o.readyAt, doneAt: o.doneAt, paidAt: o.paidAt,
      hasProof: !!o.lipaProofUrl,
      proofUrl: forHotel ? signedLipaProofUrl(o.lipaProofUrl) : undefined,
    };
  }

  private event(eventType: string, actorId: number, actorType: string, businessId: number, targetId: number,
    metadata: Record<string, any> | null, targetType = 'food_order') {
    this.activity?.record({
      eventType, category: ActivityCategory.COMMERCE, actorId, actorType, businessId,
      targetType, targetId, metadata,
    }).catch(() => {});
  }
}
