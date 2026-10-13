// ONE answer to "is this person's ID verified?" for every form (owner
// 2026-10-13). It reads the server's identity status (GET /identity/me),
// never the phone-confirmed flag (user.isVerified = phone confirmed by SMS).
//
//   verified  admin checked the ID           -> never ask again
//   waiting   ID sent, admin not done yet    -> show "kinasubiri", never ask again
//   missing   no ID sent yet                 -> show the ID step
//   rejected  admin refused it               -> show the ID step with the reason
//   null      not loaded yet                 -> show nothing / wait
export function identityState(identity) {
  if (!identity) return null;
  switch (identity.status) {
    case 'verified': return 'verified';
    case 'pending': return 'waiting';
    case 'rejected': return 'rejected';
    default: return 'missing';
  }
}

/** True only when the person must (re)send their ID. Never for verified or waiting. */
export const needsIdentityStep = (identity) => {
  const s = identityState(identity);
  return s === 'missing' || s === 'rejected';
};

/** The status right after "Tuma kitambulisho" succeeded (the server keeps a verified one). */
export const afterIdentitySent = (prev) =>
  (prev?.status === 'verified' ? prev : { ...(prev || {}), status: 'pending', level: 0, rejectionReason: null });
