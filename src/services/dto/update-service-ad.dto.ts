import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  ServiceCategory,
  PriceType,
  ServiceStatus,
} from '../entities/service-ad.entity';

// services.service.ts's updateAd() already whitelists mutable fields
// server-side (unlike createAd() before this change) — this DTO mirrors
// that exact allowed list so validation and the service-layer allowlist
// never drift apart. status/isAvailableForBooking are included because
// the owner legitimately self-serves pause/resume (MyServices.js) through
// this same endpoint — still never rating/totalJobs/views/isVerified.
export class UpdateServiceAdDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ServiceCategory)
  category?: ServiceCategory;

  @IsOptional()
  @IsString()
  subcategory?: string;

  @IsOptional()
  @IsEnum(PriceType)
  priceType?: PriceType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMax?: number;

  @IsOptional()
  @IsString()
  coverageCity?: string;

  @IsOptional()
  @IsArray()
  coverageWards?: string[];

  @IsOptional()
  @IsArray()
  workingDays?: string[];

  @IsOptional()
  @IsString()
  workingHours?: string;

  @IsOptional()
  @IsBoolean()
  isAvailableNow?: boolean;

  @IsOptional()
  @IsArray()
  images?: string[];

  @IsOptional()
  @IsString()
  whatsappPhone?: string;

  @IsOptional()
  @IsEnum(ServiceStatus)
  status?: ServiceStatus;

  @IsOptional()
  @IsBoolean()
  isAvailableForBooking?: boolean;
}
