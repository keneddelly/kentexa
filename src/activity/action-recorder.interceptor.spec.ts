import { of, lastValueFrom } from 'rxjs';
import { ActionRecorderInterceptor, categoryForRoute, safeParams, SKIP_ROUTE } from './action-recorder.interceptor';

/** Owner 2026-11-09: every change on KenteXa is recorded for the admin, never the body. */
describe('ActionRecorderInterceptor', () => {
  const ctx = (req: any, statusCode = 201) => ({
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => ({ statusCode }) }),
  }) as any;
  const run = async (req: any, body: any = { ok: true }) => {
    const events = { record: jest.fn(async () => undefined) };
    const i = new ActionRecorderInterceptor(events as any);
    await lastValueFrom(i.intercept(ctx(req), { handle: () => of(body) }));
    return events.record;
  };

  it('a change by a signed-in person: who, as which role, what route, which ids; no body', async () => {
    const record = await run({ method: 'PATCH', baseUrl: '', route: { path: '/orders/:id/cancel' }, params: { id: '12' },
      body: { reason: 'secret text', password: 'x' }, user: { id: 40 }, roleContext: { roleType: 'seller', profileId: 8, businessId: 4 } });
    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'ACTION', category: 'COMMERCE', actorId: 40, actorType: 'seller', businessId: 4, targetId: 12,
      metadata: expect.objectContaining({ method: 'PATCH', route: '/orders/:id/cancel', params: { id: 12 }, status: 201 }), visibility: 'admin',
    }));
    expect(JSON.stringify(record.mock.calls)).not.toMatch(/secret|password/);
  });

  it('sign-in: the id from the reply only; reads, pings and searches are not recorded', async () => {
    const login = await run({ method: 'POST', route: { path: '/auth/login' }, params: {} }, { access_token: 'TOKEN', user: { id: 7 } });
    expect(login).toHaveBeenCalledWith(expect.objectContaining({ actorId: 7, category: 'AUTH' }));
    expect(JSON.stringify(login.mock.calls)).not.toMatch(/TOKEN/);
    expect(await run({ method: 'GET', route: { path: '/orders' }, user: { id: 1 } })).not.toHaveBeenCalled();
    expect(await run({ method: 'POST', route: { path: '/transport/service-offers/discover' }, user: { id: 1 } })).not.toHaveBeenCalled();
    expect(await run({ method: 'POST', route: { path: '/products' }, params: {} })).not.toHaveBeenCalled(); // nobody signed in
  });

  it('helpers', () => {
    expect(categoryForRoute('/pickup-tasks/:id/claim')).toBe('LOGISTICS');
    expect(categoryForRoute('/identity/submit')).toBe('VERIFICATION');
    expect(safeParams({ id: '5', code: 'abc', text: 'a very long free text that should never be kept as a parameter value' })).toEqual({ id: 5, code: 'abc' });
    expect(SKIP_ROUTE.test('/business/instagram/webhook')).toBe(true);
    expect(SKIP_ROUTE.test('/quote-requests')).toBe(false);
  });
});
