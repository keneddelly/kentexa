import { NotFoundException } from '@nestjs/common';
import { CvsService } from './cvs.service';
import { EngagementType } from './entities/post-engagement.entity';

/** Home Feed phase C (owner 2026-11-02): heart = like, bookmark = save, a share counts once. */
const build = (opts: { existing?: any; visible?: boolean; counts?: any[]; post?: any } = {}) => {
  const svc: any = Object.create(CvsService.prototype);
  const qb: any = {
    select: () => qb, addSelect: () => qb, where: () => qb, andWhere: () => qb, leftJoin: () => qb, groupBy: () => qb,
    getRawMany: jest.fn().mockResolvedValue(opts.visible === false ? [] : [{ id: 7 }]),
    getOne: jest.fn().mockResolvedValue(opts.visible === false ? null : opts.post ?? null),
  };
  const countsQb: any = { ...qb, getRawMany: jest.fn().mockResolvedValue(opts.counts ?? []) };
  svc.feedRepo = {
    createQueryBuilder: jest.fn(() => qb),
    findOne: jest.fn().mockResolvedValue({ id: 7, businessId: 3, title: 'Taa' }),
    update: jest.fn().mockResolvedValue(undefined),
  };
  svc.engageRepo = {
    findOne: jest.fn().mockResolvedValue(opts.existing ?? null),
    delete: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
    create: jest.fn((x) => x),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn(() => countsQb),
  };
  svc.activityEvents = { record: jest.fn() };
  svc.notifyOwnerOfPost = jest.fn().mockResolvedValue(undefined);
  return svc;
};

describe('phase C engagement', () => {
  it('a heart is a like: it toggles on, tells the owner and records MOMENT_LIKED', async () => {
    const svc = build();
    expect(await svc.engage(1, 7, EngagementType.LIKE)).toEqual(expect.objectContaining({ toggled: true }));
    expect(svc.engageRepo.save).toHaveBeenCalledWith({ userId: 1, postId: 7, type: 'like' });
    expect(svc.notifyOwnerOfPost).toHaveBeenCalledWith(1, 7, 'like');
    expect(svc.activityEvents.record).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'MOMENT_LIKED' }));
  });

  it('a second heart takes the like away', async () => {
    const svc = build({ existing: { id: 99 } });
    expect(await svc.engage(1, 7, EngagementType.LIKE)).toEqual(expect.objectContaining({ toggled: false }));
    expect(svc.engageRepo.delete).toHaveBeenCalledWith(99);
  });

  it('sharing again never removes the first share', async () => {
    const svc = build({ existing: { id: 5 } });
    expect(await svc.engage(1, 7, EngagementType.SHARE)).toEqual(expect.objectContaining({ toggled: true }));
    expect(svc.engageRepo.delete).not.toHaveBeenCalled();
    expect(svc.engageRepo.save).not.toHaveBeenCalled();
  });

  it('a post the person may not see cannot be liked', async () => {
    const svc = build({ visible: false });
    await expect(svc.engage(1, 7, EngagementType.LIKE)).rejects.toThrow(NotFoundException);
    expect(svc.engageRepo.save).not.toHaveBeenCalled();
  });

  it('likes are counted apart from saves', async () => {
    const svc = build({ counts: [{ type: 'like', count: '4' }, { type: 'save', count: '1' }] });
    await svc.recalculate(7);
    expect(svc.feedRepo.update).toHaveBeenCalledWith(7, expect.objectContaining({ likeCount: 4, saveCount: 1, cvsScore: 7 }));
  });

  it('one post for its page: hidden or not visible answers "not found"', async () => {
    await expect(build({ visible: false }).getPost(7, 1)).rejects.toThrow(NotFoundException);
  });
});
