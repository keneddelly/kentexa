import { lastValueFrom, of } from 'rxjs';
import { GuestCacheInterceptor, __clearGuestCacheForTests } from './guest-cache';
import { SpikeModeService, spikeMode } from './spike-mode.service';
import { SpikeModeController } from './traffic.module';
import { AnalyticsController } from '../analytics/analytics.controller';
import { AddFeedReadIndexes1796300000000 } from '../database/migrations/1796300000000-AddFeedReadIndexes';

const ctx = (req: any, res: any): any => ({ switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) });
const res = () => ({ headers: {} as Record<string, string>, statusCode: 200, setHeader(k: string, v: string) { this.headers[k] = v; } });

beforeEach(() => { __clearGuestCacheForTests(); spikeMode.set(false, null); });

describe('traffic step 2 (#368): short cache for signed-out visitors', () => {
  it('a second signed-out visitor gets the same answer without asking the database again', async () => {
    const icp = new GuestCacheInterceptor(30);
    const handler = { handle: jest.fn(() => of({ items: [1, 2] })) };
    const r1 = res();
    expect(await lastValueFrom(icp.intercept(ctx({ method: 'GET', originalUrl: '/feed?page=1', headers: {} }, r1), handler))).toEqual({ items: [1, 2] });
    const r2 = res();
    expect(await lastValueFrom(icp.intercept(ctx({ method: 'GET', originalUrl: '/feed?page=1', headers: {} }, r2), handler))).toEqual({ items: [1, 2] });
    expect(handler.handle).toHaveBeenCalledTimes(1);
    expect(r1.headers['X-Cache']).toBe('MISS');
    expect(r2.headers['X-Cache']).toBe('HIT');
    expect(r2.headers['Cache-Control']).toBe('public, max-age=30');
  });

  it('a signed-in person is never cached: their feed is their own', async () => {
    const icp = new GuestCacheInterceptor(30);
    const handler = { handle: jest.fn(() => of({ mine: true })) };
    const req = { method: 'GET', originalUrl: '/feed?page=1', headers: { authorization: 'Bearer x' } };
    await lastValueFrom(icp.intercept(ctx(req, res()), handler));
    await lastValueFrom(icp.intercept(ctx(req, res()), handler));
    expect(handler.handle).toHaveBeenCalledTimes(2);
  });

  it('different pages and different queries are kept apart; errors are not kept', async () => {
    const icp = new GuestCacheInterceptor(30);
    const handler = { handle: jest.fn(() => of({ ok: true })) };
    await lastValueFrom(icp.intercept(ctx({ method: 'GET', originalUrl: '/feed?page=1', headers: {} }, res()), handler));
    await lastValueFrom(icp.intercept(ctx({ method: 'GET', originalUrl: '/feed?page=2', headers: {} }, res()), handler));
    const bad = res(); bad.statusCode = 500;
    await lastValueFrom(icp.intercept(ctx({ method: 'GET', originalUrl: '/feed/trending', headers: {} }, bad), handler));
    await lastValueFrom(icp.intercept(ctx({ method: 'GET', originalUrl: '/feed/trending', headers: {} }, res()), handler));
    expect(handler.handle).toHaveBeenCalledTimes(4);
  });

  it('in spike mode the cache lasts twice as long', async () => {
    spikeMode.set(true, 1);
    const r = res();
    await lastValueFrom(new GuestCacheInterceptor(30).intercept(ctx({ method: 'GET', originalUrl: '/x', headers: {} }, r), { handle: () => of(1) }));
    expect(r.headers['Cache-Control']).toBe('public, max-age=60');
  });
});

describe('traffic step 2 (#368): the emergency switch', () => {
  it('is off by default, follows SPIKE_MODE, and the admin switch wins until restart', () => {
    const svc = new SpikeModeService();
    expect(svc.isOn()).toBe(false);
    process.env.SPIKE_MODE = 'on';
    expect(svc.isOn()).toBe(true);
    delete process.env.SPIKE_MODE;
    expect(svc.set(true, 4)).toMatchObject({ on: true, source: 'admin' });
    expect(svc.isOn()).toBe(true);
  });

  it('every change by an admin is recorded', () => {
    const events: any = { record: jest.fn().mockResolvedValue(undefined) };
    const ctl = new SpikeModeController(new SpikeModeService(), events);
    expect(ctl.set(true, { user: { id: 3 } })).toMatchObject({ on: true });
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'SPIKE_MODE_CHANGED', actorId: 3, metadata: { on: true } }));
    expect(() => ctl.set('yes', { user: { id: 3 } })).toThrow();
  });

  it('browsing records wait during a spike', async () => {
    spikeMode.set(true, 1);
    const service: any = { trackEvent: jest.fn() };
    const out = await new AnalyticsController(service).trackEvents({ events: [{ sessionId: 's', eventType: 'page_view' }] }, { headers: {}, socket: {} } as any);
    expect(out).toEqual({ ok: true, received: 0, paused: true });
    expect(service.trackEvent).not.toHaveBeenCalled();
  });

  it('AI stops except safety checks', async () => {
    spikeMode.set(true, 1);
    const { AiService } = require('../ai/ai.service');
    const ai = Object.create(AiService.prototype);
    ai.safety = { assertInputLength: jest.fn() };
    await expect(ai.generate({ task: 'search-parse', prompt: 'simu' })).rejects.toThrow('AI imesimamishwa');
    ai.cache = { get: () => ({ data: 'ok' }) };
    await expect(ai.generate({ task: 'moderation', prompt: 'hi', cacheKey: 'k' })).resolves.toEqual({ data: 'ok' });
  });
});

describe('traffic step 2 (#368): feed indexes', () => {
  it('only adds indexes', async () => {
    const q: any = { query: jest.fn() };
    await new AddFeedReadIndexes1796300000000().up(q);
    expect(q.query).toHaveBeenCalledTimes(3);
    for (const [sql] of q.query.mock.calls) expect(sql).toMatch(/^CREATE INDEX IF NOT EXISTS/);
  });
});
