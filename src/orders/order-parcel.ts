import { EntityManager } from 'typeorm';
import { linkIntakeShipmentWithin } from '../shipments/intake-shipment';

/**
 * One KenteXa waybill for every order, wherever it came from (owner 2026-10-24:
 * "we need one centralized waybill for KenteXa that is known no matter where the
 * order comes from").
 *
 * A marketplace order that goes through the KenteXa network (shippingMethod
 * 'agent') used to get its Parcel -- and so its waybill -- only when an office
 * typed the order number at its counter. Now the Parcel exists from the moment
 * the order is confirmed (pay on delivery / Lipa at checkout, or online payment
 * received). The database gives the Parcel its waybill (KTX + 10 digits), and
 * every lookup and tracking page accepts it.
 *
 *   - status PENDING, no office guessed: an office is set only when the seller
 *     says which office they are taking it to (or the office receives it);
 *   - its Shipment (the shared lifecycle) is linked once an office is known, so
 *     the Shipment's hub decision is written once, at insert, with that office
 *     (shipment-hub-selection: a decision is never rewritten);
 *   - idempotent: an order that already has its Parcel keeps it; the counter's
 *     receive step and the agent collection request both reuse it;
 *   - never for a digital product, a cancelled or unpaid order, or a seller's
 *     own delivery (nothing for the network to carry).
 */

export const NETWORK_SHIPPING_METHODS = ['agent'] as const;

const CONFIRMED_STATUSES = ['paid', 'preparing'];

export interface OrderParcelResult {
  parcelId: number;
  trackingNumber: string | null;
  waybillNumber: string | null;
  created: boolean;
  officeId: number | null;
}

type Db = Pick<EntityManager, 'query'>;

/** Should this order travel with a KenteXa waybill? Pure: from the order row. */
export function needsNetworkParcel(order: {
  shippingMethod?: string | null; status?: string | null; productType?: string | null;
}): boolean {
  return (NETWORK_SHIPPING_METHODS as readonly string[]).includes(String(order.shippingMethod || ''))
    && CONFIRMED_STATUSES.includes(String(order.status || ''))
    && order.productType !== 'digital';
}

/**
 * The order's Parcel, created when missing. Call inside the caller's transaction.
 * `officeId`: the office the seller is taking it to; set only while the parcel is
 * still waiting for intake (never moves a parcel an office already holds).
 */
export async function ensureOrderParcel(
  manager: EntityManager, orderId: number, opts: { officeId?: number | null; actorUserId?: number | null } = {},
): Promise<OrderParcelResult | null> {
  const [order] = await manager.query(
    `SELECT o.id, o.status::text AS status, o."shippingMethod", o."trackingNumber", o."sellerId", o."buyerId",
            o."deliveryAddress", o.phone, o."recipientName", o."manualProductName", o."baseAmount",
            o."deliveryFeeAmount", o.quantity, p.name AS "productName", p."productType",
            s."businessLocation" AS "sellerLocation", b.phone AS "buyerUserPhone", b.name AS "buyerName"
       FROM public."order" o
       LEFT JOIN public.product p ON p.id = o."productId"
       LEFT JOIN public."user" s ON s.id = o."sellerId"
       LEFT JOIN public."user" b ON b.id = o."buyerId"
      WHERE o.id = $1 FOR UPDATE OF o`, [orderId]);
  if (!order || !needsNetworkParcel(order)) return null;

  const office = opts.officeId ? await activeOffice(manager, opts.officeId) : null;
  const linked: any[] = await manager.query(
    `SELECT id, status::text AS status, "trackingNumber", "waybillNumber", "superAgentId", "shipmentId"
       FROM public.parcel WHERE "orderId" = $1 ORDER BY id ASC FOR UPDATE`, [orderId]);
  if (linked.length) {
    const p = linked[0];
    let officeId = p.superAgentId == null ? null : Number(p.superAgentId);
    if (office && ['pending', 'collection_requested'].includes(p.status) && officeId !== office.id) {
      // The office the parcel is now addressed to: its "coming to this hub" list.
      await manager.query(`UPDATE public.parcel SET "superAgentId" = $2 WHERE id = $1`, [p.id, office.id]);
      officeId = office.id;
    }
    if (officeId != null && p.shipmentId == null) await linkShipment(manager, Number(p.id), opts.actorUserId ?? order.sellerId);
    return { parcelId: Number(p.id), trackingNumber: p.trackingNumber ?? null, waybillNumber: p.waybillNumber ?? null, created: false, officeId };
  }

  const trackingNumber = order.trackingNumber || `KTX-ORD-${order.id}`;
  const originCity = String(order.sellerLocation || '').split(',')[0].trim() || office?.city || 'Tanzania';
  const destinationCity = String(order.deliveryAddress || '').split(',')[0].trim() || 'Tanzania';
  const declaredValue = Number(order.baseAmount);
  const [created] = await manager.query(
    `INSERT INTO public.parcel
       ("trackingNumber", status, "orderId", "sellerId", "buyerId", "superAgentId", "originCity", "destinationCity",
        "deliveryAddress", "buyerPhone", "recipientName", description, "declaredValue", "declaredValueCurrency",
        "estimatedShippingFee", source)
     VALUES ($1, 'pending', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'TZS', $13, 'online_order')
     RETURNING id, "trackingNumber", "waybillNumber"`,
    [
      trackingNumber, order.id, order.sellerId ?? null, order.buyerId ?? null, office?.id ?? null,
      originCity, destinationCity, order.deliveryAddress ?? null,
      order.phone || order.buyerUserPhone || null, order.recipientName || order.buyerName || null,
      order.manualProductName || order.productName || null,
      Number.isFinite(declaredValue) && declaredValue > 0 ? declaredValue : null,
      Number(order.deliveryFeeAmount) || 0,
    ]);
  if (office) await linkShipment(manager, Number(created.id), opts.actorUserId ?? order.sellerId ?? order.buyerId);
  return {
    parcelId: Number(created.id), trackingNumber: created.trackingNumber ?? trackingNumber,
    waybillNumber: created.waybillNumber ?? null, created: true, officeId: office?.id ?? null,
  };
}

/**
 * The same, for a caller in the middle of its own important transaction (a
 * payment being confirmed, an order being placed): a SAVEPOINT keeps any failure
 * here inside this step. The payment or order still completes; the counter's
 * receive step creates the parcel later, as before.
 */
export async function ensureOrderParcelWithin(
  manager: EntityManager, orderId: number, opts: { officeId?: number | null; actorUserId?: number | null } = {},
): Promise<OrderParcelResult | null> {
  try {
    await manager.query('SAVEPOINT order_parcel');
    const result = await ensureOrderParcel(manager, orderId, opts);
    await manager.query('RELEASE SAVEPOINT order_parcel');
    return result;
  } catch (error) {
    try { await manager.query('ROLLBACK TO SAVEPOINT order_parcel'); } catch { /* no savepoint taken */ }
    console.warn(`Order #${orderId} parcel not created yet:`, (error as any)?.message ?? error);
    return null;
  }
}

/** Its Shipment, with the office (parcel.superAgentId) as the one hub decision. */
async function linkShipment(manager: EntityManager, parcelId: number, actorUserId: unknown) {
  await linkIntakeShipmentWithin(manager, { parcelId, channel: 'order', actorUserId: Number(actorUserId ?? 0) },
    (error) => console.warn(`Parcel ${parcelId} shipment link failed:`, (error as any)?.message ?? error));
}

async function activeOffice(db: Db, officeId: number): Promise<{ id: number; city: string | null } | null> {
  const id = Number(officeId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [row] = await db.query(
    `SELECT id, city FROM public.super_agent WHERE id = $1 AND status = 'active' AND "isTrainingOffice" = false`, [id]);
  return row ? { id: Number(row.id), city: row.city ?? null } : null;
}
