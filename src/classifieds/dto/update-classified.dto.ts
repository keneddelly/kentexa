import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsArray,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { ClassifiedCategory } from '../entities/classified.entity';

export class updateClassifiedDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsEnum(ClassifiedCategory)
  category: ClassifiedCategory;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsArray()
  images?: string[];

  // ── Flash Sale ───────────────────────────────────────────────────────────
  @IsOptional()
  @IsBoolean()
  isFlashSale?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  flashSalePrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  originalPrice?: number;

  @IsOptional()
  @IsDateString()
  flashSaleEndsAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  flashSaleQuantity?: number;
}
