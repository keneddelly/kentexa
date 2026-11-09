import { FUNNEL_STEPS, GOAL_KEYS, OnboardingFunnelService } from './onboarding-funnel.service';

/** Owner 2026-11-09: onboarding progress in admin, counts only, from the database. */
describe('OnboardingFunnelService', () => {
  it('counts each step since N days ago, with the share of those who joined; a missing table blanks one step', async () => {
    const db = { query: jest.fn(async (sql: string, params: unknown[]) => {
      if (sql.includes('community_member')) throw new Error('no table');
      if (sql.includes("'goals', '[]'::jsonb) ?")) return [{ count: params[1] === 'sell' ? '4' : '0' }];
      if (sql.includes('user_topic_follow')) return [{ count: '25' }];
      return [{ count: '50' }];
    }) };
    const r: any = await new OnboardingFunnelService(db as any).funnel(7);
    expect(r.days).toBe(7);
    expect(r.steps).toHaveLength(FUNNEL_STEPS.length);
    expect(r.steps[0]).toMatchObject({ key: 'joined', count: 50, percent: 100 });
    expect(r.steps.find((s: any) => s.key === 'topics')).toMatchObject({ count: 25, percent: 50 });
    expect(r.steps.find((s: any) => s.key === 'community')).toMatchObject({ count: null, percent: null });
    expect(r.goals).toHaveLength(GOAL_KEYS.length);
    expect(r.goals.find((g: any) => g.key === 'sell').count).toBe(4);
    const since = (db.query.mock.calls[0] as any)[1][0] as Date;
    expect(Date.now() - since.getTime()).toBeGreaterThanOrEqual(7 * 86400000 - 1000);
  });
});
