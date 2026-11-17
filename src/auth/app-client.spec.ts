import { AuthController, isAppClient, APP_REFRESH_HEADER } from './auth.controller';
import { VersionController } from '../version.controller';

/** Native app sign-in (#422 N0): refresh credential by header for the app, cookie for the web as before. */
describe('native app refresh credential', () => {
  const make = () => {
    const auth: any = {
      issueRefreshCredential: jest.fn(() => 'cred-1'),
      refresh: jest.fn(async (c: string) => ({ accessToken: 'a', activeContext: { userId: 1 }, used: c })),
      logoutWithCredential: jest.fn(async () => ({ ok: true })),
    };
    return { ctl: new AuthController(auth, {} as any), auth };
  };
  const res = (headers: Record<string, string> = {}) => {
    const out: any = { cookie: jest.fn(), setHeader: jest.fn(), clearCookie: jest.fn(), req: { headers } };
    return out;
  };

  it('only the app header marks the app', () => {
    expect(isAppClient({ headers: { 'x-kentexa-client': 'app' } })).toBe(true);
    expect(isAppClient({ headers: {} })).toBe(false);
    expect(isAppClient(undefined)).toBe(false);
  });

  it('the app gets the credential in a header and refreshes with it; the web keeps the cookie only', async () => {
    const { ctl, auth } = make();
    const appRes = res({ 'x-kentexa-client': 'app' });
    const r: any = await ctl.refresh({ headers: { 'x-kentexa-client': 'app', [APP_REFRESH_HEADER]: 'old' } }, appRes);
    expect(r.used).toBe('old');
    expect(appRes.setHeader).toHaveBeenCalledWith(APP_REFRESH_HEADER, 'cred-1');
    expect(appRes.cookie).toHaveBeenCalled();

    const webRes = res({});
    await ctl.refresh({ headers: { cookie: 'kx_refresh=webcred' } }, webRes);
    expect(auth.refresh).toHaveBeenLastCalledWith('webcred');
    expect(webRes.setHeader).not.toHaveBeenCalled();
  });

  it('a header credential without the app mark is ignored', async () => {
    const { ctl } = make();
    await expect(ctl.refresh({ headers: { [APP_REFRESH_HEADER]: 'x' } }, res({}))).rejects.toThrow('missing');
  });

  it('the app asks which version is needed', () => {
    process.env.APP_MIN_VERSION_CODE = '120';
    const v: any = new VersionController().getAppVersion();
    expect(v.minVersionCode).toBe(120);
    expect(v.androidUrl).toContain('com.app.bishoo');
    delete process.env.APP_MIN_VERSION_CODE;
  });
});
