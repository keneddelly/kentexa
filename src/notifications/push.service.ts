/**
 * PushService — Web Push notifications via web-push library
 * Place at: src/notifications/push.service.ts
 *
 * Setup:
 *   npm install web-push
 *   Generate VAPID keys: npx web-push generate-vapid-keys
 *   Add to .env:
 *     VAPID_PUBLIC_KEY=...
 *     VAPID_PRIVATE_KEY=...
 *     VAPID_EMAIL=mailto:admin@kentexa.com
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PushSubscription } from './entities/push-subscription.entity';

// Lazy-load web-push to avoid crash if not installed yet
let webpush: any = null;
try {
  webpush = require('web-push');
} catch {
  /* web-push not installed */
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private vapidConfigured = false;

  constructor(
    @InjectRepository(PushSubscription)
    private subRepo: Repository<PushSubscription>,
    private config: ConfigService,
  ) {
    if (webpush) {
      const pub = config.get('VAPID_PUBLIC_KEY');
      const priv = config.get('VAPID_PRIVATE_KEY');
      const email = config.get('VAPID_EMAIL') || 'mailto:admin@kentexa.com';
      if (pub && priv) {
        webpush.setVapidDetails(email, pub, priv);
        this.vapidConfigured = true;
        this.logger.log('Web Push configured ✅');
      } else {
        this.logger.warn('VAPID keys not set — push notifications disabled');
      }
    } else {
      this.logger.warn('web-push not installed — run: npm install web-push');
    }
  }

  // ── Save subscription from browser ────────────────────────────────────────
  async subscribe(
    userId: number,
    sub: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      userAgent?: string;
    },
  ): Promise<PushSubscription> {
    // Upsert by endpoint (device)
    const existing = await this.subRepo.findOne({
      where: { endpoint: sub.endpoint },
    });
    if (existing) {
      existing.userId = userId;
      existing.p256dh = sub.keys.p256dh;
      existing.auth = sub.keys.auth;
      existing.userAgent = sub.userAgent || null;
      return this.subRepo.save(existing);
    }
    return this.subRepo.save(
      this.subRepo.create({
        userId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: sub.userAgent || null,
      }),
    );
  }

  async unsubscribe(endpoint: string): Promise<void> {
    await this.subRepo.delete({ endpoint });
  }

  // ── Send push to a specific user (all their devices) ──────────────────────
  async sendToUser(
    userId: number,
    payload: {
      title: string;
      body: string;
      icon?: string;
      url?: string;
      tag?: string;
    },
  ): Promise<void> {
    if (!webpush || !this.vapidConfigured) return;

    const subs = await this.subRepo.find({ where: { userId } });
    if (!subs.length) return;

    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/icons/icon-192x192.png',
      url: payload.url || '/',
      tag: payload.tag || 'kentexa',
    });

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          pushPayload,
        ),
      ),
    );

    // Remove expired subscriptions (410 Gone)
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'rejected') {
        const status = r.reason?.statusCode;
        if (status === 410 || status === 404) {
          await this.subRepo.delete({ endpoint: subs[i].endpoint });
          this.logger.log(`Removed expired push sub for user ${userId}`);
        }
      }
    }
  }

  // ── Get VAPID public key for client ───────────────────────────────────────
  getPublicKey(): string {
    return this.config.get('VAPID_PUBLIC_KEY') || '';
  }

  async getSubscriptionCount(): Promise<number> {
    return this.subRepo.count();
  }
}
