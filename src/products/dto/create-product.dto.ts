import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsObject,
  IsDateString,
} from 'class-validator';

import { ProductDeliveryType } from '../entities/products.entity';

export enum ShippingMethod {
  DIRECT = 'direct',
  AGENT = 'agent',
}

export class CreateProductDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  basePrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryFee?: number;

  @IsNumber()
  @Min(0)
  stock: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  subcategory?: string;

  // Model number/name e.g. "Samsung A15 128GB" — lets wholesale buyers reference
  // an exact product over WhatsApp when a seller lists many similar items.
  @IsOptional()
  @IsString()
  model?: string;

  // Key-value spec pairs e.g. { "Resolution": "1080P", "Battery": "2 hrs" }
  @IsOptional()
  @IsObject()
  specs?: Record<string, string>;

  // Short feature bullets e.g. ["WiFi Live View", "Night Vision", "Motion Detection"]
  @IsOptional()
  @IsArray()
  features?: string[];

  @IsOptional()
  @IsArray()
  images?: string[];

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsEnum(ShippingMethod)
  shippingMethod?: ShippingMethod;

  @IsOptional()
  @IsString()
  estimatedDelivery?: string;

  @IsOptional()
  @IsString()
  shippingNotes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weightKg?: number;

  // ── Digital delivery ─────────────────────────────────────────────────────
  @IsOptional()
  @IsEnum(ProductDeliveryType)
  deliveryType?: ProductDeliveryType;

  @IsOptional()
  @IsString()
  digitalDeliveryUrl?: string;

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
