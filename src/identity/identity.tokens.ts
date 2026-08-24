// DI token for IdentityVerificationProvider — interfaces have no runtime
// identity in TS, so Nest needs a token to bind the interface to whichever
// implementation is currently provided in IdentityModule.
export const IDENTITY_VERIFICATION_PROVIDER = 'IDENTITY_VERIFICATION_PROVIDER';
