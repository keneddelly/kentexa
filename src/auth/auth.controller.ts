import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // Register with phone
  @Post('register/phone')
  registerPhone(
    @Body() body: { phone: string; password: string; name: string },
  ) {
    return this.authService.registerWithPhone(body);
  }

  // Register with email
  @Post('register/email')
  registerEmail(
    @Body() body: { email: string; password: string; name: string },
  ) {
    return this.authService.registerWithEmail(body);
  }

  // Legacy register (supports both)
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
  @Post('verify-otp')
  verifyOtp(@Body() body: { identifier: string; otp: string }) {
    return this.authService.verifyOtp(body.identifier, body.otp);
  }

  // Resend OTP
  @Post('resend-otp')
  resendOtp(@Body() body: { identifier: string }) {
    return this.authService.resendOtp(body.identifier);
  }

  // Login (phone or email)
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

  // Forgot password
  @Post('forgot-password')
  forgotPassword(@Body() body: { identifier: string }) {
    return this.authService.forgotPassword(body.identifier);
  }

  // Get current user profile
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req) {
    const user = req.user;
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      // Store / seller branding
      storeName: user.storeName || null,
      storeTagline: user.storeTagline || null,
      storeDescription: user.storeDescription || null,
      bio: user.bio || null,
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
    };
  }

  // Reset password
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
