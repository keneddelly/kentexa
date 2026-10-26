/**
 * What an Order becomes once the recipient has the goods, in one place.
 *
 * A seller shipment (Order.source = SELLER_SHIPMENT) is the seller's own sale: the buyer paid
 * the seller directly, KenteXa never held the money (sellerAmount 0, the ZERO FEE RULE), so
 * there is nothing to release. Once the goods are with the recipient and the money is in
 * (paid upfront, or the pay-on-delivery balance collected), the order is COMPLETED.
 *
 * Every other order becomes DELIVERED; the buyer's confirmation (or the 3/5-day auto-confirm)
 * releases the escrow and completes it, exactly as before.
 *
 * Every delivery path calls this after its own steps, inside its transaction, so the seller's
 * order never stays "preparing" after the agent or office has handed the parcel over.
 */
const OPEN = ['paid', 'preparing', 'ready_for_pickup', 'in_transit'];

/** Task states in which an Agent holds a direct-delivery job (and will collect the cash). */
const AGENT_HAS_JOB = ['claimed', 'collected'];

export async function settleOrderOnDelivery(manager: any, orderId: number | null | undefined, now: Date = new Date()): Promise<string | null> {
  if (!orderId) return null;
  const [o] = await manager.query(
    `SELECT id, source::text AS source, status::text AS status, "paymentStatus"::text AS "paymentStatus",
            "paymentMethod"::text AS "paymentMethod", "codBalanceCollected"
       FROM public."order" WHERE id = $1 FOR UPDATE`, [orderId]);
  if (!o) return null;
  const paidInFull = o.paymentStatus === 'paid' && (o.paymentMethod !== 'cod' || !!o.codBalanceCollected);
  if (o.source === 'seller_shipment' && paidInFull && [...OPEN, 'delivered'].includes(o.status)) {
    await manager.query(
      `UPDATE public."order" SET status = 'completed', "deliveredAt" = COALESCE("deliveredAt", $2), "completedAt" = $2
        WHERE id = $1`, [orderId, now]);
    return 'completed';
  }
  if (OPEN.includes(o.status)) {
    await manager.query(`UPDATE public."order" SET status = 'delivered', "deliveredAt" = COALESCE("deliveredAt", $2) WHERE id = $1`,
      [orderId, now]);
    return 'delivered';
  }
  return o.status;
}

/** Whether an Agent has taken this order's direct delivery (they collect the cash at the door). */
export async function agentHoldsDelivery(manager: any, orderId: number): Promise<boolean> {
  const rows: any[] = await manager.query(
    `SELECT 1 FROM public.parcel_pickup_task t JOIN public.parcel p ON p.id = t."parcelId"
      WHERE p."orderId" = $1 AND t."servicePath" = 'direct_delivery' AND t.status = ANY($2) LIMIT 1`,
    [orderId, AGENT_HAS_JOB]);
  return rows.length > 0;
}

/**
 * The seller says the pay-on-delivery cash is in (they delivered it themselves, or took it at
 * the till). Records the collection, keeps a linked POS sale in step, closes any delivery
 * request no Agent has taken, and settles the order. The caller has already checked ownership,
 * that it is a COD order, that a balance is due and that no Agent or office holds the delivery.
 */
export async function recordSellerCodReceived(manager: any, orderId: number, now: Date = new Date()): Promise<string | null> {
  await manager.query(
    `UPDATE public."order" SET "codBalanceCollected" = true, "codBalanceCollectedAt" = $2, "paymentStatus" = 'paid'
      WHERE id = $1`, [orderId, now]);
  // A POS sale behind this order: its balance is paid too, so the till and the order agree.
  await manager.query(
    `UPDATE public.sale s SET "amountPaid" = s.total, "balanceDue" = 0
       FROM public.parcel p WHERE p."orderId" = $1 AND p."saleId" = s.id AND s."balanceDue" > 0`, [orderId]);
  // A delivery request no Agent has taken yet is no longer needed: the goods are with the buyer.
  await manager.query(
    `UPDATE public.parcel_pickup_task t SET status = 'cancelled', "cancelledAt" = now(), "updatedAt" = now()
       FROM public.parcel p WHERE p.id = t."parcelId" AND p."orderId" = $1 AND t.status = 'requested'`, [orderId]);
  const [o] = await manager.query(`SELECT source::text AS source FROM public."order" WHERE id = $1`, [orderId]);
  // Seller's own sale: the cash in hand means the buyer has the goods. A marketplace COD order
  // keeps its delivery state; its escrow flow completes it.
  return o?.source === 'seller_shipment' ? settleOrderOnDelivery(manager, orderId, now) : null;
}

/**
 * Repair sweep (daily): seller shipments whose parcel reached the recipient and whose money is
 * in, but whose order was left open by an older path. Returns how many were completed.
 */
export async function completeSettledSellerShipments(manager: any): Promise<number> {
  const rows: any[] = await manager.query(
    `UPDATE public."order" o SET status = 'completed',
            "deliveredAt" = COALESCE(o."deliveredAt", p."deliveredTime", now()), "completedAt" = now()
       FROM public.parcel p
      WHERE p."orderId" = o.id AND o.source::text = 'seller_shipment'
        AND o.status::text = ANY($1) AND o."paymentStatus"::text = 'paid'
        AND (o."paymentMethod"::text <> 'cod' OR o."codBalanceCollected" = true)
        AND p.status::text IN ('delivered', 'self_pickup')
      RETURNING o.id`, [[...OPEN, 'delivered']]);
  const list = Array.isArray(rows) && Array.isArray(rows[0]) ? rows[0] : rows;
  return Array.isArray(list) ? list.length : 0;
}
