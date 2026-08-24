import { Injectable } from '@nestjs/common';
import { IdentityVerificationProvider } from './identity-verification-provider.interface';
import { IdentityVerificationStatus } from '../entities/identity-profile.entity';

// Kentexa has no real NIDA/identity-verification API today (confirmed: no
// provider credentials anywhere in this codebase). This provider is the
// honest stand-in — every submission goes to PENDING and an admin decides
// via IdentityController's review endpoint. Replacing this with a real
// automated provider later is a one-file swap in IdentityModule.
@Injectable()
export class ManualReviewProvider implements IdentityVerificationProvider {
  async submit(): Promise<{ status: IdentityVerificationStatus }> {
    return { status: IdentityVerificationStatus.PENDING };
  }
}
