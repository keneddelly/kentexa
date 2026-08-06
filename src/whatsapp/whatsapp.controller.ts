/**
 * WhatsappController — Meta webhook receiver.
 * Place at: src/whatsapp/whatsapp.controller.ts
 *
 * Public routes — Meta calls these directly, no KenteXa auth involved.
 * Inbound messages are routed to the right seller by matching the
 * receiving phone_number_id against User.whatsappPhoneNumberId.
 */
import { Controller, Get, Post, Body, Query, Res, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { WhatsappService } from './whatsapp.service';
import { ConversationService } from '../business/conversation.service';
import { User } from '../users/entities/user.entity';

@Controller('webhooks/whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private whatsappService: WhatsappService,
    private conversationService: ConversationService,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  // ── Meta's one-time verification handshake when the webhook is configured ─
  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const result = this.whatsappService.verifyWebhook(mode, token, challenge);
    if (result === null) {
      res.status(403).send('Forbidden');
      return;
    }
    res.status(200).send(result);
  }

  // ── Inbound messages / status updates ─────────────────────────────────────
  // Always return 200 quickly — Meta retries aggressively on non-2xx, and
  // a single seller lookup failure shouldn't turn into a retry storm.
  @Post()
  async receive(@Body() body: any, @Res() res: Response) {
    res.status(200).send('OK');

    try {
      const messages = this.whatsappService.parseInboundPayload(body);
      for (const msg of messages) {
        const seller = await this.userRepo.findOne({
          where: { whatsappPhoneNumberId: msg.phoneNumberId },
        });
        if (!seller) {
          this.logger.warn(
            `No seller connected for WhatsApp phone_number_id ${msg.phoneNumberId}`,
          );
          continue;
        }

        // TODO: image/audio/document messages arrive as a media id, not a
        // URL — resolving them via whatsappService.resolveMediaUrl() and
        // re-hosting on Cloudinary isn't wired up yet. For now a non-text
        // message still creates the conversation/notification so the seller
        // knows to open WhatsApp directly, it just won't preview inline.
        await this.conversationService.receiveExternalMessage(
          seller.id,
          {
            phone: msg.fromWaId,
            name: msg.fromName,
            channel: 'whatsapp',
            externalId: msg.fromWaId,
          },
          {
            content: msg.text || '📎 Ujumbe kwenye WhatsApp (fungua kutazama)',
          },
        );
      }
    } catch (err) {
      this.logger.error(`Failed processing WhatsApp webhook: ${err.message}`);
    }
  }
}
