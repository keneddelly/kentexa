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
import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PushSubscription } from './entities/push-subscription.entity';
import { DevicePushToken } from './entities/device-push-token.entity';
import { FcmClient, FcmPayload } from './fcm.client';

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
  private readonly fcm: FcmClient;

  constructor(
    @InjectRepository(PushSubscription)
    private subRepo: Repository<PushSubscription>,
    @InjectRepository(DevicePushToken)
    private tokenRepo: Repository<DevicePushToken>,
    private config: ConfigService,
  ) {
    this.fcm = new FcmClient(config.get('FIREBASE_SERVICE_ACCOUNT_JSON'));
    if (this.fcm.configured) this.logger.log('Native push (FCM) configured ✅');
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
    if (!this.vapidConfigured) throw new ServiceUnavailableException('Push notifications are not configured');
    if (!sub?.endpoint?.startsWith('https://') || !sub?.keys?.p256dh || !sub?.keys?.auth)
      throw new BadRequestException('Invalid push subscription');
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

  // Scoped to the caller's own subscription — previously any authenticated
  // user could unsubscribe *any* endpoint string, not just their own.
  async unsubscribe(endpoint: string, userId: number): Promise<void> {
    await this.subRepo.delete({ endpoint, userId });
  }

  // ── Native app devices (FCM) ──────────────────────────────────────────────
  // Idempotent: a token that already exists is moved to the signed-in user.
  async registerDeviceToken(userId: number, token: string, platform: string): Promise<void> {
    const clean = (token || '').trim();
    if (!clean || clean.length > 4096) throw new BadRequestException('Invalid device token');
    const existing = await this.tokenRepo.findOne({ where: { token: clean } });
    if (existing) {
      existing.userId = userId;
      existing.platform = platform;
      await this.tokenRepo.save(existing);
      return;
    }
    await this.tokenRepo.save(this.tokenRepo.create({ userId, token: clean, platform }));
  }

  // Called on sign-out so a signed-out phone stops receiving this account's pushes.
  async removeDeviceToken(userId: number, token: string): Promise<void> {
    await this.tokenRepo.delete({ token: (token || '').trim(), userId });
  }

  private async sendNativeToUser(userId: number, payload: FcmPayload): Promise<void> {
    if (!this.fcm.configured) return;
    const tokens = await this.tokenRepo.find({ where: { userId } });
    await Promise.allSettled(
      tokens.map(async (t) => {
        const result = await this.fcm.send(t.token, payload);
        if (result.invalidToken) {
          await this.tokenRepo.delete({ token: t.token });
          this.logger.log(`Removed dead device token for user ${userId}`);
        } else if (!result.ok) {
          this.logger.warn(`Native push delivery failed for user ${userId}`);
        }
      }),
    );
  }

  // ── Send push to a specific user (all their devices, web and native) ──────
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
    // Each channel is independent: a web-push failure must not stop native
    // delivery, and vice versa. Never throws.
    await Promise.allSettled([
      this.sendWebToUser(userId, payload),
      this.sendNativeToUser(userId, {
        title: payload.title,
        body: payload.body,
        data: { url: payload.url || '/', tag: payload.tag || 'kentexa' },
      }),
    ]);
  }

  private async sendWebToUser(
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
      icon: payload.icon || '/logo512.png',
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
        } else {
          // Never print the endpoint or cryptographic keys in production logs.
          this.logger.warn(`Push delivery failed (status ${status || 'unknown'})`);
        }
      }
    }
  }

  // ── Get VAPID public key for client ───────────────────────────────────────
  getPublicKey(): string {
    return this.vapidConfigured ? this.config.get('VAPID_PUBLIC_KEY') || '' : '';
  }

  async getSubscriptionCount(): Promise<number> {
    return this.subRepo.count();
  }

  async hasSubscription(userId: number, endpoint: string): Promise<boolean> {
    if (!endpoint || !endpoint.startsWith('https://')) return false;
    return Boolean(await this.subRepo.findOne({ where: { userId, endpoint } }));
  }
}
