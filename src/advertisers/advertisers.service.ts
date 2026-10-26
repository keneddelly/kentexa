import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import { normalizeTzPhone } from '../common/utils/phone.util';

/**
 * Advertisers (owner 2026-10-26): people KenteXa hires to bring users. Admin adds them;
 * each gets a registration link (FRONTEND_URL/?ref=<code>). A new user who registers
 * through it belongs to that advertiser, and the advertiser earns commission when that
 * user does something real, each event once, at the admin's rate for that event:
 *
 *   first_listing - the user posted their first listing (classified or product);
 *   business      - the user created a business;
 *   office        - the user's office (Super Agent) was approved;
 *   seller        - the user was approved as a seller.
 *
 * Events are read from the real records (never claimed by the advertiser), and checked
 * whenever the advertiser or admin opens their page, so no module needs a hook. KenteXa
 * pays its advertisers itself (admin marks commission paid); customers' money is never
 * involved.
 */
export const ADVERTISER_EVENTS = ['first_listing', 'business', 'office', 'seller'] as const;
export type AdvertiserEvent = (typeof ADVERTISER_EVENTS)[number];

export const ADVERTISER_MESSAGES = {
  notReady: 'Matangazo bado hayajawashwa. Jaribu tena baadaye.',
  badName: 'Andika jina la mtangazaji.',
  badPhone: 'Weka namba sahihi ya simu (mf. 0712345678).',
  taken: 'Namba hii tayari ni ya mtangazaji mwingine.',
  notFound: 'Mtangazaji hakupatikana.',
  notAdvertiser: 'Wewe si mtangazaji wa KenteXa.',
  badRate: 'Kiasi lazima kiwe namba isiyo hasi.',
} as const;

/** Each event, and the SQL that says whether user $1 has done it. */
const EVENT_CHECK: Record<AdvertiserEvent, string> = {
  first_listing: `SELECT 1 FROM public.classified WHERE "sellerId" = $1
                  UNION ALL SELECT 1 FROM public.product WHERE "sellerId" = $1 LIMIT 1`,
  business: `SELECT 1 FROM public.business WHERE "userId" = $1 LIMIT 1`,
  office: `SELECT 1 FROM public.super_agent WHERE "userId" = $1 AND status::text = 'active'
           AND COALESCE("isTrainingOffice", false) = false LIMIT 1`,
  seller: `SELECT 1 FROM public.seller_profile WHERE "userId" = $1 AND status::text = 'approved' LIMIT 1`,
};

const tz = (raw: unknown) => (typeof raw === 'string' ? normalizeTzPhone(raw) : '');

@Injectable()
export class AdvertisersService {
  private ready = false;
  private checkedAt = 0;

  constructor(private readonly db: DataSource) {}

  /** The advertiser tables exist once migration 1793100000000 ran. */
  async isReady(): Promise<boolean> {
    if (!this.ready && Date.now() - this.checkedAt > 60_000) {
      this.checkedAt = Date.now();
      try {
        const [row] = await this.db.query(`SELECT to_regclass('public.advertiser_commission') IS NOT NULL AS ok`);
        this.ready = Boolean(row?.ok);
      } catch { this.ready = false; }
    }
    return this.ready;
  }

  private async mustBeReady() {
    if (!(await this.isReady())) throw new BadRequestException(ADVERTISER_MESSAGES.notReady);
  }

  link(code: string): string {
    const base = (process.env.FRONTEND_URL || 'https://kentexa.com').replace(/\/+$/, '');
    return `${base}/?ref=${encodeURIComponent(code)}`;
  }

  // ── Registration ────────────────────────────────────────────────────────

  /** At registration: a link code that is an active advertiser's makes the user theirs. Never throws. */
  async recordSignup(code: string | undefined | null, userId: number): Promise<boolean> {
    try {
      const c = String(code || '').trim().toUpperCase();
      if (!c || !userId || !(await this.isReady())) return false;
      const [adv] = await this.db.query(`SELECT id, "userId" FROM public.advertiser WHERE code = $1 AND active = true`, [c]);
      if (!adv || Number(adv.userId) === Number(userId)) return false;
      await this.db.query(
        `INSERT INTO public.advertiser_referral ("advertiserId", "userId") VALUES ($1, $2) ON CONFLICT ("userId") DO NOTHING`,
        [adv.id, userId]);
      return true;
    } catch { return false; }
  }

  // ── Earning ─────────────────────────────────────────────────────────────

  /** Checks this advertiser's users against the real records and earns what is new. Returns how many. */
  async refresh(advertiserId: number): Promise<number> {
    const users: any[] = await this.db.query(
      `SELECT r."userId" FROM public.advertiser_referral r WHERE r."advertiserId" = $1`, [advertiserId]);
    if (!users.length) return 0;
    const rates = await this.rates();
    const done: any[] = await this.db.query(
      `SELECT "userId", event FROM public.advertiser_commission WHERE "advertiserId" = $1`, [advertiserId]);
    const have = new Set(done.map((d) => `${d.userId}:${d.event}`));
    let earned = 0;
    for (const u of users) {
      for (const event of ADVERTISER_EVENTS) {
        if (have.has(`${u.userId}:${event}`)) continue;
        const [hit] = await this.db.query(EVENT_CHECK[event], [u.userId]);
        if (!hit) continue;
        const rows: any[] = await this.db.query(
          `INSERT INTO public.advertiser_commission ("advertiserId", "userId", event, amount)
           VALUES ($1, $2, $3, $4) ON CONFLICT ("userId", event) DO NOTHING RETURNING id`,
          [advertiserId, u.userId, event, rates[event] ?? 0]);
        if (rows.length) earned++;
      }
    }
    return earned;
  }

  // ── Admin ───────────────────────────────────────────────────────────────

  async rates(): Promise<Record<AdvertiserEvent, number>> {
    const rows: any[] = await this.db.query(`SELECT event, amount FROM public.advertiser_rate`);
    const out = { first_listing: 0, business: 0, office: 0, seller: 0 } as Record<AdvertiserEvent, number>;
    for (const r of rows) if ((ADVERTISER_EVENTS as readonly string[]).includes(r.event)) out[r.event as AdvertiserEvent] = Number(r.amount) || 0;
    return out;
  }

  async setRates(input: Partial<Record<AdvertiserEvent, unknown>>) {
    await this.mustBeReady();
    for (const event of ADVERTISER_EVENTS) {
      if (input?.[event] === undefined) continue;
      const n = Number(input[event]);
      if (!Number.isInteger(n) || n < 0) throw new BadRequestException(ADVERTISER_MESSAGES.badRate);
      await this.db.query(
        `INSERT INTO public.advertiser_rate (event, amount, "updatedAt") VALUES ($1, $2, now())
         ON CONFLICT (event) DO UPDATE SET amount = EXCLUDED.amount, "updatedAt" = now()`, [event, n]);
    }
    return this.rates();
  }

  async create(input: { name?: unknown; phone?: unknown }) {
    await this.mustBeReady();
    const name = typeof input?.name === 'string' ? input.name.trim().slice(0, 100) : '';
    if (name.length < 2) throw new BadRequestException(ADVERTISER_MESSAGES.badName);
    const phone = tz(input?.phone);
    if (!/^255\d{9}$/.test(phone)) throw new BadRequestException(ADVERTISER_MESSAGES.badPhone);
    const [dup] = await this.db.query(`SELECT id FROM public.advertiser WHERE phone = $1`, [phone]);
    if (dup) throw new ConflictException(ADVERTISER_MESSAGES.taken);
    const [user] = await this.db.query(`SELECT id FROM public."user" WHERE phone = $1 LIMIT 1`, [phone]);
    for (let i = 0; i < 5; i++) {
      const code = `K${randomBytes(4).toString('hex').toUpperCase().slice(0, 6)}`;
      const rows: any[] = await this.db.query(
        `INSERT INTO public.advertiser ("userId", name, phone, code) VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO NOTHING RETURNING id, code`, [user?.id ?? null, name, phone, code]);
      if (rows.length) return { id: Number(rows[0].id), name, phone, code: rows[0].code, link: this.link(rows[0].code), userLinked: Boolean(user) };
    }
    throw new ConflictException('Jaribu tena.');
  }

  async setActive(id: number, active: boolean) {
    await this.mustBeReady();
    const rows: any[] = await this.db.query(`UPDATE public.advertiser SET active = $2 WHERE id = $1 RETURNING id`, [id, Boolean(active)]);
    if (!rows.length) throw new NotFoundException(ADVERTISER_MESSAGES.notFound);
    return { id, active: Boolean(active) };
  }

  /** Every advertiser with users brought, commission earned and paid (checked first). */
  async list() {
    if (!(await this.isReady())) return { ready: false, advertisers: [], rates: null };
    const ads: any[] = await this.db.query(`SELECT id FROM public.advertiser`);
    for (const a of ads) await this.refresh(Number(a.id)).catch(() => 0);
    const rows: any[] = await this.db.query(
      `SELECT a.id, a.name, a.phone, a.code, a.active, a."createdAt",
              (SELECT COUNT(*) FROM public.advertiser_referral r WHERE r."advertiserId" = a.id) AS users,
              COALESCE((SELECT SUM(amount) FROM public.advertiser_commission c WHERE c."advertiserId" = a.id AND c.status = 'earned'), 0) AS unpaid,
              COALESCE((SELECT SUM(amount) FROM public.advertiser_commission c WHERE c."advertiserId" = a.id AND c.status = 'paid'), 0) AS paid
         FROM public.advertiser a ORDER BY a.id DESC`);
    return {
      ready: true,
      rates: await this.rates(),
      advertisers: rows.map((r) => ({
        id: Number(r.id), name: r.name, phone: r.phone, code: r.code, link: this.link(r.code), active: Boolean(r.active),
        users: Number(r.users) || 0, unpaid: Number(r.unpaid) || 0, paid: Number(r.paid) || 0, createdAt: r.createdAt,
      })),
    };
  }

  /** Admin paid the advertiser what is owed: every earned commission becomes paid. */
  async markPaid(id: number) {
    await this.mustBeReady();
    const rows: any[] = await this.db.query(
      `UPDATE public.advertiser_commission SET status = 'paid', "paidAt" = now()
        WHERE "advertiserId" = $1 AND status = 'earned' RETURNING amount`, [id]);
    return { id, paidCount: rows.length, paidTotal: rows.reduce((t, r) => t + (Number(r.amount) || 0), 0) };
  }

  // ── The advertiser's own page ───────────────────────────────────────────

  async mine(userId: number, userPhone?: string | null) {
    if (!(await this.isReady())) throw new NotFoundException(ADVERTISER_MESSAGES.notAdvertiser);
    const phone = tz(userPhone || '');
    const [adv] = await this.db.query(
      `SELECT id, name, code, active FROM public.advertiser WHERE "userId" = $1 OR ($2 <> '' AND phone = $2) ORDER BY id LIMIT 1`,
      [userId, phone]);
    if (!adv) throw new NotFoundException(ADVERTISER_MESSAGES.notAdvertiser);
    await this.db.query(`UPDATE public.advertiser SET "userId" = $2 WHERE id = $1 AND "userId" IS NULL`, [adv.id, userId]).catch(() => undefined);
    await this.refresh(Number(adv.id)).catch(() => 0);
    const users: any[] = await this.db.query(
      `SELECT r."userId", r."createdAt", u.name,
              COALESCE(json_agg(json_build_object('event', c.event, 'amount', c.amount, 'status', c.status)) FILTER (WHERE c.id IS NOT NULL), '[]') AS earned
         FROM public.advertiser_referral r
         JOIN public."user" u ON u.id = r."userId"
         LEFT JOIN public.advertiser_commission c ON c."userId" = r."userId" AND c."advertiserId" = r."advertiserId"
        WHERE r."advertiserId" = $1
        GROUP BY r."userId", r."createdAt", u.name ORDER BY r."createdAt" DESC LIMIT 200`, [adv.id]);
    const [sum] = await this.db.query(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'earned'), 0) AS unpaid,
              COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0) AS paid
         FROM public.advertiser_commission WHERE "advertiserId" = $1`, [adv.id]);
    // A first name only: the advertiser sees who joined, not their details.
    const first = (n: unknown) => String(n || '').trim().split(/\s+/)[0] || 'Mtumiaji';
    return {
      name: adv.name, active: Boolean(adv.active), code: adv.code, link: this.link(adv.code),
      rates: await this.rates(),
      unpaid: Number(sum?.unpaid) || 0, paid: Number(sum?.paid) || 0,
      users: users.map((u) => ({ name: first(u.name), joinedAt: u.createdAt, earned: u.earned })),
    };
  }

  // ── Who invited this visitor (public; a name only) ──────────────────────

  /**
   * The registration page names who invited the visitor (owner 2026-10-26): an
   * advertiser's link (K......) or an office's (its referral code). A name only,
   * never a phone or anything else; an unknown or inactive code answers nothing.
   */
  async inviter(code: string): Promise<{ kind: 'advertiser' | 'office'; name: string } | null> {
    const c = String(code || '').trim();
    if (!/^[A-Za-z0-9-]{3,24}$/.test(c)) return null;
    if (await this.isReady()) {
      const [adv] = await this.db.query(`SELECT name FROM public.advertiser WHERE code = $1 AND active = true`, [c.toUpperCase()]).catch(() => []);
      if (adv?.name) return { kind: 'advertiser', name: String(adv.name).slice(0, 100) };
    }
    const [office] = await this.db.query(
      `SELECT "businessName" FROM public.super_agent WHERE "referralCode" = $1 AND status::text = 'active'
          AND COALESCE("isTrainingOffice", false) = false LIMIT 1`, [c]).catch(() => []);
    return office?.businessName ? { kind: 'office', name: String(office.businessName).slice(0, 100) } : null;
  }

}
