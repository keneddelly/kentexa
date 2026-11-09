import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { RESALE_NOTE_MAX, UNPAID_LATE_SQL, assertSellingPrice, money, profitState, sellingFloor } from './resale-rules';

/** One resale order with its profit record, as both sides see it. */
const RESALE_ORDER_SELECT = `o.id, o.status, o.quantity, o."resaleUnitPrice", o."supplierUnitPrice", o."resellerProfit",
  o."deliveredAt", o."completedAt", o."createdAt", o."resellerPaidAt", o."resellerPaidRef", o."resellerConfirmedAt",
  o."resellerDisputedAt", o."resellerDisputeNote", o."productNameSnapshot", o."sellerId", o."resellerUserId"`;
const PAID_REF = /^[A-Za-z0-9 ._/-]{4,60}$/;

/** product.images is a simple-array column: raw SQL returns "a.jpg,b.jpg". */
const firstImage = (v: unknown): string | null =>
  (Array.isArray(v) ? v[0] : typeof v === 'string' ? v.split(',')[0] : null) || null;

/**
 * "Uza tena" (resell), owner approved 2026-11-09. A supplier opens a product (product.resaleOpen,
 * resalePrice, resaleMinPrice, set through the normal product edit). Any person with a verified
 * phone reposts it here with their own price; the offer shares under their name. Orders from an
 * offer are the supplier's orders (orders.service create()). Raw SQL on product and resale_offer
 * only, so this module depends on no other feature module.
 */
@Injectable()
export class ResaleService {
  constructor(
    private readonly db: DataSource,
    private readonly events: ActivityEventService,
    @Optional() private readonly notifier?: InAppNotificationService,
  ) {}

  private async product(productId: number) {
    const [p] = await this.db.query(
      `SELECT p.id, p.name, p.images, p."basePrice", p."displayPrice", p.stock, p."isActive", p."isAvailable",
              p."resaleOpen", p."resalePrice", p."resaleMinPrice", p."sellerId"
         FROM public.product p WHERE p.id = $1::int`, [productId]);
    if (!p) throw new NotFoundException('Bidhaa haipo.');
    return p;
  }

  // ── Members (owner 2026-11-10): reseller prices show only to people who joined ──
  /** A member joined and accepted the three rules. */
  async isMember(userId: number): Promise<boolean> {
    const [m] = await this.db.query(
      `SELECT 1 FROM public.resale_member WHERE "userId" = $1::int AND "isActive" = true AND "rulesAcceptedAt" IS NOT NULL`, [userId]);
    return !!m;
  }

  private async assertMember(userId: number) {
    if (!(await this.isMember(userId))) throw new ForbiddenException('Jiunge na Uza tena kwanza ili uone bei za wauzaji.');
  }

  async membership(userId: number) {
    const [m] = await this.db.query(
      `SELECT "joinedAt", "rulesAcceptedAt", "isActive" FROM public.resale_member WHERE "userId" = $1::int`, [userId]);
    return { member: !!(m && m.isActive && m.rulesAcceptedAt), joinedAt: m?.joinedAt ?? null, rulesAccepted: !!m?.rulesAcceptedAt };
  }

  /** One tap: a verified phone and the three rules accepted. No admin approval, no fee. */
  async join(user: { id: number; isVerified?: boolean }, body: { acceptRules?: unknown }) {
    if (!user?.isVerified) throw new ForbiddenException('Thibitisha namba yako ya simu kwanza ili ujiunge na Uza tena.');
    if (body?.acceptRules !== true) throw new BadRequestException('Kubali kanuni za Uza tena ili ujiunge.');
    await this.db.query(
      `INSERT INTO public.resale_member ("userId", "rulesAcceptedAt", "isActive") VALUES ($1::int, now(), true)
       ON CONFLICT ("userId") DO UPDATE SET "rulesAcceptedAt" = COALESCE(public.resale_member."rulesAcceptedAt", now()), "isActive" = true`,
      [user.id]);
    void this.events.record({ eventType: 'RESELLER_JOINED', category: ActivityCategory.COMMERCE, actorId: user.id, actorType: 'user', targetType: 'resale_member', targetId: user.id });
    return this.membership(user.id);
  }

  /** The "Uza tena" screen: the supplier price, the floor and the person's own offer. Members only. */
  async terms(productId: number, userId: number) {
    const p = await this.product(productId);
    const own = Number(p.sellerId) === Number(userId);
    // The supplier itself sees its own terms even while closed (to open them again).
    if (own) {
      return { open: !!p.resaleOpen && money(p.resalePrice) > 0, productId: p.id, own: true, publicPrice: money(p.basePrice),
        supplierPrice: p.resalePrice == null ? null : money(p.resalePrice), minPrice: p.resaleMinPrice == null ? null : money(p.resaleMinPrice) };
    }
    if (!p.resaleOpen || !(money(p.resalePrice) > 0)) return { open: false, productId: p.id };
    // Not a member: only that the product can be resold, never a price (owner 2026-11-10).
    if (!(await this.isMember(userId))) return { open: true, productId: p.id, own: false, member: false };
    const [mine] = await this.db.query(
      `SELECT id, price, note, "isActive" FROM public.resale_offer WHERE "productId" = $1::int AND "resellerUserId" = $2::int`,
      [p.id, userId]);
    return {
      open: true,
      productId: p.id,
      own: false,
      member: true,
      publicPrice: money(p.basePrice),
      supplierPrice: money(p.resalePrice),
      minPrice: p.resaleMinPrice == null ? null : money(p.resaleMinPrice),
      floor: sellingFloor(p),
      offer: mine ? { id: mine.id, price: money(mine.price), note: mine.note, isActive: mine.isActive } : null,
    };
  }

  /** Save (or reopen) the person's offer for one product. */
  async saveOffer(user: { id: number; isVerified?: boolean }, body: { productId?: unknown; price?: unknown; note?: unknown }) {
    if (!user?.isVerified) throw new ForbiddenException('Thibitisha namba yako ya simu kwanza ili uuze tena.');
    await this.assertMember(user.id);
    const productId = Number(body?.productId);
    if (!Number.isInteger(productId) || productId <= 0) throw new BadRequestException('Chagua bidhaa.');
    const p = await this.product(productId);
    if (!p.resaleOpen || !(money(p.resalePrice) > 0) || !p.isActive) throw new BadRequestException('Bidhaa hii haijafunguliwa kwa wauzaji.');
    if (Number(p.sellerId) === Number(user.id)) throw new BadRequestException('Hii ni bidhaa yako mwenyewe.');
    const price = assertSellingPrice(body?.price, p);
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, RESALE_NOTE_MAX) || null : null;
    const [row] = await this.db.query(
      `INSERT INTO public.resale_offer ("productId", "resellerUserId", price, note, "isActive")
       VALUES ($1::int, $2::int, $3::numeric, $4::varchar, true)
       ON CONFLICT ("productId", "resellerUserId")
       DO UPDATE SET price = EXCLUDED.price, note = EXCLUDED.note, "isActive" = true, "updatedAt" = now()
       RETURNING id, price, note, "isActive"`,
      [p.id, user.id, price, note]);
    void this.events.record({
      eventType: 'RESALE_OFFER_SAVED', category: ActivityCategory.COMMERCE, actorId: user.id, actorType: 'user',
      relatedUserId: Number(p.sellerId) || null, targetType: 'resale_offer', targetId: row.id,
      metadata: { productId: p.id, price, supplierPrice: money(p.resalePrice) },
    });
    return { id: row.id, productId: p.id, price: money(row.price), note: row.note, isActive: row.isActive, profitEach: money(price - money(p.resalePrice)) };
  }

  /** The reseller stops an offer (its link then sells at the shop price). */
  async closeOffer(userId: number, offerId: number) {
    const res: any = await this.db.query(
      `UPDATE public.resale_offer SET "isActive" = false, "updatedAt" = now()
        WHERE id = $1::int AND "resellerUserId" = $2::int RETURNING id`, [offerId, userId]);
    const rows = Array.isArray(res?.[0]) ? res[0] : res;
    if (!rows?.length) throw new NotFoundException('Ofa haipo.');
    return { id: offerId, isActive: false };
  }

  /** The person's offers, with profit for one sale at their price. */
  async myOffers(userId: number) {
    const rows: any[] = await this.db.query(
      `SELECT o.id, o."productId", o.price, o.note, o."isActive", o."createdAt",
              p.name, p.images, p.stock, p."resaleOpen", p."resalePrice", p."resaleMinPrice",
              (SELECT COUNT(*) FROM public."order" r WHERE r."resaleOfferId" = o.id) AS orders
         FROM public.resale_offer o JOIN public.product p ON p.id = o."productId"
        WHERE o."resellerUserId" = $1::int
        ORDER BY o."isActive" DESC, o."updatedAt" DESC LIMIT 200`, [userId]);
    return rows.map((r) => ({
      id: r.id, productId: r.productId, name: r.name, image: firstImage(r.images),
      price: money(r.price), note: r.note, isActive: r.isActive && r.resaleOpen, stock: Number(r.stock) || 0,
      profitEach: money(money(r.price) - money(r.resalePrice)), orders: Number(r.orders) || 0,
      // The supplier raised its price or floor above this offer: it must be updated before it sells.
      needsNewPrice: r.resaleOpen && money(r.price) < sellingFloor(r),
    }));
  }

  /** A shared offer, as the buyer sees it: the reseller and the price. No supplier price. */
  async publicOffer(offerId: number) {
    const [r] = await this.db.query(
      `SELECT o.id, o."productId", o.price, o.note, o."isActive", p."resaleOpen", p."resalePrice", p."resaleMinPrice",
              u.id AS "resellerId", u.name AS "resellerName", u."avatarUrl" AS "resellerPhoto"
         FROM public.resale_offer o JOIN public.product p ON p.id = o."productId"
         JOIN public."user" u ON u.id = o."resellerUserId"
        WHERE o.id = $1::int`, [offerId]);
    if (!r || !r.isActive || !r.resaleOpen || money(r.price) < sellingFloor(r)) throw new NotFoundException('Ofa hii haipo tena.');
    return {
      id: r.id, productId: r.productId, price: money(r.price), note: r.note,
      reseller: { id: r.resellerId, name: r.resellerName || 'Muuzaji', photo: r.resellerPhoto || null },
    };
  }

  /**
   * "Bidhaa za kuuza" (owner 2026-11-10: a dedicated place where resellers find every product
   * open for reselling): search by name, a category, one shop, sorted by newest or by profit at the
   * shop price. Also returns the categories that have products, with counts, for the chips.
   * Shops that left a reseller's profit unpaid 7 days are left out.
   */
  async openProducts(userId: number, f: { page?: number; q?: string; category?: string; supplierId?: number; sort?: string } = {}) {
    await this.assertMember(userId);
    const size = 30;
    const page = Math.max(1, Math.floor(Number(f.page) || 1));
    const where = [
      `p."resaleOpen" = true`, `p."resalePrice" > 0`, `p."isActive" = true`, `p."isAvailable" = true`, `p.stock > 0`,
      `p."sellerId" <> $1::int`, `${UNPAID_LATE_SQL} = 0`,
    ];
    const params: any[] = [userId];
    const q = String(f.q ?? '').trim().slice(0, 80);
    if (q.length >= 2) {
      params.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
      where.push(`(p.name ILIKE $${params.length} OR p.model ILIKE $${params.length})`);
    }
    if (Number.isInteger(Number(f.supplierId)) && Number(f.supplierId) > 0) {
      params.push(Number(f.supplierId));
      where.push(`p."sellerId" = $${params.length}::int`);
    }
    const base = where.join(' AND ');
    const catParams = [...params];
    const category = String(f.category ?? '').trim().slice(0, 60);
    let filtered = base;
    if (category) {
      params.push(category);
      filtered = `${base} AND p.category = $${params.length}`;
    }
    const order = f.sort === 'profit'
      ? `(p."basePrice" - p."resalePrice") DESC, p.id DESC`
      : `p."updatedAt" DESC, p.id DESC`;
    params.push((page - 1) * size);
    const rows: any[] = await this.db.query(
      `SELECT p.id, p.name, p.images, p.category, p."basePrice", p."resalePrice", p."resaleMinPrice", p.stock, p."sellerId",
              COALESCE(u."storeName", u.name) AS "supplierName"
         FROM public.product p LEFT JOIN public."user" u ON u.id = p."sellerId"
        WHERE ${filtered}
        ORDER BY ${order} LIMIT ${size + 1} OFFSET $${params.length}::int`, params);
    const cats: any[] = await this.db.query(
      `SELECT p.category, COUNT(*)::int AS n FROM public.product p
        WHERE ${base} AND p.category IS NOT NULL GROUP BY p.category ORDER BY n DESC, p.category LIMIT 20`, catParams);
    return {
      items: rows.slice(0, size).map((r) => ({
        id: r.id, name: r.name, image: firstImage(r.images), category: r.category, supplierId: r.sellerId, supplierName: r.supplierName,
        publicPrice: money(r.basePrice), supplierPrice: money(r.resalePrice), floor: sellingFloor(r),
        profitAtShopPrice: money(money(r.basePrice) - money(r.resalePrice)), stock: Number(r.stock) || 0,
      })),
      categories: cats.map((c) => ({ key: c.category, count: Number(c.n) || 0 })),
      hasMore: rows.length > size,
      page,
    };
  }

  /**
   * A reseller's own shelf (owner 2026-11-10: "when he reposts a product it appears on his account
   * with his price; a buyer can buy it"). Public: the products and the reseller's prices only,
   * never the supplier price. Only offers that can still be bought.
   */
  async resellerShelf(resellerUserId: number) {
    const rows: any[] = await this.db.query(
      `SELECT o.id, o."productId", o.price, o.note, p.name, p.images, p.stock, p."resalePrice", p."resaleMinPrice"
         FROM public.resale_offer o JOIN public.product p ON p.id = o."productId"
        WHERE o."resellerUserId" = $1::int AND o."isActive" = true AND p."resaleOpen" = true AND p."isActive" = true
          AND p."isAvailable" = true AND p.stock > 0 AND ${UNPAID_LATE_SQL} = 0
        ORDER BY o."updatedAt" DESC LIMIT 100`, [resellerUserId]);
    return rows
      .filter((r) => money(r.price) >= sellingFloor(r))
      .map((r) => ({ offerId: r.id, productId: r.productId, name: r.name, image: firstImage(r.images), price: money(r.price), note: r.note, stock: Number(r.stock) || 0 }));
  }

  /** How many of one shop's products are open for reselling (the "Uza bidhaa za duka hili" door). */
  async supplierOpenCount(supplierUserId: number) {
    const [r] = await this.db.query(
      `SELECT COUNT(*)::int AS n FROM public.product p
        WHERE p."sellerId" = $1::int AND p."resaleOpen" = true AND p."resalePrice" > 0 AND p."isActive" = true
          AND p."isAvailable" = true AND p.stock > 0 AND ${UNPAID_LATE_SQL} = 0`, [supplierUserId]);
    return { supplierId: supplierUserId, count: Number(r?.n) || 0 };
  }

  // ── R3: the profit record (owner 2026-11-09) ──────────────────────────────
  private row(r: any) {
    return {
      orderId: r.id, product: r.productNameSnapshot, quantity: Number(r.quantity) || 1, status: r.status,
      sellingPrice: money(r.resaleUnitPrice), supplierPrice: money(r.supplierUnitPrice), profit: money(r.resellerProfit),
      deliveredAt: r.deliveredAt || r.completedAt || null, createdAt: r.createdAt,
      paidAt: r.resellerPaidAt, paidRef: r.resellerPaidRef, confirmedAt: r.resellerConfirmedAt,
      disputedAt: r.resellerDisputedAt, disputeNote: r.resellerDisputeNote,
      state: profitState(r),
    };
  }

  private static totals(rows: { state: string; profit: number }[]) {
    const sum = (states: string[]) => money(rows.filter((r) => states.includes(r.state)).reduce((s, r) => s + r.profit, 0));
    return { coming: sum(['waiting']), owed: sum(['owed', 'late']), paid: sum(['paid', 'disputed']), received: sum(['confirmed']) };
  }

  /** The reseller's profits: every order from their offers, newest first. */
  async myProfits(resellerUserId: number) {
    const rows: any[] = await this.db.query(
      `SELECT ${RESALE_ORDER_SELECT}, COALESCE(s."storeName", s.name) AS "supplierName", s.phone AS "supplierPhone"
         FROM public."order" o LEFT JOIN public."user" s ON s.id = o."sellerId"
        WHERE o."resellerUserId" = $1::int ORDER BY o.id DESC LIMIT 300`, [resellerUserId]);
    const items = rows.map((r) => ({ ...this.row(r), supplierName: r.supplierName || 'Duka', supplierPhone: r.supplierPhone || null }));
    return { totals: ResaleService.totals(items), items };
  }

  /** The supplier's resale orders: what it owes each reseller. */
  async supplierOrders(supplierUserId: number) {
    const rows: any[] = await this.db.query(
      `SELECT ${RESALE_ORDER_SELECT}, u.name AS "resellerName", u.phone AS "resellerPhone"
         FROM public."order" o LEFT JOIN public."user" u ON u.id = o."resellerUserId"
        WHERE o."sellerId" = $1::int AND o."resellerUserId" IS NOT NULL ORDER BY o.id DESC LIMIT 300`, [supplierUserId]);
    const items = rows.map((r) => ({ ...this.row(r), resellerName: r.resellerName || 'Muuzaji', resellerPhone: r.resellerPhone || null }));
    return { totals: ResaleService.totals(items), items };
  }

  private async resaleOrder(orderId: number) {
    const [r] = await this.db.query(`SELECT ${RESALE_ORDER_SELECT} FROM public."order" o WHERE o.id = $1::int AND o."resellerUserId" IS NOT NULL`, [orderId]);
    if (!r) throw new NotFoundException('Oda hii haikutoka kwa muuzaji.');
    return r;
  }

  /** The supplier paid the reseller's profit by mobile money, with its reference. */
  async markPaid(supplierUserId: number, orderId: number, ref: unknown) {
    const r = await this.resaleOrder(orderId);
    if (Number(r.sellerId) !== Number(supplierUserId)) throw new ForbiddenException('Hii si oda yako.');
    const state = profitState(r);
    if (!['owed', 'late', 'disputed'].includes(state)) {
      throw new BadRequestException(state === 'waiting' ? 'Lipa faida baada ya mteja kupokea mzigo.' : 'Faida ya oda hii haiwezi kulipwa sasa.');
    }
    const reference = String(ref ?? '').trim();
    if (!PAID_REF.test(reference)) throw new BadRequestException('Andika namba ya muamala wa malipo (herufi 4 hadi 60).');
    await this.db.query(
      `UPDATE public."order" SET "resellerPaidAt" = now(), "resellerPaidRef" = $2::varchar, "resellerDisputedAt" = NULL, "resellerDisputeNote" = NULL
        WHERE id = $1::int AND "resellerConfirmedAt" IS NULL`, [orderId, reference]);
    void this.events.record({
      eventType: 'RESELLER_PAID', category: ActivityCategory.COMMERCE, actorId: supplierUserId, actorType: 'seller',
      relatedUserId: Number(r.resellerUserId), targetType: 'order', targetId: orderId, metadata: { profit: money(r.resellerProfit), ref: reference },
    });
    this.tell(Number(r.resellerUserId), 'Umelipwa faida yako',
      `Duka limesema limekulipa TZS ${Math.round(money(r.resellerProfit)).toLocaleString('en-US')} kwa oda #${orderId} (muamala ${reference}). Thibitisha kwenye Uza tena.`, orderId);
    return { orderId, state: 'paid' as const, paidRef: reference };
  }

  /** The reseller confirms receiving the profit. */
  async confirm(resellerUserId: number, orderId: number) {
    const r = await this.resaleOrder(orderId);
    if (Number(r.resellerUserId) !== Number(resellerUserId)) throw new ForbiddenException('Hii si oda yako.');
    if (!r.resellerPaidAt) throw new BadRequestException('Duka bado halijasema limelipa.');
    await this.db.query(
      `UPDATE public."order" SET "resellerConfirmedAt" = COALESCE("resellerConfirmedAt", now()), "resellerDisputedAt" = NULL, "resellerDisputeNote" = NULL
        WHERE id = $1::int`, [orderId]);
    void this.events.record({
      eventType: 'RESELLER_PAY_CONFIRMED', category: ActivityCategory.COMMERCE, actorId: resellerUserId, actorType: 'user',
      relatedUserId: Number(r.sellerId), targetType: 'order', targetId: orderId, metadata: { profit: money(r.resellerProfit) },
    });
    return { orderId, state: 'confirmed' as const };
  }

  /** The reseller says the profit did not arrive. The supplier is told; admin sees the event. */
  async dispute(resellerUserId: number, orderId: number, note: unknown) {
    const r = await this.resaleOrder(orderId);
    if (Number(r.resellerUserId) !== Number(resellerUserId)) throw new ForbiddenException('Hii si oda yako.');
    if (!r.resellerPaidAt || r.resellerConfirmedAt) throw new BadRequestException('Unaweza kusema "Sijapokea" baada ya duka kusema limelipa.');
    const text = String(note ?? '').trim().slice(0, 300) || null;
    await this.db.query(
      `UPDATE public."order" SET "resellerDisputedAt" = now(), "resellerDisputeNote" = $2::varchar WHERE id = $1::int AND "resellerConfirmedAt" IS NULL`,
      [orderId, text]);
    void this.events.record({
      eventType: 'RESELLER_PAY_DISPUTED', category: ActivityCategory.COMMERCE, actorId: resellerUserId, actorType: 'user',
      relatedUserId: Number(r.sellerId), targetType: 'order', targetId: orderId, severity: 'warning',
      metadata: { profit: money(r.resellerProfit), ref: r.resellerPaidRef, note: text },
    });
    this.tell(Number(r.sellerId), 'Muuzaji hajapokea faida',
      `Muuzaji wa oda #${orderId} anasema hajapokea TZS ${Math.round(money(r.resellerProfit)).toLocaleString('en-US')} (muamala ${r.resellerPaidRef}). Angalia na umlipe.`, orderId);
    return { orderId, state: 'disputed' as const };
  }

  private tell(userId: number, title: string, body: string, orderId: number) {
    if (!this.notifier || !userId) return;
    this.notifier.notify({ userId, type: 'resale_profit', title, body, actionPage: 'MyResales', orderId, sourceType: 'order', sourceId: orderId })
      .catch(() => undefined);
  }
}
