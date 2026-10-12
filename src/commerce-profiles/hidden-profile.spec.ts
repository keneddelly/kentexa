import { readFileSync } from 'fs';
import { join } from 'path';
import { NotFoundException } from '@nestjs/common';
import { CommerceProfilesService } from './commerce-profiles.service';
import { CommerceProfilesController } from './commerce-profiles.controller';
import { SuperAgentsService } from '../super-agents/super-agents.service';
import { NOT_FROM_HIDDEN_PROFILE } from './public-visibility';

// A profile hidden from the public (a training office's) is visible only to
// its owner, its staff and admins; never in search, feeds or discovery.
describe('hidden profiles (training offices)', () => {
  const service = (accessible: number[] = []) => {
    const s: any = Object.create(CommerceProfilesService.prototype);
    s.findAccessibleForUser = jest.fn(async () => accessible.map((id) => ({ id })));
    return s as CommerceProfilesService;
  };
  const hidden: any = { id: 4, ownerId: 2, hiddenFromPublic: true };

  it('who can see a hidden profile: owner, staff, admin — nobody else', async () => {
    expect(await service().canSeeHidden({ ...hidden, hiddenFromPublic: false }, null)).toBe(true);
    expect(await service().canSeeHidden(hidden, null)).toBe(false);
    expect(await service().canSeeHidden(hidden, { id: 1, role: 'user' })).toBe(false);
    expect(await service().canSeeHidden(hidden, { id: 2, role: 'user' })).toBe(true);        // owner
    expect(await service([4]).canSeeHidden(hidden, { id: 5, role: 'user' })).toBe(true);     // staff member
    expect(await service().canSeeHidden(hidden, { id: 9, role: 'admin' })).toBe(true);
  });

  it('the profile page answers "not found" to the public', async () => {
    const s: any = service();
    s.findById = jest.fn(async () => hidden);
    const c = new CommerceProfilesController(s, {} as any, {} as any);
    await expect(c.getById({ user: null }, 4)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('search never returns hidden profiles', async () => {
    const calls: string[] = [];
    const qb: any = { where: (c: string) => { calls.push(c); return qb; }, andWhere: (c: string) => { calls.push(c); return qb; },
      orderBy: () => qb, addOrderBy: () => qb, take: () => qb, getMany: async () => [] };
    const s: any = Object.create(CommerceProfilesService.prototype);
    s.repo = { createQueryBuilder: () => qb };
    await s.search('office');
    expect(calls).toContain('p.hiddenFromPublic = false');
  });

  it('a training office has no public hub page', async () => {
    const s: any = Object.create(SuperAgentsService.prototype);
    s.superAgentRepo = { findOne: jest.fn(async () => ({ status: 'active', isTrainingOffice: true, businessName: 'Habibu' })) };
    expect(await s.findPublicByUserId(2)).toBeNull();
  });

  it('every public feed query excludes posts by hidden profiles (feeds, trending, discover, stories, ranking)', () => {
    const src = (f: string) => readFileSync(join(__dirname, '..', 'feed', f), 'utf8');
    const count = (s: string) => s.split("NOT_FROM_HIDDEN_PROFILE('f')").length - 1;
    expect(count(src('feed.service.ts'))).toBe(7);
    expect(count(src('cvs.service.ts'))).toBe(4);
    expect(NOT_FROM_HIDDEN_PROFILE('f')).toBe(
      'NOT EXISTS (SELECT 1 FROM public.commerce_profile hp WHERE hp.id = f."commerceProfileId" AND hp."hiddenFromPublic" = true)');
  });
});
