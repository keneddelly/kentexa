import { cleanClientError, describeBrowser } from './client-errors';
import { ClientErrorsController } from './client-errors.controller';
import { SKIP_ROUTE } from './action-recorder.interceptor';

const OLD_ANDROID = 'Mozilla/5.0 (Linux; Android 7.0; TECNO K7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Mobile Safari/537.36';

describe('page error reports', () => {
  it('names the browser and phone system coarsely', () => {
    expect(describeBrowser(OLD_ANDROID)).toEqual({ name: 'Chrome', version: 69, os: 'Android', osVersion: '7.0' });
    expect(describeBrowser('Opera/9.80 (Android; Opera Mini/36.2.2254/119.132; U; id) Presto/2.12.423 Version/12.16').name).toBe('Opera Mini');
    expect(describeBrowser('Mozilla/5.0 (Linux; Android 10; wv) AppleWebKit/537.36 Version/4.0 Chrome/83.0.4103.106 Mobile Safari/537.36'))
      .toMatchObject({ name: 'Android WebView', version: 83 });
    expect(describeBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 15_4 like Mac OS X) AppleWebKit/605.1.15 Version/15.4 Mobile/15E148 Safari/604.1'))
      .toMatchObject({ name: 'Safari', version: 15, os: 'iOS', osVersion: '15.4' });
    expect(describeBrowser(null)).toEqual({ name: 'other', version: null, os: 'other', osVersion: null });
  });

  it('keeps the path only, never the query, and cuts long texts', () => {
    const r = cleanClientError({ kind: 'page', page: 'Store-5', path: '/store/5?so=secret#x', message: 'x'.repeat(500), stack: 's', appMode: 'android_app' }, OLD_ANDROID);
    expect(r).toMatchObject({ kind: 'page', page: 'Store-5', path: '/store/5', appMode: 'android_app' });
    expect(r!.message).toHaveLength(300);
    expect(JSON.stringify(r)).not.toContain('secret');
  });

  it('ignores anything that is not a report', () => {
    expect(cleanClientError(null, '')).toBeNull();
    expect(cleanClientError({ kind: 'hack', message: 'x' }, '')).toBeNull();
    expect(cleanClientError({ kind: 'page', message: '   ' }, '')).toBeNull();
    expect(cleanClientError({ kind: 'page', message: 'x', appMode: 'admin' }, '')!.appMode).toBe('web');
  });

  it('records one CLIENT_ERROR system event per report, signed in or not', async () => {
    const events: any = { record: jest.fn().mockResolvedValue(undefined) };
    const ctl = new ClientErrorsController(events, {} as any);
    await ctl.report({ kind: 'page', page: 'Home', message: 'boom' }, { headers: { 'user-agent': OLD_ANDROID }, user: { id: 9 } });
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'CLIENT_ERROR', actorId: 9, actorType: 'user', visibility: 'system', severity: 'warning',
      metadata: expect.objectContaining({ page: 'Home', browser: expect.objectContaining({ name: 'Chrome', version: 69 }) }),
    }));
    await ctl.report({ kind: 'slow', message: 'slow' }, { headers: {} });
    expect(events.record).toHaveBeenLastCalledWith(expect.objectContaining({ actorId: null, actorType: 'visitor', severity: 'info' }));
    await ctl.report({ nope: true }, { headers: {} });
    expect(events.record).toHaveBeenCalledTimes(2);
  });

  it('is not also recorded as a person\'s action', () => {
    expect(SKIP_ROUTE.test('/client-errors')).toBe(true);
  });

  it('summarises the last days for the admin, within 1 to 90 days', async () => {
    const ds: any = { query: jest.fn().mockResolvedValue([{ kind: 'page', page: 'Home', message: 'boom', count: 3 }]) };
    const ctl = new ClientErrorsController({} as any, ds);
    expect(await ctl.summary('500')).toEqual({ days: 90, errors: [{ kind: 'page', page: 'Home', message: 'boom', count: 3 }] });
    expect(ds.query.mock.calls[0][1]).toEqual(['90']);
  });
});
