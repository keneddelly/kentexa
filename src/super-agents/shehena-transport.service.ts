import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Offices and the transport they use (owner 2026-10-26). KenteXa is the one network
 * that connects them; the customer never sees the transport (they deal with the
 * office), and the fare stays between the office and the transporter.
 *
 * An office's transport list is worked out from what already exists - no partner
 * table:
 *   - own:     a transporter of the same business (an office and its own vehicles);
 *   - partner: a transporter who joined KenteXa through this office's invitation,
 *              or who carried this office's shehena or one of its parcels before.
 * The office may still type a transporter that is not on KenteXa (allowed while
 * KenteXa is growing).
 */
export interface OfficeTransport {
  id: number;
  name: string;
  type: string | null;
  phone: string | null;
  relation: 'own' | 'partner';
}

export const SHEHENA_TRANSPORT_MESSAGES = {
  notYours: 'Msafirishaji huyu si wako wala mshirika wako bado. Mwalike kwanza, au andika jina lake.',
} as const;

const LIVE = `tp.status::text IN ('verified', 'active')`;

@Injectable()
export class ShehenaTransportService {
  private columnReady = false;
  private checkedAt = 0;

  constructor(private readonly db: DataSource) {}

  /** bulk_shipment."transportProviderId" exists once migration 1793000000000 ran. */
  async ready(): Promise<boolean> {
    if (!this.columnReady && Date.now() - this.checkedAt > 60_000) {
      this.checkedAt = Date.now();
      try {
        const [row] = await this.db.query(`SELECT 1 AS ok FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'bulk_shipment' AND column_name = 'transportProviderId'`);
        this.columnReady = Boolean(row?.ok);
      } catch { this.columnReady = false; }
    }
    return this.columnReady;
  }

  async listFor(officeId: number): Promise<OfficeTransport[]> {
    const used = (await this.ready())
      ? `UNION SELECT b."transportProviderId", 'partner' FROM public.bulk_shipment b
           WHERE b."superAgentId" = $1 AND b."transportProviderId" IS NOT NULL`
      : '';
    const rows: any[] = await this.db.query(
      `WITH links(pid, relation) AS (
         SELECT tp.id, 'own' FROM public.super_agent sa
           JOIN public.operational_workspace w ON w.id = sa."workspaceId"
           JOIN public.transport_provider tp ON tp."businessId" = w."businessId"
          WHERE sa.id = $1
         UNION SELECT tp.id, 'partner' FROM public.partner_invitation pi
           JOIN public.transport_provider tp ON tp."userId" = pi."joinedUserId"
          WHERE pi."invitedBySuperAgentId" = $1 AND pi."roleOffered"::text = 'transport_provider'
            AND pi.status::text IN ('joined', 'confirmed')
         UNION SELECT ta."providerId", 'partner' FROM public.transport_assignment ta
           JOIN public.super_agent sa ON sa."userId" = ta."assignedById"
          WHERE sa.id = $1
         ${used}
       )
       SELECT tp.id, tp.name, tp.type::text AS type, COALESCE(tp."contactPhone", tp."whatsappPhone") AS phone,
              CASE WHEN bool_or(l.relation = 'own') THEN 'own' ELSE 'partner' END AS relation
         FROM links l JOIN public.transport_provider tp ON tp.id = l.pid
        WHERE ${LIVE}
        GROUP BY tp.id, tp.name, tp.type, tp."contactPhone", tp."whatsappPhone"
        ORDER BY (CASE WHEN bool_or(l.relation = 'own') THEN 0 ELSE 1 END), tp.name`,
      [officeId]);
    return rows.map((r) => ({ id: Number(r.id), name: String(r.name), type: r.type ?? null, phone: r.phone ?? null, relation: r.relation }));
  }

  /** The transporter chosen at dispatch must be the office's own or a partner. */
  async assertUsable(officeId: number, providerId: number): Promise<OfficeTransport> {
    const found = (await this.listFor(officeId)).find((t) => t.id === Number(providerId));
    if (!found) throw new ForbiddenException(SHEHENA_TRANSPORT_MESSAGES.notYours);
    return found;
  }

  async link(bulkShipmentId: number, providerId: number): Promise<void> {
    if (!(await this.ready())) return;
    await this.db.query(`UPDATE public.bulk_shipment SET "transportProviderId" = $2 WHERE id = $1`, [bulkShipmentId, providerId]);
  }

  /** The transporter's view: the shehena it carries, from which office to which. */
  async forTransporter(userId: number) {
    const providers: any[] = await this.db.query(`SELECT id, "userId" FROM public.transport_provider tp WHERE tp."userId" = $1`, [userId]);
    if (!providers.length) return { providers: [], shehena: [] };
    if (!(await this.ready())) return { providers: providers.map((p) => Number(p.id)), shehena: [] };
    const rows: any[] = await this.db.query(
      `SELECT b.id, b."shipmentCode" AS code, b.status::text AS status, b."originCity" AS "originCity",
              b."destinationCity" AS "destinationCity", b."totalParcels" AS parcels, b."totalWeightKg" AS "weightKg",
              b."totalShippingCost" AS fare, b."transportRef" AS ref, b."dispatchTime" AS "dispatchedAt",
              o."businessName" AS "fromOffice", o.phone AS "fromPhone",
              d."businessName" AS "toOffice", d.phone AS "toPhone"
         FROM public.bulk_shipment b
         LEFT JOIN public.super_agent o ON o.id = b."superAgentId"
         LEFT JOIN public.super_agent d ON d.id = b."lastMileSuperAgentId"
        WHERE b."transportProviderId" = ANY($1::int[])
        ORDER BY b.id DESC LIMIT 50`,
      [providers.map((p) => Number(p.id))]);
    return {
      providers: providers.map((p) => Number(p.id)),
      shehena: rows.map((r) => ({ ...r, id: Number(r.id), parcels: Number(r.parcels) || 0, weightKg: Number(r.weightKg) || 0, fare: Number(r.fare) || 0 })),
    };
  }
}
