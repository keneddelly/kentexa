import { CommerceProfilesService } from './commerce-profiles.service';
import { CommerceProfileType as T } from './entities/commerce-profile.entity';

describe('profile follow graph', () => {
  let service: CommerceProfilesService;
  let repo: any, follow: any, users: any, legacy: any;
  beforeEach(() => {
    repo = { find: jest.fn(), findOne: jest.fn() };
    follow = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) };
    users = { find: jest.fn().mockResolvedValue([]) };
    legacy = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn().mockResolvedValue(null) };
    service = new CommerceProfilesService(repo, follow, {} as any, users, {} as any, {} as any, legacy, {} as any, {} as any, {} as any, {} as any);
  });
  test('legacy followers never bleed into a second business', async () => {
    repo.findOne.mockImplementation(({ where }: any) => Promise.resolve(where.id ? { id: where.id, ownerId: 5, type: T.BUSINESS } : { id: 10, ownerId: 5, type: T.BUSINESS }));
    legacy.find.mockResolvedValue([{ follower: { id: 7 } }]);
    expect(await service.getCanonicalFollowersCount(10)).toBe(1);
    expect(await service.getCanonicalFollowersCount(11)).toBe(0);
  });
  test('exact business follows stay profile-scoped in the Following feed', async () => {
    const profiles = [{ id: 10, ownerId: 5, type: T.BUSINESS }, { id: 20, ownerId: 6, type: T.PERSONAL }];
    jest.spyOn(service, 'getFollowingProfilesForAccount').mockResolvedValue(profiles as any);
    expect(await service.getFollowedProfiles(7)).toEqual({ businessScopedIds: [], profileScopedIds: [10, 20] });
  });
  test('following count deduplicates direct and legacy representations of one exact profile', async () => {
    follow.find.mockResolvedValue([{ commerceProfileId: 10 }, { commerceProfileId: 11 }]);
    legacy.find.mockResolvedValue([{ seller: { id: 5 } }]);
    repo.findOne.mockResolvedValue({ id: 10, ownerId: 5, type: T.BUSINESS });
    repo.find.mockResolvedValue([{ id: 10 }, { id: 11 }]);
    expect((await service.getFollowingProfilesForAccount(7)).map(p => p.id)).toEqual([10, 11]);
  });
  test('follow back means following the viewer personal profile, never their business', async () => {
    repo.findOne.mockImplementation(({ where }: any) => Promise.resolve(where.id ? { id: where.id, ownerId: 5, type: T.PERSONAL } : { id: 70, ownerId: 7, type: T.PERSONAL }));
    const isFollowing = jest.spyOn(service, 'isFollowing').mockResolvedValue(true);
    expect(await service.isFollowedBy(10, 7)).toBe(true);
    expect(isFollowing).toHaveBeenCalledWith(5, 70);
  });
  test('business ownership does not invent a reciprocal business-follow relationship', async () => {
    repo.findOne.mockResolvedValue({ id: 10, ownerId: 5, type: T.BUSINESS });
    expect(await service.isFollowedBy(10, 7)).toBe(false);
  });
  test('follower list deduplicates, paginates, returns safe personal identity and no account secrets', async () => {
    repo.findOne.mockResolvedValue({ id: 10, ownerId: 5, type: T.BUSINESS });
    follow.find.mockResolvedValue([{ followerId: 7 }, { followerId: 8 }]);
    legacy.find.mockResolvedValue([{ follower: { id: 7 } }]);
    repo.find.mockResolvedValue([{ id: 70, ownerId: 7, displayName: 'Amina', type: T.PERSONAL }]);
    users.find.mockResolvedValue([{ id: 7, name: 'Amina', email: 'private' }, { id: 8, name: 'Ali', phone: 'private' }]);
    jest.spyOn(service, 'isFollowing').mockResolvedValue(false);
    jest.spyOn(service, 'isFollowedBy').mockResolvedValue(true);
    const result = await service.getConnections(10, 'followers', 9, 1, 1);
    expect(result.total).toBe(2);
    expect(result.hasMore).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ profileId: 70, ownerId: 7, displayName: 'Amina', isFollowedBy: true });
    expect(result.items[0]).not.toHaveProperty('email');
    expect(result.items[0]).not.toHaveProperty('phone');
  });
});
