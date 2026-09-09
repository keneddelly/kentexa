import { AccountRoleType } from './entities/account-role.entity';
import { BusinessCapabilityCode } from '../business/entities/business-capability.entity';

/**
 * Stage A authority foundation. Canonical mapping from an organizationally-
 * bound AccountRole's roleType to the BusinessCapability its operating
 * workspace must hold ACTIVE (see RoleContextService.resolveOrganizationalContext).
 *
 * Deliberately partial:
 *  - buyer/admin/manager/customer_care/arbitrator/agent never carry a
 *    workspaceAssignmentId at all (see account-role.entity.ts's own
 *    UQ_account_role_singular index) so they never reach this map.
 *  - service_provider is intentionally OMITTED. BusinessCapabilityCode has
 *    no SERVICE_PROVIDER value yet (a Migration 9 requirement -- see the
 *    Stage 2 Business Capability Activation discovery report). A roleType
 *    with no entry here is NOT YET CAPABILITY-GATED: resolveOrganizationalContext
 *    falls back to pre-Stage-A organizational-chain-only validation for it,
 *    never fails closed for lacking a capability code that doesn't exist.
 *  - POS is a Commerce feature, not a separate mapping entry. Cargo has no
 *    AccountRole to map at all.
 */
export const ORGANIZATIONAL_CAPABILITY_BY_ROLE: Partial<Record<AccountRoleType, BusinessCapabilityCode>> = {
  [AccountRoleType.SELLER]: BusinessCapabilityCode.COMMERCE,
  [AccountRoleType.TRANSPORT_PROVIDER]: BusinessCapabilityCode.TRANSPORT,
  [AccountRoleType.SUPER_AGENT]: BusinessCapabilityCode.SUPER_AGENT,
};
