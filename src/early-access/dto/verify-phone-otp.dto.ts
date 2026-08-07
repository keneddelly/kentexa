import { IsString, Length, MinLength } from 'class-validator';

export class VerifyPhoneOtpDto {
  @IsString()
  @MinLength(7)
  phone: string;

  @IsString()
  @Length(6, 6)
  otp: string;
}
