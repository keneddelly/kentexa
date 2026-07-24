import {
  IsEnum, IsNumber, IsOptional,
  IsString, Min, IsArray, IsBoolean, IsObject,
} from 'class-validator';
import { ClassifiedCategory } from '../entities/classified.entity';

export class CreateClassifiedDto {
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