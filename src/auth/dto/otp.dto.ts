import { IsString, MinLength } from 'class-validator';

export class VerifyOtpDto {
  @IsString()
  @MinLength(3)
  identifier: string;

  @IsString()
  @MinLength(4)
  otp: string;
}

export class ResendOtpDto {
  @IsString()
  @MinLength(3)
  identifier: string;
}

export class ForgotPasswordDto {
  @IsString()
  @MinLength(3)
  identifier: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(3)
  identifier: string;

  @IsString()
  @MinLength(4)
  otp: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}
