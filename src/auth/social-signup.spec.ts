import { AuthService } from './auth.service';

jest.mock('./social-login', () => {
  const real = jest.requireActual('./social-login');
  return { ...real, socialConfig: () => ({ google: 'web-1', googleAll: ['web-1'], facebook: null, facebookSecret: null }), verifyGoogle: jest.fn() };
});
const { verifyGoogle } = jest.requireMock('./social-login');

// Owner 2026-11-17: "the rule of phone at registration is not must ... let email works".
describe('Sign-up with Google: no phone needed', () => {
  const build = (existingByEmail: any = null) => {
    const saved: any[] = [];
    const userRepo: any = {
      findOne: jest.fn(async () => null),
      create: jest.fn((x) => ({ id: 77, ...x })),
      save: jest.fn(async (u) => { saved.push(u); return u; }),
      update: jest.fn(async () => undefined),
      createQueryBuilder: () => ({ where: () => ({ getOne: async () => existingByEmail }) }),
      manager: { query: jest.fn(async () => []) },
    };
    const svc = new AuthService(userRepo, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    const s: any = svc;
    jest.spyOn(s, 'socialTableReady').mockResolvedValue(true);
    jest.spyOn(s, 'linkedUser').mockResolvedValue(null);
    jest.spyOn(s, 'linkSocial').mockResolvedValue(undefined);
    jest.spyOn(s, 'currentTermsAcceptance').mockResolvedValue({ termsAcceptedVersion: 'v1', termsAcceptedAt: new Date() });
    jest.spyOn(s, 'welcomeNewAccount').mockResolvedValue(undefined);
    jest.spyOn(s, 'issueAuthenticatedResponse').mockImplementation(async (u: any) => ({ accessToken: 't', user: { id: u.id, avatarUrl: u.avatarUrl } }));
    return { svc, userRepo, saved, s };
  };

  it('a new Google person gets an account at once, with the verified email and no phone', async () => {
    verifyGoogle.mockResolvedValue({ provider: 'google', sub: 'g1', email: 'amina@example.com', emailVerified: true, name: 'Amina Hassan', picture: null });
    const { svc, saved, s } = build();
    const res: any = await svc.socialLogin({ provider: 'google', token: 'tok' });
    expect(res.status).toBe('signed_in');
    expect(res.created).toBe(true);
    expect(saved[0]).toMatchObject({ phone: null, email: 'amina@example.com', name: 'Amina Hassan', isVerified: true });
    expect(s.linkSocial).toHaveBeenCalled();
    expect(s.welcomeNewAccount).toHaveBeenCalled();
  });

  it('an account with the same email that never typed its code is verified and linked, not duplicated', async () => {
    verifyGoogle.mockResolvedValue({ provider: 'google', sub: 'g2', email: 'juma@example.com', emailVerified: true, name: 'Juma', picture: null });
    const existing = { id: 5, email: 'juma@example.com', isVerified: false, name: 'Juma' };
    const { svc, userRepo, saved } = build(existing);
    const res: any = await svc.socialLogin({ provider: 'google', token: 'tok' });
    expect(res.status).toBe('signed_in');
    expect(res.created).toBeUndefined();
    expect(saved).toHaveLength(0);
    expect(userRepo.update).toHaveBeenCalledWith(5, expect.objectContaining({ isVerified: true }));
  });
});
