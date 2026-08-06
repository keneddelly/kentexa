import { IsOptional, IsString, MinLength } from 'class-validator';

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
