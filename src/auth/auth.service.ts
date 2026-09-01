import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { SmsService } from '../sms/sms.service';
import { MailService } from '../mail/mail.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RoleContextService } from '../role-context/role-context.service';
import { AccountRole } from '../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { RequestMetadata, RoleContext, RoleJwtPayload } from '../role-context/role-context.types';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private jwtService: JwtService,
    private smsService: SmsService,
    private mailService: MailService,
    private eventEmitter: EventEmitter2,
    private roleContextService: RoleContextService,
  ) {}

  private signToken(user: User, session: ActiveRoleSession, role: AccountRole) {
    return this.jwtService.sign({
      sub: user.id,
      sid: session.id,
      rid: role.id,
      rt: role.roleType,
      cv: role.contextVersion,
    });
  }

  private serializeUser(user: User) {
    return {
      id: user.id, phone: user.phone, email: user.email, name: user.name,
      role: user.role, onboardingCompleted: !!user.onboardingCompleted,
    };
  }

  private async issueAuthenticatedResponse(user: User, metadata: RequestMetadata = {}) {
    await this.roleContextService.ensureBuyerRole(user);
    const role = await this.roleContextService.selectRoleForLogin(user, metadata.deviceId);
    const session = await this.roleContextService.createSession(user.id, role, metadata);
    const accessToken = this.signToken(user, session, role);
    const activeContext = await this.roleContextService.resolveContext({
      sub: user.id, sid: session.id, rid: role.id, rt: role.roleType, cv: role.contextVersion,
    });
    return {
      accessToken,
      // Compatibility for current clients; Phase C can standardize on accessToken.
      access_token: accessToken,
      user: this.serializeUser(user),
      activeContext,
      availableRoles: await this.roleContextService.listRoles(user.id),
    };
  }

  // ── REGISTER WITH PHONE ───────────────────────────────────────────────
  async registerWithPhone(dto: {
    phone: string;
    password: string;
    name: string;
  }) {
    const existing = await this.userRepo.findOne({
      where: { phone: dto.phone },
    });
    if (existing) {
      if (!existing.isVerified) return this.resendPhoneOtp(dto.phone);
      throw new ConflictException('Phone number already registered');
    }

    const hashed = await bcrypt.hash(dto.password, 10);
    const otp = this.smsService.generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    const user = this.userRepo.create({
      phone: dto.phone,
      name: dto.name,
      password: hashed,
      otp,
      otpExpiry,
      isVerified: false,
      otpAttempts: 0,
    } as any);

    await this.userRepo.save(user);
    const sent = await this.smsService.sendOtp(dto.phone, otp);

    return {
      message: 'OTP sent to your phone number.',
      method: 'phone',
      phone: dto.phone,
      otpSent: sent,
      ...(process.env.NODE_ENV !== 'production' ? { devOtp: otp } : {}),
    };
  }

  // ── REGISTER WITH EMAIL ───────────────────────────────────────────────
  async registerWithEmail(dto: {
    email: string;
    password: string;
    name: string;
  }) {
    dto.email = dto.email.toLowerCase().trim();
    const existing = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      if (!existing.isVerified) return this.resendEmailOtp(dto.email);
      throw new ConflictException('Email already registered');
    }

    const hashed = await bcrypt.hash(dto.password, 10);
    const otp = this.smsService.generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    const user = this.userRepo.create({
      email: dto.email,
      name: dto.name,
      password: hashed,
      otp,
      otpExpiry,
      isVerified: false,
      otpAttempts: 0,
    } as any);

    await this.userRepo.save(user);

    // ✅ Actually send the email now
    const sent = await this.mailService.sendOtp(dto.email, otp, dto.name);

    return {
      message: 'OTP sent to your email address.',
      method: 'email',
      email: dto.email,
      otpSent: sent,
      ...(process.env.NODE_ENV !== 'production' ? { devOtp: otp } : {}),
    };
  }

  // ── VERIFY OTP ────────────────────────────────────────────────────────
  async verifyOtp(identifier: string, otp: string) {
    const isEmail = identifier.includes('@');
    const user = isEmail
      ? await this.userRepo.findOne({ where: { email: identifier } })
      : await this.userRepo.findOne({ where: { phone: identifier } });

    if (!user) throw new BadRequestException('Account not found');
    if (user.isVerified)
      throw new BadRequestException('Account already verified. Please login.');
    if (user.otpAttempts >= 5)
      throw new BadRequestException('Too many attempts. Request a new OTP.');
    if (!user.otpExpiry || new Date() > user.otpExpiry)
      throw new BadRequestException('OTP expired. Request a new one.');
    if (user.otp !== otp) {
      await this.userRepo.update(user.id, {
        otpAttempts: user.otpAttempts + 1,
      });
      const remaining = 5 - (user.otpAttempts + 1);
      throw new BadRequestException(
        `Incorrect OTP. ${remaining} attempts remaining.`,
      );
    }

    await this.userRepo.update(user.id, {
      isVerified: true,
      otp: null,
      otpExpiry: null,
      otpAttempts: 0,
    });

    this.eventEmitter.emit('user.registered', {
      userId: user.id,
      role: user.role,
    });

    // Send welcome messages
    if (user.phone)
      await this.smsService.sendWelcome(user.phone, String(user.name || ''));
    if (user.email)
      await this.mailService.sendWelcome(user.email, String(user.name || ''));

    const authenticated = await this.issueAuthenticatedResponse(user);
    return {
      message: 'Account verified successfully! Welcome to KenteXa.',
      ...authenticated,
    };
  }

  // ── RESEND OTP — phone ────────────────────────────────────────────────
  async resendPhoneOtp(phone: string) {
    const user = await this.userRepo.findOne({ where: { phone } });
    if (!user) throw new BadRequestException('Phone number not found');
    if (user.isVerified) throw new BadRequestException('Already verified');

    const otp = this.smsService.generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await this.userRepo.update(user.id, { otp, otpExpiry, otpAttempts: 0 });
    const sent = await this.smsService.sendOtp(phone, otp);

    return {
      message: 'New OTP sent to your phone.',
      otpSent: sent,
      ...(process.env.NODE_ENV !== 'production' ? { devOtp: otp } : {}),
    };
  }

  // ── RESEND OTP — email ────────────────────────────────────────────────
  async resendEmailOtp(email: string) {
    email = email.toLowerCase().trim();
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new BadRequestException('Email not found');
    if (user.isVerified) throw new BadRequestException('Already verified');

    const otp = this.smsService.generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await this.userRepo.update(user.id, { otp, otpExpiry, otpAttempts: 0 });

    // ✅ Actually send the email
    const sent = await this.mailService.sendOtp(
      email,
      otp,
      user.name ? String(user.name) : undefined,
    );

    return {
      message: 'New OTP sent to your email.',
      otpSent: sent,
      ...(process.env.NODE_ENV !== 'production' ? { devOtp: otp } : {}),
    };
  }

  // ── LOGIN ─────────────────────────────────────────────────────────────
  async login(identifier: string, password: string, metadata: RequestMetadata = {}) {
    if (!identifier || !identifier.trim())
      throw new UnauthorizedException('Invalid credentials');

    const id = identifier.trim();
    const isEmail = id.includes('@');
    // ✅ Always lowercase email — case-insensitive login
    const normalizedId = isEmail ? id.toLowerCase() : id;

    let user: User | null = null;
    if (isEmail) {
      user = await this.userRepo
        .createQueryBuilder('u')
        .where('LOWER(u.email) = :id', { id: normalizedId })
        .getOne();
    } else {
      user = await this.userRepo
        .createQueryBuilder('u')
        .where('u.phone = :id', { id: normalizedId })
        .getOne();
    }

    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (!user.isVerified) {
      if (user.phone) await this.resendPhoneOtp(user.phone);
      else if (user.email) await this.resendEmailOtp(user.email);
      throw new UnauthorizedException(
        'Account not verified. A new OTP has been sent.',
      );
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) throw new UnauthorizedException('Invalid credentials');

    return this.issueAuthenticatedResponse(user, metadata);
  }

  async getCurrentUser(context: RoleContext) {
    const user = await this.userRepo.findOne({ where: { id: context.userId } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    return { user: this.serializeUser(user), activeContext: context };
  }

  async getAvailableRoles(userId: number) {
    return { availableRoles: await this.roleContextService.listRoles(userId) };
  }

  async switchRole(user: User, currentContext: RoleContext, accountRoleId: number, metadata: RequestMetadata = {}) {
    const target = await this.roleContextService.getRoleForUser(accountRoleId, user.id);
    if (!target || !(await this.roleContextService.isSwitchable(target))) {
      throw new ForbiddenException({ code: 'ROLE_NOT_SWITCHABLE', message: 'ROLE_NOT_SWITCHABLE' });
    }
    await this.roleContextService.revokeCurrentSession(currentContext.sessionId, 'role_switched');
    const session = await this.roleContextService.createSession(user.id, target, metadata);
    const accessToken = this.signToken(user, session, target);
    const activeContext = await this.roleContextService.resolveContext({
      sub: user.id, sid: session.id, rid: target.id, rt: target.roleType, cv: target.contextVersion,
    });
    return { accessToken, access_token: accessToken, activeContext, availableRoles: await this.roleContextService.listRoles(user.id) };
  }

  async logout(payload: RoleJwtPayload | undefined) {
    if (payload?.sid && payload?.sub) await this.roleContextService.revokeCurrentSession(payload.sid, 'logout');
    return { success: true };
  }

  // ── FORGOT PASSWORD ───────────────────────────────────────────────────
  async forgotPassword(identifier: string) {
    const isEmail = identifier.includes('@');
    let user: User | null = null;

    if (isEmail) {
      user = await this.userRepo
        .createQueryBuilder('u')
        .where('LOWER(u.email) = :id', { id: identifier.toLowerCase().trim() })
        .getOne();
    } else {
      user = await this.userRepo
        .createQueryBuilder('u')
        .where('u.phone = :id', { id: identifier })
        .getOne();
    }

    if (!user) throw new BadRequestException('Account not found');

    const otp = this.smsService.generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await this.userRepo.update(user.id, { otp, otpExpiry, otpAttempts: 0 });

    if (user.phone) {
      await this.smsService.sendSms(
        user.phone,
        `KenteXa password reset code: ${otp}. Valid 10 minutes.`,
      );
    }
    if (user.email) {
      // ✅ Send password reset email
      await this.mailService.sendPasswordReset(user.email, otp);
    }

    return {
      message: 'Password reset OTP sent.',
      ...(process.env.NODE_ENV !== 'production' ? { devOtp: otp } : {}),
    };
  }

  // ── RESET PASSWORD ────────────────────────────────────────────────────
  async resetPassword(identifier: string, otp: string, newPassword: string) {
    const isEmail = identifier.includes('@');
    let user: User | null = null;

    if (isEmail) {
      user = await this.userRepo
        .createQueryBuilder('u')
        .where('u.email = :id', { id: identifier })
        .getOne();
    } else {
      user = await this.userRepo
        .createQueryBuilder('u')
        .where('u.phone = :id', { id: identifier })
        .getOne();
    }

    if (!user) throw new BadRequestException('Account not found');
    if (user.otpAttempts >= 5)
      throw new BadRequestException('Too many attempts.');
    if (!user.otpExpiry || new Date() > user.otpExpiry)
      throw new BadRequestException('OTP expired.');
    if (user.otp !== otp) {
      await this.userRepo.update(user.id, {
        otpAttempts: user.otpAttempts + 1,
      });
      throw new BadRequestException('Incorrect OTP.');
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await this.userRepo.update(user.id, {
      password: hashed,
      otp: null,
      otpExpiry: null,
      otpAttempts: 0,
    });

    return { message: 'Password reset successfully. You can now login.' };
  }

  // ── Legacy register ───────────────────────────────────────────────────
  async register(dto: {
    phone?: string;
    email?: string;
    password: string;
    name?: string;
  }) {
    if (dto.email && !dto.phone) {
      return this.registerWithEmail({
        email: dto.email,
        password: dto.password,
        name: dto.name || '',
      });
    }
    return this.registerWithPhone({
      phone: dto.phone!,
      password: dto.password,
      name: dto.name || '',
    });
  }

  async resendOtp(identifier: string) {
    if (identifier.includes('@')) return this.resendEmailOtp(identifier);
    return this.resendPhoneOtp(identifier);
  }
}
