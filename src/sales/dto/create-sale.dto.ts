import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SaleChannel, SalePaymentMethod } from '../entities/sale.entity';

export class SaleItemDto {
  @IsInt()
  productId: number;

  @IsNumber()
  @Min(1)
  quantity: number;

  // Overrides the product's own displayPrice — a cashier occasionally sells
  // below list price; omit to just charge the product's normal price.
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lineDiscount?: number;
}

export class CreateSaleDto {
  @IsEnum(SaleChannel)
  channel: SaleChannel;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsEnum(SalePaymentMethod)
  paymentMethod: SalePaymentMethod;

  @IsNumber()
  @Min(0)
  amountPaid: number;

  // Cash on Delivery — the only way amountPaid may be less than the sale
  // total (see SalesService.createSale()'s validation). Requires
  // customerPhone so there's someone to collect the balance from later.
  @IsOptional()
  @IsBoolean()
  isCod?: boolean;

  @IsOptional()
  @IsInt()
  customerId?: number;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;
}
