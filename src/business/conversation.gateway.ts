import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from './entities/conversation.entity';
import { ConversationMessage } from './entities/conversation-message.entity';

/**
 * ConversationGateway — real-time push for the unified inbox.
 *
 * Purely additive: every message is still created via the existing REST
 * endpoints (conversation.service.ts). This just pushes what was already
 * saved to whoever has the conversation open, so the inbox updates without
 * a refresh. If the socket never connects, the inbox still works exactly
 * as it did before — plain fetch on open/reopen.
 */
@WebSocketGateway({
  cors: {
    origin: [
      'http://localhost:3000',
      'https://kentexa.com',
      'https://www.kentexa.com',
      'https://staging.kentexa.com',
    ],
    credentials: true,
  },
})
export class ConversationGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService,
    @InjectRepository(Conversation)
    private convoRepo: Repository<Conversation>,
  ) {}

  handleConnection(client: Socket) {
    const token =
      (client.handshake.auth?.token as string) ||
      (client.handshake.query?.token as string);
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      // Uses the secret already configured on this module's JwtModule
      // registration — no need to re-read/override it here.
      const payload = this.jwtService.verify(token);
      const userId = payload.sub ?? payload.id;
      if (!userId) throw new Error('No user id in token');
      client.data.userId = userId;
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
    const userId = client.data.userId;
    if (!userId || !conversationId) return;

    const convo = await this.convoRepo.findOne({
      where: { id: Number(conversationId) },
      relations: { customer: true },
    });
    if (!convo) return;

    const isSeller = convo.sellerId === userId;
    const isBuyer = convo.customer?.userId === userId;
    if (!isSeller && !isBuyer) return; // not a party to this conversation

    client.join(`conversation:${conversationId}`);
  }

  // ── Called from ConversationService right after a message is saved ──────
  emitNewMessage(
    conversationId: number,
    sellerId: number,
    buyerUserId: number | null,
    message: ConversationMessage,
  ) {
    const rooms = [`conversation:${conversationId}`, `user:${sellerId}`];
    if (buyerUserId) rooms.push(`user:${buyerUserId}`);
    this.server.to(rooms).emit('newMessage', { conversationId, message });
  }
}
