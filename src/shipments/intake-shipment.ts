/**
 * Intake convergence (logistics repair Gate 3).
 *
 * The send form creates a Shipment, then a Journey, then a Parcel. Every
 * other way a parcel enters the network -- a walk-in at a Super Agent desk,
 * a seller's shipment, a marketplace Order received at a hub -- used to
 * create only a Parcel (and an Order), so those parcels had no Shipment for
 * the lifecycle, the status projection and the customer tracking number to
 * hang on.
 *
 * linkIntakeShipment gives such a Parcel its Shipment:
 *
 *   - built from the Parcel's own stored fields (never from request input);
 *   - carrying the SAME customer tracking number the Parcel already has, so
 *     the receipt the customer was handed stays the one number;
 *   - keeping the commerce context: shipment."orderId" is the Parcel's Order;
 *   - idempotent: a Parcel that already has a Shipment is left alone.
 *
 * For a desk walk-in it also writes the Journey the desk actually committed
 * to: one HUB_INTAKE leg naming THAT desk (resolved from the authenticated
 * role context by the caller, never from the request), which is also the
 * party authorized to collect the sender's cash. No transport leg is
 * promised -- the desk decides the onward movement and tenders it.
 */
import { EntityManager } from 'typeorm';
import { projectShipment } from './shipment-projection';

export type IntakeChannel = 'walk_in' | 'seller_shipment' | 'order';

export interface IntakeShipmentInput {
  parcelId: number;
  channel: IntakeChannel;
  /** The authenticated user performing the intake; the fallback "requester". */
  actorUserId: number;
  /** Walk-in only: the desk that received the parcel and the sender's cash. */
  deskHub?: { superAgentId: number; paymentMethod?: string | null };
}

export interface IntakeShipmentResult {
  shipmentId: number;
  journeySelectionId: number | null;
  trackingNumber: string | null;
  created: boolean;
}

const text = (value: unknown, fallback: string): string => {
  const t = typeof value === 'string' ? value.trim() : '';
  return t || fallback;
};

export async function linkIntakeShipment(
  manager: EntityManager,
  input: IntakeShipmentInput,
): Promise<IntakeShipmentResult | null> {
  const [parcel] = await manager.query(
    `SELECT p.id, p."shipmentId", p."orderId", p."journeySelectionId", p."trackingNumber",
            p."senderName", p."senderPhone", p."recipientName", p."buyerPhone",
            p."originCity", p."destinationCity", p."weightKg", p.description,
            p."estimatedShippingFee", p."actualShippingFee", p."declaredValue",
            p."superAgentId", p."destinationSuperAgentId", p."sellerId",
            o."sellerId" AS "orderSellerId"
       FROM public.parcel p
       LEFT JOIN public."order" o ON o.id = p."orderId"
      WHERE p.id = $1 FOR UPDATE OF p`,
    [input.parcelId],
  );
  if (!parcel) return null;
  if (parcel.shipmentId != null) {
    return {
      shipmentId: Number(parcel.shipmentId),
      journeySelectionId: parcel.journeySelectionId == null ? null : Number(parcel.journeySelectionId),
      trackingNumber: parcel.trackingNumber ?? null,
      created: false,
    };
  }

  const requestedByUserId = Number(parcel.sellerId ?? parcel.orderSellerId ?? input.actorUserId);
  const originCity = text(parcel.originCity, 'Tanzania');
  const destinationCity = text(parcel.destinationCity, 'Tanzania');
  const description = text(parcel.description, 'Parcel');
  const weightKg = Number(parcel.weightKg) > 0 ? Number(parcel.weightKg) : 0;
  const fee = parcel.actualShippingFee ?? parcel.estimatedShippingFee;
  const now = new Date();

  let journeySelectionId: number | null = null;
  if (input.channel === 'walk_in' && input.deskHub) {
    const cash = !input.deskHub.paymentMethod || input.deskHub.paymentMethod === 'cash';
    const cargo = {
      description, cargoClass: 'normal', quantity: 1, weightKg,
      declaredValue: parcel.declaredValue == null ? undefined : Number(parcel.declaredValue),
      evidenceLevel: 'desk_received', capturedAt: now.toISOString(),
    };
    const [journey] = await manager.query(
      `INSERT INTO public.journey_selection
         ("requestedByUserId", version, status, "originSnapshot", "destinationSnapshot", "cargoRequirements",
          "expectedCashCollectorType", "expectedCashCollectionLegSequence")
       VALUES ($1, 1, 'committed', $2::jsonb, $3::jsonb, $4::jsonb, $5, $6) RETURNING id`,
      [
        input.actorUserId,
        JSON.stringify({ source: 'desk', label: originCity, city: originCity, superAgentId: input.deskHub.superAgentId }),
        JSON.stringify({ source: 'text', label: destinationCity, city: destinationCity }),
        JSON.stringify(cargo),
        cash ? 'super_agent' : null,
        cash ? 1 : null,
      ],
    );
    journeySelectionId = Number(journey.id);
    await manager.query(
      `INSERT INTO public.journey_leg
         ("journeySelectionId", sequence, type, "fromNode", "toNode", "superAgentId",
          "commitmentLevel", "requiredActorCapability", "executionRequirements")
       VALUES ($1, 1, 'hub_intake', $2::jsonb, $3::jsonb, $4, 'service_confirmed', 'super_agent', $5::jsonb)`,
      [
        journeySelectionId,
        JSON.stringify({ kind: 'sender', label: originCity }),
        JSON.stringify({ kind: 'hub', superAgentId: input.deskHub.superAgentId, city: originCity }),
        input.deskHub.superAgentId,
        JSON.stringify({ composedByServer: true, intake: 'walk_in' }),
      ],
    );
  }

  // The customer keeps the number already on their receipt. If (legacy data)
  // another Shipment somehow holds it, this one is numbered from its own id.
  const [clash] = parcel.trackingNumber
    ? await manager.query(`SELECT id FROM public.shipment WHERE "trackingNumber" = $1 LIMIT 1`, [parcel.trackingNumber])
    : [null];
  const originHubId = parcel.superAgentId == null ? null : Number(parcel.superAgentId);
  const destinationHubId = parcel.destinationSuperAgentId == null ? null : Number(parcel.destinationSuperAgentId);

  const [shipment] = await manager.query(
    `INSERT INTO public.shipment
       ("requestedByUserId", "senderName", "senderPhone", "receiverName", "receiverPhone",
        "originCity", "destinationCity", "itemDescription", "weightKg",
        "pickupOption", "deliveryOption", "priceQuoted", "orderId", "journeySelectionId", "intakeChannel",
        "originHubId", "originHubSource", "destinationHubId", "destinationHubSource", "hubDecidedAt",
        status, "trackingNumber")
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'agent', 'agent', $10, $11, $12, $13,
             $14, $15, $16, $17, $18, 'confirmed', $19)
     RETURNING id`,
    [
      requestedByUserId, parcel.senderName ?? null, parcel.senderPhone ?? null,
      text(parcel.recipientName, 'Recipient'), text(parcel.buyerPhone, '-'),
      originCity, destinationCity, description, weightKg,
      fee == null ? null : Number(fee), parcel.orderId ?? null, journeySelectionId, input.channel,
      originHubId, originHubId == null ? 'not_required' : 'sender_selected',
      destinationHubId, destinationHubId == null ? 'not_required' : 'sender_selected', now,
      clash ? null : parcel.trackingNumber ?? null,
    ],
  );
  const shipmentId = Number(shipment.id);
  let trackingNumber: string | null = clash ? null : parcel.trackingNumber ?? null;
  if (!trackingNumber) {
    trackingNumber = `KTX-SHP-${shipmentId}`;
    await manager.query(`UPDATE public.shipment SET "trackingNumber" = $2 WHERE id = $1`, [shipmentId, trackingNumber]);
  }
  await manager.query(
    `UPDATE public.parcel SET "shipmentId" = $2, "journeySelectionId" = COALESCE("journeySelectionId", $3) WHERE id = $1`,
    [input.parcelId, shipmentId, journeySelectionId],
  );
  // 'confirmed' above is only the starting point: the status the customer
  // sees follows from where the parcel already is.
  await projectShipment(manager, shipmentId, now);
  return { shipmentId, journeySelectionId, trackingNumber, created: true };
}

/**
 * The same, for a caller that is in the middle of its own transaction and
 * must not lose it if the link cannot be written (a desk receiving cash, an
 * Order being received at a hub). A SAVEPOINT confines any failure to the
 * link itself; the intake completes and the failure is reported through
 * `onError`, never swallowed silently.
 */
export async function linkIntakeShipmentWithin(
  manager: EntityManager,
  input: IntakeShipmentInput,
  onError: (error: unknown) => void,
): Promise<IntakeShipmentResult | null> {
  try {
    await manager.query('SAVEPOINT intake_shipment_link');
    const result = await linkIntakeShipment(manager, input);
    await manager.query('RELEASE SAVEPOINT intake_shipment_link');
    return result;
  } catch (error) {
    try {
      await manager.query('ROLLBACK TO SAVEPOINT intake_shipment_link');
    } catch {
      /* the savepoint was never taken: nothing of the link was written */
    }
    onError(error);
    return null;
  }
}
