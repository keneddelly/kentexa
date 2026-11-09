import { InstagramMessagingService } from './instagram-messaging.service';

/** Owner 2026-11-09: replies go out through the linked Facebook Page with the Page token. */
describe('InstagramMessagingService.deliverText (through the Page)', () => {
  const conversation: any = { id: 3, channel: 'instagram', externalId: 'instagram:70:555', customerId: 8, ownerWorkspaceType: 'seller_profile', ownerWorkspaceId: 2, sellerId: 4 };
  const build = (connection: any) => {
    const qb: any = { addSelect: () => qb, where: () => qb, andWhere: () => qb, getOne: async () => connection };
    const connections = { createQueryBuilder: () => qb, update: jest.fn(async () => undefined) };
    const svc = new InstagramMessagingService(connections as any,
      { findOne: async () => ({ id: 1 }) } as any,
      { findOne: async () => ({ createdAt: new Date() }) } as any,
      { findOne: async () => ({ id: 2, businessId: 9 }) } as any,
      { decrypt: () => 'PAGE TOKEN' } as any, { get: () => 'v26.0' } as any);
    return { svc, connections };
  };
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('POST /{page-id}/messages with the Page token', async () => {
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ message_id: 'm1' }) }));
    global.fetch = fetchMock as any;
    const { svc } = build({ id: 70, instagramUserId: '178', facebookPageId: '111', accessTokenEncrypted: 'x', status: 'active' });
    await expect(svc.deliverText(conversation, 'Habari')).resolves.toBe('m1');
    const [url, init] = fetchMock.mock.calls[0] as any;
    expect(url).toBe('https://graph.facebook.com/v26.0/111/messages?access_token=PAGE%20TOKEN');
    expect(JSON.parse(init.body)).toEqual({ recipient: { id: '555' }, message: { text: 'Habari' } });
  });

  it('a connection made the old way (no Page) asks to reconnect; an expired token (code 190) too', async () => {
    const old = build({ id: 70, instagramUserId: '178', facebookPageId: null, accessTokenEncrypted: 'x', status: 'active' });
    await expect(old.svc.deliverText(conversation, 'Habari')).rejects.toThrow('Unganisha Instagram tena');
    expect(old.connections.update).toHaveBeenCalledWith(70, { status: 'reauth_required' });

    global.fetch = jest.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: { code: 190 } }) })) as any;
    const expired = build({ id: 71, instagramUserId: '178', facebookPageId: '111', accessTokenEncrypted: 'x', status: 'active' });
    await expect(expired.svc.deliverText(conversation, 'Habari')).rejects.toThrow('renewed');
    expect(expired.connections.update).toHaveBeenCalledWith(71, { status: 'reauth_required' });
  });
});
