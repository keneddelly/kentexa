import { IsOptional, IsString, IsEnum, MinLength } from 'class-validator';
import { ClassifiedCategory } from '../../classifieds/entities/classified.entity';

export class CreateSellerProfileDto {
  @IsString()
  @MinLength(3)
  businessName: string;

  @IsOptional()
  @IsEnum(ClassifiedCategory)
  businessCategory?: ClassifiedCategory;

  @IsOptional()
  @IsString()
  businessDescription?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  ward?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  idType?: string;

  @IsOptional()
  @IsString()
  idNumber?: string;

  @IsOptional()
  @IsString()
  idPhotoUrl?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;
}
