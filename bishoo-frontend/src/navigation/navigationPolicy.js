import { destinationForPage, DESTINATION_KIND } from './destinationRegistry';
import { homeForRole } from './navigationRegistry';

export const evaluateDestination = ({ page, isAuthenticated, roleType, capabilities = [] }) => {
  if (page === '__POST__') return { allowed: true, page, destination: null };
  const destination = destinationForPage(page);
  const home = homeForRole(roleType);
  if (!destination) return { allowed: false, reason: 'UNKNOWN_DESTINATION', page: home, destination: null };
  if (destination.kind === DESTINATION_KIND.PUBLIC) return { allowed: true, page, destination };
  if (!isAuthenticated) return { allowed: false, reason: 'AUTHENTICATION_REQUIRED', page: 'PublicLogin', destination };
  if (destination.kind === DESTINATION_KIND.ACCOUNT) return { allowed: true, page, destination };
  if (!destination.roles.includes(roleType)) return { allowed: false, reason: 'WRONG_CONTEXT', page: home, destination };
  const missing = destination.capabilities.filter((capability) => !capabilities.includes(capability));
  if (missing.length) return { allowed: false, reason: 'MISSING_CAPABILITY', page: home, destination, missing };
  return { allowed: true, page, destination };
};
export const historyEntryFor = ({ page, contextEpoch, accountRoleId }) => {
  const destination = destinationForPage(page);
  return destination ? { page, kind: destination.kind, contextEpoch, accountRoleId } : null;
};
export const isHistoryEntryValid = (entry, context) => {
  if (!entry) return false;
  if (entry.kind === DESTINATION_KIND.PUBLIC || entry.kind === DESTINATION_KIND.ACCOUNT) return true;
  return entry.contextEpoch === context.contextEpoch && Number(entry.accountRoleId) === Number(context.accountRoleId);
};
