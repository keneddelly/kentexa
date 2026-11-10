import { BadRequestException, ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { DELETED_NAME, maskContact } from './account-deletion';

// Futa akaunti (owner 2026-11-10, Google Play account-deletion rule).
describe('AuthService account deletion', () => {
  function make(user: any, openOrders = 0) {
    const queries: Array<[string, any[]]> = [];
    const updates: any[] = [];
    const manager: any = {
      query: jest.fn(async (sql: string, params: any[]) => {
        queries.push([sql, params]);
        if (/FROM public."order"/.test(sql)) return [{ n: openOrders }];
        if (/active_role_session/.test(sql)) return [{ id: 's1' }, { id: 's2' }];
        return [];
      }),
      getRepository: () => ({ update: jest.fn(async (_id: number, f: any) => { updates.push(f); }) }),
      transaction: jest.fn(async (fn: any) => fn(manager)),
    };
    const userRepo: any = {
      findOne: jest.fn().mockResolvedValue(user),
      update: jest.fn(async (_id: number, f: any) => { Object.assign(user, f); }),
      manager,
    };
    const sms: any = { generateOtp: () => '123456', sendOtp: jest.fn().mockResolvedValue(true) };
    const roleContext: any = { revokeCurrentSession: jest.fn().mockResolvedValue(undefined) };
    const service = new AuthService(userRepo, {} as any, sms, {} as any, {} as any, {} as any, {} as any, roleContext);
    return { service, sms, roleContext, queries, updates };
  }

  it('sends a code to the account phone', async () => {
    const user = { id: 7, name: 'Asha', phone: '255712345678' };
    const { service, sms } = make(user);
    const r = await service.requestAccountDeletion(7);
    expect(sms.sendOtp).toHaveBeenCalledWith('255712345678', '123456');
    expect(r).toMatchObject({ sent: true, to: '255****678' });
  });

  it('with the right code: hides everything public, erases personal data and signs out every device', async () => {
    const user = { id: 7, name: 'Asha', phone: '255712345678', otp: '123456', otpExpiry: new Date(Date.now() + 60000), otpAttempts: 0 };
    const { service, roleContext, queries, updates } = make(user);
    expect(await service.confirmAccountDeletion(7, '123456')).toEqual({ deleted: true });
    const sqls = queries.map(([s]) => s).join('\n');
    expect(sqls).toMatch(/UPDATE public.product SET "isActive" = false/);
    expect(sqls).toMatch(/UPDATE public.commerce_profile SET "hiddenFromPublic" = true/);
    expect(updates[0]).toMatchObject({ name: DELETED_NAME, phone: null, email: null, avatarUrl: null, isVerified: false });
    expect(updates[0].password).not.toBe('');
    expect(roleContext.revokeCurrentSession).toHaveBeenCalledWith('s1', 'account_deleted');
    expect(roleContext.revokeCurrentSession).toHaveBeenCalledWith('s2', 'account_deleted');
  });

  it('a wrong code changes nothing', async () => {
    const user = { id: 7, name: 'Asha', phone: '255712345678', otp: '123456', otpExpiry: new Date(Date.now() + 60000), otpAttempts: 0 };
    const { service, updates } = make(user);
    await expect(service.confirmAccountDeletion(7, '000000')).rejects.toBeInstanceOf(BadRequestException);
    expect(updates).toHaveLength(0);
    expect(user.otpAttempts).toBe(1);
  });

  it('open orders must finish first', async () => {
    const user = { id: 7, name: 'Asha', phone: '255712345678' };
    const { service, sms } = make(user, 2);
    await expect(service.requestAccountDeletion(7)).rejects.toBeInstanceOf(ConflictException);
    expect(sms.sendOtp).not.toHaveBeenCalled();
  });

  it('masks the contact it shows', () => {
    expect(maskContact('255712345678')).toBe('255****678');
    expect(maskContact(null, 'asha@mail.com')).toBe('as***@mail.com');
  });
});
