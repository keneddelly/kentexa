// userRole comes from the JWT decoded at login (App.js's checkToken()) —
// it only ever carries User.role, a single "last-writer-wins" value that
// every role-approval flow (seller/agent/super-agent/transport) overwrites
// to its own value, even though those same flows also ADD to
// User.activeRoles without removing earlier entries. The backend already
// accounts for this (see SellerScopeService.resolve()) by checking both
// role and activeRoles — pages here must do the same, or an account that
// picked up a second role after becoming a seller gets wrongly locked out
// of its own seller-only pages the moment userRole's snapshot goes stale.
//
// currentUser is the live GET /auth/profile response (already available as
// a prop via App.js's publicProps) — its activeRoles is always fresh,
// unlike the JWT-decoded userRole.
export function hasAnyRole(userRole, currentUser, allowedRoles) {
  const roles = [userRole, ...(currentUser?.activeRoles || [])].filter(Boolean);
  return roles.some((r) => allowedRoles.includes(r));
}
