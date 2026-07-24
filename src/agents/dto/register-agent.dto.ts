import { IsEnum, IsOptional, IsString, MinLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterAgentDto {
  @IsString()
  @MinLength(3)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  fullName: string;

  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Matches(/^255[0-9]{9}$/, { message: 'Phone must be 255XXXXXXXXX' })
  phone: string;

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
  idNumber?: string;

  @IsOptional()
  @IsString()
  idType?: string;

  @IsOptional()
  @IsString()
  idPhotoUrl?: string;
}