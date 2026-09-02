// userRole is the Phase B server-resolved activeRoleType. currentUser remains
// in this compatibility signature, but legacy User.activeRoles must never
// make a non-active role operational in the current UI.
export function hasAnyRole(userRole, currentUser, allowedRoles) {
  return !!userRole && allowedRoles.includes(userRole);
}
