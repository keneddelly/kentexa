/**
 * Settings for the "received but not dispatched" reminder. Environment
 * variables, so they can change without new code:
 *
 *   DISPATCH_REMINDER_ENABLED        off-switch (default ON). false, 0, off or no = no
 *                                    nightly SMS, no in-app reminder, no red notice. Anything
 *                                    else, or not set = on.
 *   DISPATCH_REMINDER_STALE_HOURS    hours after receipt before a parcel turns red (default 6) --
 *                                    used by BOTH the dashboard red notice and the evening SMS
 *   DISPATCH_REMINDER_SMS_TIME       nightly check / SMS time, Tanzania time, HH:MM (default 22:00;
 *                                    offices such as Kariakoo hand parcels to transport at night)
 *   DISPATCH_REMINDER_LATEST_TIME    no SMS after this time, HH:MM (default 23:30) -- if the
 *                                    server was down at 22:00 it catches up until then.
 *                                    Must be later than the SMS time on the same day (no window
 *                                    across midnight).
 *
 * "Still here" hides a parcel until the next day's check time (default 22:00),
 * so a parcel marked at 21:00 is not shown again an hour later.
 */
export const TANZANIA_TZ = 'Africa/Dar_es_Salaam';
// Tanzania has no daylight saving: always UTC+3.
const TANZANIA_OFFSET_MS = 3 * 60 * 60 * 1000;

const parseHhMm = (value: string | undefined, fallback: string): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((value ?? '').trim()) ?? /^(\d{1,2}):(\d{2})$/.exec(fallback)!;
  const h = Number(m[1]); const min = Number(m[2]);
  return h <= 23 && min <= 59 ? h * 60 + min : parseHhMm(undefined, fallback);
};

export interface DispatchReminderSettings {
  enabled: boolean;
  staleHours: number;
  smsMinuteOfDay: number;
  latestMinuteOfDay: number;
}

export function readDispatchReminderSettings(env: NodeJS.ProcessEnv = process.env): DispatchReminderSettings {
  const hours = Number(env.DISPATCH_REMINDER_STALE_HOURS);
  const smsMinuteOfDay = parseHhMm(env.DISPATCH_REMINDER_SMS_TIME, '22:00');
  const latest = parseHhMm(env.DISPATCH_REMINDER_LATEST_TIME, '23:30');
  return {
    enabled: !['false', '0', 'off', 'no'].includes(String(env.DISPATCH_REMINDER_ENABLED ?? '').trim().toLowerCase()),
    staleHours: Number.isFinite(hours) && hours > 0 ? hours : 6,
    smsMinuteOfDay,
    // A cut-off before the SMS time would mean the SMS is never sent: fall back to 23:59.
    latestMinuteOfDay: latest >= smsMinuteOfDay ? latest : 23 * 60 + 59,
  };
}

/**
 * "Still here" hides a parcel until the check time (e.g. 22:00) of the
 * Tanzania calendar day AFTER the day it was marked. Marked 21:00 or 23:00
 * on Monday -> visible again at Tuesday's 22:00 check, and counted in it.
 */
export function stillHereHiddenUntil(markedAt: Date, smsMinuteOfDay: number): Date {
  const { date } = tanzaniaClock(markedAt);
  const nextDayMidnightUtc = Date.parse(`${date}T00:00:00Z`) + 24 * 3600_000;
  return new Date(nextDayMidnightUtc + smsMinuteOfDay * 60_000 - TANZANIA_OFFSET_MS);
}

/** The Tanzania calendar date (YYYY-MM-DD) and minute of day for an instant. */
export function tanzaniaClock(now: Date): { date: string; minuteOfDay: number } {
  const local = new Date(now.getTime() + TANZANIA_OFFSET_MS);
  return {
    date: local.toISOString().slice(0, 10),
    minuteOfDay: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

/** The evening SMS, in Swahili. Never contains customer data. */
export function eveningSmsText(count: number): string {
  return count === 1
    ? 'KenteXa: Una kifurushi 1 kilichopokelewa bila taarifa za kusafirisha. Fungua dashibodi kuweka taarifa.'
    : `KenteXa: Una vifurushi ${count} vilivyopokelewa bila taarifa za kusafirisha. Fungua dashibodi kuweka taarifa.`;
}
