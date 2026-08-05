import { IsString, MinLength } from 'class-validator';

export class RejectRegistrationDto {
  @IsString()
  @MinLength(5)
  rejectionReason: string;
}
