import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CvsService } from './cvs.service';
import { EngagementType } from './entities/post-engagement.entity';
import { SocialSafetyService } from './social-safety.service';

/** Home Feed phase F (owner approved 2026-11-02): repost, report, mute. */
describe('repost', () => {
  const build = (post: any, existing: any = null) => {
    const svc: any = Object.create(CvsService.prototype);
    const qb: any = { select: () => qb, addSelect: () => qb, where: () => qb, andWhere: () => qb, groupBy: () => qb, getRawMany: jest.fn().mockResolvedValue([{ id: 7 }]) };
    const counts: any = { getRawMany: jest.fn().mockResolvedValue([{ type: 'repost', count: '2' }]) };
    for (const m of ['select', 'addSelect', 'where', 'andWhere', 'groupBy']) counts[m] = () => counts;
    svc.feedRepo = { createQueryBuilder: () => qb, findOne: jest.fn().mockResolvedValue(post), update: jest.fn() };
    svc.engageRepo = { findOne: jest.fn().mockResolvedValue(existing), delete: jest.fn(), save: jest.fn(), create: (x: any) => x, createQueryBuilder: () => counts };
    svc.activityEvents = { record: jest.fn() };
    svc.notifyOwnerOfPost = jest.fn().mockResolvedValue(undefined);
    return svc;
  };

  it('a post for everyone is reposted once, counted, with MOMENT_REPOSTED; the owner is not notified', async () => {
    const svc = build({ id: 7, businessId: 3, visibility: 'public' });
    expect(await svc.engage(1, 7, EngagementType.REPOST)).toEqual(expect.objectContaining({ toggled: true }));
    expect(svc.engageRepo.save).toHaveBeenCalledWith({ userId: 1, postId: 7, type: 'repost' });
    expect(svc.feedRepo.update).toHaveBeenCalledWith(7, expect.objectContaining({ repostCount: 2 }));
    expect(svc.activityEvents.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'MOMENT_REPOSTED' }));
    expect(svc.notifyOwnerOfPost).not.toHaveBeenCalled();
  });

  it('a second tap undoes the repost', async () => {
    const svc = build({ id: 7, businessId: 3, visibility: 'public' }, { id: 50 });
    expect(await svc.engage(1, 7, EngagementType.REPOST)).toEqual(expect.objectContaining({ toggled: false }));
    expect(svc.engageRepo.delete).toHaveBeenCalledWith(50);
  });

  it('a followers-only post cannot be reposted', async () => {
    const svc = build({ id: 7, businessId: 3, visibility: 'followers' });
    await expect(svc.engage(1, 7, EngagementType.REPOST)).rejects.toThrow(BadRequestException);
    expect(svc.engageRepo.save).not.toHaveBeenCalled();
  });
});

describe('report and mute', () => {
  const build = (o: { visible?: boolean; inserted?: boolean; profileOwner?: number; existingMute?: boolean } = {}) => {
    const qb: any = { select: () => qb, from: () => qb, where: () => qb, andWhere: () => qb,
      getRawMany: async () => (o.visible === false ? [] : [{ id: 7, businessId: 3, commerceProfileId: 9 }]) };
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('INSERT INTO public.post_report')) return o.inserted === false ? [] : [{ id: 1 }];
      if (sql.includes('FROM public.commerce_profile')) return [{ id: 9, ownerId: o.profileOwner ?? 3 }];
      if (sql.includes('DELETE FROM public.profile_mute')) return o.existingMute ? [{ id: 1 }] : [];
      return [];
    });
    const events = { record: jest.fn() };
    return { svc: new SocialSafetyService({ createQueryBuilder: () => qb, query } as any, events as any), query, events };
  };

  it('a report needs a known reason, is kept for review once, and removes nothing', async () => {
    const { svc, query, events } = build();
    await expect(svc.report(7, 20, 'kitu')).rejects.toThrow(BadRequestException);
    expect(await svc.report(7, 20, 'fraud', 'Anaomba pesa kabla')).toEqual({ reported: true });
    expect(events.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'MOMENT_REPORTED', targetId: 7 }));
    expect(query.mock.calls.some(([sql]) => /UPDATE|DELETE/.test(sql))).toBe(false);
  });

  it('the same person reporting again, the author, or a post they cannot see is refused', async () => {
    await expect(build({ inserted: false }).svc.report(7, 20, 'spam')).rejects.toThrow(BadRequestException);
    await expect(build().svc.report(7, 3, 'spam')).rejects.toThrow(BadRequestException);
    await expect(build({ visible: false }).svc.report(7, 20, 'spam')).rejects.toThrow(NotFoundException);
  });

  it('mute toggles on and off; nobody mutes their own profile', async () => {
    expect(await build().svc.toggleMute(20, { commerceProfileId: 9 })).toEqual({ muted: true });
    expect(await build({ existingMute: true }).svc.toggleMute(20, { commerceProfileId: 9 })).toEqual({ muted: false });
    await expect(build({ profileOwner: 20 }).svc.toggleMute(20, { commerceProfileId: 9 })).rejects.toThrow(BadRequestException);
    await expect(build().svc.toggleMute(20, { accountId: 20 })).rejects.toThrow(BadRequestException);
  });
});
