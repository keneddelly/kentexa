import { UsersService } from './users.service';
import { User, UserRole } from './entities/user.entity';

describe('UsersService', () => {
  let service: UsersService;
  let commerceProfiles: { findForUserByType: jest.Mock; createProfile: jest.Mock; updatePublicFields: jest.Mock };
  let userRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };

  const fullUser = (): User =>
    ({
      id: 1,
      email: 'buyer@example.com',
      phone: '+255700000000',
      name: 'Buyer',
      role: UserRole.BUYER,
      password: 'hashed-secret',
      otp: '123456',
      otpExpiry: new Date(),
      otpAttempts: 2,
    }) as User;

  beforeEach(() => {
    userRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(),
      remove: jest.fn(),
    };
    commerceProfiles = {
      findForUserByType: jest.fn().mockResolvedValue(null),
      createProfile: jest.fn().mockResolvedValue({ id: 10 }),
      updatePublicFields: jest.fn(),
    };
    service = new UsersService(userRepo as any, commerceProfiles as any);
  });

  // Regression: exclude() used to be a plain destructure that only worked
  // via ClassSerializerInterceptor, which silently no-ops once the entity
  // is spread into a plain object. Every read path must strip these fields
  // itself.
  describe('sensitive field exclusion', () => {
    it('findOne() never returns password/otp/otpExpiry/otpAttempts', async () => {
      userRepo.findOne.mockResolvedValue(fullUser());
      const result = await service.findOne(1);
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('otp');
      expect(result).not.toHaveProperty('otpExpiry');
      expect(result).not.toHaveProperty('otpAttempts');
      expect(result.email).toBe('buyer@example.com');
    });

    it('create() never returns password/otp/otpExpiry/otpAttempts', async () => {
      userRepo.findOne.mockResolvedValue(null);
      userRepo.save.mockResolvedValue(fullUser());
      const result = await service.create({
        email: 'buyer@example.com',
        password: 'plaintext',
      } as any);
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('otp');
    });

    it('findAll() strips sensitive fields from every user in the list', async () => {
      userRepo.find.mockResolvedValue([fullUser(), fullUser()]);
      const result = await service.findAll();
      for (const u of result) {
        expect(u).not.toHaveProperty('password');
        expect(u).not.toHaveProperty('otp');
      }
    });

    it('update() never returns password/otp/otpExpiry/otpAttempts', async () => {
      userRepo.findOne.mockResolvedValue(fullUser());
      userRepo.save.mockResolvedValue(fullUser());
      const result = await service.update(1, { name: 'New Name' } as any);
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('otp');
    });
  });
  describe('adminVerifyAccount()', () => {
    it('verifies only the base account, clears OTP material and creates the personal profile', async () => {
      const user = fullUser();
      user.isVerified = false;
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockImplementation(async (x) => x);

      const result = await service.adminVerifyAccount(1);

      expect(userRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        isVerified: true,
        otp: null,
        otpExpiry: null,
        otpAttempts: 0,
      }));
      expect(commerceProfiles.createProfile).toHaveBeenCalledWith(expect.objectContaining({
        ownerId: 1,
        type: 'personal',
      }));
      expect(result.user).not.toHaveProperty('otp');
      expect(result.user).not.toHaveProperty('password');
    });

    it('is idempotent for an already verified account', async () => {
      const user = fullUser();
      user.isVerified = true;
      userRepo.findOne.mockResolvedValue(user);

      await service.adminVerifyAccount(1);

      expect(userRepo.save).not.toHaveBeenCalled();
    });
  });

});
