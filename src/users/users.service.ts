import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import { CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private commerceProfiles: CommerceProfilesService,
  ) {}

  // Destructuring off a User instance produces a plain object, which drops
  // the entity's prototype — the @Exclude() decorators on otp/otpExpiry/
  // otpAttempts never fire because ClassSerializerInterceptor only acts on
  // real class instances. Every field that must never leave this service
  // has to be stripped explicitly here, not left to the decorator.
  //
  // Same prototype-loss problem hits the other direction too: kentexaId is
  // a getter (not an own property), so it's silently dropped by the same
  // destructure unless re-added explicitly here.
  private exclude(
    user: User,
  ): Omit<User, 'password' | 'otp' | 'otpExpiry' | 'otpAttempts'> {
    const { password, otp, otpExpiry, otpAttempts, ...result } = user;
    return { ...result, kentexaId: user.kentexaId };
  }

  async create(dto: CreateUserDto) {
    const existing = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) throw new ConflictException('Email already in use');
    const hashed = await bcrypt.hash(dto.password, 10);
    const user = this.userRepo.create({ ...dto, password: hashed });
    const saved = await this.userRepo.save(user);
    return this.exclude(saved);
  }

  async findAll() {
    const users = await this.userRepo.find();
    return users.map((u) => this.exclude(u));
  }

  async findOne(id: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User #${id} not found`);
    return this.exclude(user);
  }

  async findByEmail(email: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { email } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: number, dto: UpdateUserDto) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User #${id} not found`);

    // ✅ Check phone uniqueness before saving
    if (dto.phone && dto.phone !== user.phone) {
      const existingPhone = await this.userRepo.findOne({
        where: { phone: dto.phone },
      });
      if (existingPhone && existingPhone.id !== id) {
        throw new ConflictException(
          'This phone number is already linked to another account. Please use a different number.',
        );
      }
    }

    // ✅ Check email uniqueness before saving
    if (dto.email && dto.email.toLowerCase() !== user.email?.toLowerCase()) {
      const existingEmail = await this.userRepo.findOne({
        where: { email: dto.email.toLowerCase() },
      });
      if (existingEmail && existingEmail.id !== id) {
        throw new ConflictException(
          'This email is already linked to another account.',
        );
      }
      dto.email = dto.email.toLowerCase();
    }

    if (dto.password) dto.password = await bcrypt.hash(dto.password, 10);

    Object.assign(user, dto);
    const updated = await this.userRepo.save(user);

    // Keep the personal CommerceProfile's own photoUrl in sync — it's only
    // ever set once, at OTP-verification signup time, from whatever
    // avatarUrl existed then (usually null). Without this, any avatar
    // uploaded/changed afterward stays permanently stale on the personal
    // profile, showing an initials placeholder in comments/profile views
    // even though the account clearly has a real photo.
    if (dto.avatarUrl !== undefined) {
      const personalProfile = await this.commerceProfiles
        .findForUserByType(id, CommerceProfileType.PERSONAL)
        .catch(() => null);
      if (personalProfile) {
        await this.commerceProfiles
          .updatePublicFields(personalProfile.id, { photoUrl: dto.avatarUrl })
          .catch(() => {});
      }
    }

    return this.exclude(updated);
  }

  // Emergency account-recovery path for OTP delivery failures. This verifies
  // only the base Kentexa account; it does NOT approve NIDA/BRELA/KYC,
  // seller, agent, transport-provider or business verification.
  //
  // OTP material is invalidated at the same time so an old code cannot be
  // replayed after the admin override. Idempotent for an already-verified user.
  async adminVerifyAccount(id: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User #${id} not found`);

    if (!user.isVerified) {
      user.isVerified = true;
      user.otp = null;
      user.otpExpiry = null;
      user.otpAttempts = 0;
      await this.userRepo.save(user);
    }

    // Match the normal OTP-verification side effect: every verified account
    // should have a PERSONAL CommerceProfile. Failure is non-fatal here for
    // the same reason it is non-fatal in AuthService.verifyOtp().
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
      // Verification itself remains successful; existing admin/profile repair
      // tooling can recover a missing personal profile later.
    }

    return {
      message: user.isVerified
        ? 'Account verified successfully'
        : 'Account was already verified',
      user: this.exclude(user),
    };
  }

  async remove(id: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User #${id} not found`);
    // I2G: durable financial history (sales, payouts, wallets, invoices, orders, routing entries)
    // is RESTRICTed to its owner. A user who owns any of it is never hard-deleted; the caller
    // gets an explicit, actionable refusal instead of a raw foreign-key violation.
    const history = await this.userRepo.manager.query(
      `SELECT
         (SELECT count(*)::int FROM sale WHERE "sellerId" = $1) AS sales,
         (SELECT count(*)::int FROM payout WHERE "sellerId" = $1) AS payouts,
         (SELECT count(*)::int FROM wallet WHERE "userId" = $1) AS wallets,
         (SELECT count(*)::int FROM invoice WHERE "buyerId" = $1) AS invoices,
         (SELECT count(*)::int FROM "order" WHERE "sellerId" = $1) AS orders,
         (SELECT count(*)::int FROM classified_invoice_request WHERE "sellerId" = $1 OR "buyerId" = $1) AS "classifiedInvoiceRequests",
         (SELECT count(*)::int FROM money_routing_entry WHERE "targetUserId" = $1) AS "routingEntries"`,
      [id],
    );
    const h = history[0] ?? {};
    if (Object.values(h).some((n) => Number(n) > 0)) {
      throw new ConflictException({
        code: 'USER_HAS_FINANCIAL_HISTORY',
        message: 'USER_HAS_FINANCIAL_HISTORY',
        userId: id,
        history: h,
      });
    }
    await this.userRepo.remove(user);
    return { message: `User #${id} deleted successfully` };
  }
}
