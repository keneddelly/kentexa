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

// I2A: WHO is acting, as opposed to WHAT authority is active (roleType/
// capabilities above answer the latter). A PERSONAL identity is the User
// themself (buyer, or any legacy/not-yet-organizationally-bound operational
// role); a BUSINESS identity is the exact Business the resolved
// organizational chain points at. Switching capability within the SAME
// Business (Seller -> Service -> Transport) must never change identityType/
// businessId/displayName -- only roleType/capabilities change.
export type IdentityType = 'PERSONAL' | 'BUSINESS';

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
  // I2A: canonical acting identity, resolved server-side by
  // RoleContextService.resolveIdentity() -- see its own doc comment for the
  // exact rules (never user.name for an organizational context, never an
  // ownerId/first-Business guess for commerceProfileId). Optional only so
  // existing hand-built RoleContext test fixtures that predate this stage
  // keep compiling unchanged; every real resolution path (toContext(),
  // listRoles()) always populates all four.
  identityType?: IdentityType;
  commerceProfileId?: number | null;
  displayName?: string;
  photoUrl?: string | null;
}

export interface RequestMetadata {
  deviceId?: string;
  userAgent?: string;
  ip?: string;
}
