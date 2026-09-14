import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsArray,
  IsBoolean,
  IsObject,
  IsDateString,
  IsInt,
  Matches,
  ArrayMaxSize,
  IsUrl,
} from 'class-validator';
import { CATEGORY_KEYS } from '../../categories/categories.data';

export class CreateClassifiedDto {
  @IsString()
  @Matches(/\S/)
  title: string;

  @IsString()
  @Matches(/\S/)
  description: string;

  @IsNumber()
  @Min(1)
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
  @ArrayMaxSize(20)
  @IsUrl({ protocols: ['https'], require_protocol: true }, { each: true })
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

  // Optional per-listing contact override (e.g. a personal number for a
  // side-hustle classified, distinct from the account's business number).
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsBoolean()
  isFlashSale?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  flashSalePrice?: number;

  @IsOptional()
  @IsDateString()
  flashSaleEndsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  flashSaleQuantity?: number;
}
