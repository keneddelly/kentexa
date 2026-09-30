import { CommerceProfilesService } from './commerce-profiles.service';

describe('onboarding profile suggestions', () => {
  const official = { id: 2, ownerId: 1, status: 'active', displayName: 'Kentexa', type: 'business' };
  const bis = { id: 26, ownerId: 1, status: 'active', displayName: 'BiS', type: 'business' };
  const local = { id: 40, ownerId: 9, status: 'active', displayName: 'Local', type: 'business', location: 'Arusha' };
  function setup(localResult: any = local) {
    const service = Object.create(CommerceProfilesService.prototype) as any;
    const builder: any = {};
    for (const key of ['where', 'andWhere', 'orderBy', 'addOrderBy']) builder[key] = jest.fn().mockReturnValue(builder);
    builder.getOne = jest.fn().mockResolvedValue(localResult);
    service.repo = { findOne: jest.fn().mockResolvedValue(bis), createQueryBuilder: jest.fn().mockReturnValue(builder) };
    service.getOfficialKentexaProfile = jest.fn().mockResolvedValue(official);
    service.isFollowing = jest.fn().mockResolvedValue(false);
    return { service, builder };
  }
  it('returns official, exact BiS identity and at most one city match', async () => {
    const { service, builder } = setup();
    const result = await service.getOnboardingSuggestions(7, 'Arusha');
    expect(result.map((p: any) => p.id)).toEqual([2, 26, 40]);
    expect(result[2].isLocalSuggestion).toBe(true);
    expect(builder.andWhere).toHaveBeenCalledWith('p.ownerId != :userId', { userId: 7 });
    expect(builder.andWhere).toHaveBeenCalledWith('p.id NOT IN (:...excludedIds)', { excludedIds: [26, 2] });
    expect(result.every((p: any) => !('email' in p) && !('phone' in p))).toBe(true);
  });
  it('never adds an unrelated fallback if no business matches the city', async () => {
    const { service } = setup(null);
    expect((await service.getOnboardingSuggestions(7, 'Arusha')).map((p: any) => p.id)).toEqual([2, 26]);
  });
  it('does not query for a local business when location is unknown', async () => {
    const { service, builder } = setup();
    expect((await service.getOnboardingSuggestions(7)).map((p: any) => p.id)).toEqual([2, 26]);
    expect(builder.getOne).not.toHaveBeenCalled();
  });
});
