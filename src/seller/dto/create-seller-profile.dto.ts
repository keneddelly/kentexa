import { IsInt, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateSellerProfileDto {
  @IsString()
  @MinLength(3)
  businessName: string;

  @IsOptional()
  @IsString()
  businessDescription?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  businessCategory?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsInt()
  regionId?: number;

  @IsOptional()
  @IsString()
  businessRegion?: string;

  @IsOptional()
  @IsInt()
  districtId?: number;

  @IsOptional()
  @IsString()
  businessDistrict?: string;

  @IsOptional()
  @IsInt()
  wardId?: number;

  @IsOptional()
  @IsString()
  businessCity?: string;
}
