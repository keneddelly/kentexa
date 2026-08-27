import {
  ArrayMinSize,
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

  // Required, not optional — a service ad with no photo gave a viewer
  // nothing to actually look at (unlike a product, which at least has a
  // name/price to go on). PostService.js had an images.length check
  // guarding its AI-description button, but never on the actual submit —
  // a service could be posted with zero images. Enforced here too, not
  // just client-side, since a direct API call bypasses any frontend check.
  @IsArray()
  @ArrayMinSize(1)
  images: string[];

  @IsOptional()
  @IsString()
  whatsappPhone?: string;

  // Which CommerceProfile (personal vs a specific business) this service
  // was posted as — same pattern as CreateClassifiedDto.commerceProfileId.
  @IsOptional()
  @IsInt()
  commerceProfileId?: number;
}
