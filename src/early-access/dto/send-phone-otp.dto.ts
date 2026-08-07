import { IsString, MinLength } from 'class-validator';

export class SendPhoneOtpDto {
  @IsString()
  @MinLength(7)
  phone: string;
}
