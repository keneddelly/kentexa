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
}
