import { CvsService } from './cvs.service';

/** #374 C: comments as a conversation — one level of replies, and "Penda" state per viewer. */
const build = (comments: any[], likedRows: any[] = []) => {
  const svc: any = Object.create(CvsService.prototype);
  svc.assertCanSeePost = jest.fn().mockResolvedValue(undefined);
  svc.feedRepo = { findOne: jest.fn().mockResolvedValue({ id: 7 }) };
  svc.commentRepo = {
    find: jest.fn().mockResolvedValue(comments),
    query: jest.fn().mockResolvedValue(likedRows),
  };
  svc.attachOfferCards = jest.fn(async (cs: any[]) => cs);
  return svc;
};

const at = (m: number) => new Date(Date.UTC(2026, 10, 16, 8, m));

describe('comment threads (#374 C)', () => {
  it('a reply to a reply is shown in its comment thread, in time order', async () => {
    const svc = build([
      { id: 1, helpfulCount: 2, replies: [
        { id: 2, createdAt: at(1), replies: [{ id: 4, createdAt: at(3) }] },
        { id: 3, createdAt: at(2), replies: [] },
      ] },
    ]);
    const out = await svc.getComments(7, null);
    expect(out[0].replies.map((r: any) => r.id)).toEqual([2, 3, 4]);
    expect(out[0].replies[0].replies).toBeUndefined();
    expect(out[0].likedByMe).toBe(false);
    expect(svc.commentRepo.query).not.toHaveBeenCalled(); // nobody signed in
  });

  it('marks what the viewer liked', async () => {
    const svc = build([{ id: 1, helpfulCount: 1, replies: [{ id: 2, createdAt: at(1) }] }], [{ commentId: 2 }]);
    const out = await svc.getComments(7, 44);
    expect(out[0].likedByMe).toBe(false);
    expect(out[0].replies[0].likedByMe).toBe(true);
    expect(out[0].replies[0].helpfulCount).toBe(0);
    expect(svc.commentRepo.query).toHaveBeenCalledWith(expect.stringContaining('post_comment_helpful_vote'), [44, [1, 2]]);
  });
});
