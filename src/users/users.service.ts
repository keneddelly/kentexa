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

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
  ) {}

  // Destructuring off a User instance produces a plain object, which drops
  // the entity's prototype — the @Exclude() decorators on otp/otpExpiry/
  // otpAttempts never fire because ClassSerializerInterceptor only acts on
  // real class instances. Every field that must never leave this service
  // has to be stripped explicitly here, not left to the decorator.
  private exclude(
    user: User,
  ): Omit<User, 'password' | 'otp' | 'otpExpiry' | 'otpAttempts'> {
    const { password, otp, otpExpiry, otpAttempts, ...result } = user;
    return result;
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
    return this.exclude(updated);
  }

  async remove(id: number) {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException(`User #${id} not found`);
    await this.userRepo.remove(user);
    return { message: `User #${id} deleted successfully` };
  }
}
