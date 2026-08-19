import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ServiceCategory, PriceType } from '../entities/service-ad.entity';

// Previously createAd() had no DTO at all (@Body() dto: any), and
// services.service.ts spread the raw request body straight into the new
// row (only providerId/status/totalJobs/rating/views were overridden
// afterward) — a client could set isVerified/isAvailableForBooking
// directly. This whitelist closes that: only fields a provider should
// ever set themselves are declared here.
export class CreateServiceAdDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsEnum(ServiceCategory)
  category: ServiceCategory;

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

  // Which CommerceProfile (personal vs a specific business) this service
  // was posted as — same pattern as CreateClassifiedDto.commerceProfileId.
  @IsOptional()
  @IsInt()
  commerceProfileId?: number;
}
