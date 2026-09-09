/**
 * businessGrouping.js — Business-First Frontend Stage 1.
 *
 * Pure presentation grouping over the server-issued role list
 * (RoleContext's `roleOptions`, i.e. adaptAvailableRoles(availableRoles, ...)
 * from rolePresentation.js). Never computes or asserts authority -- every
 * field consumed here (accountRoleId, roleType, businessId, businessName,
 * switchable, status) was already resolved server-side. This module only
 * decides HOW to group/label what the server already said, for the
 * "Personal / My Businesses" presentation instead of a flat role list.
 */

// buyer is always Personal, regardless of businessId (which is always
// null for buyer anyway -- AccountRole's singular/account-scope bucket).
export const isPersonalProfile = (profile) => profile?.roleType === 'buyer';

/**
 * Groups a flat roleOptions array into:
 *  - personal: the single buyer profile, or null if not present.
 *  - businesses: one entry per distinct businessId that appears on any
 *    profile, each with { businessId, businessName, capabilities: [profile...] },
 *    ordered by businessId (stable, matches BusinessService.findAllMine's
 *    own oldest-first ordering when businessId assignment is sequential).
 *  - other: every remaining profile with no businessId (e.g. an approved
 *    Super Agent/Transport Provider/Service Provider/Agent role that has
 *    not yet been bound to any Business workspace) -- NOT hidden, NOT
 *    guessed into a business bucket it doesn't actually belong to.
 */
export const groupProfilesForSwitcher = (roleOptions = []) => {
  const personal = roleOptions.find(isPersonalProfile) || null;
  const businessMap = new Map();
  const other = [];

  for (const profile of roleOptions) {
    if (isPersonalProfile(profile)) continue;
    if (profile.businessId != null) {
      const key = profile.businessId;
      if (!businessMap.has(key)) {
        businessMap.set(key, { businessId: key, businessName: profile.businessName || null, capabilities: [] });
      }
      const group = businessMap.get(key);
      group.capabilities.push(profile);
      // A later profile in the same business may carry the name when an
      // earlier one somehow didn't (best-effort enrichment only).
      if (!group.businessName && profile.businessName) group.businessName = profile.businessName;
    } else {
      other.push(profile);
    }
  }

  const businesses = Array.from(businessMap.values()).sort((a, b) => a.businessId - b.businessId);
  return { personal, businesses, other };
};

/**
 * Finds the businessName for the CURRENTLY active context, by matching
 * activeContext.accountRoleId against the server-issued roleOptions list
 * (which carries businessName; the single activeContext object returned
 * by /auth/me and /auth/switch-role does not). Returns null when the
 * active role isn't organizationally bound (Personal, or an unbound
 * operational role) -- a legitimate state, not a loading gap.
 */
export const activeBusinessNameFor = (activeContext, roleOptions = []) => {
  if (!activeContext?.accountRoleId) return null;
  const match = roleOptions.find((p) => Number(p.accountRoleId) === Number(activeContext.accountRoleId));
  return match?.businessName || null;
};
