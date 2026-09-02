import { AccountRoleStatus } from './entities/account-role.entity';
import { mapLegacyRoleProfile } from './role-profile-mapping';

describe('mapLegacyRoleProfile', () => {
  it('maps verified transport providers to active roles', () => {
    expect(mapLegacyRoleProfile('transport_provider', 'verified')).toMatchObject({
      status: AccountRoleStatus.ACTIVE,
    });
  });

  it('retains the legacy blocked status as an auditable reason', () => {
    expect(mapLegacyRoleProfile('super_agent', 'blocked')).toMatchObject({
      status: AccountRoleStatus.SUSPENDED,
      statusReason: 'legacy_super_agent_blocked',
    });
  });
});
