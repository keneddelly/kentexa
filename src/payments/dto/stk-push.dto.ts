import { IsNumber, IsString, Matches, Min } from 'class-validator';

export class StkPushDto {
  @IsNumber()
  orderId: number;

  @IsString()
  @Matches(/^254[0-9]{9}$/, {
    message: 'Phone must be in format 254XXXXXXXXX',
  })
  phone: string;
}