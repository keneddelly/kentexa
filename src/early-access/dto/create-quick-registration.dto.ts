import { IsEnum, IsString, Matches, MinLength } from 'class-validator';
import { AccountType } from '../entities/early-access-registration.entity';

// Minimal-friction entry point for the registration funnel — accountType,
// name, and a WhatsApp number is all that's asked up front. Everything
// CreateRegistrationDto otherwise requires (region, category, description,
// etc.) is backfilled with placeholder values in the service so this still
// produces a fully-valid EarlyAccessRegistration row; the seller/business
// fills in the rest later, out of band, not as a gate on joining.
export class CreateQuickRegistrationDto {
  @IsEnum(AccountType)
  accountType: AccountType;

  @IsString()
  @MinLength(2)
  ownerName: string;

  @IsString()
  @MinLength(7)
  @Matches(/^[+]?[\d\s-]{7,20}$/, {
    message: 'whatsapp must be a valid phone number',
  })
  whatsapp: string;
}
