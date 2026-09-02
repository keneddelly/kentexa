import { SetMetadata } from '@nestjs/common';
import { AccountRoleType } from './entities/account-role.entity';

export const REQUIRED_CAPABILITIES = 'required_capabilities';

/**
 * Deliberately conservative Phase B registry. Later authorization phases may
 * assign these capabilities to roles; controllers are not migrated yet.
 */
export const ROLE_CAPABILITY_REGISTRY: Record<AccountRoleType, string[]> = {
  buyer: [], seller: [], agent: [], super_agent: [], transport_provider: [],
  service_provider: [], customer_care: [], manager: [], admin: [], arbitrator: [],
};

export const RequireCapabilities = (...capabilities: string[]) =>
  SetMetadata(REQUIRED_CAPABILITIES, capabilities);
