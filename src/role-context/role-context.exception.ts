import { UnauthorizedException } from '@nestjs/common';

export type RoleContextErrorCode =
  | 'ROLE_CONTEXT_MISSING'
  | 'ROLE_CONTEXT_REVOKED'
  | 'ROLE_CONTEXT_EXPIRED'
  | 'ROLE_NOT_ACTIVE'
  | 'ROLE_CONTEXT_VERSION_MISMATCH'
  | 'ROLE_PROFILE_INVALID'
  | 'ROLE_NOT_SWITCHABLE';

export class RoleContextException extends UnauthorizedException {
  constructor(code: RoleContextErrorCode) {
    super({ code, message: code });
  }
}
