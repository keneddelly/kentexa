/**
 * The ONE Shipment status projector (logistics repair Gate 3).
 *
 * A Shipment is what the customer asked for; a Parcel and its custody ledger
 * are what physically happened. Before this gate five different services
 * each wrote Shipment.status by hand, for the few transitions they happened
 * to know about. Everything in between was never written: a parcel could be
 * received at the hub, loaded, carried, received again and handed to an Agent
 * while its Shipment still said "confirmed"; `deliveredAt` and `completedAt`
 * were not written by any code at all.
 *
 * Now nothing sets a Shipment's operational status directly. The status and
 * its three timestamps are DERIVED here, from:
 *
 *   - the immutable custody ledger (parcel_custody_event), which is evidence;
 *   - the Parcel's own status, for the legacy paths that move a parcel
 *     without writing a custody event.
 *
 * What stays outside the projector, deliberately: `pending`, `confirmed` and
 * `cancelled` are the customer's own decisions (ShipmentsService), not
 * operational facts, so the projector never confirms and never un-cancels.
 *
 * The projection only moves forward. A late or out-of-order signal (a
 * delayed "departed" webhook after the destination hub already received the
 * parcel) can never take a Shipment backwards, and a timestamp, once set, is
 * never rewritten.
 */
import { EntityManager } from 'typeorm';

export type ShipmentStage = 'pending' | 'confirmed' | 'collected' | 'in_transit' | 'delivered' | 'completed' | 'cancelled';

export interface CustodyFact {
  eventKind: string;
  recordedAt: Date;
  toCustodianType: string | null;
  toCustodianId: number | null;
}

/** Who physically holds the parcel now, as far as the ledger shows. */
export type ShipmentHolder = 'sender' | 'agent' | 'hub' | 'carrier' | 'recipient';

export interface ShipmentState {
  status: ShipmentStage;
  collectedAt: Date | null;
  deliveredAt: Date | null;
  completedAt: Date | null;
}

export interface ShipmentProjection extends ShipmentState {
  shipmentId: number;
  parcelId: number | null;
  parcelStatus: string | null;
  holder: ShipmentHolder;
  /** The custodian's id when the holder is a hub (a Super Agent id); otherwise null. */
  holderHubId: number | null;
  /** True when this call changed the stored Shipment. */
  changed: boolean;
}

// Kentexa's network has the parcel: an Agent collected it from the sender,
// or an origin desk received it.
const COLLECTED_EVENTS = new Set([
  'origin_agent_collected', 'origin_hub_received',
  'seller_collected_by_agent', 'collection_received_at_origin_hub',
]);
// The parcel has left its origin: with a carrier, at a later hub, or out
// with a delivery Agent.
const IN_TRANSIT_EVENTS = new Set([
  'transport_provider_collected', 'parcel_run_loaded', 'parcel_run_unloaded',
  'parcel_run_received', 'destination_hub_received', 'destination_agent_received',
]);
// The recipient has it.
const DELIVERED_EVENTS = new Set(['recipient_agent_delivery', 'recipient_self_pickup']);

const COLLECTED_PARCEL = new Set(['collected_by_agent', 'received_at_hub', 'verified', 'ready_for_dispatch']);
const IN_TRANSIT_PARCEL = new Set([
  'dispatched', 'in_transit', 'transferred_hub', 'arrived_at_hub', 'awaiting_buyer', 'out_for_delivery',
]);
const DELIVERED_PARCEL = new Set(['delivered', 'self_pickup']);

const RANK: Record<ShipmentStage, number> = {
  pending: 0, confirmed: 1, collected: 2, in_transit: 3, delivered: 4, completed: 5, cancelled: -1,
};

const earliest = (facts: CustodyFact[], kinds: Set<string>): Date | null => {
  let best: Date | null = null;
  for (const f of facts) {
    if (!kinds.has(f.eventKind)) continue;
    const at = new Date(f.recordedAt);
    if (!best || at.getTime() < best.getTime()) best = at;
  }
  return best;
};

/**
 * Pure derivation. `current` is what the Shipment row holds; the result is
 * what it should hold. Never goes backwards; never touches a pending or
 * cancelled Shipment.
 *
 * `completed` means nothing is left open. For a Shipment with no marketplace
 * Order that is the moment the recipient takes the parcel (the sender paid at
 * origin). A Shipment that carries an Order's parcel is completed when the
 * Order's own close-out says so -- escrow release and cash-on-delivery
 * remittance are the Order's business, not the projector's.
 */
export function deriveShipmentState(input: {
  current: ShipmentState;
  parcelStatus: string | null;
  custody: CustodyFact[];
  hasOrder: boolean;
  orderStatus: string | null;
  now: Date;
}): ShipmentState {
  const { current, parcelStatus, custody, now } = input;
  if (current.status === 'pending' || current.status === 'cancelled') return current;

  const collectedEvent = earliest(custody, COLLECTED_EVENTS);
  const transitEvent = earliest(custody, IN_TRANSIT_EVENTS);
  const deliveredEvent = earliest(custody, DELIVERED_EVENTS);
  const status = parcelStatus ?? '';

  let derived: ShipmentStage = 'confirmed';
  if (collectedEvent || COLLECTED_PARCEL.has(status)) derived = 'collected';
  if (transitEvent || IN_TRANSIT_PARCEL.has(status)) derived = 'in_transit';
  if (deliveredEvent || DELIVERED_PARCEL.has(status)) derived = 'delivered';
  if (derived === 'delivered' && (!input.hasOrder || input.orderStatus === 'completed')) derived = 'completed';

  const next: ShipmentStage = RANK[derived] > RANK[current.status] ? derived : current.status;
  const reached = (stage: ShipmentStage) => RANK[next] >= RANK[stage];

  const collectedAt = current.collectedAt
    ?? (reached('collected') ? collectedEvent ?? transitEvent ?? deliveredEvent ?? now : null);
  const deliveredAt = current.deliveredAt ?? (reached('delivered') ? deliveredEvent ?? now : null);
  const completedAt = current.completedAt
    ?? (reached('completed') ? (input.hasOrder ? now : deliveredAt ?? now) : null);
  return { status: next, collectedAt, deliveredAt, completedAt };
}

/** Who holds the parcel, from the latest custody fact (facts are oldest first). */
export function deriveHolder(custody: CustodyFact[]): { holder: ShipmentHolder; holderHubId: number | null } {
  const last = custody[custody.length - 1];
  if (!last) return { holder: 'sender', holderHubId: null };
  switch (last.toCustodianType) {
    case 'super_agent': return { holder: 'hub', holderHubId: last.toCustodianId == null ? null : Number(last.toCustodianId) };
    case 'local_agent': return { holder: 'agent', holderHubId: null };
    case 'transport_provider': return { holder: 'carrier', holderHubId: null };
    case 'recipient_contact': return { holder: 'recipient', holderHubId: null };
    // A carrier's "unloaded" claim names no custodian: it is still the
    // carrier's until a hub confirms receipt.
    default: return { holder: last.eventKind === 'parcel_run_unloaded' ? 'carrier' : 'sender', holderHubId: null };
  }
}

const sameInstant = (a: Date | null, b: Date | null) =>
  (a === null && b === null) || (a !== null && b !== null && new Date(a).getTime() === new Date(b).getTime());

/**
 * Reads the truth for one Shipment and stores what follows from it. Safe to
 * call any number of times, from inside the transaction that recorded the
 * operational event or afterwards. Returns null when there is no such
 * Shipment.
 */
export async function projectShipment(
  manager: EntityManager,
  shipmentId: number,
  now: Date = new Date(),
): Promise<ShipmentProjection | null> {
  const [row] = await manager.query(
    `SELECT id, status, "orderId", "collectedAt", "deliveredAt", "completedAt" FROM public.shipment WHERE id = $1`,
    [shipmentId],
  );
  if (!row) return null;
  const [parcel] = await manager.query(
    `SELECT id, status FROM public.parcel WHERE "shipmentId" = $1 ORDER BY id ASC LIMIT 1`,
    [shipmentId],
  );
  const custody: CustodyFact[] = parcel
    ? await manager.query(
        `SELECT "eventKind", "recordedAt", "toCustodianType", "toCustodianId"
           FROM public.parcel_custody_event WHERE "parcelId" = $1 ORDER BY "recordedAt" ASC, id ASC`,
        [parcel.id],
      )
    : [];
  let orderStatus: string | null = null;
  if (row.orderId != null) {
    const [order] = await manager.query(`SELECT status FROM public."order" WHERE id = $1`, [row.orderId]);
    orderStatus = order?.status ?? null;
  }

  const current: ShipmentState = {
    status: row.status, collectedAt: row.collectedAt ?? null,
    deliveredAt: row.deliveredAt ?? null, completedAt: row.completedAt ?? null,
  };
  const next = deriveShipmentState({
    current, parcelStatus: parcel?.status ?? null, custody,
    hasOrder: row.orderId != null, orderStatus, now,
  });
  let changed =
    next.status !== current.status || !sameInstant(next.collectedAt, current.collectedAt) ||
    !sameInstant(next.deliveredAt, current.deliveredAt) || !sameInstant(next.completedAt, current.completedAt);
  if (changed) {
    // Compare-and-set on the status this derivation started from: if a
    // cancellation (or another projection) won the row meanwhile, this
    // write does nothing and the next projection sees the new truth.
    const updated = await manager.query(
      `UPDATE public.shipment
          SET status = $2, "collectedAt" = $3, "deliveredAt" = $4, "completedAt" = $5, "updatedAt" = now()
        WHERE id = $1 AND status = $6 RETURNING id`,
      [shipmentId, next.status, next.collectedAt, next.deliveredAt, next.completedAt, current.status],
    );
    const rows = Array.isArray(updated) && Array.isArray(updated[0]) ? updated[0] : updated;
    changed = Array.isArray(rows) && rows.length === 1;
  }
  return {
    shipmentId: Number(row.id),
    parcelId: parcel ? Number(parcel.id) : null,
    parcelStatus: parcel?.status ?? null,
    ...(changed || next.status === current.status ? next : current),
    ...deriveHolder(custody),
    changed,
  };
}

/** The same, starting from a Parcel. A Parcel with no Shipment is left alone. */
export async function projectShipmentForParcel(
  manager: EntityManager,
  parcelId: number,
  now?: Date,
): Promise<ShipmentProjection | null> {
  const [parcel] = await manager.query(`SELECT "shipmentId" FROM public.parcel WHERE id = $1`, [parcelId]);
  if (!parcel || parcel.shipmentId == null) return null;
  return projectShipment(manager, Number(parcel.shipmentId), now);
}

/**
 * For callers outside a transaction, where a projection problem must never
 * fail the operation that already committed: the read paths re-project, so
 * nothing is lost.
 */
export async function projectShipmentForParcelSafely(manager: EntityManager, parcelId: number): Promise<void> {
  try {
    await projectShipmentForParcel(manager, parcelId);
  } catch {
    /* re-projected on the next read (ShipmentsService.trackShipment / getMyShipments) */
  }
}
