import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsArray,
  IsObject,
} from 'class-validator';
import { CATEGORY_KEYS } from '../../categories/categories.data';

export class updateClassifiedDto {
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
  @IsObject()
  specs?: Record<string, string>;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsArray()
  images?: string[];

  @IsOptional()
  @IsString()
  contactPhone?: string;
}
