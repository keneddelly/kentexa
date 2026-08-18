import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterPhoneDto {
  @IsString()
  @MinLength(9)
  phone: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @MinLength(2)
  name: string;
}

export class RegisterEmailDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @MinLength(2)
  name: string;
}

// Legacy /auth/register — accepts either identifier, matching
// AuthService.register()'s own dispatch-by-field logic.
export class RegisterDto {
  @IsOptional()
  @IsString()
  @MinLength(9)
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;
}
