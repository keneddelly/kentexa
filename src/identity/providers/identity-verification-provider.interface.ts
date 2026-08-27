import {
  IdentityDocumentType,
  IdentityVerificationStatus,
} from '../entities/identity-profile.entity';

// Swap point for a real automated verification provider later (a NIDA API
// integration, a passport-checking service, etc.) — no other code in this
// module should ever talk to a provider directly, only through this
// interface, so plugging one in never touches
// VerificationService/IdentityController. A real provider would likely
// dispatch on `idType` internally to call the right upstream API; today's
// ManualReviewProvider ignores it entirely and always returns PENDING.
export interface IdentityVerificationProvider {
  submit(data: {
    idType: IdentityDocumentType;
    idNumber: string;
    legalName: string;
    dateOfBirth: string;
    idDocumentImageUrl: string;
  }): Promise<{ status: IdentityVerificationStatus }>;
}
