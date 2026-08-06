/**
 * WhatsappService — thin client for the WhatsApp Cloud API (Meta).
 * Place at: src/whatsapp/whatsapp.service.ts
 *
 * Pure API client — no knowledge of Conversations/BusinessCustomers. Each
 * seller connects their own WhatsApp Business phone number (User.whatsappPhoneNumberId
 * + User.whatsappAccessToken); this service just sends/receives on their behalf.
 */
import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface WhatsappInboundMessage {
  phoneNumberId: string; // which of OUR sellers' numbers received this
  fromWaId: string; // customer's WhatsApp ID (phone number, no +)
  fromName: string | null;
  text: string | null;
  imageUrl: string | null; // resolved media URL, if any
  waMessageId: string;
  timestamp: string;
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly apiVersion = 'v21.0';
  private readonly graphUrl = 'https://graph.facebook.com';

  // ── Webhook verification handshake (GET) ──────────────────────────────────
  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    const expected = process.env.WHATSAPP_VERIFY_TOKEN;
    if (!expected) {
      this.logger.warn('WHATSAPP_VERIFY_TOKEN not configured — rejecting webhook verification');
      return null;
    }
    if (mode === 'subscribe' && token === expected) return challenge;
    return null;
  }

  // ── Parse an inbound webhook payload into normalized messages ────────────
  // A single webhook POST can contain multiple entries/changes/messages —
  // callers should handle an array.
  parseInboundPayload(body: any): WhatsappInboundMessage[] {
    const out: WhatsappInboundMessage[] = [];
    for (const entry of body?.entry || []) {
      for (const change of entry?.changes || []) {
        const value = change?.value;
        if (!value?.messages?.length) continue; // status updates etc — ignore
        const phoneNumberId = value.metadata?.phone_number_id;
        const contact = value.contacts?.[0];
        for (const msg of value.messages) {
          out.push({
            phoneNumberId,
            fromWaId: msg.from,
            fromName: contact?.profile?.name || null,
            text: msg.text?.body || msg.button?.text || msg.interactive?.button_reply?.title || null,
            imageUrl: null, // media requires a separate authenticated fetch — see resolveMediaUrl()
            waMessageId: msg.id,
            timestamp: msg.timestamp,
          });
        }
      }
    }
    return out;
  }

  // ── Resolve a media id (image/audio/etc) to a temporary download URL ─────
  async resolveMediaUrl(mediaId: string, accessToken: string): Promise<string | null> {
    try {
      const res = await axios.get(`${this.graphUrl}/${this.apiVersion}/${mediaId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return res.data?.url || null;
    } catch (err) {
      this.logger.warn(`Failed to resolve WhatsApp media ${mediaId}: ${err.message}`);
      return null;
    }
  }

  // ── Send a free-form text message ─────────────────────────────────────────
  // Only deliverable within 24h of the customer's last message — outside
  // that window Meta will reject this and a template message is required
  // instead (not yet implemented — see TODO in ConversationService).
  async sendTextMessage(
    phoneNumberId: string,
    accessToken: string,
    toWaId: string,
    text: string,
  ): Promise<{ success: boolean; waMessageId?: string; error?: string }> {
    try {
      const res = await axios.post(
        `${this.graphUrl}/${this.apiVersion}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: toWaId,
          type: 'text',
          text: { body: text },
        },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      return { success: true, waMessageId: res.data?.messages?.[0]?.id };
    } catch (err) {
      const message = err.response?.data?.error?.message || err.message;
      this.logger.warn(`WhatsApp send failed to ${toWaId}: ${message}`);
      return { success: false, error: message };
    }
  }
}
