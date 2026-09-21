/**
 * businessEntry.js — I2D.
 *
 * Decides WHICH Business a Business-only page (BusinessHome/BusinessDashboard)
 * may open. Pure navigation logic: the server still authorizes every read
 * and action, and canonical RoleContext stays the acting authority. The one
 * thing this module refuses to do is guess — no first/oldest Business, no
 * account-wide role, no silent retarget of the acting Business.
 *
 * Inputs:
 *  - activeContext: server RoleContext (identityType/businessId).
 *  - routeBusinessId: the id named by the route, or null for a bare entry.
 *  - businesses: the user's own Businesses (GET /business/mine/all).
 *
 * Outcomes:
 *  - ok            → open `businessId`.
 *  - choose        → several Businesses, none explicitly selected → chooser.
 *  - none          → the user owns no Business.
 *  - inaccessible  → the route names a Business the user does not own.
 *  - mismatch      → the route names a Business other than the BUSINESS
 *                    context the user is acting as; never silently retargeted.
 */
export const BUSINESS_ENTRY = Object.freeze({
  OK: 'ok',
  CHOOSE: 'choose',
  NONE: 'none',
  INACCESSIBLE: 'inaccessible',
  MISMATCH: 'mismatch',
});

export const resolveBusinessEntry = ({ activeContext, routeBusinessId, businesses = [] }) => {
  const contextBusinessId = activeContext?.identityType === 'BUSINESS' && activeContext?.businessId != null
    ? Number(activeContext.businessId)
    : null;
  const routeId = routeBusinessId != null && routeBusinessId !== '' ? Number(routeBusinessId) : null;
  const owned = (id) => businesses.some((b) => Number(b.id) === Number(id));

  if (routeId != null) {
    if (contextBusinessId != null && contextBusinessId !== routeId) {
      return { status: BUSINESS_ENTRY.MISMATCH, routeBusinessId: routeId, contextBusinessId };
    }
    return owned(routeId)
      ? { status: BUSINESS_ENTRY.OK, businessId: routeId }
      : { status: BUSINESS_ENTRY.INACCESSIBLE, routeBusinessId: routeId };
  }

  if (contextBusinessId != null) {
    return owned(contextBusinessId)
      ? { status: BUSINESS_ENTRY.OK, businessId: contextBusinessId }
      : { status: BUSINESS_ENTRY.INACCESSIBLE, routeBusinessId: contextBusinessId };
  }
  if (businesses.length === 1) return { status: BUSINESS_ENTRY.OK, businessId: Number(businesses[0].id) };
  if (businesses.length === 0) return { status: BUSINESS_ENTRY.NONE };
  return { status: BUSINESS_ENTRY.CHOOSE };
};
