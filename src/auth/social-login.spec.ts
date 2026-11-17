import { createHmac } from 'crypto';
import { socialConfig, verifyFacebook, verifyGoogle } from './social-login';

// Ingia kwa Google / Facebook (owner 2026-11-17): the server checks every token with Google / Facebook.
const reply = (body: any, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) });
const future = Math.floor(Date.now() / 1000) + 600;

describe('social sign-in: token checks', () => {
  const env: any = { GOOGLE_CLIENT_ID: 'web-1.apps.googleusercontent.com', FACEBOOK_APP_ID: '123', FACEBOOK_APP_SECRET: 'shh' };

  it('a provider without its keys is off; the Facebook secret is never part of the public config', () => {
    expect(socialConfig({} as any)).toMatchObject({ google: null, facebook: null });
    expect(socialConfig({ FACEBOOK_APP_ID: '123' } as any).facebook).toBeNull();
    expect(socialConfig(env)).toMatchObject({ google: 'web-1.apps.googleusercontent.com', facebook: '123' });
  });

  it('Google: accepts a token for our client id; refuses another app, a wrong issuer or an expired one', async () => {
    const good = { sub: 'g1', aud: 'web-1.apps.googleusercontent.com', iss: 'https://accounts.google.com', exp: String(future),
      email: 'Asha@Gmail.com', email_verified: 'true', name: 'Asha', picture: 'https://p/a.jpg' };
    const p = await verifyGoogle('tok', env, () => reply(good));
    expect(p).toEqual({ provider: 'google', sub: 'g1', email: 'asha@gmail.com', emailVerified: true, name: 'Asha', picture: 'https://p/a.jpg' });
    expect(await verifyGoogle('tok', env, () => reply({ ...good, aud: 'someone-else' }))).toBeNull();
    expect(await verifyGoogle('tok', env, () => reply({ ...good, iss: 'evil.com' }))).toBeNull();
    expect(await verifyGoogle('tok', env, () => reply({ ...good, exp: '1000' }))).toBeNull();
    expect(await verifyGoogle('tok', env, () => reply({}, false))).toBeNull();
    expect((await verifyGoogle('tok', env, () => reply({ ...good, email_verified: 'false' })))?.emailVerified).toBe(false);
    expect(await verifyGoogle('tok', {} as any, () => reply(good))).toBeNull();
  });

  it('Facebook: the token must belong to our app and the profile id must match; its email never auto-links', async () => {
    const urls: string[] = [];
    const fetchFn = (url: string) => {
      urls.push(url);
      return url.includes('debug_token')
        ? reply({ data: { is_valid: true, app_id: '123', user_id: 'f9' } })
        : reply({ id: 'f9', name: 'Juma', email: 'juma@x.com', picture: { data: { url: 'https://p/j.jpg', is_silhouette: false } } });
    };
    const p = await verifyFacebook('fbtok', env, fetchFn);
    expect(p).toEqual({ provider: 'facebook', sub: 'f9', email: 'juma@x.com', emailVerified: false, name: 'Juma', picture: 'https://p/j.jpg' });
    expect(urls[1]).toContain(`appsecret_proof=${createHmac('sha256', 'shh').update('fbtok').digest('hex')}`);
    const otherApp = (url: string) => (url.includes('debug_token') ? reply({ data: { is_valid: true, app_id: '999', user_id: 'f9' } }) : reply({ id: 'f9' }));
    expect(await verifyFacebook('fbtok', env, otherApp)).toBeNull();
    const mismatch = (url: string) => (url.includes('debug_token') ? reply({ data: { is_valid: true, app_id: '123', user_id: 'f9' } }) : reply({ id: 'f1' }));
    expect(await verifyFacebook('fbtok', env, mismatch)).toBeNull();
  });
});
