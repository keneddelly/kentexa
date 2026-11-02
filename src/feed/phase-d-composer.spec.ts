import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FeedService } from './feed.service';
import { assertMedia, assertComposerText, cleanMedia, assertPublishInput } from './publish-input';

/** Home Feed phase D, the composer (owner approved 2026-11-02). */
describe('composer input', () => {
  const photo = (n: number) => ({ url: `https://cdn/x${n}.jpg`, width: 1200, height: 900 });

  it('takes up to 4 photos, never 5; each needs its address', () => {
    expect(() => assertMedia([photo(1), photo(2), photo(3), photo(4)])).not.toThrow();
    expect(() => assertMedia([photo(1), photo(2), photo(3), photo(4), photo(5)])).toThrow(BadRequestException);
    expect(() => assertMedia([{ url: '' }])).toThrow(BadRequestException);
    expect(() => assertMedia('x.jpg')).toThrow(BadRequestException);
    expect(() => assertPublishInput({ type: 'moment', title: 'Taa', media: [photo(1), { width: 2 }] })).toThrow(BadRequestException);
  });

  it('stores only url, width and height', () => {
    expect(cleanMedia([{ url: ' a.jpg ', width: '800', height: 0, extra: 'x' }])).toEqual([{ url: 'a.jpg', width: 800, height: null }]);
    expect(cleanMedia([])).toBeNull();
  });

  it('what a person types is at most 500 characters; question and discussion are known formats', () => {
    expect(() => assertComposerText({ body: 'a'.repeat(500) })).not.toThrow();
    expect(() => assertComposerText({ body: 'a'.repeat(501) })).toThrow(BadRequestException);
    expect(() => assertPublishInput({ type: 'moment', title: 'Nani anajua fundi?', intent: 'question' })).not.toThrow();
    expect(() => assertPublishInput({ type: 'moment', title: 'Tuzungumze', intent: 'discussion' })).not.toThrow();
  });
});

describe('edit within 15 minutes', () => {
  const created = new Date('2026-11-02T10:00:00Z');
  const build = (post: any) => {
    const svc: any = Object.create(FeedService.prototype);
    svc.feedRepo = { findOne: jest.fn().mockResolvedValue(post), update: jest.fn().mockResolvedValue(undefined) };
    svc.searchIndex = { upsert: jest.fn().mockResolvedValue(undefined), remove: jest.fn().mockResolvedValue(undefined) };
    svc.activityEvents = { record: jest.fn() };
    return svc;
  };
  const post = { id: 7, businessId: 3, isActive: true, createdAt: created, title: 'Taa', body: 'Taa', visibility: 'public', commerceProfileId: 5 };

  it('the author edits text, photos and audience; the edit has its own event', async () => {
    const svc = build({ ...post });
    const at = new Date(created.getTime() + 10 * 60 * 1000);
    const saved = await svc.editPost(3, 7, { body: 'Taa mpya', media: [{ url: 'b.jpg' }], visibility: 'followers' }, at);
    expect(svc.feedRepo.findOne).toHaveBeenCalledWith({ where: { id: 7, businessId: 3, isActive: true } });
    expect(svc.feedRepo.update).toHaveBeenCalledWith(7, expect.objectContaining({
      body: 'Taa mpya', imageUrl: 'b.jpg', visibility: 'followers', editedAt: at,
    }));
    expect(saved.editedAt).toEqual(at);
    expect(svc.searchIndex.remove).toHaveBeenCalledWith('moment', 7); // followers-only leaves search
    expect(svc.activityEvents.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'MOMENT_EDITED', targetId: 7 }));
  });

  it('after 15 minutes the post cannot be edited', async () => {
    const svc = build({ ...post });
    await expect(svc.editPost(3, 7, { body: 'x' }, new Date(created.getTime() + 16 * 60 * 1000))).rejects.toThrow(ForbiddenException);
    expect(svc.feedRepo.update).not.toHaveBeenCalled();
  });

  it('someone else\'s post is "not found"; an unknown audience is refused', async () => {
    await expect(build(null).editPost(9, 7, { body: 'x' }, created)).rejects.toThrow(NotFoundException);
    await expect(build({ ...post }).editPost(3, 7, { visibility: 'limited' }, created)).rejects.toThrow(BadRequestException);
  });
});
