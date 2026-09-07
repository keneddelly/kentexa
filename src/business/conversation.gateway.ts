/**
 * ConversationGateway — real-time delivery for the Inbox
 * Place at: src/business/conversation.gateway.ts
 *
 * Purely additive over the existing REST API (business.controller.ts +
 * conversation.service.ts) — every message is still persisted via a normal
 * HTTP request first; this only pushes a live copy to anyone already
 * connected, so a socket outage never loses a message, it just delays
 * seeing it until the next manual refresh.
 *
 * Stage 2 (communication isolation): socket auth now resolves the full
 * RoleContext (sid -> ActiveRoleSession -> rid -> AccountRole -> cv/status),
 * the same path RoleContextGuard uses on the REST side, instead of trusting
 * only the JWT `sub`. Room design:
 *   account:{userId}       — ACCOUNT_SCOPE only (security/policy notices).
 *                            Always joined regardless of active role.
 *   role:{accountRoleId}   — the scoped delivery target for operational
 *                            events (inbox nudges) belonging to THIS
 *                            active role only. Never a generic user room.
 *   session:{sessionId}    — lets a single-session revocation (logout,
 *                            role switch) disconnect exactly this
 *                            connection without touching the account's
 *                            other devices/sessions.
 *   conversation:{id}      — joined explicitly via 'joinConversation', only
 *                            after re-verifying real entitlement (a
 *                            ConversationParticipant row for the resolved
 *                            RoleContext, or -- for a legacy conversation
 *                            dual-write hasn't touched yet -- the original
 *                            structural-ownership check now ALSO requiring
 *                            the matching active role).
 *
 * ROLE_CONTEXT_SOCKET_AUTH / ROLE_CONTEXT_SOCKET_ROOMS gate the Stage 2
 * behavior; disabled, this falls back to the pre-Stage-2 sub-only auth and
 * generic user:{userId} room, for rollback.
 */
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation, ConversationClassificationStatus } from './entities/conversation.entity';
import { ConversationMessage } from './entities/conversation-message.entity';
import { SellerScopeService } from './seller-scope.service';
import { User } from '../users/entities/user.entity';
import { RoleContextService } from '../role-context/role-context.service';
import { RoleContextException } from '../role-context/role-context.exception';
import { RoleContext, RoleJwtPayload } from '../role-context/role-context.types';
import { RoleSessionEventsService } from '../role-context/role-session-events.service';
import { ParticipantResolutionService } from './participant-resolution.service';
import { CommunicationFeatureFlagsService } from '../communication/communication-feature-flags.service';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

// Kept in sync with main.ts's app.enableCors() origin list — a client that
// can reach the REST API but not the socket would be a confusing partial
// failure (messages send fine, just never arrive live).
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'https://kentexa.com',
  'https://www.kentexa.com',
  'https://staging.kentexa.com',
  'https://bishoo-frontend.onrender.com',
  'capacitor://localhost',
  'http://localhost',
  'ionic://localhost',
];

@WebSocketGateway({
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
})
export class ConversationGateway implements OnGatewayConnection, OnModuleInit {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ConversationGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly sellerScope: SellerScopeService,
    @InjectRepository(Conversation)
    private readonly convoRepo: Repository<Conversation>,
    private readonly roleContextService: RoleContextService,
    private readonly sessionEvents: RoleSessionEventsService,
    private readonly participants: ParticipantResolutionService,
    private readonly flags: CommunicationFeatureFlagsService,
  ) {}

  // Stage 2 item 18: a revoked session/AccountRole must immediately drop
  // any socket still authenticated under it, not just fail its next REST
  // call. session:{sessionId}/role:{accountRoleId} rooms (joined in
  // handleConnection) make this a plain room-targeted disconnect -- no
  // manual iteration over connected sockets needed.
  onModuleInit(): void {
    this.sessionEvents.onRevoked((event) => {
      if (!this.server) return;
      if (event.sessionId) {
        this.server.to(`session:${event.sessionId}`).disconnectSockets(true);
      }
      if (event.accountRoleId) {
        this.server.to(`role:${event.accountRoleId}`).disconnectSockets(true);
      }
    });
  }

  async handleConnection(client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query?.token as string);
      if (!token) {
        client.disconnect();
        return;
      }
      const payload = this.jwtService.verify(token) as RoleJwtPayload & { sub?: number };
      if (!payload?.sub) {
        client.disconnect();
        return;
      }

      if (!this.flags.isEnabled('ROLE_CONTEXT_SOCKET_AUTH')) {
        // Rollback path: pre-Stage-2 sub-only auth, generic user room.
        (client.data as any).userId = payload.sub;
        client.join(`user:${payload.sub}`);
        return;
      }

      // Mandatory (Stage 2 item 16): same resolution path RoleContextGuard
      // uses on the REST side -- rejects a missing/revoked/expired session,
      // a suspended/rejected/revoked AccountRole, and a contextVersion
      // mismatch. The JWT's own `rt` claim is never trusted as authority;
      // RoleContextService always resolves roleType from the DB row.
      if (!payload.sid || !payload.rid || payload.cv === undefined) {
        throw new RoleContextException('ROLE_CONTEXT_MISSING');
      }
      const roleContext = await this.roleContextService.resolveContext(payload);
      (client.data as any).userId = payload.sub;
      (client.data as any).roleContext = roleContext;

      client.join(`account:${payload.sub}`);
      client.join(`session:${roleContext.sessionId}`);
      if (this.flags.isEnabled('ROLE_CONTEXT_SOCKET_ROOMS')) {
        client.join(`role:${roleContext.accountRoleId}`);
      } else {
        // Rollback path for room scoping specifically (auth still ran).
        client.join(`user:${payload.sub}`);
      }
    } catch (err: any) {
      // Worth keeping visible in prod logs (expired/forged tokens, revoked
      // sessions, suspended roles, clock skew) without logging every
      // successful connect/join/emit.
      this.logger.warn(`Socket auth rejected: ${err?.message}`);
      client.disconnect();
    }
  }

  @SubscribeMessage('joinConversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: number,
  ) {
    const userId = (client.data as any).userId;
    const roleContext = (client.data as any).roleContext as RoleContext | undefined;
    if (!userId || !conversationId) return;

    const convo = await this.convoRepo
      .findOne({
        where: { id: Number(conversationId) },
        relations: { customer: true },
      })
      .catch(() => null);
    if (!convo) return;

    let authorized = false;

    // New authoritative check: a real ConversationParticipant row for the
    // resolved active AccountRole.
    if (roleContext) {
      authorized = await this.participants.isEntitled(convo.id, roleContext).catch(() => false);
    }

    // Legacy fallback: a conversation dual-write hasn't touched yet (no
    // participants) falls back to the original structural-ownership check
    // -- but now ALSO requires the matching active role, which the
    // original check never looked at at all. This is the actual Stage 2
    // fix for this handler; the ownership half is unchanged.
    //
    // Restricted (mirroring the REST fallback in
    // ConversationService.getScopedInboxByAccountRole) to conversations the
    // classifier has never evaluated: classificationStatus must still be
    // LEGACY_UNSCOPED. A RESOLVED/ACCOUNT_WIDE/EXTERNAL_CONTACT row always
    // has a real participant already, so it's covered by the isEntitled()
    // check above, never this branch. An AMBIGUOUS row -- one the
    // classifier looked at and could not deterministically assign -- must
    // never re-enter via raw structural ownership just because it lacks a
    // participant on this particular side.
    if (
      !authorized &&
      this.flags.isEnabled('LEGACY_COMMUNICATION_READ_FALLBACK') &&
      convo.classificationStatus === ConversationClassificationStatus.LEGACY_UNSCOPED
    ) {
      const isBuyer =
        convo.customer?.userId === userId &&
        (!roleContext || roleContext.roleType === AccountRoleType.BUYER);
      const isSeller =
        !isBuyer &&
        (!roleContext ||
          [AccountRoleType.SELLER, AccountRoleType.ADMIN, AccountRoleType.MANAGER].includes(
            roleContext.roleType,
          )) &&
        (await this.sellerScope
          .isAuthorizedFor({ id: userId } as User, convo.sellerId, 'canSendMessages')
          .catch(() => false));
      authorized = isBuyer || isSeller;
    }

    // Never confirm or deny a conversation's existence to a non-participant
    // — just silently decline to join, same as the REST 404-for-anyone-not-
    // authorized pattern.
    if (!authorized) return;

    client.join(`conversation:${conversationId}`);
  }

  @SubscribeMessage('leaveConversation')
  handleLeaveConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: number,
  ) {
    if (conversationId) client.leave(`conversation:${conversationId}`);
  }

  // Called by ConversationService right after a message is persisted via
  // REST — this is the ONLY thing that ever calls into this gateway; it
  // never originates writes itself. sellerAccountRoleId/buyerAccountRoleId
  // are the already-resolved ids from ConversationService's own dual-write
  // (Stage 2) -- this gateway never re-resolves them itself, to avoid an
  // extra DB round trip per message and to keep this file's own
  // responsibility purely about delivery, not authorization resolution.
  emitNewMessage(params: {
    conversationId: number;
    sellerId: number;
    buyerUserId: number | null;
    message: ConversationMessage;
    isNote: boolean;
    sellerAccountRoleId?: number | null;
    buyerAccountRoleId?: number | null;
  }): void {
    const payload = {
      conversationId: params.conversationId,
      message: params.message,
    };

    const roomsEnabled = this.flags.isEnabled('ROLE_CONTEXT_SOCKET_ROOMS');
    // Operational events must route to scoped rooms, never the generic
    // user:{userId} room (Stage 2 item 17) -- when rooms are enabled but an
    // accountRoleId wasn't resolved (e.g. SCOPED_CONVERSATION_DUAL_WRITE is
    // off), this side's realtime nudge is skipped rather than delivered to
    // the wrong room shape; the message itself is already durably
    // persisted, so this only delays a live refresh, never loses data.
    const sellerRoom = roomsEnabled
      ? params.sellerAccountRoleId
        ? `role:${params.sellerAccountRoleId}`
        : null
      : `user:${params.sellerId}`;
    const buyerRoom = roomsEnabled
      ? params.buyerAccountRoleId
        ? `role:${params.buyerAccountRoleId}`
        : null
      : params.buyerUserId
        ? `user:${params.buyerUserId}`
        : null;

    if (params.isNote) {
      // Internal notes are seller-only and must never reach a buyer's
      // socket, even one sitting in the same conversation:{id} room —
      // deliver only to the seller's own connected sessions.
      if (sellerRoom) this.server.to(sellerRoom).emit('newMessage', payload);
      return;
    }

    this.server.to(`conversation:${params.conversationId}`).emit('newMessage', payload);
    // Also nudges anyone with the inbox LIST open (not this specific
    // thread) to refresh — the sender's own room membership above already
    // covers the case where they have this exact conversation open.
    if (sellerRoom) {
      this.server.to(sellerRoom).emit('inboxUpdated', { conversationId: params.conversationId });
    }
    if (buyerRoom) {
      this.server.to(buyerRoom).emit('inboxUpdated', { conversationId: params.conversationId });
    }
  }
}
