import { AuthController } from './auth.controller';

describe('phone session renewal cookie', () => {
  const context: any = { userId: 7, sessionId: 'session-7',
    accountRoleId: 3, roleType: 'buyer', contextVersion: 1 };

  it('issues an HttpOnly session cookie after login and clears it on logout', async () => {
    const auth: any = {
      login: jest.fn().mockResolvedValue({ accessToken: 'short-token', activeContext: context }),
      issueRefreshCredential: jest.fn().mockReturnValue('signed-refresh'),
      logoutWithCredential: jest.fn().mockResolvedValue({ success: true }),
    };
    const response: any = { cookie: jest.fn(), clearCookie: jest.fn() };
    const controller = new AuthController(auth, {} as any);
    await controller.login({ identifier: 'test', password: 'password' } as any,
      { headers: {} } as any, response);
    expect(response.cookie).toHaveBeenCalledWith('kx_refresh', 'signed-refresh',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/auth' }));
    await controller.logout({ headers: { cookie: 'kx_refresh=signed-refresh' } } as any, response);
    expect(auth.logoutWithCredential).toHaveBeenCalledWith('signed-refresh', undefined);
    expect(response.clearCookie).toHaveBeenCalledWith('kx_refresh',
      expect.objectContaining({ path: '/auth' }));
  });

  it('rejects a refresh without a credential before querying account state', async () => {
    const auth: any = { refresh: jest.fn() };
    const controller = new AuthController(auth, {} as any);
    await expect(controller.refresh({ headers: {} } as any)).rejects.toMatchObject({ status: 401 });
    expect(auth.refresh).not.toHaveBeenCalled();
  });
});
