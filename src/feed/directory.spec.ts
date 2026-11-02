import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';

/** Owner 2026-11-02: Home's "Biashara" tab lists every public business on KenteXa. */
describe('business directory', () => {
  it('public, active businesses only, verified and most followed first, at most 60', async () => {
    const svc: any = Object.create(CommerceProfilesService.prototype);
    svc.repo = { findAndCount: jest.fn().mockResolvedValue([[{ id: 75, ownerId: 9, displayName: 'Bishoo', isVerified: true, followersCount: 3 }], 1]) };
    const out = await svc.businessDirectory(500, -3);
    expect(svc.repo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({
      where: { type: 'business', status: 'active', hiddenFromPublic: false },
      order: { isVerified: 'DESC', followersCount: 'DESC', id: 'ASC' },
      take: 60, skip: 0,
    }));
    expect(out).toEqual({ total: 1, items: [expect.objectContaining({ id: 75, ownerId: 9, displayName: 'Bishoo' })] });
  });
});
