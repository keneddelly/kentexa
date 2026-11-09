import { NotFoundException } from '@nestjs/common';
import { AdminDataService, ADMIN_DATASETS } from './admin-data.service';

/** Owner 2026-11-09: every kind of data listed for the admin; a reported Moment can be hidden. */
describe('AdminDataService', () => {
  it('lists every dataset; words and status become parameters; unknown is 404; a failing query is an empty list', async () => {
    expect(Object.keys(ADMIN_DATASETS)).toEqual(expect.arrayContaining(['moments', 'reports', 'communities', 'hotel_orders', 'pos_sales',
      'team_invitations', 'instagram', 'office_prices', 'agent_jobs', 'reviews', 'notifications']));
    const db = { query: jest.fn(async () => [{ id: 1 }]) };
    const svc = new AdminDataService(db as any);
    const r = await svc.list('communities', { q: 'wajasiriamali', status: 'active' });
    expect(r.rows).toEqual([{ id: 1 }]);
    const [sql, params] = db.query.mock.calls[0] as any;
    expect(sql).toMatch(/ILIKE \$1/);
    expect(sql).toMatch(/c\.status::text = \$2/);
    expect(params).toEqual(['%wajasiriamali%', 'active']);
    await expect(svc.list('passwords')).rejects.toBeInstanceOf(NotFoundException);
    const broken = new AdminDataService({ query: jest.fn(async () => { throw new Error('no table'); }) } as any);
    await expect(broken.list('moments')).resolves.toMatchObject({ rows: [], unavailable: true });
  });

  it('never selects tokens, PINs or payment proofs', () => {
    const svc: any = new AdminDataService({} as any);
    expect(svc).toBeDefined();
    const src = require('fs').readFileSync(require('path').join(__dirname, 'admin-data.service.ts'), 'utf8');
    expect(src).not.toMatch(/accessTokenEncrypted|"token"|t\.token|pinHash|lipaProofUrl/);
  });

  it('hide a reported Moment: archived, its open reports closed; keep: only the reports', async () => {
    const calls: string[] = [];
    const db = { query: jest.fn(async (sql: string) => { calls.push(sql); return sql.startsWith('SELECT') ? [{ id: 5, postId: 9 }] : [{ id: 5 }, { id: 6 }]; }) };
    const svc = new AdminDataService(db as any);
    await expect(svc.reviewReport(5, 1, 'hide')).resolves.toEqual({ postId: 9, decision: 'hide', reportsClosed: 2 });
    expect(calls.some((s) => /UPDATE public\.business_feed_item SET status = 'archived'/.test(s))).toBe(true);
    calls.length = 0;
    await svc.reviewReport(5, 1, 'keep');
    expect(calls.some((s) => /business_feed_item/.test(s))).toBe(false);
  });
});
