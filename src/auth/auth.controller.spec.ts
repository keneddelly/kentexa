import { AuthController } from './auth.controller';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(() => {
    const authService = {
      registerWithPhone: jest.fn(),
      registerWithEmail: jest.fn(),
    };
    const profileService = {};
    controller = new AuthController(
      authService as any,
      profileService as any,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
