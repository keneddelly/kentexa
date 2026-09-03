import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ConversationParticipant,
  ParticipantKind,
  ParticipantPrincipalType,
  ParticipantStatus,
} from './entities/conversation-participant.entity';
import { ConversationParticipantState } from './entities/conversation-participant-state.entity';
import { RoleContext } from '../role-context/role-context.types';
import { RoleProfileType } from '../role-context/entities/account-role.entity';

export interface WorkspaceDescriptor {
  workspaceType: string;
  workspaceId: number;
}

/**
 * The one place that turns a trusted RoleContext (or another server-
 * resolved principal, e.g. an external BusinessCustomer contact) into a
 * ConversationParticipant row. Never accepts a client-supplied sellerId/
 * providerId/agentId/accountRoleId/workspaceId as authority -- callers pass
 * a RoleContext (already resolved by RoleContextService from the JWT/
 * session, Stage 1) or an id this service itself looked up server-side
 * (e.g. BusinessCustomer.id from BusinessCustomerService). A raw client id
 * may only ever be used to look up which resource is being asked about,
 * never to decide who the caller is allowed to act as.
 */
@Injectable()
export class ParticipantResolutionService {
  constructor(
    @InjectRepository(ConversationParticipant)
    private readonly participantRepo: Repository<ConversationParticipant>,
    @InjectRepository(ConversationParticipantState)
    private readonly stateRepo: Repository<ConversationParticipantState>,
  ) {}

  /**
   * RoleContext.profileType/profileId (Stage 1) already IS the trusted
   * workspace descriptor for every operational role -- seller_profile,
   * agent, super_agent, transport_provider all carry a real profileId;
   * account-level roles (buyer/admin/manager/customer_care/arbitrator/
   * service_provider) share the User identity profile and have no
   * separate workspace.
   */
  resolveWorkspace(roleContext: RoleContext): WorkspaceDescriptor | null {
    if (!roleContext || roleContext.profileType === RoleProfileType.USER) return null;
    return { workspaceType: roleContext.profileType, workspaceId: roleContext.profileId };
  }

  /**
   * Idempotent upsert for an ACCOUNT_ROLE principal (the normal case for an
   * operational participant -- seller, buyer, agent, super_agent, transport
   * provider all resolve through their AccountRole). Reactivates a
   * previously-LEFT row rather than creating a duplicate, since the unique
   * index only covers ACTIVE rows.
   *
   * Takes a bare accountRoleId, not a full RoleContext: a conversation's
   * seller-side (or buyer-side) workspace is a STRUCTURAL fact -- "this
   * thread belongs to seller X's business" -- independent of whose live
   * session is doing the resolving right now (e.g. a delegated team member
   * sending on the seller's behalf has their OWN active role, which may not
   * even be 'seller'). Callers resolve the target AccountRole server-side
   * (e.g. by sellerId + roleType=SELLER, never from a client-supplied id)
   * and pass just its id.
   */
  async ensureAccountRoleParticipant(
    conversationId: number,
    accountRoleId: number,
    participantKind: ParticipantKind | string,
    permissions: Record<string, boolean> = {},
  ): Promise<ConversationParticipant> {
    const existing = await this.participantRepo.findOne({
      where: {
        conversationId,
        principalType: ParticipantPrincipalType.ACCOUNT_ROLE,
        accountRoleId,
      },
    });
    if (existing) {
      if (existing.status !== ParticipantStatus.ACTIVE) {
        await this.participantRepo.update(existing.id, {
          status: ParticipantStatus.ACTIVE,
          leftAt: null,
        });
        existing.status = ParticipantStatus.ACTIVE;
        existing.leftAt = null;
      }
      return existing;
    }
    // The workspace descriptor (resolveWorkspace()) is deliberately NOT
    // duplicated onto this row -- principalType stays 'account_role', a
    // single unambiguous principal per the CHECK constraint. resolveWorkspace()
    // is for tagging messages/notifications inline (senderWorkspaceType/Id
    // etc.), not a second participant kind. A future WORKSPACE-principal
    // participant (a channel with only a workspace, no live AccountRole --
    // e.g. bulk legacy backfill) uses ensureWorkspaceParticipant below instead.
    return this.participantRepo.save(
      this.participantRepo.create({
        conversationId,
        principalType: ParticipantPrincipalType.ACCOUNT_ROLE,
        accountRoleId,
        workspaceType: null,
        workspaceId: null,
        userId: null,
        externalCustomerId: null,
        participantKind: String(participantKind),
        permissions,
        status: ParticipantStatus.ACTIVE,
        joinedAt: new Date(),
      }),
    );
  }

  /** For legacy/backfill rows where a workspace is known but no live AccountRole is available. */
  async ensureWorkspaceParticipant(
    conversationId: number,
    workspace: WorkspaceDescriptor,
    participantKind: ParticipantKind | string,
  ): Promise<ConversationParticipant> {
    const existing = await this.participantRepo.findOne({
      where: {
        conversationId,
        principalType: ParticipantPrincipalType.WORKSPACE,
        workspaceType: workspace.workspaceType,
        workspaceId: workspace.workspaceId,
      },
    });
    if (existing) return existing;
    return this.participantRepo.save(
      this.participantRepo.create({
        conversationId,
        principalType: ParticipantPrincipalType.WORKSPACE,
        workspaceType: workspace.workspaceType,
        workspaceId: workspace.workspaceId,
        participantKind: String(participantKind),
        permissions: {},
        status: ParticipantStatus.ACTIVE,
        joinedAt: new Date(),
      }),
    );
  }

  /** For a non-account external contact (WhatsApp/manual BusinessCustomer with no userId). */
  async ensureExternalContactParticipant(
    conversationId: number,
    externalCustomerId: number,
  ): Promise<ConversationParticipant> {
    const existing = await this.participantRepo.findOne({
      where: { conversationId, principalType: ParticipantPrincipalType.EXTERNAL_CONTACT, externalCustomerId },
    });
    if (existing) return existing;
    return this.participantRepo.save(
      this.participantRepo.create({
        conversationId,
        principalType: ParticipantPrincipalType.EXTERNAL_CONTACT,
        externalCustomerId,
        participantKind: ParticipantKind.EXTERNAL,
        permissions: {},
        status: ParticipantStatus.ACTIVE,
        joinedAt: new Date(),
      }),
    );
  }

  async getOrInitState(participantId: number): Promise<ConversationParticipantState> {
    const existing = await this.stateRepo.findOne({ where: { conversationParticipantId: participantId } });
    if (existing) return existing;
    return this.stateRepo.save(
      this.stateRepo.create({ conversationParticipantId: participantId, unreadCount: 0 }),
    );
  }

  async incrementUnread(participantId: number): Promise<void> {
    await this.getOrInitState(participantId);
    await this.stateRepo.increment({ conversationParticipantId: participantId }, 'unreadCount', 1);
  }

  async markRead(participantId: number, lastReadMessageId?: number): Promise<void> {
    await this.getOrInitState(participantId);
    await this.stateRepo.update(
      { conversationParticipantId: participantId },
      { unreadCount: 0, lastReadAt: new Date(), ...(lastReadMessageId ? { lastReadMessageId } : {}) },
    );
  }

  /**
   * Entitlement check for a resolved RoleContext against a conversation: is
   * there an ACTIVE participant row for this exact accountRoleId (or, for
   * an account-level role, this exact userId)? Used by scoped reads and by
   * the socket gateway's joinConversation handler. Never consults anything
   * client-supplied -- roleContext is already server-resolved (Stage 1),
   * conversationId only identifies which resource is being asked about.
   */
  async isEntitled(conversationId: number, roleContext: RoleContext): Promise<boolean> {
    const byRole = await this.participantRepo.findOne({
      where: {
        conversationId,
        principalType: ParticipantPrincipalType.ACCOUNT_ROLE,
        accountRoleId: roleContext.accountRoleId,
        status: ParticipantStatus.ACTIVE,
      },
    });
    if (byRole) return true;
    const byAccount = await this.participantRepo.findOne({
      where: {
        conversationId,
        principalType: ParticipantPrincipalType.ACCOUNT,
        userId: roleContext.userId,
        status: ParticipantStatus.ACTIVE,
      },
    });
    return !!byAccount;
  }
}
