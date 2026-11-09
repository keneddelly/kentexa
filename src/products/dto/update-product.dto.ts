import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

// Every field from CreateProductDto, made optional, with the same
// validation decorators preserved — derived automatically so this can't
// drift out of sync the way the old hand-written version did (it was
// missing basePrice, deliveryFee, subcategory, model, specs, features,
// shippingMethod, estimatedDelivery, shippingNotes, and weightKg).
export class UpdateProductDto extends PartialType(CreateProductDto) {
  // "Uza tena" (owner 2026-11-09): the supplier opens this product for resellers, with the price
  // a reseller pays it and an optional lowest selling price. Checked in ProductsService.update().
  @IsOptional()
  @IsBoolean()
  resaleOpen?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  resalePrice?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  resaleMinPrice?: number | null;
}
