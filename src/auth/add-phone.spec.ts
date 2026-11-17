import { AuthService } from './auth.service';
import { MailService } from '../mail/mail.service';

// Owner 2026-11-17: a phone is added later, by the features that need one; and a new welcome email.
describe('Add a phone later', () => {
  const build = (over: Record<string, any> = {}) => {
    const user: any = { id: 7, phone: null, otp: null, otpExpiry: null, otpAttempts: 0, ...over.user };
    const userRepo: any = {
      findOne: jest.fn(async () => ({ ...user })),
      update: jest.fn(async (_id: number, patch: any) => Object.assign(user, patch)),
      manager: { query: jest.fn(async () => (over.taken ? [{ id: 99 }] : [])) },
    };
    const sms: any = { generateOtp: () => '123456', sendOtp: jest.fn(async () => true) };
    const jwt: any = { sign: jest.fn((p) => JSON.stringify(p)), verify: jest.fn((t) => JSON.parse(t)) };
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
    const svc = new AuthService(userRepo, jwt, sms, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    return { svc, userRepo, sms, user };
  };

  it('sends a code to a free Tanzanian number, then saves the phone and region after the code', async () => {
    const { svc, sms, user } = build();
    const start: any = await svc.addPhoneStart(7, '0712 345 678');
    expect(sms.sendOtp).toHaveBeenCalledWith('255712345678', '123456');
    const done: any = await svc.addPhoneConfirm(7, { ticket: start.ticket, otp: '123456', city: 'Mwanza' });
    expect(user.phone).toBe('255712345678');
    expect(user.city).toBe('Mwanza');
    expect(done.user.phone).toBe('255712345678');
  });

  it('refuses a number another account uses, a wrong code, and a ticket for someone else', async () => {
    await expect(build({ taken: true }).svc.addPhoneStart(7, '0712345678')).rejects.toThrow('inatumiwa');
    const { svc } = build();
    const start: any = await svc.addPhoneStart(7, '0712345678');
    await expect(svc.addPhoneConfirm(7, { ticket: start.ticket, otp: '000000' })).rejects.toThrow('Incorrect');
    await expect(svc.addPhoneConfirm(8, { ticket: start.ticket, otp: '123456' })).rejects.toThrow('Muda');
    await expect(svc.addPhoneStart(7, '12345')).rejects.toThrow('sahihi');
  });

  it('the welcome email is current, in Swahili first, with no emoji', () => {
    const html = MailService.welcomeHtml('Amina <b>', 'https://kentexa.com');
    expect(html).toContain('Karibu KenteXa, Amina b');
    expect(html).toContain('Mfululizo');
    expect(html).toContain('play.google.com/store/apps/details?id=com.app.bishoo');
    expect(html).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(html).not.toContain("#1 Marketplace");
  });
});
