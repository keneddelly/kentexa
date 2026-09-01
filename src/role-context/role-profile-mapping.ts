import {
  AccountRoleStatus,
  AccountRoleType,
  RoleProfileType,
} from './entities/account-role.entity';

export type LegacyRoleProfile =
  | 'seller_profile'
  | 'agent'
  | 'super_agent'
  | 'transport_provider';

export interface RoleProfileMapping {
  roleType: AccountRoleType;
  profileType: RoleProfileType;
  status: AccountRoleStatus;
  statusReason: string | null;
}

const directStatusMap: Record<string, AccountRoleStatus> = {
  pending: AccountRoleStatus.PENDING,
  approved: AccountRoleStatus.ACTIVE,
  active: AccountRoleStatus.ACTIVE,
  verified: AccountRoleStatus.ACTIVE,
  suspended: AccountRoleStatus.SUSPENDED,
  rejected: AccountRoleStatus.REJECTED,
};

/**
 * Maps only the status vocabularies verified in the live Kentexa schema.
 * `blocked`, `inactive`, and `testing` retain their source meaning in the
 * audit/statusReason while mapping into the approved AccountRole lifecycle.
 */
export function mapLegacyRoleProfile(
  profile: LegacyRoleProfile,
  status: string,
): RoleProfileMapping {
  const normalized = status.toLowerCase();
  const roleTypeByProfile: Record<LegacyRoleProfile, AccountRoleType> = {
    seller_profile: AccountRoleType.SELLER,
    agent: AccountRoleType.AGENT,
    super_agent: AccountRoleType.SUPER_AGENT,
    transport_provider: AccountRoleType.TRANSPORT_PROVIDER,
  };
  const profileTypeByProfile: Record<LegacyRoleProfile, RoleProfileType> = {
    seller_profile: RoleProfileType.SELLER_PROFILE,
    agent: RoleProfileType.AGENT,
    super_agent: RoleProfileType.SUPER_AGENT,
    transport_provider: RoleProfileType.TRANSPORT_PROVIDER,
  };

  if (normalized === 'blocked') {
    return {
      roleType: roleTypeByProfile[profile],
      profileType: profileTypeByProfile[profile],
      status: AccountRoleStatus.SUSPENDED,
      statusReason: 'legacy_super_agent_blocked',
    };
  }
  if (normalized === 'inactive') {
    return {
      roleType: roleTypeByProfile[profile],
      profileType: profileTypeByProfile[profile],
      status: AccountRoleStatus.SUSPENDED,
      statusReason: 'legacy_transport_provider_inactive',
    };
  }
  if (normalized === 'testing') {
    return {
      roleType: roleTypeByProfile[profile],
      profileType: profileTypeByProfile[profile],
      status: AccountRoleStatus.PENDING,
      statusReason: 'legacy_transport_provider_testing',
    };
  }

  const mapped = directStatusMap[normalized];
  if (!mapped) throw new Error(`Unsupported ${profile} status: ${status}`);
  return {
    roleType: roleTypeByProfile[profile],
    profileType: profileTypeByProfile[profile],
    status: mapped,
    statusReason: null,
  };
}
