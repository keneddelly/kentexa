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
  { key: 'service', roleType: 'service_provider', recordKey: null,     page: 'PostService', activePage: 'MyServices' },
];

// Record statuses of the different role tables, as one word.
const FROM_RECORD = {
  pending: 'waiting',
  approved: 'active', active: 'active',
  suspended: 'suspended', blocked: 'suspended',
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
export function workRoleStatus({ record, roleRow, identity }) {
  // The role row is the final word once the role is active or stopped.
  const fromRow = roleRow ? FROM_ROLE_ROW[roleRow.status] : null;
  const fromRecord = record ? FROM_RECORD[record.status] : null;
  let status = fromRow === 'active' || fromRow === 'suspended' ? fromRow : (fromRecord || fromRow || 'none');
  if (status === 'waiting' && identityState(identity) !== 'verified') status = 'waiting_id';
  return status;
}

/** Where tapping the role goes. */
export function workRoleTarget(role, status) {
  return status === 'active' && role.activePage ? role.activePage : role.page;
}
