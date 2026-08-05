import { IsObject, IsOptional, IsString } from 'class-validator';

export class GenerateListingDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  subcategory?: string;

  @IsOptional()
  @IsObject()
  specs?: Record<string, string>;

  @IsOptional()
  @IsString()
  hint?: string;
}
