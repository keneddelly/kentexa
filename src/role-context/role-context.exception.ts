import { UnauthorizedException } from '@nestjs/common';

export type RoleContextErrorCode =
  | 'ROLE_CONTEXT_MISSING'
  | 'ROLE_CONTEXT_REVOKED'
  | 'ROLE_CONTEXT_EXPIRED'
  | 'ROLE_NOT_ACTIVE'
  | 'ROLE_CONTEXT_VERSION_MISMATCH'
  | 'ROLE_PROFILE_INVALID'
  | 'ROLE_NOT_SWITCHABLE'
  // Business-First Stage 1: role.workspaceAssignmentId is set (this role IS
  // organizationally bound) but the WorkspaceAssignment -> BusinessMembership
  // -> OperationalWorkspace -> Business chain is not fully active/consistent
  // right now (revoked, suspended, or a cross-Business mismatch). A broken
  // organizational chain is an invalid operating context -- this denies the
  // whole request/connection, exactly like every other RoleContextException,
  // never a silent businessId/workspaceId = null degrade.
  | 'ROLE_CONTEXT_ORGANIZATIONAL_REVOKED'
  // Business Capability Activation Stage A: the organizational chain
  // (WorkspaceAssignment -> BusinessMembership -> OperationalWorkspace ->
  // Business) is fully active and consistent, but the specific workspace
  // does not currently hold an ACTIVE BusinessCapability corresponding to
  // this role's roleType (see organizational-capability.ts's mapping).
  // Deliberately distinct from ROLE_CONTEXT_ORGANIZATIONAL_REVOKED so a
  // caller/log can tell "this business relationship is broken" apart from
  // "this business relationship is fine but the capability was suspended/
  // revoked/never granted" -- both still fail authorization identically.
  | 'ROLE_CONTEXT_CAPABILITY_INACTIVE';

export class RoleContextException extends UnauthorizedException {
  constructor(code: RoleContextErrorCode) {
    super({ code, message: code });
  }
}
