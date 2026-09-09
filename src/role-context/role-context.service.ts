import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { Agent } from '../agents/entities/agent.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';
import { WorkspaceAssignment } from '../business/entities/workspace-assignment.entity';
import {
  AccountRole,
  AccountRoleStatus,
  AccountRoleType,
  RoleProfileType,
} from './entities/account-role.entity';
import { ActiveRoleSession } from './entities/active-role-session.entity';
import { ROLE_CAPABILITY_REGISTRY } from './capabilities';
import { ORGANIZATIONAL_CAPABILITY_BY_ROLE } from './organizational-capability';
import { RoleContextException } from './role-context.exception';
import { RequestMetadata, RoleContext, RoleJwtPayload } from './role-context.types';
import { RoleSessionEventsService } from './role-session-events.service';

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
    @InjectRepository(WorkspaceAssignment) private readonly workspaceAssignmentRepo: Repository<WorkspaceAssignment>,
    private readonly sessionEvents: RoleSessionEventsService,
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

  // Multi-Business Authority Stage 1: each row now also carries its
  // resolved businessId/workspaceId/businessName (when organizationally
  // bound) so a future frontend can render e.g. "Transport — BIS" and
  // "Transport — Kentexa Logistics" as two distinct, clearly-labeled
  // entries rather than two indistinguishable "transport_provider" rows.
  // Every AccountRole row (including two of the same roleType) is returned
  // -- this method never deduplicates by roleType, so it already worked
  // correctly for multiplicity before this stage; the only change is
  // attaching the extra display metadata. Resolution is best-effort per
  // row (a broken chain surfaces as businessId/workspaceId/businessName:
  // null here, never a thrown error -- switchRole()'s own
  // resolveContext() call remains the one place a broken chain fails
  // closed, since THAT call is what actually grants operating authority).
  async listRoles(userId: number) {
    const roles = await this.roleRepo.find({ where: { userId }, order: { id: 'ASC' } });
    return Promise.all(roles.map(async (role) => {
      const organizational = await this.resolveOrganizationalContext(role).catch(() => ({
        businessId: null,
        workspaceId: null,
        businessName: null,
      }));
      return {
        accountRoleId: role.id,
        roleType: role.roleType,
        status: role.status,
        profileType: role.profileType,
        profileId: role.profileId,
        switchable: await this.isSwitchable(role),
        capabilities: this.effectiveCapabilities(role),
        businessId: organizational.businessId,
        workspaceId: organizational.workspaceId,
        businessName: organizational.businessName,
      };
    }));
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
    // Realtime layers (ConversationGateway) listen for this to disconnect
    // the matching socket immediately -- a revoked session must not keep
    // receiving scoped-room events just because the socket itself is still
    // technically connected (Stage 2 socket-switch requirement).
    this.sessionEvents.emitRevoked({ sessionId, reason });
  }

  async revokeSessionsForAccountRole(accountRoleId: number, reason: string): Promise<void> {
    await this.sessionRepo.update({ accountRoleId, revokedAt: IsNull() }, { revokedAt: new Date(), revokeReason: reason });
    // Bulk revocation (suspend/reject/reactivate via syncOperationalRole) has
    // no single sessionId to target -- announce by accountRoleId instead so
    // every connected socket currently in that role's rooms gets dropped.
    this.sessionEvents.emitRevoked({ accountRoleId, reason });
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
    const organizational = await this.resolveOrganizationalContext(role);

    await this.sessionRepo.update(session.id, { lastSeenAt: new Date() });
    return this.toContext(session, role, organizational);
  }

  /**
   * Business-First Stage 1: AccountRole -> WorkspaceAssignment ->
   * BusinessMembership -> OperationalWorkspace -> Business, resolved live
   * (never cached) in one indexed join so a revoked/suspended link anywhere
   * in the chain is visible on the very next request. This never overrides
   * AccountRole lifecycle/status -- it answers "which Business/workspace
   * would this ALREADY-authorized context represent," not "is this
   * AccountRole authorized to become active" (that's the existing
   * status/contextVersion/isProfileValid checks above, unchanged).
   *
   * role.workspaceAssignmentId === null is a legitimate, permanent state
   * for most roles (Buyer, Agent, every platform role, any not-yet-migrated
   * Seller/Transport Provider/Super Agent/Service Provider role) -- returns
   * {businessId: null, workspaceId: null} for those, never an error.
   *
   * role.workspaceAssignmentId !== null means this role IS organizationally
   * bound: the chain must be fully active and internally consistent (the
   * membership and workspace must agree on which Business) or this throws
   * ROLE_CONTEXT_ORGANIZATIONAL_REVOKED -- a broken bound chain is an
   * invalid operating context, never silently degraded to null/null.
   *
   * Business Capability Activation Stage A: for roleTypes with an entry in
   * ORGANIZATIONAL_CAPABILITY_BY_ROLE, the resolved workspace must also hold
   * an ACTIVE BusinessCapability of the mapped code, or this throws
   * ROLE_CONTEXT_CAPABILITY_INACTIVE -- entitlement (BusinessCapability) is
   * enforced here, alongside the organizational chain, in the same single
   * query (never a second round trip) so a suspended/revoked capability
   * denies the very next request even though AccountRole.status/contextVersion
   * and the org chain itself remain untouched. A roleType with NO entry in
   * the map (today: service_provider, since BusinessCapabilityCode has no
   * SERVICE_PROVIDER value yet) is left ungated -- the CASE below resolves
   * to true for it, preserving pre-Stage-A behavior exactly rather than
   * failing closed for a capability code that doesn't exist.
   */
  private async resolveOrganizationalContext(
    role: AccountRole,
  ): Promise<{ businessId: number | null; workspaceId: number | null; businessName: string | null }> {
    if (role.workspaceAssignmentId == null) return { businessId: null, workspaceId: null, businessName: null };

    const requiredCapability = ORGANIZATIONAL_CAPABILITY_BY_ROLE[role.roleType] ?? null;

    const rows = await this.workspaceAssignmentRepo.manager.query(
      `
      SELECT b.id AS "businessId", w.id AS "workspaceId",
             COALESCE(b."tradingName", b."legalName") AS "businessName",
             CASE
               WHEN $2::text IS NULL THEN true
               ELSE EXISTS (
                 SELECT 1 FROM business_capability bc
                 WHERE bc."workspaceId" = w.id
                   AND bc."capabilityCode"::text = $2::text
                   AND bc.status = 'active'
               )
             END AS "capabilityActive"
      FROM workspace_assignment wa
      JOIN business_membership bm
        ON bm.id = wa."businessMembershipId" AND bm.status = 'active'
      JOIN operational_workspace w
        ON w.id = wa."workspaceId" AND w.status = 'active'
      JOIN business b
        ON b.id = w."businessId" AND b.status = 'active' AND b.id = bm."businessId"
      WHERE wa.id = $1 AND wa.status = 'active'
      `,
      [role.workspaceAssignmentId, requiredCapability],
    );

    if (!rows.length) throw new RoleContextException('ROLE_CONTEXT_ORGANIZATIONAL_REVOKED');
    if (!rows[0].capabilityActive) throw new RoleContextException('ROLE_CONTEXT_CAPABILITY_INACTIVE');
    return { businessId: rows[0].businessId, workspaceId: rows[0].workspaceId, businessName: rows[0].businessName };
  }

  /**
   * The only ongoing write path for operational (seller/agent/super_agent/
   * transport_provider) AccountRole rows. The Phase A migration backfilled
   * these once from the legacy profile tables at deploy time, but nothing
   * since then kept them in sync -- SellerService.approve()/suspend(),
   * AgentsService.approve()/suspend()/reject(),
   * SuperAgentsService.approve()/suspend(), and TransportService.adminVerify()
   * all only ever wrote User.role/activeRoles. Any user approved after that
   * one-time migration ran would have no AccountRole for their new role at
   * all, and would be unable to ever resolve or switch into it. Call this
   * from every one of those status-changing methods, alongside (not instead
   * of) their existing legacy-field writes.
   *
   * Always bumps contextVersion on an existing row and revokes its sessions
   * -- any change in status (approved, suspended, rejected, reactivated)
   * must invalidate whatever the caller was previously authorized to do as
   * that role, never silently carry old authority forward.
   *
   * Business Capability Activation Stage A: `workspaceAssignmentId` is an
   * additive, optional discriminator with three distinct meanings --
   * deliberately three, not a binary supplied/absent split, because
   * collapsing "absent" and "explicitly unbound" into one lookup would
   * either reintroduce the bug this stage fixes or regress a real
   * already-migrated production row (see below):
   *
   *  - a real id: this caller KNOWS the exact WorkspaceAssignment this role
   *    is bound to (a Stage B/C-aware caller). Lookup/create/update targets
   *    EXACTLY {userId, roleType, workspaceAssignmentId: that id} -- this is
   *    what lets User U hold independent Seller AccountRoles for Workspace A
   *    and Workspace B: approving B can never find/mutate A's row, because
   *    A's id and B's id never match this exact-equality filter.
   *  - explicit null: this caller KNOWS the role must be the unbound
   *    placeholder and nothing else. Lookup/create/update targets EXACTLY
   *    {userId, roleType, workspaceAssignmentId: IS NULL} -- it will never
   *    select an existing bound row "merely because userId+roleType match."
   *  - omitted (undefined, every current caller -- agents/transport/
   *    super-agents/seller approve|reject): preserves the exact pre-Stage-A
   *    lookup, {userId, roleType} with no workspace filter at all. This is
   *    NOT an oversight: SellerService.approve() is also production's
   *    verification-tier-bump endpoint, and production already has a real
   *    workspace-BOUND Seller AccountRole (id 38, Business "BiS") created by
   *    the one-time Migration 8 backfill, not by any live code path. If
   *    "omitted" resolved to unbound-only here (the literal reading of "no
   *    workspaceAssignmentId supplied"), the next admin verification-tier
   *    bump for that seller would silently create a SECOND, stray, unbound
   *    Seller AccountRole for the same user instead of updating role 38 --
   *    a real regression against live data, not a hypothetical. Since the
   *    one-per-user application guards remain fully intact (this stage does
   *    not touch them), no user can currently hold more than one AccountRole
   *    of a given roleType regardless of bound/unbound state, so the
   *    unfiltered legacy lookup and the strict unbound-only lookup are
   *    behaviorally identical for every caller today EXCEPT this one -- and
   *    only the legacy lookup is safe for it. Every existing caller is left
   *    unchanged (none pass workspaceAssignmentId yet); see the Stage A
   *    final report's caller audit for the one-by-one classification.
   */
  async syncOperationalRole(params: {
    userId: number;
    roleType: AccountRoleType;
    status: AccountRoleStatus;
    profileType: RoleProfileType;
    profileId: number;
    statusReason?: string | null;
    workspaceAssignmentId?: number | null;
  }): Promise<AccountRole> {
    const hasWorkspaceFilter = params.workspaceAssignmentId !== undefined;
    const workspaceAssignmentId = hasWorkspaceFilter ? params.workspaceAssignmentId : undefined;

    const existing = await this.roleRepo.findOne({
      where: hasWorkspaceFilter
        ? {
            userId: params.userId,
            roleType: params.roleType,
            workspaceAssignmentId: workspaceAssignmentId === null ? IsNull() : (workspaceAssignmentId as number),
          }
        : { userId: params.userId, roleType: params.roleType },
    });
    const saved = await this.roleRepo.save(
      existing
        ? this.roleRepo.merge(existing, {
            status: params.status,
            profileType: params.profileType,
            profileId: params.profileId,
            statusReason: params.statusReason ?? null,
            contextVersion: existing.contextVersion + 1,
          })
        : this.roleRepo.create({
            userId: params.userId,
            roleType: params.roleType,
            status: params.status,
            profileType: params.profileType,
            profileId: params.profileId,
            statusReason: params.statusReason ?? null,
            workspaceAssignmentId: hasWorkspaceFilter ? (workspaceAssignmentId as number | null) : null,
            capabilities: {},
            contextVersion: 1,
          }),
    );
    if (existing) {
      await this.revokeSessionsForAccountRole(saved.id, `role_status_synced_${params.status}`);
    }
    return saved;
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

  private toContext(
    session: ActiveRoleSession,
    role: AccountRole,
    organizational: { businessId: number | null; workspaceId: number | null } = { businessId: null, workspaceId: null },
  ): RoleContext {
    return {
      userId: role.userId, accountRoleId: role.id, roleType: role.roleType,
      profileType: role.profileType!, profileId: role.profileId!,
      capabilities: this.effectiveCapabilities(role), sessionId: session.id,
      contextVersion: role.contextVersion,
      businessId: organizational.businessId, workspaceId: organizational.workspaceId,
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
