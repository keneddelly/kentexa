import {
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  MinLength,
} from 'class-validator';
import { AccountType, BusinessCategory } from '../entities/early-access-registration.entity';

export class CreateRegistrationDto {
  @IsEnum(AccountType)
  accountType: AccountType;

  @IsString()
  @MinLength(2)
  ownerName: string;

  @IsString()
  @MinLength(2)
  businessName: string;

  @IsString()
  @MinLength(7)
  phone: string;

  @IsOptional()
  @IsString()
  whatsapp?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  region: string;

  @IsString()
  district: string;

  @IsOptional()
  @IsString()
  ward?: string;

  @IsEnum(BusinessCategory)
  businessCategory: BusinessCategory;

  @IsString()
  @MinLength(10)
  businessDescription: string;

  @IsString()
  @MinLength(3)
  productsOrServices: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  yearsInBusiness?: number;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsOptional()
  @IsString()
  facebook?: string;

  @IsOptional()
  @IsString()
  instagram?: string;

  @IsOptional()
  @IsString()
  tiktok?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[];

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  // Must be explicitly true — "I agree to be contacted before my profile is published."
  @Equals(true)
  consentToContact: boolean;

  @IsOptional()
  @IsString()
  biggestChallenge?: string;

  @IsOptional()
  @IsString()
  howCustomersFindYou?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  onlinePlatformsUsed?: string[];

  @IsOptional()
  @IsString()
  desiredKentexaFeature?: string;

  @IsOptional()
  @IsBoolean()
  wouldUseAi?: boolean;
}
