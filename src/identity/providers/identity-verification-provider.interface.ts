import { IdentityVerificationStatus } from '../entities/identity-profile.entity';

// Swap point for a real NIDA-backed provider later — no other code in this
// module should ever talk to a provider directly, only through this
// interface, so plugging in a real integration never touches
// VerificationService/IdentityController.
export interface IdentityVerificationProvider {
  submit(data: {
    nidaNumber: string;
    legalName: string;
    dateOfBirth: string;
    idDocumentImageUrl: string;
  }): Promise<{ status: IdentityVerificationStatus }>;
}
