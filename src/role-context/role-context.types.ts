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
}

export interface RequestMetadata {
  deviceId?: string;
  userAgent?: string;
  ip?: string;
}
