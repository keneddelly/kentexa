import { EntityManager } from 'typeorm';
import { ensureOrderParcel, OrderParcelResult } from '../orders/order-parcel';
import { BatchParcelStatus } from './entities/batch-parcel.entity';

/**
 * Dar "KenteXa delivery" van runs on the one KenteXa waybill (owner 2026-10-24).
 *
 * The van runs keep their own batch table (zones, cut-off, departure), but every
 * batch order now also has the network Parcel with its database waybill
 * (KTX + 10 digits), linked by the order. Each van step moves that Parcel
 * forward and writes one tracking line, so the buyer and anyone holding the
 * waybill see the same history as for any other KenteXa parcel.
 *
 * Best effort by design: the van step itself is the operational truth here,
 * so a problem mirroring it is logged and never undoes or blocks the step.
 */

/** Van step -> network parcel status. */
export const BATCH_TO_PARCEL_STATUS: Record<BatchParcelStatus, string | null> = {
  [BatchParcelStatus.AWAITING_HANDOVER]: null,
  [BatchParcelStatus.AT_HUB]: 'received_at_hub',
  [BatchParcelStatus.ON_VAN]: 'in_transit',
  [BatchParcelStatus.AT_ZONE]: 'arrived_at_hub',
  [BatchParcelStatus.OUT_FOR_DELIVERY]: 'out_for_delivery',
  [BatchParcelStatus.DELIVERED]: 'delivered',
  [BatchParcelStatus.RETURNED]: 'returned',
};

const RANK: Record<string, number> = {
  pending: 0, collection_requested: 0, received_at_hub: 1, in_transit: 2,
  arrived_at_hub: 3, out_for_delivery: 4, delivered: 5, returned: 5, self_pickup: 5,
};

/** Only ever forward; a finished parcel is never moved. Pure. */
export function shouldMoveParcel(current: string | null | undefined, next: string | null | undefined): boolean {
  if (!next) return false;
  const from = RANK[String(current ?? 'pending')] ?? 0;
  return from < 5 && (RANK[next] ?? 0) > from;
}

const NOTES: Record<string, string> = {
  received_at_hub: 'Imepokewa Kariakoo, inasubiri van',
  in_transit: 'Iko kwenye van ya KenteXa',
  arrived_at_hub: 'Imefika kwenye eneo lako',
  out_for_delivery: 'Wakala anaileta',
  delivered: 'Imefikishwa',
  returned: 'Imerudishwa Kariakoo',
};

/** The batch order's network Parcel (and waybill), created when missing. */
export async function ensureBatchOrderParcel(manager: EntityManager, orderId: number): Promise<OrderParcelResult | null> {
  try {
    return await manager.transaction((m) => ensureOrderParcel(m, orderId));
  } catch (e) {
    console.warn(`Batch order #${orderId} waybill not created:`, (e as any)?.message ?? e);
    return null;
  }
}

/**
 * Move the network Parcels of the given batch parcels to match a van step, with
 * one tracking line each. Selects batch parcels by id, or by batch (and zone).
 */
export async function mirrorBatchStep(
  manager: EntityManager,
  where: { batchParcelId?: number; batchId?: number; zoneId?: number },
  step: BatchParcelStatus,
): Promise<number> {
  const next = BATCH_TO_PARCEL_STATUS[step];
  if (!next) return 0;
  try {
    const filters: string[] = []; const params: any[] = [];
    if (where.batchParcelId != null) { params.push(where.batchParcelId); filters.push(`bp.id = $${params.length}`); }
    if (where.batchId != null) { params.push(where.batchId); filters.push(`bp."batchId" = $${params.length}`); }
    if (where.zoneId != null) { params.push(where.zoneId); filters.push(`bp."zoneId" = $${params.length}`); }
    if (!filters.length) return 0;
    const rows: any[] = await manager.query(
      `SELECT p.id, p.status::text AS status, z.name AS "zoneName"
         FROM public.batch_parcel bp
         JOIN public.parcel p ON p."orderId" = bp."orderId"
         LEFT JOIN public.delivery_zone z ON z.id = bp."zoneId"
        WHERE ${filters.join(' AND ')}`, params);
    let moved = 0;
    for (const r of rows) {
      if (!shouldMoveParcel(r.status, next)) continue;
      await manager.transaction(async (m) => {
        await m.query(`UPDATE public.parcel SET status = $2 WHERE id = $1`, [r.id, next]);
        await m.query(`INSERT INTO public.parcel_tracking ("parcelId", status, city, note, "updatedBy", "handlerType")
          VALUES ($1, $2, $3, $4, 'KenteXa Van', 'system')`,
        [r.id, next, next === 'received_at_hub' ? 'Kariakoo' : (r.zoneName ?? 'Dar es Salaam'), NOTES[next] ?? null]);
      });
      moved++;
    }
    return moved;
  } catch (e) {
    console.warn(`Van step ${step} not mirrored to the waybill:`, (e as any)?.message ?? e);
    return 0;
  }
}
