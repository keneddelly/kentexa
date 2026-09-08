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
  | 'ROLE_CONTEXT_ORGANIZATIONAL_REVOKED';

export class RoleContextException extends UnauthorizedException {
  constructor(code: RoleContextErrorCode) {
    super({ code, message: code });
  }
}
