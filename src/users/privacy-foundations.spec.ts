import { BadRequestException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { ERASE_TRACKING_SQL, HIDE_PUBLIC_SQL } from '../auth/account-deletion';
import { AnalyticsRetentionService, ANALYTICS_RETENTION_MONTHS } from '../analytics/analytics-retention.service';
import { AddMarketingOptOut1796200000000 } from '../database/migrations/1796200000000-AddMarketingOptOut';

describe('issue #365: a person can say no to KenteXa news and offers', () => {
  it('saves the person\'s own choice with the time it was made', async () => {
    const repo: any = { update: jest.fn().mockResolvedValue(undefined) };
    const svc = new UsersService(repo, {} as any);
    const off = await svc.setMarketingOptOut(4, true);
    expect(off.marketingOptOut).toBe(true);
    expect(off.marketingOptOutAt).toBeInstanceOf(Date);
    expect(repo.update).toHaveBeenCalledWith(4, expect.objectContaining({ marketingOptOut: true }));
    expect(await svc.setMarketingOptOut(4, false)).toEqual({ marketingOptOut: false, marketingOptOutAt: null });
  });

  it('only for the signed-in person, and only a clear yes or no', async () => {
    const svc: any = { setMarketingOptOut: jest.fn().mockResolvedValue({ marketingOptOut: true }) };
    const ctl = new UsersController(svc);
    await ctl.setMarketing({ user: { id: 9 } }, true);
    expect(svc.setMarketingOptOut).toHaveBeenCalledWith(9, true);
    expect(() => ctl.setMarketing({ user: { id: 9 } }, 'yes')).toThrow(BadRequestException);
  });

  it('the migration only adds columns', async () => {
    const q: any = { query: jest.fn() };
    await new AddMarketingOptOut1796200000000().up(q);
    for (const [sql] of q.query.mock.calls) expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS/);
  });
});

describe('issue #365: deleting an account also deletes its browsing records', () => {
  it('visits, taps and searches go, including from before signing in; orders and payments are not touched', () => {
    const all = ERASE_TRACKING_SQL.join('\n');
    expect(all).toMatch(/DELETE FROM public\.analytics_events/);
    expect(all).toMatch(/analytics_sessions WHERE "userId" = \$1\)/);
    expect(all).toMatch(/DELETE FROM public\.analytics_sessions/);
    expect([...HIDE_PUBLIC_SQL, ...ERASE_TRACKING_SQL].join('\n')).not.toMatch(/DELETE FROM public\.(order|payment|invoice|activity_events)/);
  });
});

describe('issue #365: browsing records are kept 12 months', () => {
  it('removes older records in batches, then empty old sessions', async () => {
    const ds: any = { query: jest.fn().mockResolvedValueOnce([[], 5000]).mockResolvedValueOnce([[], 12]).mockResolvedValueOnce([[], 3]) };
    const svc = new AnalyticsRetentionService(ds);
    expect(await svc.run()).toEqual({ events: 5012, sessions: 3 });
    expect(ANALYTICS_RETENTION_MONTHS).toBe(12);
    expect(ds.query.mock.calls[0][0]).toMatch(/INTERVAL '12 months'/);
    expect(ds.query.mock.calls[2][0]).toMatch(/NOT EXISTS/);
  });

  it('never throws from the nightly job', async () => {
    const svc = new AnalyticsRetentionService({ query: jest.fn().mockRejectedValue(new Error('down')) } as any);
    await expect(svc.nightly()).resolves.toBeUndefined();
  });
});

describe('issue #365: "Tuma taarifa" to many people skips those who said no', () => {
  it('everyone = everyone who did not say no; one person still gets their message', async () => {
    const { KentexaMessagesService } = require('../announcements/kentexa-messages.service');
    const userRepo: any = {
      find: jest.fn(async () => [{ id: 1, phone: '255700000001' }]),
      findOne: jest.fn(async () => ({ id: 7, phone: '255700000007' })),
    };
    const svc = new KentexaMessagesService({} as any, userRepo, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    await svc.recipients({ audience: 'all' });
    expect(userRepo.find.mock.calls[0][0].where).toEqual({ marketingOptOut: false });
    expect(await svc.recipients({ targetUserId: 7 })).toEqual([{ id: 7, phone: '255700000007' }]);
  });
});
