import { readFileSync } from 'fs';
import { join } from 'path';
import { NotFoundException } from '@nestjs/common';
import { CommerceProfilesService } from './commerce-profiles.service';
import { CommerceProfilesController } from './commerce-profiles.controller';

// Owner 2026-10-13: a WAITING business profile (office or seller not approved
// yet, status PENDING) is hidden like a training office: only its owner, its
// team and admins can open it; everyone else gets "not found". Profiles in any
// other status behave exactly as before.
describe('waiting (pending) business profiles', () => {
  const waiting: any = { id: 10, ownerId: 5, type: 'hub', status: 'pending', hiddenFromPublic: false };
  const personal: any = { id: 9, ownerId: 5, type: 'personal', status: 'active', hiddenFromPublic: false };
  const setup = (accessible: number[] = []) => {
    const s: any = Object.create(CommerceProfilesService.prototype);
    s.findAccessibleForUser = jest.fn(async () => accessible.map((id) => ({ id })));
    s.findById = jest.fn(async () => waiting);
    s.findByUsername = jest.fn(async () => waiting);
    s.findForUser = jest.fn(async () => [personal, waiting]);
    s.isFollowing = jest.fn(async () => false);
    s.isFollowedBy = jest.fn(async () => false);
    s.getCanonicalFollowersCount = jest.fn(async () => 0);
    s.getFollowingCount = jest.fn(async () => 0);
    return { s, c: new CommerceProfilesController(s, {} as any, {} as any) };
  };

  it('a logged-out visitor gets "not found" by link and by username, and does not see it in the person\'s profiles', async () => {
    const { c } = setup();
    await expect(c.getById({ user: null }, 10)).rejects.toBeInstanceOf(NotFoundException);
    expect(await c.getByUsername({ user: null }, 'audit_hub')).toBeNull();
    expect((await c.getForUser({ user: null }, 5)).map((p: any) => p.id)).toEqual([9]);
  });

  it('another logged-in user is treated the same as a visitor', async () => {
    const { c } = setup();
    await expect(c.getById({ user: { id: 1, role: 'user' } }, 10)).rejects.toBeInstanceOf(NotFoundException);
    expect((await c.getForUser({ user: { id: 1, role: 'user' } }, 5)).map((p: any) => p.id)).toEqual([9]);
  });

  it('the owner, a team member and an admin can open it', async () => {
    for (const [accessible, user] of [[[], { id: 5, role: 'user' }], [[10], { id: 7, role: 'user' }], [[], { id: 2, role: 'admin' }]] as any[]) {
      const { c } = setup(accessible);
      expect(await c.getById({ user }, 10)).toMatchObject({ id: 10 });
      expect((await c.getForUser({ user }, 5)).map((p: any) => p.id)).toEqual([9, 10]);
    }
  });

  it('active, suspended and rejected profiles are unchanged for a visitor', async () => {
    for (const status of ['active', 'suspended', 'rejected']) {
      const s: any = Object.create(CommerceProfilesService.prototype);
      expect(await s.canSeeHidden({ ...waiting, status }, null)).toBe(true);
    }
  });

  it('unified search never returns a waiting profile', () => {
    const src = readFileSync(join(__dirname, '..', 'search', 'search.controller.ts'), 'utf8');
    expect(src).toContain('hiddenFromPublic: false, status: Not(CommerceProfileStatus.PENDING)');
  });
});
