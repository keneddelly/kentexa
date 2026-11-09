import { BadRequestException } from '@nestjs/common';
import { FeedService, isPublicPost } from './feed.service';
import { FeedController } from './feed.controller';
import { composerEvent, ComposerEventLimiter, COMPOSER_EVENTS_PER_MINUTE } from './composer-events';
import { assertPublishInput } from './publish-input';
import { MomentIntent, MomentVisibility } from '../business/entities/business-feed-item.entity';

/** Smart Post step 1 (owner 2026-11-09, "do what is best and used by many companies"). */
describe('Smart Post: Natafuta alerts only from public posts', () => {
  const build = () => {
    const svc: any = Object.create(FeedService.prototype);
    const qb: any = { where: () => qb, andWhere: () => qb, orderBy: () => qb, addOrderBy: () => qb, take: () => qb,
      getMany: jest.fn().mockResolvedValue([{ id: 5, ownerId: 50 }]) };
    svc.commerceProfileRepo = { createQueryBuilder: jest.fn(() => qb) };
    svc.activityEvents = { record: jest.fn(), countSince: jest.fn().mockResolvedValue(0) };
    svc.notifService = { notify: jest.fn().mockResolvedValue({}) };
    return svc;
  };
  const need = (visibility: any) => ({ id: 9, businessId: 1, title: 'Natafuta friji', category: 'Electronics', visibility });

  it('a public (or older, unset) need alerts matching sellers, in Swahili', async () => {
    for (const v of [MomentVisibility.PUBLIC, null]) {
      const svc = build();
      await svc.matchNeedToSellers(need(v));
      expect(svc.notifService.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 50, title: 'Mteja anatafuta unachouza' }));
    }
  });

  it('a followers-only or limited need alerts nobody and never looks for sellers', async () => {
    for (const v of [MomentVisibility.FOLLOWERS, MomentVisibility.LIMITED]) {
      const svc = build();
      await svc.matchNeedToSellers(need(v));
      expect(svc.notifService.notify).not.toHaveBeenCalled();
      expect(svc.commerceProfileRepo.createQueryBuilder).not.toHaveBeenCalled();
    }
  });

  it('isPublicPost', () => {
    expect(isPublicPost({ visibility: 'public' })).toBe(true);
    expect(isPublicPost({ visibility: null })).toBe(true);
    expect(isPublicPost({ visibility: 'followers' })).toBe(false);
  });
});

describe('Smart Post: Uzoefu and the audience', () => {
  const post = { type: 'moment', title: 'Nilijifunza kitu' };
  it('Uzoefu is a post intent', () => {
    expect(MomentIntent.EXPERIENCE).toBe('experience');
    expect(() => assertPublishInput({ ...post, intent: 'experience' })).not.toThrow();
  });
  it('a new post is for everyone or for followers; limited is refused', () => {
    expect(() => assertPublishInput({ ...post, visibility: 'followers' })).not.toThrow();
    expect(() => assertPublishInput({ ...post, visibility: 'limited' })).toThrow(BadRequestException);
  });
});

describe('Smart Post: composer steps', () => {
  it('keeps the step, the kind and counts, never the text', () => {
    expect(composerEvent({ step: 'abandoned', kind: 'question', at: 'write', hasText: true, photos: 2, text: 'siri' }))
      .toEqual({ eventType: 'COMPOSER_ABANDONED', metadata: { kind: 'question', at: 'write', hasText: true, photos: 2 } });
    expect(composerEvent({ step: 'preview', kind: 'experience', audience: 'followers' }))
      .toEqual({ eventType: 'COMPOSER_PREVIEWED', metadata: { kind: 'experience', audience: 'followers' } });
  });

  it('ignores unknown steps and odd values', () => {
    expect(composerEvent({ step: 'toString' })).toBeNull();
    expect(composerEvent({ step: 'posted' })).toBeNull();
    expect(composerEvent(null)).toBeNull();
    expect(composerEvent({ step: 'opened', kind: '<b>', photos: 99, audience: 'everyone' }))
      .toEqual({ eventType: 'COMPOSER_OPENED', metadata: { kind: null } });
  });

  it('at most 30 a minute for one person', () => {
    const lim = new ComposerEventLimiter();
    const t0 = 1_700_000_000_000;
    for (let i = 0; i < COMPOSER_EVENTS_PER_MINUTE; i += 1) expect(lim.allow(1, t0)).toBe(true);
    expect(lim.allow(1, t0)).toBe(false);
    expect(lim.allow(2, t0)).toBe(true);
    expect(lim.allow(1, t0 + 60_000)).toBe(true);
  });

  it('the endpoint records a known step for the signed-in person and answers ok', () => {
    const svc: any = { recordComposerStep: jest.fn() };
    const ctrl = new FeedController(svc, {} as any);
    expect(ctrl.composerStep({ user: { id: 3 } }, { step: 'opened', kind: 'moment' })).toEqual({ ok: true });
    expect(svc.recordComposerStep).toHaveBeenCalledWith(3, { eventType: 'COMPOSER_OPENED', metadata: { kind: 'moment' } });
    ctrl.composerStep({ user: { id: 3 } }, { step: 'nope' });
    expect(svc.recordComposerStep).toHaveBeenCalledTimes(1);
  });
});
