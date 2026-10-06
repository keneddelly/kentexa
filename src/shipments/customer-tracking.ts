/**
 * One customer tracking number (logistics repair Gate 3).
 *
 * The number a customer is given -- on the booking confirmation, the desk
 * receipt, every SMS -- is the Shipment's tracking number. From this gate a
 * Parcel born from a Shipment carries that SAME number, so the desk, the
 * Agent, the carrier and the customer all read one reference.
 *
 * Parcels created before this gate were stamped with a second, internal
 * number (KTX-PCL-n) that their senders never saw. resolveParcelTrackingNumber
 * is what lets the customer's number find those too, at every door that
 * looks a parcel up by number.
 */
import { EntityManager } from 'typeorm';

const TRACKING_NUMBER = /^[A-Za-z0-9][A-Za-z0-9-]{2,63}$/;

/**
 * The parcel's own stored number for whatever number the caller holds.
 *
 *  - a number a Parcel already carries is returned unchanged (nothing that
 *    works today changes);
 *  - otherwise, if a Shipment carries it and that Shipment has a Parcel, the
 *    Parcel's number is returned;
 *  - anything else is returned unchanged, for the caller's own "not found".
 */
export async function resolveParcelTrackingNumber(manager: EntityManager, raw: unknown): Promise<string> {
  const given = typeof raw === 'string' ? raw.trim() : '';
  if (!TRACKING_NUMBER.test(given)) return typeof raw === 'string' ? raw : '';
  const rows: Array<{ own: string | null; viaShipment: string | null }> = await manager.query(
    `SELECT (SELECT p."trackingNumber" FROM public.parcel p WHERE p."trackingNumber" = $1 LIMIT 1) AS own,
            (SELECT p."trackingNumber" FROM public.shipment s
               JOIN public.parcel p ON p."shipmentId" = s.id
              WHERE s."trackingNumber" = $1 AND p."trackingNumber" IS NOT NULL
              ORDER BY p.id ASC LIMIT 1) AS "viaShipment"`,
    [given],
  );
  return rows[0]?.own ?? rows[0]?.viaShipment ?? given;
}

/** The number to show a customer for a parcel: its Shipment's, else its own. */
export async function customerTrackingNumberForParcel(manager: EntityManager, parcelId: number): Promise<string | null> {
  const rows: Array<{ customer: string | null }> = await manager.query(
    `SELECT COALESCE(s."trackingNumber", p."trackingNumber") AS customer
       FROM public.parcel p LEFT JOIN public.shipment s ON s.id = p."shipmentId"
      WHERE p.id = $1`,
    [parcelId],
  );
  return rows[0]?.customer ?? null;
}
