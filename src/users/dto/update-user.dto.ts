import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  MinLength,
} from 'class-validator';
import { UserRole } from '../entities/user.entity';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsString()
  storeName?: string;

  @IsOptional()
  @IsString()
  businessName?: string;

  // Was `profilePhoto` — no matching User column ever existed, so PATCHing
  // it was a silent no-op. Renamed to match the real column.
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  // ── Onboarding fields — were missing here entirely, so the global
  // ValidationPipe's whitelist silently stripped them from every request,
  // even though the PATCH call itself always looked successful. ─────────────
  @IsOptional()
  @IsBoolean()
  onboardingCompleted?: boolean;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsArray()
  interests?: string[];

  // Was collected nowhere — CustomerProfile's edit form had no field for it,
  // so this stayed permanently null for every account.
  @IsOptional()
  @IsString()
  bio?: string;
}
