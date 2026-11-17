import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { SmsService } from '../sms/sms.service';
import { LIPA_PROOF_REF, signedLipaProofUrl } from '../orders/lipa-proof';
import { DEFAULT_FEE_SETTINGS, FeeAccountType, FeeSettings, feeSettingsFrom, finishedMonths, invoiceStatuses, jobFee, lockState, monthLabel, ruleFor } from './kentexa-fee-calc';
import { setFeeLockReady, setFeeStandingReady } from './paid-up-gate';

/**
 * Ada ya KenteXa (owner approved 2026-11-03): "we charge the one who has succeeded to make
 * money on KenteXa". A background job reads finished work from the records every 10 minutes
 * and writes one fee row per job (never edited, never twice):
 *   ofisi  a parcel the ofisi took (walk-in, seller shipment, marketplace), shipping fee > 0
 *   agent  a finished delivery (its agreed delivery fee)
 *   seller a marketplace checkout order that is delivered/completed (product price)
 * Only work done from the start day counts. Since 2026-11-17 an account owing TZS 50,000+ with
 * part older than 30 days gets no new work until it pays (paid-up-gate.ts). Otherwise an account
 * with a fee unpaid for more than 30 days only goes after the paid-up ones for jobs KenteXa
 * brings (paid-up-gate.ts). Payment: KenteXa's Lipa Namba + screenshot, admin confirms.
 * Before migration 1794600000000 runs, everything here is off.
 */
export const FEE_TYPES: readonly FeeAccountType[] = ['office', 'agent', 'seller'];
const SWEEP_BATCH = 500;
const SWEEP_LOCK = 794600;

interface Job { accountType: FeeAccountType; accountId: number; accountUserId: number | null; sourceType: string; sourceId: number; sourceRef: string | null; base: number; doneAt: Date }

export const FEE_TEXT = {
  notReady: 'Ada ya KenteXa bado haijawashwa.',
  noOffice: 'Chagua ofisi yako kwanza.',
  noAgent: 'Wewe si wakala wa KenteXa.',
  badAs: 'Chagua: ofisi, wakala au muuzaji.',
  badAmount: 'Andika kiasi ulicholipa.',
  badProof: 'Weka picha ya ujumbe wa malipo.',
  tooManyWaiting: 'Una malipo 3 yanayosubiri kuthibitishwa. Subiri tuyathibitishe kwanza.',
  missing: 'Malipo hayapatikani.',
  notWaiting: 'Malipo haya yameshashughulikiwa.',
  reasonShort: 'Eleza sababu (angalau herufi 5).',
  noInvoice: 'Ankara haipatikani.',
  noAccount: 'Akaunti haipatikani.',
  remindedToday: 'Umeshamkumbusha leo. Jaribu kesho.',
} as const;

const money = (n: number) => `TZS ${Math.round(Number(n) || 0).toLocaleString('en-US')}`;

@Injectable()
export class KentexaFeeService implements OnModuleInit {
  private readonly logger = new Logger(KentexaFeeService.name);
  private tablesReady = false;
  private checkedAt = 0;
  private invoicesReady = false;
  private invoicesCheckedAt = 0;

  constructor(
    private readonly db: DataSource,
    @Optional() private readonly notifications?: InAppNotificationService,
    @Optional() private readonly sms?: SmsService,
  ) {}

  private lockColumn = false;
  private lockCheckedAt = 0;

  /** The lock columns exist once migration 1797300000000 ran (checked at most once a minute). */
  async lockOn(): Promise<boolean> {
    if (!(await this.ready())) return false;
    if (!this.lockColumn && Date.now() - this.lockCheckedAt > 60_000) {
      this.lockCheckedAt = Date.now();
      try {
        const [row] = await this.db.query(`SELECT EXISTS (SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'kentexa_fee_standing' AND column_name = 'locked') AS ok`);
        this.lockColumn = Boolean(row?.ok);
      } catch { this.lockColumn = false; }
      setFeeLockReady(this.lockColumn);
    }
    return this.lockColumn;
  }

  /** One SMS to the account's phone; never blocks anything. */
  private async textAccount(type: FeeAccountType, id: number, message: string): Promise<boolean> {
    if (!this.sms) return false;
    const who = await this.accountName(type, id).catch(() => null);
    if (!who?.phone) return false;
    return this.sms.sendSms(who.phone, message).catch(() => false);
  }

  async onModuleInit() {
    if (await this.ready()) setFeeStandingReady(true, (await this.settings()).agentFirstMinutes);
    await this.lockOn().catch(() => false);
  }

  /** The tables exist once migration 1794600000000 ran (checked at most once a minute). */
  async ready(): Promise<boolean> {
    if (!this.tablesReady && Date.now() - this.checkedAt > 60_000) {
      this.checkedAt = Date.now();
      try {
        const [row] = await this.db.query(`SELECT to_regclass('public.kentexa_fee_standing') IS NOT NULL AS ok`);
        this.tablesReady = Boolean(row?.ok);
      } catch { this.tablesReady = false; }
      setFeeStandingReady(this.tablesReady);
    }
    return this.tablesReady;
  }

  async settings(): Promise<FeeSettings> {
    if (!(await this.ready())) return DEFAULT_FEE_SETTINGS;
    const rows = await this.db.query(`SELECT key, value FROM public.kentexa_fee_setting`).catch(() => []);
    return feeSettingsFrom(rows);
  }

  // ── The background job ──────────────────────────────────────────────────
  @Cron('*/10 * * * *')
  async sweepCron() {
    try { await this.sweep(); } catch (e: any) { this.logger.warn(`fee sweep failed: ${e?.message}`); }
  }

  /** Writes the fee rows for finished work not charged yet. Returns how many rows were written. */
  async sweep(now = new Date()): Promise<number> {
    if (!(await this.ready())) return 0;
    const s = await this.settings();
    setFeeStandingReady(true, s.agentFirstMinutes);
    let written = 0;
    const touched = new Set<string>();
    await this.db.transaction(async (em) => {
      const [lock] = await em.query(`SELECT pg_try_advisory_xact_lock($1::int) AS ok`, [SWEEP_LOCK]);
      if (!lock?.ok) return;
      const jobs: Job[] = [
        ...(await this.officeJobs(em, s.startAt)),
        ...(await this.agentJobs(em, s.startAt)),
        ...(await this.sellerJobs(em, s.startAt)),
      ];
      // Free start, per account, oldest job first.
      const byAccount = new Map<string, Job[]>();
      for (const j of jobs) {
        const k = `${j.accountType}:${j.accountId}`;
        byAccount.set(k, [...(byAccount.get(k) ?? []), j]);
      }
      for (const [k, list] of byAccount) {
        const [type, idText] = k.split(':') as [FeeAccountType, string];
        const id = Number(idText);
        let freeLeft = await this.freeLeft(em, type, id, s);
        const rule = ruleFor(type, s);
        list.sort((a, b) => a.doneAt.getTime() - b.doneAt.getTime() || a.sourceId - b.sourceId);
        for (const j of list) {
          const full = jobFee(j.base, rule.rate, rule.min, rule.cap);
          const free = full > 0 && freeLeft > 0;
          if (free) freeLeft -= 1;
          const res = await em.query(
            `INSERT INTO public.kentexa_fee ("accountType", "accountId", "accountUserId", "sourceType", "sourceId", "sourceRef",
                "baseAmount", rate, fee, "freeJob", "doneAt")
             VALUES ($1::varchar, $2::int, $3::int, $4::varchar, $5::int, $6::varchar, $7::numeric, $8::numeric, $9::numeric, $10::boolean, $11::timestamptz)
             ON CONFLICT ("accountType", "sourceType", "sourceId") DO NOTHING RETURNING id`,
            [j.accountType, j.accountId, j.accountUserId, j.sourceType, j.sourceId, j.sourceRef?.slice(0, 60) ?? null,
              Math.max(0, j.base), rule.rate, free ? 0 : full, free, j.doneAt]);
          if (res?.length) { written += 1; touched.add(k); }
        }
      }
    });
    for (const k of touched) {
      const [type, id] = k.split(':');
      await this.refreshStanding(type as FeeAccountType, Number(id), s, now).catch(() => undefined);
    }
    // Arrears move with time even without new work: refresh every account that owes.
    await this.refreshOwing(s, now, touched).catch(() => undefined);
    return written;
  }

  private async officeJobs(em: any, startAt: Date): Promise<Job[]> {
    const rows: any[] = await em.query(`
      SELECT p.id, p."superAgentId" AS "accountId", sa."userId" AS "accountUserId",
             COALESCE(NULLIF(p."actualShippingFee", 0), p."estimatedShippingFee", 0) AS base,
             COALESCE(p."waybillNumber"::text, p."trackingNumber") AS ref, p."createdAt" AS "doneAt"
        FROM public.parcel p
        JOIN public.super_agent sa ON sa.id = p."superAgentId"
       WHERE p."createdAt" >= $1::timestamptz
         AND p.status::text NOT IN ('pending', 'collection_requested', 'collected_by_agent', 'returned')
         AND sa."isTrainingOffice" = false
         AND NOT EXISTS (SELECT 1 FROM public.kentexa_fee f
               WHERE f."accountType" = 'office' AND f."sourceType" = 'parcel' AND f."sourceId" = p.id)
       ORDER BY p.id ASC LIMIT ${SWEEP_BATCH}`, [startAt]);
    return rows.map((r) => this.job('office', 'parcel', r));
  }

  private async agentJobs(em: any, startAt: Date): Promise<Job[]> {
    // The same finished deliveries the agent's own "Mapato" counts (agents.service getMySummary).
    const tasks: any[] = await em.query(`
      SELECT t.id, t."agentProfileId" AS "accountId", a."userId" AS "accountUserId", COALESCE(p."agreedDeliveryFee", 0) AS base,
             COALESCE(p."waybillNumber"::text, p."trackingNumber") AS ref, t."deliveredAt" AS "doneAt"
        FROM public.parcel_pickup_task t
        JOIN public.parcel p ON p.id = t."parcelId"
        JOIN public.agent a ON a.id = t."agentProfileId"
       WHERE t.status = 'delivered' AND t."deliveredAt" >= $1::timestamptz
         AND NOT EXISTS (SELECT 1 FROM public.kentexa_fee f
               WHERE f."accountType" = 'agent' AND f."sourceType" = 'pickup_task' AND f."sourceId" = t.id)
       ORDER BY t.id ASC LIMIT ${SWEEP_BATCH}`, [startAt]);
    const direct: any[] = await em.query(`
      SELECT p.id, a.id AS "accountId", a."userId" AS "accountUserId", COALESCE(p."agreedDeliveryFee", 0) AS base,
             COALESCE(p."waybillNumber"::text, p."trackingNumber") AS ref, p."deliveredTime" AS "doneAt"
        FROM public.parcel p
        JOIN public.agent a ON a."userId"::text = p."localAgentId"
       WHERE p.status::text = 'delivered' AND p."deliveredTime" >= $1::timestamptz
         AND NOT EXISTS (SELECT 1 FROM public.parcel_pickup_task t2 WHERE t2."parcelId" = p.id AND t2."agentProfileId" = a.id)
         AND NOT EXISTS (SELECT 1 FROM public.kentexa_fee f
               WHERE f."accountType" = 'agent' AND f."sourceType" = 'parcel_local' AND f."sourceId" = p.id)
       ORDER BY p.id ASC LIMIT ${SWEEP_BATCH}`, [startAt]);
    return [...tasks.map((r) => this.job('agent', 'pickup_task', r)), ...direct.map((r) => this.job('agent', 'parcel_local', r))];
  }

  private async sellerJobs(em: any, startAt: Date): Promise<Job[]> {
    // Marketplace (checkout) orders only: POS, own sales, seller shipments and classifieds are free.
    // "Uza tena" (owner 2026-11-09): on a resold order the supplier keeps the price less the
    // reseller's profit, so its 2% is on what it keeps; the reseller pays nothing during launch.
    const rows: any[] = await em.query(`
      SELECT o.id, o."sellerId" AS "accountId", o."sellerId" AS "accountUserId",
             GREATEST(COALESCE(o."baseAmount", 0) - COALESCE(o."resellerProfit", 0), 0) AS base,
             NULL::text AS ref, COALESCE(o."completedAt", o."deliveredAt") AS "doneAt"
        FROM public."order" o
       WHERE o.source::text = 'online' AND o.status::text IN ('delivered', 'completed') AND o."sellerId" IS NOT NULL
         AND COALESCE(o."completedAt", o."deliveredAt") >= $1::timestamptz
         AND NOT EXISTS (SELECT 1 FROM public.kentexa_fee f
               WHERE f."accountType" = 'seller' AND f."sourceType" = 'order' AND f."sourceId" = o.id)
       ORDER BY o.id ASC LIMIT ${SWEEP_BATCH}`, [startAt]);
    return rows.map((r) => this.job('seller', 'order', r));
  }

  private job(accountType: FeeAccountType, sourceType: string, r: any): Job {
    return {
      accountType, sourceType, accountId: Number(r.accountId), sourceId: Number(r.id),
      accountUserId: r.accountUserId == null ? null : Number(r.accountUserId),
      sourceRef: r.ref == null ? null : String(r.ref), base: Number(r.base) || 0, doneAt: new Date(r.doneAt),
    };
  }

  /** Free jobs left: ofisi keep what is left of 20 after the old counter's used ones; agents 20; sellers none. */
  private async freeLeft(em: any, type: FeeAccountType, id: number, s: FeeSettings): Promise<number> {
    const [used] = await em.query(`SELECT COUNT(*)::int AS n FROM public.kentexa_fee
      WHERE "accountType" = $1::varchar AND "accountId" = $2::int AND "freeJob" = true`, [type, id]);
    const n = Number(used?.n) || 0;
    if (type === 'office') {
      const [o] = await em.query(`SELECT "freeOrdersUsed" FROM public.super_agent WHERE id = $1::int`, [id]);
      return Math.max(0, s.officeFree - (Number(o?.freeOrdersUsed) || 0) - n);
    }
    if (type === 'agent') return Math.max(0, s.agentFree - n);
    return 0;
  }

  // ── What an account owes ────────────────────────────────────────────────
  private async legacyFor(type: FeeAccountType, id: number): Promise<number> {
    if (type !== 'office') return 0; // seller debts were cleared by the migration; agents had none
    const [o] = await this.db.query(`SELECT "outstandingBalance" FROM public.super_agent WHERE id = $1::int`, [id]);
    return Math.max(0, Number(o?.outstandingBalance) || 0);
  }

  async stateOf(type: FeeAccountType, id: number, s: FeeSettings, now = new Date()) {
    const fees: any[] = await this.db.query(`SELECT fee, "doneAt" FROM public.kentexa_fee
      WHERE "accountType" = $1::varchar AND "accountId" = $2::int AND fee > 0`, [type, id]);
    const [paid] = await this.db.query(`SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*)::int AS n FROM public.kentexa_fee_payment
      WHERE "accountType" = $1::varchar AND "accountId" = $2::int AND status = 'confirmed'`, [type, id]);
    const legacy = await this.legacyFor(type, id);
    return { ...lockState(fees, Number(paid?.total) || 0, legacy, s, now), legacy, paidCount: Number(paid?.n) || 0 };
  }

  private async userOf(type: FeeAccountType, id: number): Promise<number | null> {
    if (type === 'seller') return id;
    const table = type === 'office' ? 'super_agent' : 'agent';
    const [r] = await this.db.query(`SELECT "userId" FROM public.${table} WHERE id = $1::int`, [id]);
    return r?.userId == null ? null : Number(r.userId);
  }

  async refreshStanding(type: FeeAccountType, id: number, s?: FeeSettings, now = new Date()) {
    const settings = s ?? (await this.settings());
    const st = await this.stateOf(type, id, settings, now);
    const userId = await this.userOf(type, id);
    const lockOn = await this.lockOn();
    const locked = lockOn && st.locked;
    const rows: any[] = lockOn
      ? await this.db.query(`WITH before AS (SELECT locked FROM public.kentexa_fee_standing WHERE "accountType" = $1::varchar AND "accountId" = $2::int)
          INSERT INTO public.kentexa_fee_standing ("accountType", "accountId", "accountUserId", "inArrears", owed, locked, "lockedAt", "updatedAt")
          VALUES ($1::varchar, $2::int, $3::int, $4::boolean, $5::numeric, $6::boolean, CASE WHEN $6::boolean THEN now() END, now())
          ON CONFLICT ("accountType", "accountId") DO UPDATE SET "accountUserId" = EXCLUDED."accountUserId",
            "inArrears" = EXCLUDED."inArrears", owed = EXCLUDED.owed, locked = EXCLUDED.locked,
            "lockedAt" = CASE WHEN EXCLUDED.locked THEN COALESCE(kentexa_fee_standing."lockedAt", now()) END, "updatedAt" = now()
          RETURNING (SELECT locked FROM before) AS "wasLocked"`,
          [type, id, userId, st.inArrears, st.owed, locked])
      : await this.db.query(`INSERT INTO public.kentexa_fee_standing ("accountType", "accountId", "accountUserId", "inArrears", owed, "updatedAt")
          VALUES ($1::varchar, $2::int, $3::int, $4::boolean, $5::numeric, now())
          ON CONFLICT ("accountType", "accountId") DO UPDATE SET "accountUserId" = EXCLUDED."accountUserId",
            "inArrears" = EXCLUDED."inArrears", owed = EXCLUDED.owed, "updatedAt" = now() RETURNING NULL AS "wasLocked"`,
          [type, id, userId, st.inArrears, st.owed]);
    if (lockOn && userId) {
      const was = Boolean(rows?.[0]?.wasLocked);
      if (locked !== was) await this.tellLock(type, id, userId, locked, st.owed);
      else if (!locked && st.warn) await this.warnLock(type, id, st.owed, st.paidCount, settings);
    }
    if (st.owed >= settings.reminderAmount && userId) await this.remindOnce(type, id, userId, st.owed);
    return st;
  }

  /** In-app note when new work stops or comes back (no SMS: owner chose SMS only for the warning). */
  private async tellLock(type: FeeAccountType, id: number, userId: number, locked: boolean, owed: number) {
    const what = type === 'office' ? 'vifurushi vipya' : type === 'agent' ? 'safari mpya' : 'maagizo mapya ya KenteXa';
    await this.notifications?.notify({
      userId, type: 'kentexa_fee',
      title: locked ? 'Kazi mpya zimesimama' : 'Kazi mpya zimerudi',
      body: locked
        ? `Deni la Ada ya KenteXa ni ${money(owed)} na sehemu yake imepita siku 30. Hupokei ${what} mpaka ulipe. Kazi zilizopo zinaendelea.`
        : `Asante kwa kulipa. Sasa unapokea ${what} tena.`,
      actionPage: 'KentexaFee', actionParam: type, sourceType: 'kentexa_fee', sourceId: id,
    }).catch(() => undefined);
  }

  /** One SMS (and in-app note) a few days before new work stops; once per payment period. */
  private async warnLock(type: FeeAccountType, id: number, owed: number, paidCount: number, s: FeeSettings) {
    const ins = await this.db.query(`INSERT INTO public.kentexa_fee_reminder ("accountType", "accountId", kind, "periodKey")
      VALUES ($1::varchar, $2::int, 'lock_warning', $3::varchar) ON CONFLICT DO NOTHING RETURNING id`, [type, id, `p${paidCount}`]).catch(() => []);
    if (!ins?.length) return;
    const what = type === 'office' ? 'vifurushi vipya' : type === 'agent' ? 'safari mpya' : 'maagizo mapya';
    const text = `KenteXa: deni lako la ada ni ${money(owed)}. Usipolipa ndani ya siku ${s.lockWarnDays}, hutapokea ${what} mpaka ulipe. Lipa Namba ${s.lipaNumber} (${s.lipaBank}, ${s.lipaName}), kisha tuma picha ya malipo kwenye app.`;
    await this.textAccount(type, id, text);
    const userId = await this.userOf(type, id).catch(() => null);
    if (userId) {
      await this.notifications?.notify({
        userId, type: 'kentexa_fee', title: 'Lipa ada kabla kazi hazijasimama', body: text.replace(/^KenteXa: /, ''),
        actionPage: 'KentexaFee', actionParam: type, sourceType: 'kentexa_fee', sourceId: id,
      }).catch(() => undefined);
    }
  }

  /** Accounts already owing (or with an old debt) are re-checked so arrears follow the calendar. */
  private async refreshOwing(s: FeeSettings, now: Date, skip: Set<string>) {
    const rows: any[] = await this.db.query(`
      SELECT "accountType", "accountId" FROM public.kentexa_fee_standing WHERE owed > 0
      UNION SELECT 'office', id FROM public.super_agent WHERE "outstandingBalance" > 0`);
    for (const r of rows) {
      if (skip.has(`${r.accountType}:${r.accountId}`)) continue;
      await this.refreshStanding(r.accountType, Number(r.accountId), s, now).catch(() => undefined);
    }
  }

  private async remindOnce(type: FeeAccountType, id: number, userId: number, owed: number) {
    const [paid] = await this.db.query(`SELECT COUNT(*)::int AS n FROM public.kentexa_fee_payment
      WHERE "accountType" = $1::varchar AND "accountId" = $2::int AND status = 'confirmed'`, [type, id]);
    const period = `p${Number(paid?.n) || 0}`;
    const ins = await this.db.query(`INSERT INTO public.kentexa_fee_reminder ("accountType", "accountId", kind, "periodKey")
      VALUES ($1::varchar, $2::int, 'over_amount', $3::varchar) ON CONFLICT DO NOTHING RETURNING id`, [type, id, period]);
    if (!ins?.length || !this.notifications) return;
    await this.notifications.notify({
      userId, type: 'kentexa_fee', title: 'Ada ya KenteXa',
      body: `Deni lako la ada ni ${money(owed)}. Kazi yako haisimami; ukilipa, kazi mpya kutoka KenteXa zinakuja kwako kwanza.`,
      actionPage: 'KentexaFee', actionParam: type, sourceType: 'kentexa_fee', sourceId: id,
    }).catch(() => undefined);
  }

  /** Monday 08:00 Dar es Salaam (05:00 UTC): last week's statement, in-app only. */
  @Cron('0 5 * * 1')
  async weeklyStatement(now = new Date()) {
    if (!(await this.ready()) || !this.notifications) return;
    const s = await this.settings();
    const week = now.toISOString().slice(0, 10);
    const rows: any[] = await this.db.query(`
      SELECT f."accountType", f."accountId", COUNT(*)::int AS jobs, COALESCE(SUM(f.fee), 0) AS fee
        FROM public.kentexa_fee f WHERE f."doneAt" > now() - interval '7 days'
       GROUP BY f."accountType", f."accountId"`).catch(() => []);
    for (const r of rows) {
      const type = r.accountType as FeeAccountType; const id = Number(r.accountId);
      const ins = await this.db.query(`INSERT INTO public.kentexa_fee_reminder ("accountType", "accountId", kind, "periodKey")
        VALUES ($1::varchar, $2::int, 'weekly', $3::varchar) ON CONFLICT DO NOTHING RETURNING id`, [type, id, week]).catch(() => []);
      if (!ins?.length) continue;
      const userId = await this.userOf(type, id);
      if (!userId) continue;
      const st = await this.stateOf(type, id, s, now);
      const what = type === 'seller' ? 'maagizo' : type === 'agent' ? 'safari' : 'vifurushi';
      await this.notifications.notify({
        userId, type: 'kentexa_fee', title: 'Ada ya KenteXa: wiki hii',
        body: `Wiki hii: ${what} ${r.jobs}, ada ${money(r.fee)}. Deni lote: ${money(st.owed)}.`,
        actionPage: 'KentexaFee', actionParam: type, sourceType: 'kentexa_fee', sourceId: id,
      }).catch(() => undefined);
    }
  }

  // ── Monthly ankara (owner approved 2026-11-17) ──────────────────────────
  /** The invoice table exists once migration 1797000000000 ran. */
  async invoicesOn(): Promise<boolean> {
    if (!(await this.ready())) return false;
    if (!this.invoicesReady && Date.now() - this.invoicesCheckedAt > 60_000) {
      this.invoicesCheckedAt = Date.now();
      try {
        const [row] = await this.db.query(`SELECT to_regclass('public.kentexa_fee_invoice') IS NOT NULL AS ok`);
        this.invoicesReady = Boolean(row?.ok);
      } catch { this.invoicesReady = false; }
    }
    return this.invoicesReady;
  }

  /** Every day 06:10 Dar es Salaam: makes any missing invoice for a finished month (the 1st, and any missed day). */
  @Cron('10 3 * * *')
  async invoiceCron() {
    try { await this.makeInvoices(); } catch (e: any) { this.logger.warn(`fee invoices failed: ${e?.message}`); }
  }

  /**
   * One invoice per account per finished month that had a fee to pay: the month's jobs and the
   * total of its fee rows. Never edited and never made twice (unique account + month). Returns how
   * many were made; each new one is told to its owner.
   */
  async makeInvoices(now = new Date()): Promise<number> {
    if (!(await this.invoicesOn())) return 0;
    const s = await this.settings();
    let made = 0;
    for (const month of finishedMonths(s.startAt, now)) {
      const rows: any[] = await this.db.query(`
        INSERT INTO public.kentexa_fee_invoice (number, "accountType", "accountId", "accountUserId", "periodStart", "periodEnd", jobs, "freeJobs", amount, "dueAt")
        SELECT 'KX-' || to_char($1::date, 'YYYYMM') || '-' ||
                 CASE f."accountType" WHEN 'office' THEN 'O' WHEN 'agent' THEN 'A' ELSE 'S' END || lpad(f."accountId"::text, GREATEST(4, length(f."accountId"::text)), '0'),
               f."accountType", f."accountId", MAX(f."accountUserId"), $1::date, ($1::date + interval '1 month' - interval '1 day')::date,
               COUNT(*)::int, (COUNT(*) FILTER (WHERE f."freeJob"))::int, SUM(f.fee),
               ($1::date + interval '1 month' + interval '29 days')::date
          FROM public.kentexa_fee f
         WHERE date_trunc('month', f."doneAt" AT TIME ZONE 'Africa/Dar_es_Salaam')::date = $1::date
         GROUP BY f."accountType", f."accountId"
        HAVING SUM(f.fee) > 0
        ON CONFLICT ("accountType", "accountId", "periodStart") DO NOTHING
        RETURNING id, number, "accountType", "accountId", amount, "dueAt"`, [month]);
      made += rows.length;
      for (const r of rows) await this.tellInvoice(r, month);
    }
    return made;
  }

  private async tellInvoice(r: any, month: string) {
    const userId = await this.userOf(r.accountType, Number(r.accountId)).catch(() => null);
    if (!userId || !this.notifications) return;
    const due = new Date(r.dueAt).toLocaleDateString('en-GB', { timeZone: 'Africa/Dar_es_Salaam' });
    await this.notifications.notify({
      userId, type: 'kentexa_fee', title: `Ankara ya ${monthLabel(month)}`,
      body: `Ankara ${r.number}: ada ya KenteXa ${money(r.amount)}. Lipa kabla ya ${due}.`,
      actionPage: 'KentexaFee', actionParam: r.accountType, sourceType: 'kentexa_fee_invoice', sourceId: Number(r.id),
    }).catch(() => undefined);
    const s = await this.settings();
    await this.textAccount(r.accountType, Number(r.accountId),
      `KenteXa: ankara ${r.number} ya ${monthLabel(month)} ni ${money(r.amount)}. Lipa kabla ya ${due} kwa Lipa Namba ${s.lipaNumber} (${s.lipaBank}, ${s.lipaName}), kisha tuma picha ya malipo kwenye app.`);
  }

  /** The account's invoices, newest first, each with what is paid and left. */
  async invoicesOf(type: FeeAccountType, id: number, now = new Date()) {
    if (!(await this.invoicesOn())) return [];
    const rows: any[] = await this.db.query(`SELECT id, number, "periodStart"::text AS "periodStart", "periodEnd"::text AS "periodEnd",
        jobs, "freeJobs", amount, "dueAt"::text AS "dueAt", "createdAt"
      FROM public.kentexa_fee_invoice WHERE "accountType" = $1::varchar AND "accountId" = $2::int`, [type, id]);
    const [paid] = await this.db.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM public.kentexa_fee_payment
      WHERE "accountType" = $1::varchar AND "accountId" = $2::int AND status = 'confirmed'`, [type, id]);
    const legacy = await this.legacyFor(type, id);
    return invoiceStatuses(rows, Number(paid?.total) || 0, legacy, now)
      .map((r) => ({ ...r, id: Number(r.id), jobs: Number(r.jobs), freeJobs: Number(r.freeJobs), month: monthLabel(r.periodStart) }))
      .reverse();
  }

  /** One invoice with its jobs. `only` limits it to one account (the owner); admin passes none. */
  async invoiceDetail(invoiceId: number, only?: { type: FeeAccountType; id: number }) {
    if (!(await this.invoicesOn())) throw new NotFoundException(FEE_TEXT.noInvoice);
    const [inv] = await this.db.query(`SELECT id, "accountType", "accountId", "periodStart"::text AS "periodStart" FROM public.kentexa_fee_invoice WHERE id = $1::int`, [invoiceId]);
    if (!inv || (only && (inv.accountType !== only.type || Number(inv.accountId) !== only.id))) throw new NotFoundException(FEE_TEXT.noInvoice);
    const type = inv.accountType as FeeAccountType; const accountId = Number(inv.accountId);
    const all = await this.invoicesOf(type, accountId);
    const invoice = all.find((i) => i.id === Number(invoiceId));
    const jobs: any[] = await this.db.query(`SELECT id, "sourceType", "sourceRef", "baseAmount", rate, fee, "freeJob", "doneAt"
      FROM public.kentexa_fee WHERE "accountType" = $1::varchar AND "accountId" = $2::int
        AND date_trunc('month', "doneAt" AT TIME ZONE 'Africa/Dar_es_Salaam')::date = $3::date
      ORDER BY "doneAt" ASC LIMIT 1000`, [type, accountId, inv.periodStart]);
    const s = await this.settings();
    const who = await this.accountName(type, accountId);
    const n = (v: any) => Math.round(Number(v) || 0);
    return {
      invoice, accountType: type, accountId, who: who.name, phone: only ? undefined : who.phone,
      lipa: { number: s.lipaNumber, name: s.lipaName, bank: s.lipaBank },
      jobs: jobs.map((j) => ({ ...j, id: Number(j.id), baseAmount: n(j.baseAmount), fee: n(j.fee), rate: Number(j.rate) })),
    };
  }

  private async accountName(type: FeeAccountType, id: number): Promise<{ name: string | null; phone: string | null; userId: number | null }> {
    const userId = await this.userOf(type, id).catch(() => null);
    const [u] = userId ? await this.db.query(`SELECT name, phone FROM public."user" WHERE id = $1::int`, [userId]) : [];
    let name = u?.name ?? null;
    if (type === 'office') {
      const [o] = await this.db.query(`SELECT "businessName" FROM public.super_agent WHERE id = $1::int`, [id]);
      name = o?.businessName || name;
    }
    return { name, phone: u?.phone ?? null, userId };
  }

  // ── Admin: who uses KenteXa and what they owe ───────────────────────────
  /** Every account with fees (or an old debt): what it did, owes, paid, and whether it is late. */
  async adminAccounts(filter = 'owing', q = '') {
    if (!(await this.ready())) return { ready: false, totals: null, rows: [] };
    const invoices = await this.invoicesOn();
    const rows: any[] = await this.db.query(`
      WITH acc AS (
        SELECT "accountType", "accountId" FROM public.kentexa_fee
        UNION SELECT "accountType", "accountId" FROM public.kentexa_fee_standing
        UNION SELECT "accountType", "accountId" FROM public.kentexa_fee_payment
      ), fee AS (
        SELECT "accountType", "accountId", COUNT(*)::int AS jobs, COALESCE(SUM(fee), 0) AS fees,
               COUNT(*) FILTER (WHERE "freeJob")::int AS free, MAX("doneAt") AS "lastJobAt",
               COUNT(*) FILTER (WHERE date_trunc('month', "doneAt" AT TIME ZONE 'Africa/Dar_es_Salaam') = date_trunc('month', now() AT TIME ZONE 'Africa/Dar_es_Salaam'))::int AS "monthJobs"
          FROM public.kentexa_fee GROUP BY 1, 2
      ), pay AS (
        SELECT "accountType", "accountId", COALESCE(SUM(amount) FILTER (WHERE status = 'confirmed'), 0) AS paid,
               COUNT(*) FILTER (WHERE status = 'waiting')::int AS waiting,
               MAX("reviewedAt") FILTER (WHERE status = 'confirmed') AS "lastPaidAt"
          FROM public.kentexa_fee_payment GROUP BY 1, 2
      )
      SELECT a."accountType", a."accountId", COALESCE(f.jobs, 0) AS jobs, COALESCE(f.fees, 0) AS fees, COALESCE(f.free, 0) AS free,
             COALESCE(f."monthJobs", 0) AS "monthJobs", f."lastJobAt",
             COALESCE(p.paid, 0) AS paid, COALESCE(p.waiting, 0) AS waiting, p."lastPaidAt",
             COALESCE(st.owed, 0) AS owed, COALESCE(st."inArrears", false) AS late,
             ${(await this.lockOn()) ? 'COALESCE(st.locked, false)' : 'false'} AS locked,
             COALESCE(sa."businessName", u.name) AS who, u.phone,
             ${invoices ? `(SELECT COUNT(*)::int FROM public.kentexa_fee_invoice i WHERE i."accountType" = a."accountType" AND i."accountId" = a."accountId")` : '0'} AS invoices
        FROM acc a
        LEFT JOIN fee f ON f."accountType" = a."accountType" AND f."accountId" = a."accountId"
        LEFT JOIN pay p ON p."accountType" = a."accountType" AND p."accountId" = a."accountId"
        LEFT JOIN public.kentexa_fee_standing st ON st."accountType" = a."accountType" AND st."accountId" = a."accountId"
        LEFT JOIN public.super_agent sa ON a."accountType" = 'office' AND sa.id = a."accountId"
        LEFT JOIN public.agent ag ON a."accountType" = 'agent' AND ag.id = a."accountId"
        LEFT JOIN public."user" u ON u.id = CASE a."accountType" WHEN 'office' THEN sa."userId" WHEN 'agent' THEN ag."userId" ELSE a."accountId" END
       ORDER BY COALESCE(st."inArrears", false) DESC, COALESCE(st.owed, 0) DESC, f."lastJobAt" DESC NULLS LAST
       LIMIT 2000`);
    const n = (v: any) => Math.round(Number(v) || 0);
    const all = rows.map((r) => ({
      accountType: r.accountType, accountId: Number(r.accountId), who: r.who || null, phone: r.phone || null,
      jobs: n(r.jobs), free: n(r.free), monthJobs: n(r.monthJobs), fees: n(r.fees), paid: n(r.paid), owed: n(r.owed),
      late: Boolean(r.late), locked: Boolean(r.locked), waiting: n(r.waiting), invoices: n(r.invoices), lastJobAt: r.lastJobAt, lastPaidAt: r.lastPaidAt,
    }));
    const totals = {
      accounts: all.length,
      owing: all.filter((r) => r.owed > 0).length,
      late: all.filter((r) => r.late).length,
      locked: all.filter((r) => r.locked).length,
      owed: all.reduce((sum, r) => sum + r.owed, 0),
      paid: all.reduce((sum, r) => sum + r.paid, 0),
      waiting: all.reduce((sum, r) => sum + r.waiting, 0),
    };
    const words = String(q ?? '').trim().toLowerCase();
    const picked = all
      .filter((r) => (filter === 'late' ? r.late : filter === 'locked' ? r.locked : filter === 'all' ? true : r.owed > 0))
      .filter((r) => !words || `${r.who ?? ''} ${r.phone ?? ''} ${r.accountId}`.toLowerCase().includes(words));
    return { ready: true, invoicesOn: invoices, totals, rows: picked.slice(0, 300) };
  }

  /** One account for admin: who, the numbers, its invoices, payments and latest jobs. */
  async adminAccount(type: FeeAccountType, id: number, now = new Date()) {
    if (!(await this.ready())) throw new BadRequestException(FEE_TEXT.notReady);
    if (!['office', 'agent', 'seller'].includes(type)) throw new BadRequestException(FEE_TEXT.badAs);
    const who = await this.accountName(type, id);
    const [any] = await this.db.query(`SELECT 1 AS ok FROM public.kentexa_fee WHERE "accountType" = $1::varchar AND "accountId" = $2::int
      UNION SELECT 1 FROM public.kentexa_fee_payment WHERE "accountType" = $1::varchar AND "accountId" = $2::int
      UNION SELECT 1 FROM public.kentexa_fee_standing WHERE "accountType" = $1::varchar AND "accountId" = $2::int LIMIT 1`, [type, id]);
    if (!any) throw new NotFoundException(FEE_TEXT.noAccount);
    const s = await this.settings();
    const st = await this.stateOf(type, id, s, now);
    const n = (v: any) => Math.round(Number(v) || 0);
    const [sum] = await this.db.query(`SELECT COUNT(*)::int AS jobs, COALESCE(SUM("baseAmount"), 0) AS earned, COALESCE(SUM(fee), 0) AS fees,
        COUNT(*) FILTER (WHERE "freeJob")::int AS free, MIN("doneAt") AS "firstJobAt"
      FROM public.kentexa_fee WHERE "accountType" = $1::varchar AND "accountId" = $2::int`, [type, id]);
    const payments: any[] = await this.db.query(`SELECT id, amount, reference, status, reason, "createdAt", "reviewedAt", "proofRef"
      FROM public.kentexa_fee_payment WHERE "accountType" = $1::varchar AND "accountId" = $2::int ORDER BY id DESC LIMIT 50`, [type, id]);
    const recent: any[] = await this.db.query(`SELECT id, "sourceType", "sourceRef", "baseAmount", fee, "freeJob", "doneAt"
      FROM public.kentexa_fee WHERE "accountType" = $1::varchar AND "accountId" = $2::int ORDER BY "doneAt" DESC LIMIT 30`, [type, id]);
    const [lastReminder] = await this.db.query(`SELECT MAX("sentAt") AS at FROM public.kentexa_fee_reminder
      WHERE "accountType" = $1::varchar AND "accountId" = $2::int AND kind = 'admin'`, [type, id]).catch(() => [null]);
    return {
      accountType: type, accountId: id, who: who.name, phone: who.phone,
      owed: st.owed, legacy: n(st.legacy), late: st.inArrears, locked: (await this.lockOn()) && st.locked, lockAmount: s.lockAmount,
      jobs: n(sum?.jobs), earned: n(sum?.earned), fees: n(sum?.fees), free: n(sum?.free), firstJobAt: sum?.firstJobAt ?? null,
      invoices: await this.invoicesOf(type, id, now),
      payments: payments.map((p) => ({ id: Number(p.id), amount: n(p.amount), reference: p.reference, status: p.status, reason: p.reason,
        createdAt: p.createdAt, reviewedAt: p.reviewedAt, proofUrl: signedLipaProofUrl(p.proofRef) })),
      recent: recent.map((r) => ({ ...r, id: Number(r.id), baseAmount: n(r.baseAmount), fee: n(r.fee) })),
      lastRemindedAt: lastReminder?.at ?? null,
    };
  }

  /** Admin "Mkumbushe": one in-app reminder with the amount owed, at most once a day per account. */
  async adminRemind(type: FeeAccountType, id: number, now = new Date()) {
    const acc = await this.adminAccount(type, id, now);
    const who = await this.accountName(type, id);
    if (!who.userId) throw new NotFoundException(FEE_TEXT.noAccount);
    const day = new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
    const ins = await this.db.query(`INSERT INTO public.kentexa_fee_reminder ("accountType", "accountId", kind, "periodKey")
      VALUES ($1::varchar, $2::int, 'admin', $3::varchar) ON CONFLICT DO NOTHING RETURNING id`, [type, id, day]);
    if (!ins?.length) throw new BadRequestException(FEE_TEXT.remindedToday);
    const open = acc.invoices.filter((i) => i.left > 0);
    const line = open.length
      ? `Ankara ${open.length} hazijalipwa (${open.map((i) => i.number).join(', ')}).`
      : 'Ada ya mwezi huu inaendelea kuhesabiwa.';
    await this.notifications?.notify({
      userId: who.userId, type: 'kentexa_fee', title: 'Ada ya KenteXa: kumbusho',
      body: `Deni lako la ada ni ${money(acc.owed)}. ${line} Lipa kwa Lipa Namba ya KenteXa kisha tuma picha ya malipo.`,
      actionPage: 'KentexaFee', actionParam: type, sourceType: 'kentexa_fee', sourceId: id,
    }).catch(() => undefined);
    const s = await this.settings();
    const smsSent = await this.textAccount(type, id,
      `KenteXa: deni lako la ada ni ${money(acc.owed)}. ${line} Lipa Namba ${s.lipaNumber} (${s.lipaBank}, ${s.lipaName}), kisha tuma picha ya malipo kwenye app.`);
    return { ok: true, owed: acc.owed, smsSent };
  }

  // ── The account's own view ──────────────────────────────────────────────
  /** Which account is asking: its own ofisi (active role), its own agent profile, or itself as seller. */
  async accountFor(user: { id: number }, as: string, roleContext?: any): Promise<{ type: FeeAccountType; id: number; name: string | null }> {
    if (as === 'office') {
      if (!roleContext || roleContext.roleType !== 'super_agent' || Number(roleContext.userId) !== Number(user.id)) {
        throw new ForbiddenException(FEE_TEXT.noOffice);
      }
      const [o] = await this.db.query(`SELECT id, "businessName", "workspaceId" FROM public.super_agent
        WHERE id = $1::int AND "userId" = $2::int`, [roleContext.profileId, user.id]);
      if (!o || (o.workspaceId != null && Number(o.workspaceId) !== Number(roleContext.workspaceId))) throw new ForbiddenException(FEE_TEXT.noOffice);
      return { type: 'office', id: Number(o.id), name: o.businessName ?? null };
    }
    if (as === 'agent') {
      const [a] = await this.db.query(`SELECT id FROM public.agent WHERE "userId" = $1::int`, [user.id]);
      if (!a) throw new ForbiddenException(FEE_TEXT.noAgent);
      return { type: 'agent', id: Number(a.id), name: null };
    }
    if (as === 'seller') return { type: 'seller', id: Number(user.id), name: null };
    throw new BadRequestException(FEE_TEXT.badAs);
  }

  async mine(user: { id: number }, as: string, roleContext?: any, now = new Date()) {
    if (!(await this.ready())) return { ready: false };
    const acc = await this.accountFor(user, as, roleContext);
    const s = await this.settings();
    const st = await this.stateOf(acc.type, acc.id, s, now);
    const [month] = await this.db.query(`
      SELECT COUNT(*)::int AS jobs, COALESCE(SUM("baseAmount"), 0) AS earned, COALESCE(SUM(fee), 0) AS fee,
             COUNT(*) FILTER (WHERE "freeJob")::int AS free
        FROM public.kentexa_fee
       WHERE "accountType" = $1::varchar AND "accountId" = $2::int
         AND date_trunc('month', "doneAt" AT TIME ZONE 'Africa/Dar_es_Salaam') = date_trunc('month', now() AT TIME ZONE 'Africa/Dar_es_Salaam')`,
      [acc.type, acc.id]);
    const recent: any[] = await this.db.query(`SELECT id, "sourceType", "sourceRef", "baseAmount", fee, "freeJob", "doneAt"
      FROM public.kentexa_fee WHERE "accountType" = $1::varchar AND "accountId" = $2::int ORDER BY "doneAt" DESC LIMIT 20`, [acc.type, acc.id]);
    const payments: any[] = await this.db.query(`SELECT id, amount, reference, status, reason, "createdAt", "reviewedAt"
      FROM public.kentexa_fee_payment WHERE "accountType" = $1::varchar AND "accountId" = $2::int ORDER BY id DESC LIMIT 10`, [acc.type, acc.id]);
    const freeLeft = await this.freeLeft(this.db, acc.type, acc.id, s);
    const rule = ruleFor(acc.type, s);
    const n = (v: any) => Math.round(Number(v) || 0);
    return {
      ready: true, as: acc.type, name: acc.name,
      owed: st.owed, legacy: n(st.legacy), inArrears: st.inArrears,
      locked: (await this.lockOn()) && st.locked, lockWarn: (await this.lockOn()) && st.warn, lockAmount: s.lockAmount,
      month: { jobs: n(month?.jobs), earned: n(month?.earned), fee: n(month?.fee), free: n(month?.free) },
      freeLeft,
      rule: { rate: rule.rate, min: rule.min, cap: Number.isFinite(rule.cap) ? rule.cap : null },
      lipa: { number: s.lipaNumber, name: s.lipaName, bank: s.lipaBank },
      waiting: payments.filter((p) => p.status === 'waiting').reduce((sum, p) => sum + n(p.amount), 0),
      recent: recent.map((r) => ({ ...r, id: Number(r.id), baseAmount: n(r.baseAmount), fee: n(r.fee) })),
      payments: payments.map((p) => ({ ...p, id: Number(p.id), amount: n(p.amount) })),
      invoices: await this.invoicesOf(acc.type, acc.id, now).catch(() => []),
    };
  }

  /** The owner opens one of its invoices. */
  async myInvoice(user: { id: number }, as: string, invoiceId: number, roleContext?: any) {
    const acc = await this.accountFor(user, as, roleContext);
    return this.invoiceDetail(invoiceId, { type: acc.type, id: acc.id });
  }

  async pay(user: { id: number }, body: { as?: string; amount?: unknown; proofRef?: unknown; reference?: unknown }, roleContext?: any) {
    if (!(await this.ready())) throw new BadRequestException(FEE_TEXT.notReady);
    const acc = await this.accountFor(user, String(body?.as ?? ''), roleContext);
    const amount = Math.round(Number(body?.amount));
    if (!Number.isFinite(amount) || amount < 100 || amount > 50_000_000) throw new BadRequestException(FEE_TEXT.badAmount);
    const proofRef = typeof body?.proofRef === 'string' ? body.proofRef.trim() : '';
    if (!LIPA_PROOF_REF.test(proofRef)) throw new BadRequestException(FEE_TEXT.badProof);
    const reference = typeof body?.reference === 'string' && body.reference.trim() ? body.reference.trim().slice(0, 60) : null;
    const [w] = await this.db.query(`SELECT COUNT(*)::int AS n FROM public.kentexa_fee_payment
      WHERE "accountType" = $1::varchar AND "accountId" = $2::int AND status = 'waiting'`, [acc.type, acc.id]);
    if ((Number(w?.n) || 0) >= 3) throw new BadRequestException(FEE_TEXT.tooManyWaiting);
    const [row] = await this.db.query(`INSERT INTO public.kentexa_fee_payment ("accountType", "accountId", "userId", amount, "proofRef", reference)
      VALUES ($1::varchar, $2::int, $3::int, $4::numeric, $5::varchar, $6::varchar) RETURNING id, status`,
      [acc.type, acc.id, user.id, amount, proofRef, reference]);
    return { id: Number(row.id), status: row.status, amount };
  }

  // ── Admin: confirm or reject a payment ──────────────────────────────────
  async adminPayments(status = 'waiting') {
    if (!(await this.ready())) return [];
    const st = ['waiting', 'confirmed', 'rejected'].includes(status) ? status : 'waiting';
    const rows: any[] = await this.db.query(`
      SELECT p.*, u.name AS "userName", u.phone AS "userPhone",
             CASE p."accountType" WHEN 'office' THEN (SELECT "businessName" FROM public.super_agent WHERE id = p."accountId")
                                  ELSE NULL END AS "officeName",
             s.owed
        FROM public.kentexa_fee_payment p
        LEFT JOIN public."user" u ON u.id = p."userId"
        LEFT JOIN public.kentexa_fee_standing s ON s."accountType" = p."accountType" AND s."accountId" = p."accountId"
       WHERE p.status = $1::varchar ORDER BY p.id ${st === 'waiting' ? 'ASC' : 'DESC'} LIMIT 100`, [st]);
    return rows.map((r) => ({
      id: Number(r.id), accountType: r.accountType, accountId: Number(r.accountId), amount: Number(r.amount),
      reference: r.reference, status: r.status, reason: r.reason, createdAt: r.createdAt, reviewedAt: r.reviewedAt,
      who: r.officeName || r.userName || null, phone: r.userPhone || null, owed: Number(r.owed) || 0,
      proofUrl: signedLipaProofUrl(r.proofRef),
    }));
  }

  async adminReview(adminUserId: number, id: number, decision: 'confirm' | 'reject', reason?: string) {
    if (!(await this.ready())) throw new BadRequestException(FEE_TEXT.notReady);
    const why = String(reason ?? '').trim();
    if (decision === 'reject' && why.length < 5) throw new BadRequestException(FEE_TEXT.reasonShort);
    const [row] = await this.db.query(`UPDATE public.kentexa_fee_payment
      SET status = $2::varchar, reason = $3::varchar, "reviewedByUserId" = $4::int, "reviewedAt" = now()
      WHERE id = $1::int AND status = 'waiting' RETURNING "accountType", "accountId", "userId", amount`,
      [id, decision === 'confirm' ? 'confirmed' : 'rejected', decision === 'reject' ? why.slice(0, 200) : null, adminUserId]);
    if (!row) {
      const [exists] = await this.db.query(`SELECT id FROM public.kentexa_fee_payment WHERE id = $1::int`, [id]);
      throw exists ? new BadRequestException(FEE_TEXT.notWaiting) : new NotFoundException(FEE_TEXT.missing);
    }
    const st = await this.refreshStanding(row.accountType, Number(row.accountId));
    await this.notifications?.notify({
      userId: Number(row.userId), type: 'kentexa_fee',
      title: decision === 'confirm' ? 'Malipo yamethibitishwa' : 'Malipo hayakukubaliwa',
      body: decision === 'confirm'
        ? `Tumepokea ${money(row.amount)}. Deni lililobaki: ${money(st.owed)}. Asante.`
        : `Malipo ya ${money(row.amount)} hayakukubaliwa: ${why}. Tuma picha sahihi tena.`,
      actionPage: 'KentexaFee', actionParam: row.accountType, sourceType: 'kentexa_fee_payment', sourceId: id,
    }).catch(() => undefined);
    return { id, status: decision === 'confirm' ? 'confirmed' : 'rejected', owed: st.owed };
  }
}
