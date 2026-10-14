import { identityState } from './identityState';

// "Fanya kazi na KenteXa" (owner 2026-10-13, audit B step 2): every work role
// a person can apply for, with ONE status each. Tapping a role opens its own
// form (which also shows the status of an existing request).
//   page        form / status page for that role
//   recordKey   the person's own record for the role (GET .../my-profile)
//   roleType    the AccountRole row (GET /auth/roles) once it exists
export const WORK_ROLES = [
  { key: 'agent',   roleType: 'agent',            recordKey: 'agent',  page: 'BecomeAgent' },
  { key: 'office',  roleType: 'super_agent',      recordKey: 'office', page: 'BecomeSuperAgentInfo' },
  { key: 'seller',  roleType: 'seller',           recordKey: 'seller', page: 'BecomeSeller' },
  // Service provider has no request: its "record" is derived from the
  // person's own ads (serviceRecordFromAds), and it wins over the role row,
  // because an ad waiting for the ID (decision S1) is not live yet.
  { key: 'service', roleType: 'service_provider', recordKey: 'service', recordWins: true, page: 'PostService', activePage: 'MyServices' },
  // Msafirishaji (bus, truck, van; owner 2026-10-14). Its dashboard only
  // opens inside the transport role, so the role is switched first.
  { key: 'transport', roleType: 'transport_provider', recordKey: 'transport', page: 'BecomeTransportProvider', activePage: 'TransportProviderDashboard', switchRole: true },
];

/** The service provider's status from their own ads (GET /services/my/ads). */
export function serviceRecordFromAds(ads) {
  if (!Array.isArray(ads) || !ads.length) return null;
  if (ads.some((a) => a.status === 'active' && !a.waitingForId)) return { status: 'active' };
  if (ads.some((a) => a.waitingForId)) return { status: 'pending' };
  return null;
}

// Record statuses of the different role tables, as one word.
const FROM_RECORD = {
  pending: 'waiting', testing: 'waiting',
  approved: 'active', active: 'active', verified: 'active',   // transport_provider uses "verified" for approved
  suspended: 'suspended', blocked: 'suspended', inactive: 'suspended',
  rejected: 'rejected',
};
const FROM_ROLE_ROW = {
  active: 'active', pending: 'waiting',
  suspended: 'suspended', revoked: 'suspended', rejected: 'rejected',
};

/**
 * One status for one role:
 *   none | waiting_id | waiting | active | suspended | rejected
 * waiting_id = the request waits because the person's ID is not verified yet
 * (nothing becomes public and no money moves until then).
 */
export function workRoleStatus({ record, roleRow, identity, recordWins = false }) {
  // The role row is the final word once the role is active or stopped
  // (except where the record wins, see WORK_ROLES service).
  const fromRow = roleRow ? FROM_ROLE_ROW[roleRow.status] : null;
  const fromRecord = record ? FROM_RECORD[record.status] : null;
  let status = recordWins && fromRecord ? fromRecord
    : fromRow === 'active' || fromRow === 'suspended' ? fromRow : (fromRecord || fromRow || 'none');
  if (status === 'waiting' && identityState(identity) !== 'verified') status = 'waiting_id';
  return status;
}

/** Where tapping the role goes. */
export function workRoleTarget(role, status) {
  return status === 'active' && role.activePage ? role.activePage : role.page;
}

/**
 * Opens the role. A page that only works inside the role (switchRole) goes
 * through the same role switch as the profile switcher; without an active
 * role row to switch to, the role's own status page opens instead.
 */
export function openWorkRole({ role, status, roleRow, onNavigate, onSwitchAccountRole }) {
  const target = workRoleTarget(role, status);
  if (!role.switchRole || target === role.page) return onNavigate(target);
  if (roleRow?.status === 'active' && roleRow.accountRoleId && onSwitchAccountRole) {
    return onSwitchAccountRole(roleRow.accountRoleId, target);
  }
  return onNavigate(role.page);
}
