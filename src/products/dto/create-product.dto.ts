import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CATEGORY_KEYS } from '../../categories/categories.data';

export enum ShippingMethod {
  DIRECT = 'direct',
  AGENT = 'agent',
}

// Layer 1 seller verification — digital products (eBooks/PDFs/etc). Kept
// as a small nested object rather than flattening onto CreateProductDto
// so its fields only ever apply when productType === 'digital'.
export class DigitalAssetDto {
  @IsString()
  cloudinaryPublicId: string;

  @IsString()
  format: string;

  @IsNumber()
  @Min(0)
  fileSizeBytes: number;

  @IsOptional()
  @IsString()
  licenseType?: string;

  @IsBoolean()
  copyrightDeclared: boolean;
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
  @IsIn(CATEGORY_KEYS)
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

  // Previously missing from this DTO — the global ValidationPipe's
  // whitelist:true silently stripped both before the service ever saw
  // them, so sellers could never actually set a custom boda fee or city
  // even though bodaFee directly drives delivery-fee math in orders.
  @IsOptional()
  @IsNumber()
  @Min(0)
  bodaFee?: number;

  @IsOptional()
  @IsString()
  sellerCity?: string;

  // Which CommerceProfile (personal vs a specific business) this product
  // was posted as — same pattern as CreateClassifiedDto.commerceProfileId.
  @IsOptional()
  @IsInt()
  commerceProfileId?: number;

  // Optional structured brand (src/brands/) — never required. Setting
  // this does NOT claim authorization; ProductsService computes the
  // authorized-seller badge separately, live, from
  // BrandAuthorizationsService.
  @IsOptional()
  @IsInt()
  brandId?: number;

  // Optional per-product warranty length override in months (spec §15) —
  // falls back to the brand's own defaultWarrantyMonths when unset.
  @IsOptional()
  @IsInt()
  warrantyMonths?: number;

  // Optional link to the brand's own canonical catalog entry
  // (src/products/entities/official-product.entity.ts) — never required.
  // When set, other sellers' listings on the same official item are
  // surfaced as otherOffers on this product's read.
  @IsOptional()
  @IsInt()
  officialProductId?: number;

  // ── Unified inventory (BIS Local Shop POS) ──────────────────────────────
  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStockThreshold?: number;

  @IsOptional()
  @IsBoolean()
  availableOnline?: boolean;

  @IsOptional()
  @IsBoolean()
  availableInStore?: boolean;

  // Seller's explicit Cash-on-Delivery permission for this product — never
  // assumed. Defaults to false in the entity when omitted.
  @IsOptional()
  @IsBoolean()
  codEnabled?: boolean;

  // ── Digital products (Layer 1 seller verification) ─────────────────────
  @IsOptional()
  @IsIn(['physical', 'digital'])
  productType?: 'physical' | 'digital';

  @IsOptional()
  @ValidateNested()
  @Type(() => DigitalAssetDto)
  digitalAsset?: DigitalAssetDto;
}
