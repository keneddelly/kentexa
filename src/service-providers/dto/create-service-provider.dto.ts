import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ServiceCategory } from '../../services/entities/service-ad.entity';

export class CreateServiceProviderDto {
  @IsString()
  @MinLength(2)
  businessName: string;

  @IsOptional()
  @IsString()
  businessDescription?: string;

  @IsOptional()
  @IsEnum(ServiceCategory)
  primaryCategory?: ServiceCategory;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  whatsappPhone?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

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
