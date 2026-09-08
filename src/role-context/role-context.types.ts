import {
  AccountRoleType,
  RoleProfileType,
} from './entities/account-role.entity';

export interface RoleJwtPayload {
  sub: number;
  sid: string;
  rid: number;
  rt: AccountRoleType;
  cv: number;
  iat?: number;
  exp?: number;
}

export interface RoleContext {
  userId: number;
  accountRoleId: number;
  roleType: AccountRoleType;
  profileType: RoleProfileType;
  profileId: number;
  capabilities: string[];
  sessionId: string;
  contextVersion: number;
  // Business-First Stage 1 (additive). Resolved server-side from
  // AccountRole.workspaceAssignmentId -- null for every role that is
  // legitimately non-organizational (Buyer, Agent, every platform role, any
  // not-yet-migrated Seller/Transport Provider/Super Agent/Service Provider
  // role). When the underlying AccountRole IS organizationally bound, these
  // are only ever populated with a fully active, consistent chain -- a
  // broken chain throws RoleContextException('ROLE_CONTEXT_ORGANIZATIONAL_REVOKED')
  // during resolution instead of reaching here as null. See
  // RoleContextService.resolveOrganizationalContext().
  businessId?: number | null;
  workspaceId?: number | null;
}

export interface RequestMetadata {
  deviceId?: string;
  userAgent?: string;
  ip?: string;
}
