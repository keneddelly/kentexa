import { __resetMetricsForTests, metricsSnapshot, recordRequest, recordSlowQuery, requestMetricsMiddleware } from './request-metrics';
import { SlowQueryLogger } from './slow-query.logger';
import { VersionController } from '../version.controller';

beforeEach(() => __resetMetricsForTests());

describe('traffic step 1 (#368): live numbers for the server', () => {
  it('counts requests per minute, statuses and response times over 5 minutes', () => {
    const t = Date.UTC(2026, 10, 16, 6, 0, 30);
    for (let i = 1; i <= 100; i += 1) recordRequest(200, i * 10, t);
    recordRequest(429, 5, t);
    recordRequest(503, 5, t);
    recordRequest(200, 50, t - 10 * 60000); // older than the window
    const s = metricsSnapshot(null, t);
    expect(s.requests.total).toBe(102);
    expect(s.requests.status).toEqual({ ok2xx: 100, redirect3xx: 0, client4xx: 1, tooMany429: 1, server5xx: 1 });
    expect(s.requests.latencyMs.p95).toBeGreaterThanOrEqual(940);
    expect(s.requests.latencyMs.max).toBe(1000);
    expect(s.requests.perMinute.at(-1)).toEqual({ minute: '06:00', count: 102 });
  });

  it('the middleware times a request when it finishes, once', () => {
    const handlers: Record<string, () => void> = {};
    const res: any = { statusCode: 201, on: (e: string, fn: () => void) => { handlers[e] = fn; } };
    const next = jest.fn();
    requestMetricsMiddleware({}, res, next);
    expect(next).toHaveBeenCalled();
    expect(metricsSnapshot(null).requests.inFlight).toBe(1);
    handlers.finish(); handlers.close();
    const s = metricsSnapshot(null);
    expect(s.requests.inFlight).toBe(0);
    expect(s.requests.total).toBe(1);
  });

  it('keeps slow queries by their text only, slowest first', () => {
    const log = new SlowQueryLogger();
    log.logQuerySlow(1500, 'SELECT * FROM   business_feed_item WHERE id = $1');
    log.logQuerySlow(2500, 'SELECT * FROM business_feed_item WHERE id = $1');
    recordSlowQuery('SELECT 1', 1200);
    const slow = metricsSnapshot(null).database.slowQueries;
    expect(slow[0]).toMatchObject({ sql: 'SELECT * FROM business_feed_item WHERE id = $1', count: 2, maxMs: 2500 });
    expect(slow).toHaveLength(2);
  });

  it('GET /version/health reports the database pool when the driver has one', () => {
    const ctl = new VersionController({ driver: { master: { totalCount: 6, idleCount: 1, waitingCount: 3, options: { max: 10 } } } } as any);
    expect(ctl.health().database.pool).toEqual({ total: 6, idle: 1, waiting: 3, max: 10 });
    expect(new VersionController().health().database.pool).toBeNull();
  });
});
