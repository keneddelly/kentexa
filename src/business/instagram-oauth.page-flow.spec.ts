import axios from 'axios';
import { InstagramConnectError, InstagramOAuthService } from './instagram-oauth.service';

jest.mock('axios');
const mocked = { get: axios.get as unknown as jest.Mock, post: axios.post as unknown as jest.Mock };

/**
 * Owner 2026-11-09: the Instagram connection kept breaking. With Facebook Login, Instagram
 * messaging works through the linked Facebook Page and its Page access token (Meta: Instagram
 * Messaging, Get started / Send a message). The old flow stored the short-lived user token and
 * subscribed the Instagram id with it.
 */
describe('InstagramOAuthService.completeAuthorization (through the Page)', () => {
  const config = { get: (k: string) => ({ META_APP_ID: 'app', META_APP_SECRET: 'secret', META_INSTAGRAM_REDIRECT_URI: 'https://api/cb', META_GRAPH_API_VERSION: 'v26.0' } as any)[k] };
  const build = () => {
    const saved: any[] = [];
    const updates: any[] = [];
    const states = { createQueryBuilder: () => ({ update: () => ({ set: () => ({ where: () => ({ returning: () => ({ execute: async () => ({ raw: [{ id: 1, businessId: 9, userId: 4 }] }) }) }) }) }) }) };
    const connections = {
      findOne: jest.fn(async () => null),
      create: jest.fn((x: any) => ({ ...x })),
      save: jest.fn(async (x: any) => { const r = { id: 70 + saved.length, ...x }; saved.push(r); return r; }),
      update: jest.fn(async (id: number, x: any) => { updates.push({ id, ...x }); }),
    };
    const svc = new InstagramOAuthService(config as any, states as any, connections as any,
      { assertCanManage: jest.fn(async () => undefined) } as any, { encrypt: (t: string) => `enc(${t})` } as any);
    return { svc, saved, updates };
  };
  const granted = (list: string[]) => ({ data: { data: list.map((permission) => ({ permission, status: 'granted' })) } });
  const ALL = ['instagram_manage_messages', 'pages_manage_metadata', 'pages_show_list', 'instagram_basic'];

  beforeEach(() => jest.resetAllMocks());

  it('long-lived token, the Page and its Instagram account, the Page token stored, the PAGE subscribed', async () => {
    mocked.get.mockImplementation(async (url: string, opts: any) => {
      if (url.endsWith('/oauth/access_token') && opts.params.code) return { data: { access_token: 'SHORT', expires_in: 5000 } };
      if (url.endsWith('/oauth/access_token')) return { data: { access_token: 'LONG' } };
      if (url.endsWith('/me/permissions')) return granted(ALL);
      if (url.endsWith('/me/accounts')) return { data: { data: [
        { id: '111', name: 'BiS Page', access_token: 'PAGETOKEN', instagram_business_account: { id: '178', username: 'bis_tz' } },
        { id: '222', name: 'Page bila Instagram', access_token: 'X' },
      ] } };
      throw new Error('unexpected ' + url);
    });
    mocked.post.mockResolvedValue({ data: { success: true } });
    const { svc, saved, updates } = build();
    const r = await svc.completeAuthorization('code', 'state');
    expect(r).toEqual({ businessId: 9, connected: [{ id: 70, username: 'bis_tz', webhookSubscribed: true }] });
    expect(mocked.get).toHaveBeenCalledWith('https://graph.facebook.com/v26.0/oauth/access_token',
      expect.objectContaining({ params: expect.objectContaining({ grant_type: 'fb_exchange_token', fb_exchange_token: 'SHORT' }) }));
    expect(mocked.get).toHaveBeenCalledWith('https://graph.facebook.com/v26.0/me/accounts', expect.objectContaining({ params: expect.objectContaining({ access_token: 'LONG' }) }));
    expect(saved[0]).toMatchObject({ businessId: 9, instagramUserId: '178', instagramUsername: 'bis_tz', facebookPageId: '111',
      facebookPageName: 'BiS Page', accessTokenEncrypted: 'enc(PAGETOKEN)', tokenExpiresAt: null, status: 'active' });
    expect(mocked.post).toHaveBeenCalledWith('https://graph.facebook.com/v26.0/111/subscribed_apps', {},
      expect.objectContaining({ params: { subscribed_fields: 'messages', access_token: 'PAGETOKEN' } }));
    expect(updates[0]).toEqual({ id: 70, webhookSubscribed: true, webhookError: null });
  });

  it('a refused subscription is kept with Meta\'s short reason, never hidden', async () => {
    mocked.get.mockImplementation(async (url: string, opts: any) => {
      if (url.endsWith('/oauth/access_token')) return { data: { access_token: opts.params.code ? 'SHORT' : 'LONG' } };
      if (url.endsWith('/me/permissions')) return granted(ALL);
      return { data: { data: [{ id: '111', name: 'BiS', access_token: 'P', instagram_business_account: { id: '178', username: 'bis' } }] } };
    });
    mocked.post.mockRejectedValue({ response: { data: { error: { code: 200, message: 'Requires pages_manage_metadata permission' } } } });
    const { svc, updates } = build();
    const r = await svc.completeAuthorization('code', 'state');
    expect(r.connected[0].webhookSubscribed).toBe(false);
    expect(updates[0]).toEqual({ id: 70, webhookSubscribed: false, webhookError: '(#200) Requires pages_manage_metadata permission' });
  });

  it('missing permissions, or no Page with Instagram: a clear reason for the page', async () => {
    mocked.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/oauth/access_token')) return { data: { access_token: 'T' } };
      if (url.endsWith('/me/permissions')) return granted(['instagram_manage_messages']);
      return { data: { data: [] } };
    });
    await expect(build().svc.completeAuthorization('code', 'state')).rejects.toMatchObject({ reason: 'permission' });

    mocked.get.mockImplementation(async (url: string) => {
      if (url.endsWith('/oauth/access_token')) return { data: { access_token: 'T' } };
      if (url.endsWith('/me/permissions')) return granted(ALL);
      return { data: { data: [{ id: '222', name: 'No IG', access_token: 'X' }] } };
    });
    const err = await build().svc.completeAuthorization('code', 'state').catch((e) => e);
    expect(err).toBeInstanceOf(InstagramConnectError);
    expect(err.reason).toBe('no_instagram');
  });
});
