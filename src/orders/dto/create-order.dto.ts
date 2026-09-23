import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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

  // Checkout DTO Integrity hotfix. Legitimate buyer intent, declared here so
  // the global ValidationPipe (whitelist: true) stops silently discarding
  // them before OrdersService.create() ever sees them. shippingMethod is
  // validated CONTEXTUALLY against OrdersService.getDeliveryMethods() (the
  // existing delivery-method authority) in the service, not against a bare
  // static enum here — a syntactically valid key can still be ineligible
  // for a given product/address. Deliberately does NOT include
  // deliveryFee/collectionFee (fee amounts are never client-trusted; the
  // server always derives them) or regionId/districtId/wardId/
  // destinationCity (Order has no matching persisted column today — adding
  // them here would silently require a migration this hotfix does not
  // include; deferred to the Location/Order integration stage).
  @IsOptional()
  @IsString()
  shippingMethod?: string;

  @IsOptional()
  @IsBoolean()
  needsCollection?: boolean;

  @IsOptional()
  @IsBoolean()
  isRuralCollection?: boolean;
}
