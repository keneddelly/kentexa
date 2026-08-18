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

  async remove(id: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User #${id} not found`);
    await this.userRepo.remove(user);
    return { message: `User #${id} deleted successfully` };
  }
}
