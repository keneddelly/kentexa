import { OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, Min, ValidateNested } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';

export class CheckoutItemDto {
  @IsNumber()
  productId: number;

  @IsNumber()
  @Min(1)
  quantity: number;
}

/**
 * POST /orders/checkout — the whole cart in one request. Every item becomes one
 * order through OrdersService.create() with the same shared fields (address,
 * phone, payment method, ...), exactly as the old one-POST-per-item loop did.
 * The request is the "checkout": its direct-payment orders get one seller
 * notice per seller (see seller-checkout-notice.ts). Nothing extra is stored.
 */
export class CreateCheckoutDto extends OmitType(CreateOrderDto, ['productId', 'quantity'] as const) {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items: CheckoutItemDto[];

  // The buyer's district from the checkout place list (tz_district id). Not stored on the order
  // (no column, see CreateOrderDto); used only for the seller notice's "Mahali" line.
  @IsOptional()
  @IsInt()
  districtId?: number;
}
