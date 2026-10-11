import { DispatchRemindersService } from './dispatch-reminders.service';
import { eveningSmsText, readDispatchReminderSettings, stillHereHiddenUntil, tanzaniaClock } from './dispatch-reminders.config';

// In-memory stand-in for the two queries that matter: the per-office count
// and the one-row-per-office-per-day reminder table. Nothing real is sent.
function fakeWorld(offices: Array<{ superAgentId: number; count: number; phone: string | null; userId: number | null }>) {
  const rows = new Map<string, { id: number; status: string; attempts: number }>();
  const failFinalUpdateFor = new Set<number>();
  let nextId = 1;
  const keyOf = (officeId: number, date: string) => `${officeId}|${date}`;
  const byId = (id: number) => [...rows.values()].find((r) => r.id === id)!;
  const db = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      if (/GROUP BY s\."superAgentId"/.test(sql)) return offices.map((o) => ({ ...o, name: 'Office ' + o.superAgentId }));
      if (/INSERT INTO public\.super_agent_dispatch_reminder/.test(sql)) {
        const k = keyOf(params[0], params[1]);
        if (rows.has(k)) return [];
        const row = { id: nextId++, status: 'sending', attempts: 0 };
        rows.set(k, row);
        return [{ id: row.id }];
      }
      if (/WITH claimed AS[\s\S]*SET status = 'sending'/.test(sql)) {
        const row = rows.get(keyOf(params[0], params[1]));
        if (row && row.status === 'failed' && row.attempts === 1) { row.status = 'sending'; return [{ id: row.id }]; }
        return [];
      }
      if (/SET status = 'no_phone'/.test(sql)) { byId(params[0]).status = 'no_phone'; return []; }
      if (/SET status = \$2::varchar, attempts = attempts \+ 1/.test(sql)) {
        if (failFinalUpdateFor.has(params[0])) throw new Error('database hiccup');
        const row = byId(params[0]); row.status = params[1]; row.attempts += 1; return [];
      }
      if (/SET status = 'failed', attempts = attempts \+ 1/.test(sql)) {
        const row = byId(params[0]); if (row.status === 'sending') { row.status = 'failed'; row.attempts += 1; } return [];
      }
      throw new Error('unexpected SQL in test: ' + sql.slice(0, 80));
    }),
  };
  return { db, rows, failFinalUpdateFor };
}

const at = (iso: string) => new Date(iso);
// Tanzania = UTC+3. 19:05 UTC = 22:05 Tanzania (inside the default 22:00-23:30 window).
const EVENING = at('2026-10-10T19:05:00Z');

function build(offices: any[], smsResults: boolean[] = [true]) {
  const world = fakeWorld(offices);
  const results = [...smsResults];
  const sms = { sendSms: jest.fn(async () => (results.length ? results.shift()! : true)) };
  const inApp = { notify: jest.fn(async () => ({})) };
  const activity = { record: jest.fn(async () => undefined) };
  const svc = new DispatchRemindersService(world.db as any, sms as any, inApp as any, activity as any);
  return { svc, sms, inApp, world };
}

describe('dispatch reminder settings and text', () => {
  it('uses 6 hours, 22:00 and 23:30 by default, and reads the settings', () => {
    expect(readDispatchReminderSettings({})).toEqual({ enabled: true, staleHours: 6, smsMinuteOfDay: 22 * 60, latestMinuteOfDay: 23 * 60 + 30 });
    expect(readDispatchReminderSettings({ DISPATCH_REMINDER_STALE_HOURS: '12', DISPATCH_REMINDER_SMS_TIME: '17:30' }))
      .toEqual({ enabled: true, staleHours: 12, smsMinuteOfDay: 17 * 60 + 30, latestMinuteOfDay: 23 * 60 + 30 });
    expect(readDispatchReminderSettings({ DISPATCH_REMINDER_SMS_TIME: 'nonsense' }).smsMinuteOfDay).toBe(22 * 60);
  });

  it('off-switch: ON unless DISPATCH_REMINDER_ENABLED is false / 0 / off / no', () => {
    for (const off of ['false', 'FALSE', ' 0 ', 'off', 'No']) {
      expect(readDispatchReminderSettings({ DISPATCH_REMINDER_ENABLED: off }).enabled).toBe(false);
    }
    for (const on of [undefined, '', 'true', '1', 'yes', 'on', 'anything']) {
      expect(readDispatchReminderSettings({ DISPATCH_REMINDER_ENABLED: on }).enabled).toBe(true);
    }
  });

  it('never lets the cut-off fall before the SMS time (the SMS would never go)', () => {
    expect(readDispatchReminderSettings({ DISPATCH_REMINDER_LATEST_TIME: '21:00' }).latestMinuteOfDay).toBe(23 * 60 + 59);
  });

  it('"Still here" hides until the NEXT day\'s 22:00 check', () => {
    const hidden = (tzLocal: string) => stillHereHiddenUntil(at(tzLocal + '+03:00'), 22 * 60).toISOString();
    // Marked 21:00 Monday -> back at Tuesday 22:00 (not 23 hours early at Monday 22:00, not at midnight).
    expect(hidden('2026-10-12T21:00:00')).toBe(at('2026-10-13T22:00:00+03:00').toISOString());
    // Marked 23:00 Monday (after the check) -> Tuesday 22:00.
    expect(hidden('2026-10-12T23:00:00')).toBe(at('2026-10-13T22:00:00+03:00').toISOString());
    // Marked 09:00 Tuesday -> Wednesday 22:00.
    expect(hidden('2026-10-13T09:00:00')).toBe(at('2026-10-14T22:00:00+03:00').toISOString());
  });

  it('converts to Tanzania time (UTC+3), including the date', () => {
    expect(tanzaniaClock(at('2026-10-10T15:00:00Z'))).toEqual({ date: '2026-10-10', minuteOfDay: 18 * 60 });
    expect(tanzaniaClock(at('2026-10-10T22:30:00Z'))).toEqual({ date: '2026-10-11', minuteOfDay: 90 });
  });

  it('writes the Swahili SMS with the right count and no customer data', () => {
    expect(eveningSmsText(5)).toBe('KenteXa: Una vifurushi 5 vilivyopokelewa bila taarifa za kusafirisha. Fungua dashibodi kuweka taarifa.');
    expect(eveningSmsText(1)).toBe('KenteXa: Una kifurushi 1 kilichopokelewa bila taarifa za kusafirisha. Fungua dashibodi kuweka taarifa.');
  });
});

describe('evening SMS', () => {
  const office = { superAgentId: 7, count: 5, phone: '0711000111', userId: 70 };

  it('does nothing outside the 22:00-23:30 window', async () => {
    const { svc, sms, world } = build([office]);
    expect((await svc.runEvening(at('2026-10-10T15:05:00Z'))).skipped).toBe('outside_time_window'); // 18:05
    expect((await svc.runEvening(at('2026-10-10T18:55:00Z'))).skipped).toBe('outside_time_window'); // 21:55
    expect((await svc.runEvening(at('2026-10-10T20:35:00Z'))).skipped).toBe('outside_time_window'); // 23:35
    expect(world.db.query).not.toHaveBeenCalled();
    expect(sms.sendSms).not.toHaveBeenCalled();
  });

  describe('when switched off (DISPATCH_REMINDER_ENABLED=false)', () => {
    const saved = process.env.DISPATCH_REMINDER_ENABLED;
    beforeEach(() => { process.env.DISPATCH_REMINDER_ENABLED = 'false'; });
    afterEach(() => {
      if (saved === undefined) delete process.env.DISPATCH_REMINDER_ENABLED;
      else process.env.DISPATCH_REMINDER_ENABLED = saved;
    });

    it('sends nothing, writes nothing, and logs "off" once per night', async () => {
      const { svc, sms, inApp, world } = build([office]);
      const log = jest.spyOn((svc as any).logger, 'log').mockImplementation(() => undefined);
      expect(await svc.runEvening(EVENING)).toMatchObject({ sent: 0, skipped: 'disabled' });
      await svc.runEvening(at('2026-10-10T19:10:00Z'));
      expect(world.db.query).not.toHaveBeenCalled();
      expect(sms.sendSms).not.toHaveBeenCalled();
      expect(inApp.notify).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledTimes(1);
      expect(log.mock.calls[0][0]).toContain('off');
    });

    it('shows no red notice on the counter', async () => {
      const { svc, world } = build([office]);
      world.db.query.mockImplementationOnce(async () => [{ id: 7, userId: 70 }]); // officeForUser
      expect(await svc.mine(70)).toEqual({ enabled: false, staleHours: 6, count: 0, parcels: [] });
      expect(world.db.query).toHaveBeenCalledTimes(1); // only the office lookup, no parcel query
    });
  });

  it('sends one SMS to the OFFICE phone only, plus one in-app notification', async () => {
    const { svc, sms, inApp, world } = build([office]);
    expect(await svc.runEvening(EVENING)).toMatchObject({ sent: 1, failed: 0 });
    expect(sms.sendSms).toHaveBeenCalledTimes(1);
    expect(sms.sendSms).toHaveBeenCalledWith('0711000111', eveningSmsText(5));
    expect(inApp.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 70 }));
    expect([...world.rows.values()][0]).toMatchObject({ status: 'sent', attempts: 1 });
  });

  it('never sends a second SMS the same day (later ticks, restarts)', async () => {
    const { svc, sms, inApp } = build([office]);
    await svc.runEvening(EVENING);
    await svc.runEvening(at('2026-10-10T19:10:00Z'));
    await svc.runEvening(at('2026-10-10T20:25:00Z'));
    expect(sms.sendSms).toHaveBeenCalledTimes(1);
    expect(inApp.notify).toHaveBeenCalledTimes(1);
  });

  it('sends again on the next day', async () => {
    const { svc, sms } = build([office], [true, true]);
    await svc.runEvening(EVENING);
    await svc.runEvening(at('2026-10-11T19:05:00Z'));
    expect(sms.sendSms).toHaveBeenCalledTimes(2);
  });

  it('retries a failed SMS exactly once, then records the failure', async () => {
    const { svc, sms, world } = build([office], [false, false, true]);
    expect(await svc.runEvening(EVENING)).toMatchObject({ failed: 1 });
    expect(await svc.runEvening(at('2026-10-10T19:10:00Z'))).toMatchObject({ failed: 1 });
    expect(await svc.runEvening(at('2026-10-10T19:15:00Z'))).toMatchObject({ sent: 0, failed: 0 });
    expect(sms.sendSms).toHaveBeenCalledTimes(2);
    expect([...world.rows.values()][0]).toMatchObject({ status: 'failed', attempts: 2 });
  });

  it('a retry that succeeds is marked sent', async () => {
    const { svc, sms, world } = build([office], [false, true]);
    await svc.runEvening(EVENING);
    await svc.runEvening(at('2026-10-10T19:10:00Z'));
    expect(sms.sendSms).toHaveBeenCalledTimes(2);
    expect([...world.rows.values()][0]).toMatchObject({ status: 'sent', attempts: 2 });
  });

  it('records "no phone" and sends nothing when the office has no phone', async () => {
    const { svc, sms, inApp, world } = build([{ ...office, phone: null }]);
    expect(await svc.runEvening(EVENING)).toMatchObject({ noPhone: 1, sent: 0 });
    expect(sms.sendSms).not.toHaveBeenCalled();
    expect(inApp.notify).toHaveBeenCalledTimes(1);
    expect([...world.rows.values()][0].status).toBe('no_phone');
  });

  it('sends nothing when no office has a red list', async () => {
    const { svc, sms } = build([]);
    await svc.runEvening(EVENING);
    expect(sms.sendSms).not.toHaveBeenCalled();
  });

  it('a database error for one office never stops the others, and never leaves a row stuck at "sending"', async () => {
    const other = { superAgentId: 8, count: 2, phone: '0733000333', userId: 80 };
    const { svc, sms, world } = build([office, other], [true, true]);
    world.failFinalUpdateFor.add(1); // the first office's row
    expect(await svc.runEvening(EVENING)).toMatchObject({ sent: 1, failed: 1 });
    expect(sms.sendSms).toHaveBeenCalledWith('0733000333', eveningSmsText(2));
    const [first, second] = [...world.rows.values()];
    expect(first).toMatchObject({ status: 'failed', attempts: 1 });
    expect(second).toMatchObject({ status: 'sent', attempts: 1 });
  });

  it('a thrown SMS error is recorded as a failure, not a crash', async () => {
    const { svc, sms, world } = build([office]);
    sms.sendSms.mockRejectedValueOnce(new Error('network down'));
    expect(await svc.runEvening(EVENING)).toMatchObject({ failed: 1 });
    expect([...world.rows.values()][0]).toMatchObject({ status: 'failed', attempts: 1 });
  });
});
