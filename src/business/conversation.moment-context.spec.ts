import { ConversationService } from './conversation.service';

/** Home Feed phase C (2026-11-02): Contact on a post keeps which post started the chat. */
const build = (row: any) => {
  const svc: any = Object.create(ConversationService.prototype);
  const calls: any[] = [];
  const qb: any = {
    where: (...a: any[]) => { calls.push(a); return qb; },
    andWhere: (...a: any[]) => { calls.push(a); return qb; },
    getOne: jest.fn().mockResolvedValue(row),
  };
  svc.convoRepo = { manager: { createQueryBuilder: jest.fn(() => qb) } };
  return { svc, calls };
};

describe('moment as conversation context', () => {
  it('the seller\'s own visible post becomes the chat tag', async () => {
    const { svc, calls } = build({ id: 7, title: 'Taa mpya za sola', imageUrl: 'x.jpg', price: 25000 });
    expect(await svc.resolveContext(3, { type: 'moment', id: 7 }, 9))
      .toEqual({ type: 'moment', id: 7, title: 'Taa mpya za sola', image: 'x.jpg', price: 25000 });
    expect(calls).toContainEqual(['f."businessId" = :sellerId', { sellerId: 3 }]);
    expect(calls.some(([sql, p]) => /visibility = 'public'/.test(sql) && p?.feedViewerId === 9)).toBe(true);
  });

  it('a post that is not the seller\'s, inactive or not visible gives no tag (the chat still opens)', async () => {
    const { svc } = build(null);
    expect(await svc.resolveContext(3, { type: 'moment', id: 7 }, 9)).toBeNull();
  });
});
