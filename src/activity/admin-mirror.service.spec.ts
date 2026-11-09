import { NotFoundException } from '@nestjs/common';
import { AdminMirrorService } from './admin-mirror.service';

/** Owner 2026-11-09: the admin mirror reads only what was recorded, part by part. */
describe('AdminMirrorService', () => {
  it('feed: filters become SQL conditions with their own placeholders; a cursor goes back', async () => {
    const db = { query: jest.fn(async () => [{ id: 9 }, { id: 8 }]) };
    const r = await new AdminMirrorService(db as any).feed({ category: 'COMMERCE', actorId: 40, kind: 'action', before: 100, limit: 2 });
    const [sql, params] = db.query.mock.calls[0] as any;
    expect(sql).toMatch(/e\.category::text = \$1/);
    expect(sql).toMatch(/\(e\."actorId" = \$2 OR e\."relatedUserId" = \$2\)/);
    expect(sql).toMatch(/e\."eventType" = 'ACTION'/);
    expect(sql).toMatch(/e\.id < \$3/);
    expect(params).toEqual(['COMMERCE', 40, 100]);
    expect(r.nextBefore).toBe(8);
  });

  it('person: never the password or ID number; a missing table blanks only its part', async () => {
    const db = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM public."user" WHERE id')) return [{ id: 40, name: 'Baraka', phone: '0713', email: null, role: 'user' }];
      if (sql.includes('identity_profile')) return [{ status: 'pending', idType: 'nida' }];
      if (sql.includes('business_feed_item')) throw new Error('no table');
      if (sql.startsWith('SELECT count(*)')) return [{ count: '3' }];
      return [];
    }) };
    const r: any = await new AdminMirrorService(db as any).person(40);
    expect(r.user.name).toBe('Baraka');
    expect(r.identity).toEqual({ status: 'pending', idType: 'nida' });
    expect(r.counts.moments).toBeNull();
    expect(r.counts.ordersBought).toBe(3);
    const all = db.query.mock.calls.map((c: any) => c[0]).join('\n');
    expect(all).not.toMatch(/password|"idNumber"|idDocumentImageUrl/);
    await expect(new AdminMirrorService({ query: jest.fn(async () => []) } as any).person(1)).rejects.toBeInstanceOf(NotFoundException);
  });
  it('chats: one person\'s chats from either side; a chat opens with all its messages', async () => {
    const db = { query: jest.fn(async (sql: string) => {
      if (sql.includes('conversation_message')) return [{ id: 1, senderType: 'customer', content: 'Bei gani?' }, { id: 2, senderType: 'seller', content: '20,000' }];
      return [{ id: 5, sellerId: 7, customerUserId: 40 }];
    }) };
    const svc = new AdminMirrorService(db as any);
    await svc.chats({ userId: 40, q: 'simu' });
    const [sql, params] = db.query.mock.calls[0] as any;
    expect(sql).toMatch(/\(c\.seller_id = \$1 OR bc\.user_id = \$1\)/);
    expect(params).toEqual([40, '%simu%']);
    const r: any = await svc.chat(5);
    expect(r.conversation.customerUserId).toBe(40);
    expect(r.messages.map((m: any) => m.content)).toEqual(['Bei gani?', '20,000']);
    const none = new AdminMirrorService({ query: jest.fn(async () => []) } as any);
    await expect(none.chat(99)).rejects.toBeInstanceOf(NotFoundException);
  });
});
