import { IsEnum, IsNumber, IsString, Matches, Min } from 'class-validator';
import { PaymentProvider } from '../entities/payment.entity';

export class InitiatePaymentDto {
  @IsNumber()
  orderId: number;

  @IsString()
  @Matches(/^255[0-9]{9}$/, {
    message: 'Phone must be in format 255XXXXXXXXX',
  })
  phone: string;

  @IsEnum(PaymentProvider, {
    message: 'Provider must be one of: vodacom, selcom, airtel, tigo, halopesa',
  })
  provider: PaymentProvider;
}