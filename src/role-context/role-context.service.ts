import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { Agent } from '../agents/entities/agent.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';
import {
  AccountRole,
  AccountRoleStatus,
  AccountRoleType,
  RoleProfileType,
} from './entities/account-role.entity';
import { ActiveRoleSession } from './entities/active-role-session.entity';
import { ROLE_CAPABILITY_REGISTRY } from './capabilities';
import { RoleContextException } from './role-context.exception';
import { RequestMetadata, RoleContext, RoleJwtPayload } from './role-context.types';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class RoleContextService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(AccountRole) private readonly roleRepo: Repository<AccountRole>,
    @InjectRepository(ActiveRoleSession) private readonly sessionRepo: Repository<ActiveRoleSession>,
    @InjectRepository(SellerProfile) private readonly sellerRepo: Repository<SellerProfile>,
    @InjectRepository(Agent) private readonly agentRepo: Repository<Agent>,
    @InjectRepository(SuperAgent) private readonly superAgentRepo: Repository<SuperAgent>,
    @InjectRepository(TransportProvider) private readonly transportRepo: Repository<TransportProvider>,
  ) {}

  async ensureBuyerRole(user: User): Promise<AccountRole> {
    let role = await this.roleRepo.findOne({ where: { userId: user.id, roleType: AccountRoleType.BUYER } });
    if (!role) {
      role = await this.roleRepo.save(this.roleRepo.create({
        userId: user.id, roleType: AccountRoleType.BUYER, status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.USER, profileId: user.id, capabilities: {}, contextVersion: 1,
      }));
    }
    return role;
  }

  async listRoles(userId: number) {
    const roles = await this.roleRepo.find({ where: { userId }, order: { id: 'ASC' } });
    return Promise.all(roles.map(async (role) => ({
      accountRoleId: role.id,
      roleType: role.roleType,
      status: role.status,
      profileType: role.profileType,
      profileId: role.profileId,
      switchable: await this.isSwitchable(role),
      capabilities: this.effectiveCapabilities(role),
    })));
  }

  async selectRoleForLogin(user: User, deviceId?: string): Promise<AccountRole> {
    if (deviceId) {
      const previous = await this.sessionRepo.findOne({
        where: { userId: user.id, deviceId, revokedAt: IsNull() }, order: { createdAt: 'DESC' },
      });
      if (previous && previous.expiresAt > new Date()) {
        const priorRole = await this.roleRepo.findOne({ where: { id: previous.accountRoleId, userId: user.id } });
        if (priorRole && await this.isSwitchable(priorRole)) return priorRole;
      }
    }
    const buyer = await this.roleRepo.findOne({ where: { userId: user.id, roleType: AccountRoleType.BUYER } });
    if (buyer && await this.isSwitchable(buyer)) return buyer;
    const active = await this.roleRepo.find({ where: { userId: user.id, status: AccountRoleStatus.ACTIVE }, order: { id: 'ASC' } });
    for (const role of active) if (await this.isSwitchable(role)) return role;
    throw new RoleContextException('ROLE_NOT_ACTIVE');
  }

  async createSession(userId: number, role: AccountRole, metadata: RequestMetadata = {}): Promise<ActiveRoleSession> {
    return this.sessionRepo.save(this.sessionRepo.create({
      userId,
      accountRoleId: role.id,
      contextVersion: role.contextVersion,
      deviceId: this.normalizedDeviceId(metadata.deviceId),
      userAgentHash: this.hash(metadata.userAgent),
      ipHash: this.hash(metadata.ip),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      lastSeenAt: new Date(),
    }));
  }

  async revokeCurrentSession(sessionId: string, reason: string = 'logout'): Promise<void> {
    await this.sessionRepo.update({ id: sessionId, revokedAt: IsNull() }, { revokedAt: new Date(), revokeReason: reason });
  }

  async revokeSessionsForAccountRole(accountRoleId: number, reason: string): Promise<void> {
    await this.sessionRepo.update({ accountRoleId, revokedAt: IsNull() }, { revokedAt: new Date(), revokeReason: reason });
  }

  async resolveContext(payload: RoleJwtPayload): Promise<RoleContext> {
    const session = await this.sessionRepo.findOne({ where: { id: payload.sid } });
    if (!session) throw new RoleContextException('ROLE_CONTEXT_MISSING');
    if (session.revokedAt) throw new RoleContextException('ROLE_CONTEXT_REVOKED');
    if (session.expiresAt <= new Date()) throw new RoleContextException('ROLE_CONTEXT_EXPIRED');
    if (session.userId !== payload.sub || session.accountRoleId !== payload.rid) {
      throw new RoleContextException('ROLE_CONTEXT_MISSING');
    }

    const role = await this.roleRepo.findOne({ where: { id: payload.rid } });
    if (!role || role.userId !== payload.sub || role.status !== AccountRoleStatus.ACTIVE) {
      throw new RoleContextException('ROLE_NOT_ACTIVE');
    }
    if (session.contextVersion !== role.contextVersion || payload.cv !== role.contextVersion) {
      throw new RoleContextException('ROLE_CONTEXT_VERSION_MISMATCH');
    }
    if (!(await this.isProfileValid(role))) throw new RoleContextException('ROLE_PROFILE_INVALID');

    await this.sessionRepo.update(session.id, { lastSeenAt: new Date() });
    return this.toContext(session, role);
  }

  async getRoleForUser(accountRoleId: number, userId: number): Promise<AccountRole | null> {
    return this.roleRepo.findOne({ where: { id: accountRoleId, userId } });
  }

  async isSwitchable(role: AccountRole): Promise<boolean> {
    return role.status === AccountRoleStatus.ACTIVE && this.isProfileValid(role);
  }

  private async isProfileValid(role: AccountRole): Promise<boolean> {
    if (!role.profileType || role.profileId == null) return false;
    if (role.profileType !== this.expectedProfileType(role.roleType)) return false;
    if (role.profileType === RoleProfileType.USER) {
      return role.profileId === role.userId && !!(await this.userRepo.findOne({ where: { id: role.userId } }));
    }
    const profile = await this.resolveProfile(role);
    return !!profile && Number(profile.userId ?? profile.user?.id) === role.userId;
  }

  private expectedProfileType(roleType: AccountRoleType): RoleProfileType {
    switch (roleType) {
      case AccountRoleType.SELLER: return RoleProfileType.SELLER_PROFILE;
      case AccountRoleType.AGENT: return RoleProfileType.AGENT;
      case AccountRoleType.SUPER_AGENT: return RoleProfileType.SUPER_AGENT;
      case AccountRoleType.TRANSPORT_PROVIDER: return RoleProfileType.TRANSPORT_PROVIDER;
      // Account-level roles deliberately share the User identity profile.
      default: return RoleProfileType.USER;
    }
  }

  /** Single trusted profile resolver; never consumes a frontend profile id. */
  private async resolveProfile(role: AccountRole): Promise<any | null> {
    switch (role.profileType) {
      case RoleProfileType.SELLER_PROFILE: return this.sellerRepo.findOne({ where: { id: role.profileId! } }) as any;
      case RoleProfileType.AGENT: return this.agentRepo.findOne({ where: { id: role.profileId! } }) as any;
      case RoleProfileType.SUPER_AGENT: return this.superAgentRepo.findOne({ where: { id: role.profileId! } }) as any;
      case RoleProfileType.TRANSPORT_PROVIDER:
        return this.transportRepo.findOne({ where: { id: role.profileId! }, relations: { user: true } }) as any;
      default: return null;
    }
  }

  private toContext(session: ActiveRoleSession, role: AccountRole): RoleContext {
    return {
      userId: role.userId, accountRoleId: role.id, roleType: role.roleType,
      profileType: role.profileType!, profileId: role.profileId!,
      capabilities: this.effectiveCapabilities(role), sessionId: session.id,
      contextVersion: role.contextVersion,
    };
  }

  private effectiveCapabilities(role: AccountRole): string[] {
    const persisted = Object.keys(role.capabilities || {}).filter((key) => role.capabilities[key] === true);
    return [...new Set([...ROLE_CAPABILITY_REGISTRY[role.roleType], ...persisted])];
  }

  private hash(value?: string): string | null {
    return value ? createHash('sha256').update(value).digest('hex') : null;
  }

  private normalizedDeviceId(value?: string): string | null {
    const deviceId = value?.trim();
    return deviceId ? deviceId.slice(0, 255) : null;
  }
}
