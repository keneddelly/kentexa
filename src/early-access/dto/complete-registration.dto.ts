import { OmitType } from '@nestjs/swagger';
import { CreateRegistrationDto } from './create-registration.dto';

// Same required-ness as CreateRegistrationDto — the "tell us more" wizard
// still requires region/category/description/etc., it just skips the
// account-type step since that was already captured at quick-register time.
export class CompleteRegistrationDto extends OmitType(CreateRegistrationDto, [
  'accountType',
] as const) {}
