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
 *  - POS is a Commerce feature, not a separate mapping entry. Cargo has no
 *    AccountRole to map at all.
 *
 * Business Capability Activation Stage B6B: service_provider is now mapped
 * to SERVICE (BusinessCapabilityCode gained the value in Migration
 * 1788263400000-AddServiceBusinessAuthorityFoundation). A Business-bound
 * SERVICE_PROVIDER AccountRole therefore requires its workspace's SERVICE
 * capability to be ACTIVE, exactly like SELLER/TRANSPORT_PROVIDER/
 * SUPER_AGENT already do -- resolveOrganizationalContext needs no changes
 * of its own, it already reads this map generically.
 */
export const ORGANIZATIONAL_CAPABILITY_BY_ROLE: Partial<Record<AccountRoleType, BusinessCapabilityCode>> = {
  [AccountRoleType.SELLER]: BusinessCapabilityCode.COMMERCE,
  [AccountRoleType.TRANSPORT_PROVIDER]: BusinessCapabilityCode.TRANSPORT,
  [AccountRoleType.SUPER_AGENT]: BusinessCapabilityCode.SUPER_AGENT,
  [AccountRoleType.SERVICE_PROVIDER]: BusinessCapabilityCode.SERVICE,
};
