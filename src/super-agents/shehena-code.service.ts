import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { DataSource } from 'typeorm';

/**
 * Shehena hand-over code (owner approved 2026-11-02, sketch "Hand-over Codes").
 *
 * When an office dispatches a shehena, KenteXa makes one 6-digit code. The sending staff
 * write it on the package and the receiving office gets it in the dispatch SMS.
 *   - Office -> transport: a transporter on KenteXa types it to confirm "Nimepokea shehena"
 *     (a bus that is not on KenteXa: nothing changes, the office types the ticket).
 *   - Transport -> receiving office: the office types it and every parcel in the shehena
 *     arrives in one step; a lost label: receive without it by giving a reason (saved).
 * Five wrong codes stop code entry for that shehena (the reason path stays open).
 * Before migration 1794400000000 runs, everything here is off and nothing changes.
 */
export const SHEHENA_CODE_MAX_ATTEMPTS = 5;

export const SHEHENA_CODE_MESSAGES = {
  wrong: 'Namba ya shehena si sahihi. Angalia namba iliyoandikwa kwenye mzigo.',
  locked: 'Umekosea namba mara 5. Pokea kwa kueleza sababu (mf. lebo imepotea).',
  needCodeOrReason: 'Andika namba ya shehena, au eleza kwa nini huna namba.',
  reasonShort: 'Eleza sababu kwa maneno machache (angalau herufi 5).',
  notYours: 'Shehena hii haiji kwenye ofisi yako.',
  notCarrier: 'Shehena hii haijapakiwa kwenye usafiri wako.',
  notOnTheWay: 'Shehena hii haiko njiani tena.',
  missing: 'Shehena haipatikani.',
} as const;

export const newShehenaCode = () => String(randomInt(100000, 1000000));

/** Pure: is this what the person typed? Spaces are ignored. */
export const sameShehenaCode = (stored: string | null | undefined, typed: unknown) =>
  !!stored && typeof typed === 'string' && typed.replace(/\s+/g, '') === stored;

@Injectable()
export class ShehenaCodeService {
  private columnReady = false;
  private checkedAt = 0;

  constructor(private readonly db: DataSource) {}

  /** bulk_shipment."handoverCode" exists once migration 1794400000000 ran. */
  async ready(): Promise<boolean> {
    if (!this.columnReady && Date.now() - this.checkedAt > 60_000) {
      this.checkedAt = Date.now();
      try {
        const [row] = await this.db.query(`SELECT 1 AS ok FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'bulk_shipment' AND column_name = 'handoverCode'`);
        this.columnReady = Boolean(row?.ok);
      } catch { this.columnReady = false; }
    }
    return this.columnReady;
  }

  /** Called once the shehena is dispatched: its code (kept if it already has one), or null before the migration. */
  async issue(bulkId: number): Promise<string | null> {
    if (!(await this.ready())) return null;
    const [row] = await this.db.query(
      `UPDATE public.bulk_shipment SET "handoverCode" = COALESCE("handoverCode", $2) WHERE id = $1 RETURNING "handoverCode"`,
      [bulkId, newShehenaCode()]);
    return row?.handoverCode ?? null;
  }

  /** The sending office's own dispatched shehena with their codes (to write on the package again). */
  async sentBy(officeId: number) {
    if (!(await this.ready())) return [];
    const rows: any[] = await this.db.query(
      `SELECT b.id, b."shipmentCode", b."destinationCity", b."totalParcels", b."handoverCode", b.status::text AS status,
              b."dispatchTime", b."transportCompany", b."transportConfirmedAt", b."arrivedTime"
         FROM public.bulk_shipment b
        WHERE b."superAgentId" = $1 AND b.status::text IN ('dispatched', 'arrived') AND b."handoverCode" IS NOT NULL
        ORDER BY b."dispatchTime" DESC NULLS LAST LIMIT 20`, [officeId]);
    return rows.map((r) => ({ ...r, id: Number(r.id), totalParcels: Number(r.totalParcels) || 0 }));
  }

  /** Shehena on the way to this office (never the code: it is on the package and in the office's SMS). */
  async incomingFor(officeId: number) {
    if (!(await this.ready())) return [];
    const rows: any[] = await this.db.query(
      `SELECT b.id, b."shipmentCode", b."originCity", b."totalParcels", b."dispatchTime", b."transportCompany",
              b."transportRef", b."transportConfirmedAt", o."businessName" AS "fromOffice", o.phone AS "fromPhone"
         FROM public.bulk_shipment b
         LEFT JOIN public.super_agent o ON o.id = b."superAgentId"
        WHERE b."lastMileSuperAgentId" = $1 AND b.status::text = 'dispatched'
        ORDER BY b."dispatchTime" ASC NULLS LAST LIMIT 30`, [officeId]);
    return rows.map((r) => ({ ...r, id: Number(r.id), totalParcels: Number(r.totalParcels) || 0 }));
  }

  /** A wrong code counts; the fifth stops code entry for this shehena. */
  private async checkCode(bulk: any, code: unknown) {
    if (Number(bulk.codeAttempts) >= SHEHENA_CODE_MAX_ATTEMPTS) throw new BadRequestException(SHEHENA_CODE_MESSAGES.locked);
    if (!sameShehenaCode(bulk.handoverCode, code)) {
      await this.db.query(`UPDATE public.bulk_shipment SET "codeAttempts" = "codeAttempts" + 1 WHERE id = $1`, [bulk.id]);
      throw new BadRequestException(Number(bulk.codeAttempts) + 1 >= SHEHENA_CODE_MAX_ATTEMPTS
        ? SHEHENA_CODE_MESSAGES.locked : SHEHENA_CODE_MESSAGES.wrong);
    }
  }

  private async bulk(bulkId: number) {
    if (!(await this.ready())) throw new NotFoundException(SHEHENA_CODE_MESSAGES.missing);
    const [b] = await this.db.query(
      `SELECT id, status::text AS status, "superAgentId", "lastMileSuperAgentId", "transportProviderId", "handoverCode",
              "codeAttempts", "transportConfirmedAt", "destinationCity", "transportCompany"
         FROM public.bulk_shipment WHERE id = $1`, [bulkId]);
    if (!b) throw new NotFoundException(SHEHENA_CODE_MESSAGES.missing);
    return b;
  }

  /**
   * Office -> transport: the transporter on KenteXa (the one the office loaded it onto)
   * types the code. Returns the shehena's parcels for the waybill note.
   */
  async transporterConfirm(userId: number, bulkId: number, code: unknown) {
    const b = await this.bulk(bulkId);
    const [carrier] = b.transportProviderId == null ? [] : await this.db.query(
      `SELECT id, name FROM public.transport_provider WHERE id = $1 AND "userId" = $2`, [b.transportProviderId, userId]);
    if (!carrier) throw new ForbiddenException(SHEHENA_CODE_MESSAGES.notCarrier);
    if (b.transportConfirmedAt) return { id: Number(b.id), confirmedAt: b.transportConfirmedAt, carrierName: carrier.name, replay: true };
    if (b.status !== 'dispatched') throw new ConflictException(SHEHENA_CODE_MESSAGES.notOnTheWay);
    await this.checkCode(b, code);
    const [row] = await this.db.query(
      `UPDATE public.bulk_shipment SET "transportConfirmedAt" = COALESCE("transportConfirmedAt", now()) WHERE id = $1 RETURNING "transportConfirmedAt"`,
      [b.id]);
    return { id: Number(b.id), confirmedAt: row?.transportConfirmedAt ?? new Date(), carrierName: String(carrier.name), replay: false };
  }

  /**
   * Transport -> receiving office: the code, or a reason when the label is lost. Returns the
   * parcels still to receive; the caller receives each one with the normal arrival rule.
   */
  async checkReceive(officeId: number, bulkId: number, input: { code?: unknown; reason?: unknown }) {
    const b = await this.bulk(bulkId);
    if (Number(b.lastMileSuperAgentId) !== Number(officeId)) throw new ForbiddenException(SHEHENA_CODE_MESSAGES.notYours);
    if (b.status !== 'dispatched') throw new ConflictException(SHEHENA_CODE_MESSAGES.notOnTheWay);
    const code = typeof input?.code === 'string' ? input.code.trim() : '';
    const reason = typeof input?.reason === 'string' ? input.reason.trim().slice(0, 300) : '';
    if (code) await this.checkCode(b, code);
    else if (!reason) throw new BadRequestException(SHEHENA_CODE_MESSAGES.needCodeOrReason);
    else if (reason.length < 5) throw new BadRequestException(SHEHENA_CODE_MESSAGES.reasonShort);
    const parcels: any[] = await this.db.query(
      `SELECT "trackingNumber" FROM public.parcel
        WHERE "bulkShipmentId" = $1 AND status::text IN ('dispatched', 'in_transit', 'arrived_at_hub') ORDER BY id`, [b.id]);
    return { withCode: !!code, reason: code ? null : reason, trackingNumbers: parcels.map((p) => String(p.trackingNumber)) };
  }

  async markArrived(bulkId: number, reason: string | null) {
    await this.db.query(
      `UPDATE public.bulk_shipment SET status = 'arrived', "arrivedTime" = COALESCE("arrivedTime", now()),
              "receivedWithoutCodeReason" = $2 WHERE id = $1 AND status::text = 'dispatched'`, [bulkId, reason]);
  }
}
