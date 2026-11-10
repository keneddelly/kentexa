import { BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';

// Buying without signing up first (owner 2026-11-10): the account is made from the phone at checkout.
describe('AuthService.checkoutPhone', () => {
  function make(existing: any) {
    const service = new AuthService({ findOne: jest.fn().mockResolvedValue(existing) } as any, {} as any, {} as any, {} as any);
    const register = jest.spyOn(service, 'registerWithPhone').mockResolvedValue({ otpSent: true } as any);
    const resend = jest.spyOn(service, 'resendPhoneOtp').mockResolvedValue({ otpSent: true } as any);
    return { service, register, resend };
  }

  it('a new number gets an account with a hidden random password and one SMS code', async () => {
    const { service, register, resend } = make(null);
    const r = await service.checkoutPhone({ name: ' Asha ', phone: '0712 345 678' });
    expect(r).toEqual({ status: 'otp_sent', phone: '255712345678', otpSent: true });
    expect(resend).not.toHaveBeenCalled();
    const arg: any = register.mock.calls[0][0];
    expect(arg.phone).toBe('255712345678');
    expect(arg.name).toBe('Asha');
    expect(arg.password).toMatch(/^[0-9a-f]{48}$/);
    expect(JSON.stringify(r)).not.toContain(arg.password);
  });

  it('a number that started sign-up but never confirmed gets the code again', async () => {
    const { service, register, resend } = make({ id: 3, isVerified: false });
    const r = await service.checkoutPhone({ name: 'Asha', phone: '+255712345678' });
    expect(r.status).toBe('otp_sent');
    expect(resend).toHaveBeenCalledWith('255712345678');
    expect(register).not.toHaveBeenCalled();
  });

  it('a number with an account is told to use its password; no SMS is sent', async () => {
    const { service, register, resend } = make({ id: 3, isVerified: true });
    expect(await service.checkoutPhone({ name: 'Asha', phone: '0712345678' })).toEqual({ status: 'has_account', phone: '255712345678' });
    expect(register).not.toHaveBeenCalled();
    expect(resend).not.toHaveBeenCalled();
  });

  it('needs a name and a real Tanzanian number', async () => {
    const { service } = make(null);
    await expect(service.checkoutPhone({ name: 'A', phone: '0712345678' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.checkoutPhone({ name: 'Asha', phone: '12345' })).rejects.toBeInstanceOf(BadRequestException);
  });
});
