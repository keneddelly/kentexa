/**
 * ConversationGateway — real-time delivery for the Inbox
 * Place at: src/business/conversation.gateway.ts
 *
 * Purely additive over the existing REST API (business.controller.ts +
 * conversation.service.ts) — every message is still persisted via a normal
 * HTTP request first; this only pushes a live copy to anyone already
 * connected, so a socket outage never loses a message, it just delays
 * seeing it until the next manual refresh (the app's entire behavior
 * before this file existed at all).
 *
 * Two room types:
 *   user:{userId}         — joined automatically on connect. Used for
 *                            "your inbox list needs refreshing" signals
 *                            and for delivering seller-only internal notes
 *                            (which must never reach a buyer's socket).
 *   conversation:{id}     — joined explicitly via 'joinConversation', only
 *                            after re-verifying the caller is actually a
 *                            participant (owner, delegated team member, or
 *                            the buyer) — mirrors the same authorization
 *                            business.controller.ts's REST endpoints use,
 *                            not a separate/weaker check.
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
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { ConversationMessage } from './entities/conversation-message.entity';
import { SellerScopeService } from './seller-scope.service';
import { User } from '../users/entities/user.entity';

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
export class ConversationGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ConversationGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly sellerScope: SellerScopeService,
    @InjectRepository(Conversation)
    private readonly convoRepo: Repository<Conversation>,
  ) {}

  // Same posture as JwtAuthGuard on the REST side: no token, or a token
  // that doesn't verify, means no connection at all — never a connection
  // that's silently unauthenticated.
  handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string) ||
        (client.handshake.query?.token as string);
      if (!token) {
        client.disconnect();
        return;
      }
      const payload = this.jwtService.verify(token);
      const userId = payload?.sub;
      if (!userId) {
        client.disconnect();
        return;
      }
      (client.data as any).userId = userId;
      client.join(`user:${userId}`);
    } catch {
      client.disconnect();
    }
  }

  @SubscribeMessage('joinConversation')
  async handleJoinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() conversationId: number,
  ) {
    const userId = (client.data as any).userId;
    if (!userId || !conversationId) return;

    const convo = await this.convoRepo
      .findOne({
        where: { id: Number(conversationId) },
        relations: { customer: true },
      })
      .catch(() => null);
    if (!convo) return;

    const isBuyer = convo.customer?.userId === userId;
    // isAuthorizedFor only ever reads user.id off this object for the
    // ownership check, then queries BusinessTeamMember by that id for the
    // delegation check — a full User row isn't needed for either path.
    const isSeller =
      !isBuyer &&
      (await this.sellerScope
        .isAuthorizedFor(
          { id: userId } as User,
          convo.sellerId,
          'canSendMessages',
        )
        .catch(() => false));

    // Never confirm or deny a conversation's existence to a non-participant
    // — just silently decline to join, same as the REST 404-for-anyone-not-
    // authorized pattern.
    if (!isBuyer && !isSeller) return;

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
  // never originates writes itself.
  emitNewMessage(params: {
    conversationId: number;
    sellerId: number;
    buyerUserId: number | null;
    message: ConversationMessage;
    isNote: boolean;
  }): void {
    const payload = {
      conversationId: params.conversationId,
      message: params.message,
    };

    if (params.isNote) {
      // Internal notes are seller-only and must never reach a buyer's
      // socket, even one sitting in the same conversation:{id} room —
      // deliver only to the seller's own connected sessions.
      this.server.to(`user:${params.sellerId}`).emit('newMessage', payload);
      return;
    }

    this.server.to(`conversation:${params.conversationId}`).emit('newMessage', payload);
    // Also nudges anyone with the inbox LIST open (not this specific
    // thread) to refresh — the sender's own room membership above already
    // covers the case where they have this exact conversation open.
    this.server
      .to(`user:${params.sellerId}`)
      .emit('inboxUpdated', { conversationId: params.conversationId });
    if (params.buyerUserId) {
      this.server
        .to(`user:${params.buyerUserId}`)
        .emit('inboxUpdated', { conversationId: params.conversationId });
    }
  }
}
