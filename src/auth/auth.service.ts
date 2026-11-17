import { AdvertisersService } from '../advertisers/advertisers.service';
import { authError } from './auth-errors';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';
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
import { SOCIAL_TEXT, SocialProfile, SocialProvider, providerName, socialConfig, verifyFacebook, verifyGoogle } from './social-login';
import { DELETED_NAME, ERASE_TRACKING_SQL, HIDE_PUBLIC_SQL, OPEN_ORDER_STATUSES, erasedUserFields, maskContact } from './account-deletion';
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
    // Sign-up journey events (issue #361). Optional so hand-built test services keep working.
    @Optional() private activityEvents?: ActivityEventService,
  ) {}

  /**
   * Sign-up and sign-in journey events (owner approved 2026-11-16, issue #361): which step
   * people reach and why they fail, so the journey can be measured. Never a phone number,
   * email, password or code. Never blocks the request.
   */
  private journey(eventType: string, actorId: number | null, metadata: Record<string, unknown> = {}): void {
    try {
      this.activityEvents?.record({
        eventType, category: ActivityCategory.AUTH, actorId, actorType: actorId ? 'user' : 'visitor',
        targetType: 'account', targetId: actorId, metadata, visibility: 'system',
        severity: /FAILED/.test(eventType) ? 'warning' : 'info',
      })?.catch?.(() => {});
    } catch { /* measuring never blocks signing in */ }
  }

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
    // A session in use stays signed in: its end moves to 7 days from now (the controller also
    // writes a fresh 7-day refresh cookie).
    await Promise.resolve().then(() => this.roleContextService.extendSession(context.sessionId)).catch(() => undefined);
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
      throw authError(ConflictException, 'PHONE_TAKEN', 'Phone number already registered');
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
    this.journey('REGISTRATION_STARTED', (user as any).id ?? null, { method: 'phone', invited: !!dto.referralCode });
    this.journey('OTP_SENT', (user as any).id ?? null, { purpose: 'register', channel: 'sms', delivered: !!sent });

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
      throw authError(ConflictException, 'EMAIL_TAKEN', 'Email already registered');
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
    this.journey('REGISTRATION_STARTED', (user as any).id ?? null, { method: 'email', invited: !!dto.referralCode });
    this.journey('OTP_SENT', (user as any).id ?? null, { purpose: 'register', channel: 'email', delivered: !!sent });

    return {
      message: 'OTP sent to your email address.',
      method: 'email',
      email: dto.email,
      otpSent: sent,
      ...(process.env.NODE_ENV !== 'production' ? { devOtp: otp } : {}),
    };
  }

  // ── VERIFY OTP ────────────────────────────────────────────────────────
  /**
   * A new account's first moment (after the sign-up code, or a Google / Facebook sign-up): the
   * welcome email, its personal Commerce Profile and the in-app welcome. Never blocks sign-in.
   */
  private async welcomeNewAccount(user: User) {
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

  }

  async verifyOtp(identifier: string, otp: string) {
    const isEmail = identifier.includes('@');
    const user = isEmail
      ? await this.userRepo.findOne({ where: { email: identifier } })
      : await this.userRepo.findOne({ where: { phone: normalizeTzPhone(identifier) } });

    if (!user) {
      this.journey('OTP_FAILED', null, { reason: 'no_account' });
      throw authError(BadRequestException, 'ACCOUNT_NOT_FOUND', 'Account not found');
    }
    if (user.isVerified) {
      this.journey('OTP_FAILED', user.id, { reason: 'already_verified' });
      throw authError(BadRequestException, 'ALREADY_VERIFIED', 'Account already verified. Please login.');
    }
    if (user.otpAttempts >= 5) {
      this.journey('OTP_FAILED', user.id, { reason: 'too_many' });
      throw authError(BadRequestException, 'OTP_TOO_MANY', 'Too many attempts. Request a new OTP.');
    }
    if (!user.otpExpiry || new Date() > user.otpExpiry) {
      this.journey('OTP_FAILED', user.id, { reason: 'expired' });
      throw authError(BadRequestException, 'OTP_EXPIRED', 'OTP expired. Request a new one.');
    }
    if (user.otp !== otp) {
      await this.userRepo.update(user.id, {
        otpAttempts: user.otpAttempts + 1,
      });
      const remaining = 5 - (user.otpAttempts + 1);
      this.journey('OTP_FAILED', user.id, { reason: 'wrong', remaining });
      throw authError(BadRequestException, 'OTP_WRONG', `Incorrect OTP. ${remaining} attempts remaining.`, { remaining });
    }
    this.journey('OTP_VERIFIED', user.id, { channel: isEmail ? 'email' : 'sms' });

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
    await this.welcomeNewAccount(user);

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
    if (!user) throw authError(BadRequestException, 'ACCOUNT_NOT_FOUND', 'Phone number not found');
    if (user.isVerified) throw authError(BadRequestException, 'ALREADY_VERIFIED', 'Already verified');

    const otp = this.smsService.generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await this.userRepo.update(user.id, { otp, otpExpiry, otpAttempts: 0 });
    const sent = await this.smsService.sendOtp(normalizedPhone, otp);
    this.journey('OTP_SENT', user.id, { purpose: 'resend', channel: 'sms', delivered: !!sent });

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
    if (!user) throw authError(BadRequestException, 'ACCOUNT_NOT_FOUND', 'Email not found');
    if (user.isVerified) throw authError(BadRequestException, 'ALREADY_VERIFIED', 'Already verified');

    const otp = this.smsService.generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await this.userRepo.update(user.id, { otp, otpExpiry, otpAttempts: 0 });

    // ✅ Actually send the email
    const sent = await this.mailService.sendOtp(
      email,
      otp,
      user.name ? String(user.name) : undefined,
    );
    this.journey('OTP_SENT', user.id, { purpose: 'resend', channel: 'email', delivered: !!sent });

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
      for (const sql of [...HIDE_PUBLIC_SQL, ...ERASE_TRACKING_SQL]) {
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

  // ── INGIA KWA GOOGLE / FACEBOOK (owner 2026-11-17) ────────────────────
  // 1. POST /auth/social: an outside account already linked signs in; a Google account whose
  //    verified email belongs to a KenteXa account is linked and signs in. Otherwise the person
  //    gets a short "ticket" and is asked for a phone number.
  // 2. POST /auth/social/phone: the SMS code goes to that phone (a new account is started, or an
  //    existing account with that phone will be linked once its owner types the code).
  // 3. POST /auth/social/verify: the code proves the phone; the outside account is linked and the
  //    person is signed in. Every account keeps a verified phone, as before.
  socialProviders() {
    const c = socialConfig();
    return { google: c.google, facebook: c.facebook };
  }

  private socialSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is required');
    return createHash('sha256').update(`kentexa-social:${secret}`).digest('hex');
  }

  private async socialTableReady(): Promise<boolean> {
    const [row] = await this.userRepo.manager.query(`SELECT to_regclass('public.user_social_login') IS NOT NULL AS ok`).catch(() => [null]);
    return Boolean(row?.ok);
  }


  private readTicket(ticket: unknown): SocialProfile {
    try {
      const t: any = this.jwtService.verify(String(ticket || ''), { secret: this.socialSecret() });
      if (t?.purpose !== 'social' || !['google', 'facebook'].includes(t.p) || !t.sub) throw new Error('bad');
      return { provider: t.p, sub: String(t.sub), email: t.email ?? null, emailVerified: Boolean(t.ev), name: t.name ?? null, picture: t.pic ?? null };
    } catch { throw new BadRequestException(SOCIAL_TEXT.ticket); }
  }

  private async linkedUser(p: SocialProfile): Promise<User | null> {
    const [row] = await this.userRepo.manager.query(`SELECT "userId" FROM public.user_social_login WHERE provider = $1::varchar AND "providerUserId" = $2::varchar`, [p.provider, p.sub]);
    return row ? this.userRepo.findOne({ where: { id: Number(row.userId) } }) : null;
  }

  /** Links the outside account to the user, and fills an empty email or photo from it. */
  private async linkSocial(user: User, p: SocialProfile) {
    const m = this.userRepo.manager;
    const [mine] = await m.query(`SELECT "providerUserId" FROM public.user_social_login WHERE provider = $1::varchar AND "userId" = $2::int`, [p.provider, user.id]);
    if (mine && String(mine.providerUserId) !== p.sub) throw new ConflictException(SOCIAL_TEXT.otherLink.replace('{p}', providerName(p.provider)));
    const ins = await m.query(`INSERT INTO public.user_social_login (provider, "providerUserId", "userId", email) VALUES ($1::varchar, $2::varchar, $3::int, $4::varchar)
      ON CONFLICT (provider, "providerUserId") DO UPDATE SET "lastUsedAt" = now() RETURNING "userId"`, [p.provider, p.sub, user.id, p.email]);
    if (Number(ins?.[0]?.userId) !== Number(user.id)) throw new ConflictException(SOCIAL_TEXT.linkedElsewhere.replace('{p}', providerName(p.provider)));
    const fill: Partial<User> = {};
    if (!user.email && p.email && p.emailVerified) {
      const [taken] = await m.query(`SELECT id FROM public."user" WHERE LOWER(email) = $1::varchar LIMIT 1`, [p.email]);
      if (!taken) fill.email = p.email;
    }
    if (!user.avatarUrl && p.picture) fill.avatarUrl = p.picture;
    if (Object.keys(fill).length) await this.userRepo.update(user.id, fill as any).catch(() => undefined);
  }

  async socialLogin(body: { provider?: unknown; token?: unknown; deviceId?: unknown }, metadata: RequestMetadata = {}) {
    const provider = String(body?.provider || '') as SocialProvider;
    const token = typeof body?.token === 'string' ? body.token : '';
    const cfg = socialConfig();
    if (!(provider === 'google' ? cfg.google : provider === 'facebook' ? cfg.facebook : null) || !(await this.socialTableReady())) {
      throw new BadRequestException(SOCIAL_TEXT.off);
    }
    const p = provider === 'google' ? await verifyGoogle(token) : await verifyFacebook(token);
    if (!p) {
      this.journey('LOGIN_FAILED', null, { reason: 'social_token', provider });
      throw new UnauthorizedException(SOCIAL_TEXT.bad);
    }
    let user = await this.linkedUser(p);
    if (user && user.name === DELETED_NAME) user = null;
    if (!user && p.emailVerified && p.email) {
      const byEmail = await this.userRepo.createQueryBuilder('u').where('LOWER(u.email) = :e', { e: p.email }).getOne();
      if (byEmail && byEmail.name !== DELETED_NAME) {
        // Google proved this email: an account that never typed its email code is verified now.
        if (!byEmail.isVerified) {
          await this.userRepo.update(byEmail.id, { isVerified: true, otp: null, otpExpiry: null, otpAttempts: 0 } as any);
          byEmail.isVerified = true;
          await this.welcomeNewAccount(byEmail).catch(() => undefined);
        }
        await this.linkSocial(byEmail, p);
        user = byEmail;
      }
    }
    if (user) {
      await this.userRepo.manager.query(`UPDATE public.user_social_login SET "lastUsedAt" = now() WHERE provider = $1::varchar AND "providerUserId" = $2::varchar`, [p.provider, p.sub]).catch(() => undefined);
      this.journey('LOGIN_SOCIAL', user.id, { provider });
      return { status: 'signed_in' as const, ...(await this.issueAuthenticatedResponse(user, metadata)) };
    }
    // Owner 2026-11-17: no phone at sign-up ("there are users outside Tanzania who join
    // communities"). The account is made from the Google / Facebook profile; a phone is asked
    // only later, by the features that need one (selling, delivery, payments).
    const created = await this.createSocialAccount(p);
    this.journey('REGISTRATION_STARTED', created.id, { method: provider, phone: false });
    this.journey('LOGIN_SOCIAL', created.id, { provider, created: true });
    return { status: 'signed_in' as const, created: true, ...(await this.issueAuthenticatedResponse(created, metadata)) };
  }

  /** A new account from a verified Google / Facebook profile: no phone, no password the person knows. */
  private async createSocialAccount(p: SocialProfile): Promise<User> {
    let email: string | null = null;
    if (p.email) {
      const [taken] = await this.userRepo.manager.query(`SELECT id FROM public."user" WHERE LOWER(email) = $1::varchar LIMIT 1`, [p.email]);
      if (!taken) email = p.email;
    }
    const terms = await this.currentTermsAcceptance();
    const user = this.userRepo.create({
      phone: null, email, name: (p.name || '').trim().slice(0, 100) || 'Mtumiaji wa KenteXa',
      password: await bcrypt.hash(randomBytes(24).toString('hex'), 10),
      avatarUrl: p.picture || null, isVerified: true, otp: null, otpExpiry: null, otpAttempts: 0,
      ...terms,
    } as any) as unknown as User;
    await this.userRepo.save(user);
    await this.linkSocial(user, p);
    await this.welcomeNewAccount(user).catch(() => undefined);
    return user;
  }

  async socialPhone(body: { ticket?: unknown; phone?: unknown }) {
    const p = this.readTicket(body?.ticket);
    const phone = typeof body?.phone === 'string' ? normalizeTzPhone(body.phone) : '';
    if (!/^255\d{9}$/.test(phone)) throw new BadRequestException(SOCIAL_TEXT.phone);
    const existing = await this.userRepo.findOne({ where: { phone } });
    if (existing && existing.name === DELETED_NAME) throw new BadRequestException(SOCIAL_TEXT.phone);
    let sent: any;
    if (existing?.isVerified) {
      // The phone's owner proves it with the code; only then is the outside account linked.
      const otp = this.smsService.generateOtp();
      await this.userRepo.update(existing.id, { otp, otpExpiry: new Date(Date.now() + 10 * 60 * 1000), otpAttempts: 0 } as any);
      const ok = await this.smsService.sendOtp(phone, otp);
      this.journey('OTP_SENT', existing.id, { purpose: 'social_link', channel: 'sms', delivered: !!ok });
      sent = { otpSent: ok, ...(process.env.NODE_ENV !== 'production' ? { devOtp: otp } : {}) };
    } else if (existing) {
      sent = await this.resendPhoneOtp(phone);
    } else {
      sent = await this.registerWithPhone({
        phone, name: (p.name || '').trim() || 'Mtumiaji wa KenteXa',
        // Never shown: the person signs in with Google / Facebook and can set a password later.
        password: randomBytes(24).toString('hex'),
      });
    }
    return { status: 'otp_sent' as const, phone, existing: Boolean(existing?.isVerified), otpSent: sent?.otpSent ?? true,
      ...(sent?.devOtp ? { devOtp: sent.devOtp } : {}) };
  }

  async socialVerify(body: { ticket?: unknown; phone?: unknown; otp?: unknown }, metadata: RequestMetadata = {}) {
    const p = this.readTicket(body?.ticket);
    const phone = typeof body?.phone === 'string' ? normalizeTzPhone(body.phone) : '';
    const otp = typeof body?.otp === 'string' ? body.otp.trim() : '';
    const user = phone ? await this.userRepo.findOne({ where: { phone } }) : null;
    if (!user || user.name === DELETED_NAME) throw authError(BadRequestException, 'ACCOUNT_NOT_FOUND', 'Account not found');
    if (!user.isVerified) {
      // A new account: the normal sign-up check (welcome, personal profile) runs, then the link.
      const res = await this.verifyOtp(phone, otp);
      const fresh = await this.userRepo.findOne({ where: { id: user.id } });
      if (fresh) await this.linkSocial(fresh, p);
      this.journey('LOGIN_SOCIAL', user.id, { provider: p.provider, created: true });
      return res;
    }
    if ((user.otpAttempts ?? 0) >= 5) throw authError(BadRequestException, 'OTP_TOO_MANY', 'Too many attempts. Request a new OTP.');
    if (!user.otp || !user.otpExpiry || new Date() > user.otpExpiry) throw authError(BadRequestException, 'OTP_EXPIRED', 'OTP expired. Request a new one.');
    if (user.otp !== otp) {
      await this.userRepo.update(user.id, { otpAttempts: (user.otpAttempts ?? 0) + 1 } as any);
      const remaining = 5 - ((user.otpAttempts ?? 0) + 1);
      throw authError(BadRequestException, 'OTP_WRONG', `Incorrect OTP. ${remaining} attempts remaining.`, { remaining });
    }
    await this.userRepo.update(user.id, { otp: null, otpExpiry: null, otpAttempts: 0 } as any);
    await this.linkSocial(user, p);
    this.journey('LOGIN_SOCIAL', user.id, { provider: p.provider, linked: true });
    return this.issueAuthenticatedResponse(user, metadata);
  }

  // ── LOGIN ─────────────────────────────────────────────────────────────
  async login(
    identifier: string,
    password: string,
    metadata: RequestMetadata = {},
  ) {
    if (!identifier || !identifier.trim())
      throw authError(UnauthorizedException, 'INVALID_CREDENTIALS', 'Invalid credentials');

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

    if (!user) {
      this.journey('LOGIN_FAILED', null, { reason: 'no_account' });
      throw authError(UnauthorizedException, 'INVALID_CREDENTIALS', 'Invalid credentials');
    }

    if (!user.isVerified) {
      // Issue #361: the person never typed their code. A new one goes out and the page opens
      // the code step straight away (identifier = what /auth/verify-otp expects).
      let resent: any = null;
      if (user.phone) resent = await this.resendPhoneOtp(user.phone).catch(() => null);
      else if (user.email) resent = await this.resendEmailOtp(user.email).catch(() => null);
      this.journey('LOGIN_FAILED', user.id, { reason: 'not_verified' });
      throw authError(UnauthorizedException, 'ACCOUNT_NOT_VERIFIED', 'Account not verified. A new OTP has been sent.', {
        identifier: user.phone || user.email,
        otpSent: !!resent?.otpSent,
      });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      this.journey('LOGIN_FAILED', user.id, { reason: 'wrong_password' });
      throw authError(UnauthorizedException, 'INVALID_CREDENTIALS', 'Invalid credentials');
    }

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

    if (!user) throw authError(BadRequestException, 'ACCOUNT_NOT_FOUND', 'Account not found');

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

    if (!user) throw authError(BadRequestException, 'ACCOUNT_NOT_FOUND', 'Account not found');
    if (user.otpAttempts >= 5)
      throw authError(BadRequestException, 'OTP_TOO_MANY', 'Too many attempts.');
    if (!user.otpExpiry || new Date() > user.otpExpiry)
      throw authError(BadRequestException, 'OTP_EXPIRED', 'OTP expired.');
    if (user.otp !== otp) {
      await this.userRepo.update(user.id, {
        otpAttempts: user.otpAttempts + 1,
      });
      throw authError(BadRequestException, 'OTP_WRONG', 'Incorrect OTP.');
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
