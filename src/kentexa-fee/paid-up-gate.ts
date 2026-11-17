/**
 * "Paid-up first" (owner approved 2026-11-03). Work never stops for an unpaid fee; an ofisi
 * or agent with a fee unpaid for more than 30 days only goes after the paid-up ones for the
 * jobs KenteXa itself brings:
 *   - agents: a waiting pickup/delivery job is shown to them only after the first
 *     few minutes (setting agent_first_minutes, default 10), like the seller-partner gate;
 *   - offices: in the sender's list of offices they come after the paid-up offices.
 * Walk-in customers are never affected. Until migration 1794600000000 runs the gate is TRUE.
 * kentexa_fee_standing is kept up to date by KentexaFeeService (every 10 minutes).
 *
 * Kufungwa (owner 2026-11-17: "the threshold value should be 50000/= then the account lock"):
 * an account owing at least TZS 50,000 with part of it unpaid for more than 30 days gets no NEW
 * work until it pays: an agent sees and takes no new pickup jobs, an ofisi registers no new
 * walk-in parcel and is left out of the senders' office list, a seller takes no new KenteXa
 * checkout order. Work already started goes on; signing in, messages and paying always work.
 * Until migration 1797300000000 runs, nothing is locked.
 */
export const PAID_UP_FIRST_MESSAGE =
  'Kazi hii itakufikia baada ya dakika chache: wenye ada iliyolipwa wanaipata kwanza. Lipa Ada ya KenteXa upate kazi mapema.';

let standingReady = false;
let firstMinutes = 10;
let lockReady = false;

export const FEE_LOCKED_TEXT = {
  agent: 'Huwezi kupokea kazi mpya: deni la Ada ya KenteXa limefika kiwango cha kufungwa. Lipa deni, kazi zitarudi mara tukithibitisha.',
  office: 'Ofisi haiwezi kupokea vifurushi vipya: deni la Ada ya KenteXa limefika kiwango cha kufungwa. Lipa deni, kazi zitarudi mara tukithibitisha.',
  seller: 'Muuzaji huyu hapokei maagizo mapya kwa sasa. Jaribu tena baadaye au chagua muuzaji mwingine.',
} as const;

export function setFeeLockReady(ready: boolean) {
  lockReady = ready;
}

export function feeLockReady(): boolean {
  return standingReady && lockReady;
}

/** SQL condition: the agent whose USER id is `agentUserIdSql` is NOT locked. */
export function agentNotLockedSql(agentUserIdSql: string): string {
  if (!feeLockReady()) return 'TRUE';
  return `NOT EXISTS (SELECT 1 FROM public.kentexa_fee_standing kfl
       WHERE kfl."accountType" = 'agent' AND kfl."accountUserId" = (${agentUserIdSql}) AND kfl.locked = true)`;
}

/** Locked accounts of one type among `ids` (empty before the migration). */
export async function lockedAccounts(db: { query: (sql: string, p?: any[]) => Promise<any> }, type: 'office' | 'agent' | 'seller', ids: number[]): Promise<Set<number>> {
  if (!feeLockReady() || !ids.length) return new Set();
  const rows: any[] = await db.query(`SELECT "accountId" FROM public.kentexa_fee_standing
    WHERE "accountType" = $1::varchar AND locked = true AND "accountId" = ANY($2::int[])`, [type, ids]).catch(() => []);
  return new Set(rows.map((r) => Number(r.accountId)));
}

export function setFeeStandingReady(ready: boolean, minutes?: number) {
  standingReady = ready;
  if (minutes != null && Number.isFinite(minutes)) firstMinutes = Math.min(60, Math.max(0, Math.round(minutes)));
}

export function feeStandingReady(): boolean {
  return standingReady;
}

/**
 * SQL condition: may the agent whose USER id is `agentUserIdSql` see/take pickup task `t`
 * now? Needs alias t (parcel_pickup_task) in the outer query.
 */
export function paidUpGateSql(agentUserIdSql: string): string {
  const lock = agentNotLockedSql(agentUserIdSql);
  if (!standingReady || firstMinutes <= 0) return lock;
  const first = `(t."createdAt" <= now() - interval '${firstMinutes} minutes'
    OR NOT EXISTS (SELECT 1 FROM public.kentexa_fee_standing kfs
       WHERE kfs."accountType" = 'agent' AND kfs."accountUserId" = (${agentUserIdSql}) AND kfs."inArrears" = true))`;
  return lock === 'TRUE' ? first : `(${lock} AND ${first})`;
}

/** Offices with a fee unpaid for more than 30 days (empty before the migration). */
export async function officesInArrears(db: { query: (sql: string, p?: any[]) => Promise<any> }, ids: number[]): Promise<Set<number>> {
  if (!standingReady || !ids.length) return new Set();
  const rows: any[] = await db.query(`SELECT "accountId" FROM public.kentexa_fee_standing
    WHERE "accountType" = 'office' AND "inArrears" = true AND "accountId" = ANY($1::int[])`, [ids]).catch(() => []);
  return new Set(rows.map((r) => Number(r.accountId)));
}

/** Stable: paid-up offices first, each group keeping its own order (cheapest first). */
export function paidUpFirst<T>(list: T[], idOf: (x: T) => number, arrears: Set<number>): T[] {
  if (!arrears.size) return list;
  return [...list.filter((x) => !arrears.has(idOf(x))), ...list.filter((x) => arrears.has(idOf(x)))];
}
