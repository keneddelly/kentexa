import { RoleContextGuard } from './role-context.guard';
import { AccountRoleType } from './entities/account-role.entity';

const mockContext = (user: any) => ({
  switchToHttp: () => ({ getRequest: () => ({ user }) }),
} as any);

describe('RoleContextGuard', () => {
  it('rejects a request with no auth payload at all', async () => {
    const guard = new RoleContextGuard({} as any);
    await expect(guard.canActivate(mockContext(undefined)))
      .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_MISSING' } });
  });

  it('rejects a payload missing sid/rid/cv even if sub and rt are present', async () => {
    const guard = new RoleContextGuard({} as any);
    await expect(guard.canActivate(mockContext({ authPayload: { sub: 1, rt: AccountRoleType.ADMIN } })))
      .rejects.toMatchObject({ response: { code: 'ROLE_CONTEXT_MISSING' } });
  });

  it('delegates to RoleContextService.resolveContext and stashes the result on the request', async () => {
    const resolved = { userId: 1, roleType: AccountRoleType.SELLER };
    const roleContextService = { resolveContext: jest.fn().mockResolvedValue(resolved) } as any;
    const guard = new RoleContextGuard(roleContextService);
    const payload = { sub: 1, sid: 's1', rid: 10, rt: AccountRoleType.ADMIN, cv: 1 };
    const request: any = { user: { authPayload: payload } };
    const context: any = { switchToHttp: () => ({ getRequest: () => request }) };

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(roleContextService.resolveContext).toHaveBeenCalledWith(payload);
    expect(request.roleContext).toBe(resolved);
  });
});
