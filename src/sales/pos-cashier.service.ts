import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { DataSource } from 'typeorm';

/**
 * "Badilisha mhudumu" (owner approved 2026-11-03). The shop's cashiers are its owner and its
 * active team members allowed to use the POS. Each gets a 4-digit PIN; the till keeps the salted
 * hashes so it can switch cashier without internet. The PIN marks who is on duty (sales, receipts,
 * shifts); access to the till itself stays the logged-in account's own POS permission.
 */
export const PIN_TEXT = {
  notReady: 'PIN za wahudumu bado hazijawashwa.',
  badPin: 'PIN ni tarakimu 4.',
  notCashier: 'Mtu huyu si mhudumu wa duka hili.',
} as const;

export const hashPin = (salt: string, pin: string) => createHash('sha256').update(`${salt}${pin}`).digest('hex');

@Injectable()
export class PosCashierService {
  private ready = false;
  private checkedAt = 0;

  constructor(private readonly db: DataSource) {}

  async tablesReady(): Promise<boolean> {
    if (!this.ready && Date.now() - this.checkedAt > 60_000) {
      this.checkedAt = Date.now();
      try {
        const [r] = await this.db.query(`SELECT to_regclass('public.pos_cashier_pin') IS NOT NULL AS ok`);
        this.ready = Boolean(r?.ok);
      } catch { this.ready = false; }
    }
    return this.ready;
  }

  /** The owner first, then active team members with the POS permission (with their PIN hash when set). */
  async list(sellerId: number) {
    const ready = await this.tablesReady();
    const rows: any[] = await this.db.query(`
      SELECT u.id AS "userId", u.name, u.phone, true AS owner
        FROM public."user" u WHERE u.id = $1::int
      UNION ALL
      SELECT u.id, u.name, u.phone, false
        FROM public.business_team_member m JOIN public."user" u ON u.id = m.user_id
       WHERE m.seller_id = $1::int AND m."isActive" = true AND COALESCE((m.permissions->>'canOperatePOS')::boolean, false) = true
         AND m.user_id <> $1::int`, [sellerId]);
    const pins: any[] = ready ? await this.db.query(`SELECT "userId", salt, "pinHash" FROM public.pos_cashier_pin WHERE "sellerId" = $1::int`, [sellerId]) : [];
    const byUser = new Map(pins.map((p) => [Number(p.userId), p]));
    return {
      ready,
      cashiers: rows.map((r) => {
        const p = byUser.get(Number(r.userId));
        return { userId: Number(r.userId), name: r.name || r.phone || 'Mhudumu', owner: !!r.owner, hasPin: !!p, salt: p?.salt ?? null, pinHash: p?.pinHash ?? null };
      }),
    };
  }

  async isCashier(sellerId: number, userId: number): Promise<boolean> {
    if (!Number.isInteger(userId) || userId <= 0) return false;
    if (userId === sellerId) return true;
    const [r] = await this.db.query(`SELECT 1 AS ok FROM public.business_team_member WHERE seller_id = $1::int AND user_id = $2::int AND "isActive" = true
      AND COALESCE((permissions->>'canOperatePOS')::boolean, false) = true`, [sellerId, userId]);
    return Boolean(r?.ok);
  }

  /** The cashier on duty a request names, or the caller when none is named; anyone else is refused. */
  async onDuty(sellerId: number, callerId: number, requested: unknown): Promise<number> {
    const id = Number(requested);
    if (requested == null || requested === '' || !Number.isFinite(id)) return callerId;
    if (id === callerId || (await this.isCashier(sellerId, id))) return id;
    throw new ForbiddenException(PIN_TEXT.notCashier);
  }

  /** The owner (or a team member allowed to manage the team) sets a cashier's PIN; a cashier may set their own. */
  async setPin(sellerId: number, actorId: number, canManage: boolean, targetUserId: number, pin: unknown) {
    if (!(await this.tablesReady())) throw new BadRequestException(PIN_TEXT.notReady);
    const p = String(pin ?? '');
    if (!/^\d{4}$/.test(p)) throw new BadRequestException(PIN_TEXT.badPin);
    if (!(await this.isCashier(sellerId, targetUserId))) throw new BadRequestException(PIN_TEXT.notCashier);
    if (!canManage && actorId !== targetUserId) throw new ForbiddenException(PIN_TEXT.notCashier);
    const salt = randomBytes(8).toString('hex');
    await this.db.query(`
      INSERT INTO public.pos_cashier_pin ("sellerId", "userId", salt, "pinHash", "setByUserId", "updatedAt")
      VALUES ($1::int, $2::int, $3::varchar, $4::varchar, $5::int, now())
      ON CONFLICT ("sellerId", "userId") DO UPDATE SET salt = EXCLUDED.salt, "pinHash" = EXCLUDED."pinHash", "setByUserId" = EXCLUDED."setByUserId", "updatedAt" = now()`,
      [sellerId, targetUserId, salt, hashPin(salt, p), actorId]);
    return { userId: targetUserId, hasPin: true };
  }

  /** Puts the cashier on duty on a sale just saved (after the migration). Never fails the sale. */
  async stamp(saleId: number, cashierUserId: number | null) {
    if (!cashierUserId || !(await this.tablesReady())) return;
    await this.db.query(`UPDATE public.sale SET "cashierUserId" = $2::int WHERE id = $1::int`, [saleId, cashierUserId]).catch(() => undefined);
  }
}
