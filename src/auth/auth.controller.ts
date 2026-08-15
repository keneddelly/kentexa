import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { ProfileService } from '../profile/profile.service';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private profileService: ProfileService,
  ) {}

  // Register with phone
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @Post('register/phone')
  registerPhone(
    @Body() body: { phone: string; password: string; name: string },
  ) {
    return this.authService.registerWithPhone(body);
  }

  // Register with email
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @Post('register/email')
  registerEmail(
    @Body() body: { email: string; password: string; name: string },
  ) {
    return this.authService.registerWithEmail(body);
  }

  // Legacy register (supports both)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @Post('register')
  register(
    @Body()
    body: {
      phone?: string;
      email?: string;
      password: string;
      name?: string;
    },
  ) {
    return this.authService.register(body);
  }

  // Verify OTP (phone or email)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 15, ttl: 3600000 } })
  @Post('verify-otp')
  verifyOtp(@Body() body: { identifier: string; otp: string }) {
    return this.authService.verifyOtp(body.identifier, body.otp);
  }

  // Resend OTP — throttled tighter since it costs a real SMS/email send
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post('resend-otp')
  resendOtp(@Body() body: { identifier: string }) {
    return this.authService.resendOtp(body.identifier);
  }

  // Login (phone or email) — the 5-attempts-per-account lockout inside
  // AuthService is the real anti-brute-force control; this is defense in
  // depth against spraying attempts across many different accounts.
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 3600000 } })
  @Post('login')
  login(
    @Body()
    body: {
      phone?: string;
      email?: string;
      identifier?: string;
      password: string;
    },
  ) {
    const id = body.identifier || body.phone || body.email || '';
    return this.authService.login(id, body.password);
  }

  // Forgot password — costs a real SMS/email send
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post('forgot-password')
  forgotPassword(@Body() body: { identifier: string }) {
    return this.authService.forgotPassword(body.identifier);
  }

  // Get current user profile
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Request() req) {
    const user = req.user;
    const roleEntities = await this.profileService.getRoleEntities(user.id);
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl || null,
      kentexaId: user.kentexaId,
      role: user.role,
      createdAt: user.createdAt,
      // Store / seller branding
      storeName: user.storeName || null,
      storeTagline: user.storeTagline || null,
      storeDescription: user.storeDescription || null,
      bio: user.bio || null,
      city: user.city || null,
      logo: user.logo || null,
      coverImage: user.coverImage || null,
      storeWhatsApp: user.storeWhatsApp || null,
      businessLocation: user.businessLocation || null,
      isOfficialStore: user.isOfficialStore || false,
      isVerified: user.isVerified || false,
      // Stats
      rating: user.rating || 0,
      reviewsCount: user.reviewsCount || 0,
      followersCount: user.followersCount || 0,
      completedOrders: user.completedOrders || 0,
      reputationScore: user.reputationScore || 0,
      activeRoles: user.activeRoles || [],
      serviceProvider: roleEntities.serviceProvider || null,
    };
  }

  // Reset password
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @Post('reset-password')
  resetPassword(
    @Body() body: { identifier: string; otp: string; newPassword: string },
  ) {
    return this.authService.resetPassword(
      body.identifier,
      body.otp,
      body.newPassword,
    );
  }
}
