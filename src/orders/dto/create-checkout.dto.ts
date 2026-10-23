import { OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { CreateOrderDto } from './create-order.dto';

/** Lipa Namba proof for one seller of the cart: the private screenshot (POST /upload/payment-proof) and an optional reference. */
export class CheckoutLipaProofDto {
  @IsInt()
  sellerId: number;

  @IsString()
  @MaxLength(200)
  proofId: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  reference?: string;
}

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

  // The buyer's district and ward from the checkout place search (tz_district / tz_ward ids).
  // With regionId they make the one delivery place: the server builds its label and saves it
  // as every order's deliveryAddress; nothing typed by the buyer is kept next to it.
  @IsOptional()
  @IsInt()
  districtId?: number;

  @IsOptional()
  @IsInt()
  wardId?: number;

  // Same key on a retried request = the first result, never a second set of orders.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  checkoutKey?: string;

  // Lipa Namba only: one proof per seller in the cart (see OrdersService.createCheckout()).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CheckoutLipaProofDto)
  lipaProofs?: CheckoutLipaProofDto[];
}
