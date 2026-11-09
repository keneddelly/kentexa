import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';
import { RESALE_NOTE_MAX, assertSellingPrice, money, sellingFloor } from './resale-rules';

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
  constructor(private readonly db: DataSource, private readonly events: ActivityEventService) {}

  private async product(productId: number) {
    const [p] = await this.db.query(
      `SELECT p.id, p.name, p.images, p."basePrice", p."displayPrice", p.stock, p."isActive", p."isAvailable",
              p."resaleOpen", p."resalePrice", p."resaleMinPrice", p."sellerId"
         FROM public.product p WHERE p.id = $1::int`, [productId]);
    if (!p) throw new NotFoundException('Bidhaa haipo.');
    return p;
  }

  /** The "Uza tena" screen: the supplier price, the floor and the person's own offer. Signed in only. */
  async terms(productId: number, userId: number) {
    const p = await this.product(productId);
    const own = Number(p.sellerId) === Number(userId);
    // The supplier itself sees its own terms even while closed (to open them again).
    if (own) {
      return { open: !!p.resaleOpen && money(p.resalePrice) > 0, productId: p.id, own: true, publicPrice: money(p.basePrice),
        supplierPrice: p.resalePrice == null ? null : money(p.resalePrice), minPrice: p.resaleMinPrice == null ? null : money(p.resaleMinPrice) };
    }
    if (!p.resaleOpen || !(money(p.resalePrice) > 0)) return { open: false, productId: p.id };
    const [mine] = await this.db.query(
      `SELECT id, price, note, "isActive" FROM public.resale_offer WHERE "productId" = $1::int AND "resellerUserId" = $2::int`,
      [p.id, userId]);
    return {
      open: true,
      productId: p.id,
      own: false,
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

  /** "Bidhaa za kuuza": products open for reselling, newest first, with the profit at the shop price. */
  async openProducts(userId: number, page = 1) {
    const size = 30;
    const rows: any[] = await this.db.query(
      `SELECT p.id, p.name, p.images, p."basePrice", p."resalePrice", p."resaleMinPrice", p.stock,
              COALESCE(u."storeName", u.name) AS "supplierName"
         FROM public.product p LEFT JOIN public."user" u ON u.id = p."sellerId"
        WHERE p."resaleOpen" = true AND p."resalePrice" > 0 AND p."isActive" = true AND p."isAvailable" = true
          AND p.stock > 0 AND p."sellerId" <> $1::int
        ORDER BY p."updatedAt" DESC LIMIT ${size} OFFSET $2::int`, [userId, (Math.max(1, page) - 1) * size]);
    return rows.map((r) => ({
      id: r.id, name: r.name, image: firstImage(r.images), supplierName: r.supplierName,
      publicPrice: money(r.basePrice), supplierPrice: money(r.resalePrice), floor: sellingFloor(r),
      profitAtShopPrice: money(money(r.basePrice) - money(r.resalePrice)), stock: Number(r.stock) || 0,
    }));
  }
}
