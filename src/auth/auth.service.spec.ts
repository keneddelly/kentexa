import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    const userRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    const jwtService = { sign: jest.fn() };
    const smsService = { sendSms: jest.fn() };
    const mailService = { sendMail: jest.fn() };
    service = new AuthService(
      userRepo as any,
      jwtService as any,
      smsService as any,
      mailService as any,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
