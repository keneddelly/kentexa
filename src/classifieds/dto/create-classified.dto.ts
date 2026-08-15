import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsArray,
  IsBoolean,
  IsObject,
} from 'class-validator';
import { CATEGORY_KEYS } from '../../categories/categories.data';

export class CreateClassifiedDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsIn(CATEGORY_KEYS)
  category: string;

  @IsOptional()
  @IsString()
  subcategory?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsArray()
  images?: string[];

  // Key-value spec pairs specific to the subcategory
  @IsOptional()
  @IsObject()
  specs?: Record<string, string>;

  @IsOptional()
  @IsString()
  condition?: string; // 'new' | 'used' | 'refurbished'

  @IsOptional()
  @IsBoolean()
  isNegotiable?: boolean;
}
