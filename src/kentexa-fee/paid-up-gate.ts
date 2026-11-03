/**
 * "Paid-up first" (owner approved 2026-11-03). Work never stops for an unpaid fee; an ofisi
 * or agent with a fee unpaid for more than 30 days only goes after the paid-up ones for the
 * jobs KenteXa itself brings:
 *   - agents: a waiting pickup/delivery job is shown to them only after the first
 *     few minutes (setting agent_first_minutes, default 10), like the seller-partner gate;
 *   - offices: in the sender's list of offices they come after the paid-up offices.
 * Walk-in customers are never affected. Until migration 1794600000000 runs the gate is TRUE.
 * kentexa_fee_standing is kept up to date by KentexaFeeService (every 10 minutes).
 */
export const PAID_UP_FIRST_MESSAGE =
  'Kazi hii itakufikia baada ya dakika chache: wenye ada iliyolipwa wanaipata kwanza. Lipa Ada ya KenteXa upate kazi mapema.';

let standingReady = false;
let firstMinutes = 10;

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
  if (!standingReady || firstMinutes <= 0) return 'TRUE';
  return `(t."createdAt" <= now() - interval '${firstMinutes} minutes'
    OR NOT EXISTS (SELECT 1 FROM public.kentexa_fee_standing kfs
       WHERE kfs."accountType" = 'agent' AND kfs."accountUserId" = (${agentUserIdSql}) AND kfs."inArrears" = true))`;
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
