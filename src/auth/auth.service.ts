import { AdvertisersService } from '../advertisers/advertisers.service';
import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { User } from '../users/entities/user.entity';
import { SmsService } from '../sms/sms.service';
import { MailService } from '../mail/mail.service';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import { CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';
import { PolicyVersionService } from '../policies/policy-version.service';
import { PolicyType } from '../policies/entities/policy-version.entity';
import { normalizeTzPhone } from '../common/utils/phone.util';
import { DELETED_NAME, HIDE_PUBLIC_SQL, OPEN_ORDER_STATUSES, erasedUserFields, maskContact } from './account-deletion';
import { VerificationService } from '../identity/verification.service';
import { RoleContextService } from '../role-context/role-context.service';
import { AccountRole } from '../role-context/entities/account-role.entity';
import { ActiveRoleSession } from '../role-context/entities/active-role-session.entity';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { NotificationType } from '../notifications/entities/notification.entity';
import {
  RequestMetadata,
  RoleContext,
  RoleJwtPayload,
} from '../role-context/role-context.types';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private jwtService: JwtService,
    private smsService: SmsService,
    private mailService: MailService,
    private commerceProfiles: CommerceProfilesService,
    private policyVersions: PolicyVersionService,
    private verification: VerificationService,
    private roleContextService: RoleContextService,
    private inAppNotifications: InAppNotificationService,
    @Optional() private advertisers?: AdvertisersService,
  ) {}

  // Stamps whatever Terms of Service version is currently active at the
  // moment of signup — the registration form's "I agree to the Terms"
  // checkbox is what this proves happened, and when, for a specific
  // version. Never fails registration if resolution fails for any reason.
  private async currentTermsAcceptance(): Promise<{
    termsAcceptedVersion: string | null;
    termsAcceptedAt: Date | null;
  }> {
    const active = await this.policyVersions
      .getActive(PolicyType.TERMS_OF_SERVICE)
      .catch(() => null);
    if (!active) return { termsAcceptedVersion: null, termsAcceptedAt: null };
    return { termsAcceptedVersion: active.version, termsAcceptedAt: new Date() };
  }

  private signToken(
    user: User,
    session: ActiveRoleSession,
    role: AccountRole,
  ) {
    return this.jwtService.sign({
      sub: user.id,
      sid: session.id,
      rid: role.id,
      rt: role.roleType,
      cv: role.contextVersion,
    });
  }

  // The refresh credential is scoped to this server-side session and uses a
  // separate signing key. It is only sent in an HttpOnly cookie.
  private refreshSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is required for refresh credentials');
    return createHash('sha256').update(`kentexa-refresh:${secret}`).digest('hex');
  }

  issueRefreshCredential(context: RoleContext): string {
    return this.jwtService.sign({ purpose: 'refresh', sub: context.userId,
      sid: context.sessionId, rid: context.accountRoleId,
      rt: context.roleType, cv: context.contextVersion },
      { secret: this.refreshSecret(), expiresIn: '7d' });
  }

  private verifyRefreshCredential(credential: string): RoleJwtPayload {
    try {
      const payload = this.jwtService.verify(credential, { secret: this.refreshSecret() });
      if (payload?.purpose !== 'refresh' || !payload.sub || !payload.sid || !payload.rid ||
          !payload.rt || !Number.isInteger(payload.cv)) throw new Error('INVALID_REFRESH');
      return payload;
    } catch { throw new UnauthorizedException('Refresh session expired'); }
  }

  async refresh(credential: string) {
    const payload = this.verifyRefreshCredential(credential);
    // resolveContext checks the DB session expiry/revocation, account owner,
    // role version, suspended role and organizational chain on every renewal.
    const context = await this.roleContextService.resolveContext(payload);
    const user = await this.userRepo.findOne({ where: { id: context.userId } });
    if (!user) throw new UnauthorizedException('Account not found');
    const accessToken = this.jwtService.sign({ sub: user.id, sid: context.sessionId,
      rid: context.accountRoleId, rt: context.roleType, cv: context.contextVersion });
    return { accessToken, access_token: accessToken, user: this.serializeUser(user),
      activeContext: context, availableRoles: await this.roleContextService.listRoles(user.id) };
  }

  async logoutWithCredential(credential?: string, authorization?: string) {
    let payload: RoleJwtPayload | undefined;
    if (credential) {
      try { payload = this.verifyRefreshCredential(credential); } catch { /* expired cookie */ }
    }
    if (!payload && authorization?.startsWith('Bearer ')) {
      try {
        const bearer = this.jwtService.verify<RoleJwtPayload>(authorization.slice(7), { ignoreExpiration: true });
        if (bearer?.sid && bearer?.sub) payload = bearer;
      }
      catch { /* invalid access token */ }
    }
    if (payload?.sid && payload?.sub) await this.logout(payload);
    return { success: true };
  }

  private serializeUser(user: User) {
    return {
      id: user.id,
      phone: user.phone,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl || null,
      kentexaId: user.kentexaId,
      role: user.role,
      onboardingCompleted: !!user.onboardingCompleted,
    };
  }

  private async issueAuthenticatedResponse(
    user: User,
    metadata: RequestMetadata = {},
  ) {
    await this.roleContextService.ensureBuyerRole(user);
    const role = await this.roleContextService.selectRoleForLogin(
      user,
      metadata.deviceId,
    );
    const session = await this.roleContextService.createSession(
      user.id,
      role,
      metadata,
    );
    const accessToken = this.signToken(user, session, role);
    const activeContext = await this.roleContextService.resolveContext({
      sub: user.id,
      sid: session.id,
      rid: role.id,
      rt: role.roleType,
      cv: role.contextVersion,
    });
    return {
      accessToken,
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
    referralCode?: string;
  }) {
    const phone = normalizeTzPhone(dto.phone);
    const existing = await this.userRepo.findOne({
      where: { phone },
    });
    if (existing) {
      if (!existing.isVerified) return this.resendPhoneOtp(phone);
      throw new ConflictException('Phone number already registered');
    }

    const hashed = await bcrypt.hash(dto.password, 10);
    const otp = this.smsService.generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    const terms = await this.currentTermsAcceptance();
    // An unknown/invalid code is silently ignored -- never blocks
    // registration (spec: keep buyer onboarding fast).
    const referrer = dto.referralCode
      ? await this.verification.resolveReferralCode(dto.referralCode).catch(() => null)
      : null;

    const user = this.userRepo.create({
      phone,
      name: dto.name,
      password: hashed,
      otp,
      otpExpiry,
      isVerified: false,
      otpAttempts: 0,
      referredBySuperAgentId: referrer?.id ?? null,
      ...terms,
    } as any);

    await this.userRepo.save(user);
    if (referrer) {
      await this.verification.recordReferralRegistration(referrer, user as unknown as User).catch(() => {});
    } else if (dto.referralCode && this.advertisers) {
      // Not an office code: an advertiser's link (owner 2026-10-26). Never blocks registration.
      await this.advertisers.recordSignup(dto.referralCode, (user as any).id).catch(() => false);
    }
    const sent = await this.smsService.sendOtp(phone, otp);

    return {
      message: 'OTP sent to your phone number.',
      method: 'phone',
      phone,
      otpSent: sent,
      ...(process.env.NODE_ENV !== 'production' ? { devOtp: otp } : {}),
    };
  }

  /**
   * Buying without signing up first (owner 2026-11-10: "when a user arrives with a link, allow him
   * to check out; the account is created at checkout when he adds his phone"). Same SMS code and
   * limits as sign-up; then POST /auth/verify-otp signs the person in and the order goes through.
   *   new number          an account with no usable password (the person can set one later with
   *                       "Weka nenosiri" / forgot password), and the SMS code;
   *   started, not done   the code again;
   *   has an account      { status: 'has_account' }: the checkout asks for the password instead.
   */
  async checkoutPhone(dto: { name?: unknown; phone?: unknown; referralCode?: unknown }) {
    const name = typeof dto?.name === 'string' ? dto.name.trim().slice(0, 100) : '';
    if (name.length < 2) throw new BadRequestException('Andika jina lako.');
    const phone = typeof dto?.phone === 'string' ? normalizeTzPhone(dto.phone) : '';
    if (!/^255\d{9}$/.test(phone)) throw new BadRequestException('Weka namba sahihi ya simu (mf. 0712345678).');
    const existing = await this.userRepo.findOne({ where: { phone } });
    if (existing?.isVerified) return { status: 'has_account' as const, phone };
    const sent: any = existing
      ? await this.resendPhoneOtp(phone)
      : await this.registerWithPhone({
          phone, name,
          // Never shown or sent: the person signs in with the SMS code now and sets a password later.
          password: randomBytes(24).toString('hex'),
          referralCode: typeof dto?.referralCode === 'string' ? dto.referralCode : undefined,
        });
    return { status: 'otp_sent' as const, phone, otpSent: sent?.otpSent ?? true, ...(sent?.devOtp ? { devOtp: sent.devOtp } : {}) };
  }

  // ── REGISTER WITH EMAIL ───────────────────────────────────────────────
  async registerWithEmail(dto: {
    email: string;
    password: string;
    name: string;
    referralCode?: string;
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
    const terms = await this.currentTermsAcceptance();
    const referrer = dto.referralCode
      ? await this.verification.resolveReferralCode(dto.referralCode).catch(() => null)
      : null;

    const user = this.userRepo.create({
      email: dto.email,
      name: dto.name,
      password: hashed,
      otp,
      otpExpiry,
      isVerified: false,
      otpAttempts: 0,
      referredBySuperAgentId: referrer?.id ?? null,
      ...terms,
    } as any);

    await this.userRepo.save(user);
    if (referrer) {
      await this.verification.recordReferralRegistration(referrer, user as unknown as User).catch(() => {});
    } else if (dto.referralCode && this.advertisers) {
      // Not an office code: an advertiser's link (owner 2026-10-26). Never blocks registration.
      await this.advertisers.recordSignup(dto.referralCode, (user as any).id).catch(() => false);
    }

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
      : await this.userRepo.findOne({ where: { phone: normalizeTzPhone(identifier) } });

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

    // Welcome email only — an SMS welcome message here meant every phone
    // signup got two texts seconds apart (the OTP, then this), which read
    // as a confusing duplicate rather than two separate things. If an SMS
    // welcome touchpoint is wanted later, it belongs later in the funnel
    // (e.g. after onboarding), not stacked directly on OTP verification.
    if (user.email)
      await this.mailService.sendWelcome(user.email, String(user.name || ''));

    // Every verified account gets exactly one personal Commerce Profile —
    // this is what makes "one Kentexa account" true from the very first
    // moment, before the person ever becomes a seller/agent/anything else.
    // Never blocks verification itself if it fails.
    try {
      const existing = await this.commerceProfiles.findForUserByType(
        user.id,
        CommerceProfileType.PERSONAL,
      );
      if (!existing) {
        await this.commerceProfiles.createProfile({
          ownerId: user.id,
          type: CommerceProfileType.PERSONAL,
          displayName: user.name || `User ${user.id}`,
          usernameSeed: user.name || `user${user.id}`,
          photoUrl: user.avatarUrl,
        });
      }
    } catch {
      // Non-fatal — the admin backfill will catch any account that slips
      // through here.
    }

    // Account-wide welcome/discovery notification. This is stored in Kentexa
    // itself, so it works even when the user has not granted browser/OS push
    // permission. PushService may additionally deliver it to subscribed
    // devices, but lack of a subscription never blocks signup.
    try {
      await this.inAppNotifications.notify({
        userId: user.id,
        type: NotificationType.SYSTEM,
        title: 'Karibu Kentexa 👋',
        body: 'Gundua bidhaa, huduma, biashara, Moments na usafirishaji. Anza kwa kuona kilicho kipya Kentexa.',
        actionPage: 'Home',
        actionRouteKey: 'discovery.home',
        actionParams: { tab: 'for_you' },
        sourceType: 'platform_welcome',
        icon: '✨',
        classificationStatus: 'resolved',
      });
    } catch {
      // Notifications are engagement infrastructure, never an auth blocker.
    }

    const authenticated = await this.issueAuthenticatedResponse(user);
    return {
      message: 'Account verified successfully! Welcome to KenteXa.',
      ...authenticated,
    };
  }

  // ── RESEND OTP — phone ────────────────────────────────────────────────
  async resendPhoneOtp(phone: string) {
    const normalizedPhone = normalizeTzPhone(phone);
    const user = await this.userRepo.findOne({ where: { phone: normalizedPhone } });
    if (!user) throw new BadRequestException('Phone number not found');
    if (user.isVerified) throw new BadRequestException('Already verified');

    const otp = this.smsService.generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await this.userRepo.update(user.id, { otp, otpExpiry, otpAttempts: 0 });
    const sent = await this.smsService.sendOtp(normalizedPhone, otp);

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

  // ── FUTA AKAUNTI (account deletion, owner 2026-11-10) ─────────────────
  /** Step 1: send a code to the account's own phone (or email) so only its owner can delete it. */
  async requestAccountDeletion(userId: number) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || user.name === DELETED_NAME) throw new UnauthorizedException('Akaunti haipo.');
    await this.assertNoOpenOrders(userId);
    const otp = this.smsService.generateOtp();
    await this.userRepo.update(user.id, { otp, otpExpiry: new Date(Date.now() + 10 * 60 * 1000), otpAttempts: 0 } as any);
    let sent = false;
    if (user.phone) sent = await this.smsService.sendOtp(user.phone, otp).catch(() => false);
    else if (user.email) sent = await this.mailService.sendOtp(user.email, otp, user.name ? String(user.name) : undefined).catch(() => false);
    else throw new BadRequestException('Akaunti hii haina namba ya simu wala barua pepe. Wasiliana na support@kentexa.com.');
    return { sent, to: maskContact(user.phone, user.email), ...(process.env.NODE_ENV !== 'production' ? { devOtp: otp } : {}) };
  }

  /** Step 2: with the right code, close the account and erase its personal data now. */
  async confirmAccountDeletion(userId: number, code: unknown) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || user.name === DELETED_NAME) throw new UnauthorizedException('Akaunti haipo.');
    const otp = typeof code === 'string' ? code.trim() : '';
    if (!user.otp || !user.otpExpiry || user.otpExpiry < new Date()) throw new BadRequestException('Namba imeisha muda. Omba namba mpya.');
    if ((user.otpAttempts ?? 0) >= 5) throw new BadRequestException('Umejaribu mara nyingi. Omba namba mpya.');
    if (otp !== user.otp) {
      await this.userRepo.update(user.id, { otpAttempts: (user.otpAttempts ?? 0) + 1 } as any);
      throw new BadRequestException('Namba si sahihi.');
    }
    await this.assertNoOpenOrders(userId);
    const hidden = await bcrypt.hash(randomBytes(24).toString('hex'), 10);
    const sessionIds: string[] = await this.userRepo.manager.transaction(async (m) => {
      for (const sql of HIDE_PUBLIC_SQL) {
        // A table an older database does not have yet is skipped; the rest still runs.
        await m.query(`SAVEPOINT futa`);
        try { await m.query(sql, [userId]); await m.query(`RELEASE SAVEPOINT futa`); }
        catch { await m.query(`ROLLBACK TO SAVEPOINT futa`); }
      }
      await m.getRepository(User).update(userId, erasedUserFields(hidden) as any);
      const rows = await m.query(`SELECT id FROM public.active_role_session WHERE "userId" = $1 AND "revokedAt" IS NULL`, [userId]);
      return rows.map((r: any) => String(r.id));
    });
    for (const id of sessionIds) await this.roleContextService.revokeCurrentSession(id, 'account_deleted').catch(() => undefined);
    return { deleted: true };
  }

  private async assertNoOpenOrders(userId: number) {
    const [row] = await this.userRepo.manager.query(
      `SELECT count(*)::int AS n FROM public."order" WHERE ("buyerId" = $1 OR "sellerId" = $1) AND status::text = ANY($2::text[])`,
      [userId, OPEN_ORDER_STATUSES],
    ).catch(() => [{ n: 0 }]);
    const n = Number(row?.n || 0);
    if (n > 0) throw new ConflictException(`Una oda ${n} ambazo bado hazijaisha. Zimalize au zighairi kwanza, kisha ufute akaunti.`);
  }

  // ── LOGIN ─────────────────────────────────────────────────────────────
  async login(
    identifier: string,
    password: string,
    metadata: RequestMetadata = {},
  ) {
    if (!identifier || !identifier.trim())
      throw new UnauthorizedException('Invalid credentials');

    const id = identifier.trim();
    const isEmail = id.includes('@');
    // ✅ Always lowercase email — case-insensitive login
    const normalizedId = isEmail ? id.toLowerCase() : normalizeTzPhone(id);

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
    const user = await this.userRepo.findOne({
      where: { id: context.userId },
    });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    return { user: this.serializeUser(user), activeContext: context };
  }

  async getAvailableRoles(userId: number) {
    return {
      availableRoles: await this.roleContextService.listRoles(userId),
    };
  }

  async switchRole(
    user: User,
    currentContext: RoleContext,
    accountRoleId: number,
    metadata: RequestMetadata = {},
  ) {
    const target = await this.roleContextService.getRoleForUser(
      accountRoleId,
      user.id,
    );
    if (!target) {
      throw new ForbiddenException({
        code: 'ROLE_NOT_SWITCHABLE',
        message: 'ROLE_NOT_SWITCHABLE',
      });
    }
    // Business Capability Activation Stage B4.5: never trust a cached/prior
    // GET /auth/roles switchable flag -- re-evaluate the target role fresh,
    // right here, against current authoritative state (AccountRole.status +
    // organizational BusinessCapability), immediately before creating any
    // session. A capability suspended between the client's last /auth/roles
    // read and this request must still reject the switch.
    const availability = await this.roleContextService.evaluateAccountRoleAvailability(target);
    if (!availability.switchable) {
      // Preserve the architectural meaning rather than collapsing every
      // denial into the same generic code: an organizational-entitlement
      // failure is surfaced as such (ROLE_CONTEXT_CAPABILITY_INACTIVE /
      // ROLE_CONTEXT_ORGANIZATIONAL_REVOKED), never mislabeled as if the
      // AccountRole itself had been suspended. Every other denial reason
      // (role not active, invalid profile) keeps the existing
      // ROLE_NOT_SWITCHABLE code exactly as before this stage.
      const code: string =
        availability.reason === 'ROLE_CONTEXT_CAPABILITY_INACTIVE' ||
        availability.reason === 'ROLE_CONTEXT_ORGANIZATIONAL_REVOKED'
          ? availability.reason
          : 'ROLE_NOT_SWITCHABLE';
      throw new ForbiddenException({ code, message: code });
    }
    await this.roleContextService.revokeCurrentSession(
      currentContext.sessionId,
      'role_switched',
    );
    const session = await this.roleContextService.createSession(
      user.id,
      target,
      metadata,
    );
    const accessToken = this.signToken(user, session, target);
    const activeContext = await this.roleContextService.resolveContext({
      sub: user.id,
      sid: session.id,
      rid: target.id,
      rt: target.roleType,
      cv: target.contextVersion,
    });
    return {
      accessToken,
      access_token: accessToken,
      activeContext,
      availableRoles: await this.roleContextService.listRoles(user.id),
    };
  }

  async logout(payload: RoleJwtPayload | undefined) {
    if (payload?.sid && payload?.sub) {
      await this.roleContextService.revokeCurrentSession(payload.sid, 'logout');
    }
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
        .where('u.phone = :id', { id: normalizeTzPhone(identifier) })
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
        .where('u.phone = :id', { id: normalizeTzPhone(identifier) })
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
