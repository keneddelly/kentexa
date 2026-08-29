import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum CheckoutPaymentMethod {
  ONLINE = 'online',
  COD = 'cod',
}

export class CreateOrderDto {
  @IsNumber()
  productId: number;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsString()
  deliveryMethod?: string; // 'direct' | 'agent'

  // Cash on Delivery — buyer's checkout choice. Defaults to ONLINE (every
  // order behaves exactly as before) when omitted. See
  // CodCalculationService for how the upfront/remaining split is decided.
  @IsOptional()
  @IsEnum(CheckoutPaymentMethod)
  paymentMethod?: CheckoutPaymentMethod;
}
