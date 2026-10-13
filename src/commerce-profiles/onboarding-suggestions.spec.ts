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
  it('returns the official profile and at most one city match; no business is pinned by its id', async () => {
    const { service, builder } = setup();
    const result = await service.getOnboardingSuggestions(7, 'Arusha');
    expect(result.map((p: any) => p.id)).toEqual([2, 40]);
    expect(result[1].isLocalSuggestion).toBe(true);
    expect(service.repo.findOne).not.toHaveBeenCalled();   // no lookup of a fixed profile (was #26, BiS)
    expect(builder.andWhere).toHaveBeenCalledWith('p.ownerId != :userId', { userId: 7 });
    expect(builder.andWhere).toHaveBeenCalledWith('p.id NOT IN (:...excludedIds)', { excludedIds: [2] });
    expect(result.every((p: any) => !('email' in p) && !('phone' in p))).toBe(true);
  });
  it('never adds an unrelated fallback if no business matches the city', async () => {
    const { service } = setup(null);
    expect((await service.getOnboardingSuggestions(7, 'Arusha')).map((p: any) => p.id)).toEqual([2]);
  });
  it('the former pinned business (#26) is only suggested like any other: as the city match', async () => {
    const { service } = setup(bis);
    expect((await service.getOnboardingSuggestions(7, 'Dar es Salaam')).map((p: any) => p.id)).toEqual([2, 26]);
  });
  it('does not query for a local business when location is unknown', async () => {
    const { service, builder } = setup();
    expect((await service.getOnboardingSuggestions(7)).map((p: any) => p.id)).toEqual([2]);
    expect(builder.getOne).not.toHaveBeenCalled();
  });
});

describe('city names with special characters', () => {
  it('are escaped (one backslash each), never turned into other text', async () => {
    const service = Object.create(CommerceProfilesService.prototype) as any;
    const builder: any = {};
    for (const key of ['where', 'andWhere', 'orderBy', 'addOrderBy']) builder[key] = jest.fn().mockReturnValue(builder);
    builder.getOne = jest.fn().mockResolvedValue(null);
    service.repo = { createQueryBuilder: jest.fn().mockReturnValue(builder) };
    service.getOfficialKentexaProfile = jest.fn().mockResolvedValue(null);
    service.isFollowing = jest.fn().mockResolvedValue(false);
    await service.getOnboardingSuggestions(7, 'St. Mary (Moshi)');
    const call = builder.andWhere.mock.calls.find((c: any[]) => /LOWER\(p\.location\)/.test(c[0]));
    expect(call[1].location).toBe(String.raw`(^|[^a-z])st\. mary \(moshi\)([^a-z]|$)`);
    // The pattern is a valid regex that matches the city as written.
    expect(new RegExp(call[1].location).test('st. mary (moshi), kilimanjaro')).toBe(true);
  });
});
