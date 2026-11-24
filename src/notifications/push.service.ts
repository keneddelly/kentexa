import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { PushSubscription } from './entities/push-subscription.entity';
import { DevicePushToken } from './entities/device-push-token.entity';
import { FcmClient, FcmPayload } from './fcm.client';

let webpush: any = null;
try { webpush = require('web-push'); } catch { /* optional */ }

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private vapidConfigured = false;
  private readonly fcm: FcmClient;

  constructor(
    @InjectRepository(PushSubscription) private subRepo: Repository<PushSubscription>,
    @InjectRepository(DevicePushToken) private tokenRepo: Repository<DevicePushToken>,
    private config: ConfigService,
  ) {
    this.fcm = new FcmClient(config.get('FIREBASE_SERVICE_ACCOUNT_JSON'));
    if (this.fcm.configured) this.logger.log('Native push (FCM) configured');
    if (webpush) {
      const pub = config.get('VAPID_PUBLIC_KEY');
      const priv = config.get('VAPID_PRIVATE_KEY');
      const email = config.get('VAPID_EMAIL') || 'mailto:admin@kentexa.com';
      if (pub && priv) {
        webpush.setVapidDetails(email, pub, priv);
        this.vapidConfigured = true;
        this.logger.log('Web Push configured');
      } else this.logger.warn('VAPID keys not set — web push disabled');
    }
  }

  async subscribe(userId: number, sub: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string }): Promise<PushSubscription> {
    if (!this.vapidConfigured) throw new ServiceUnavailableException('Push notifications are not configured');
    if (!sub?.endpoint?.startsWith('https://') || !sub?.keys?.p256dh || !sub?.keys?.auth) throw new BadRequestException('Invalid push subscription');
    const existing = await this.subRepo.findOne({ where: { endpoint: sub.endpoint } });
    if (existing) {
      existing.userId = userId; existing.p256dh = sub.keys.p256dh; existing.auth = sub.keys.auth;
      existing.userAgent = sub.userAgent || null;
      return this.subRepo.save(existing);
    }
    return this.subRepo.save(this.subRepo.create({ userId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: sub.userAgent || null }));
  }

  async unsubscribe(endpoint: string, userId: number): Promise<void> { await this.subRepo.delete({ endpoint, userId }); }

  async registerDeviceToken(userId: number, token: string, platform: string): Promise<void> {
    const clean = (token || '').trim();
    if (!clean || clean.length > 4096) throw new BadRequestException('Invalid device token');
    const existing = await this.tokenRepo.findOne({ where: { token: clean } });
    if (existing) { existing.userId = userId; existing.platform = platform; await this.tokenRepo.save(existing); return; }
    await this.tokenRepo.save(this.tokenRepo.create({ userId, token: clean, platform }));
  }

  async removeDeviceToken(userId: number, token: string): Promise<void> { await this.tokenRepo.delete({ token: (token || '').trim(), userId }); }

  async getDeviceStatus(userId: number) {
    const [nativeDeviceCount, webSubscriptionCount] = await Promise.all([
      this.tokenRepo.count({ where: { userId } }),
      this.subRepo.count({ where: { userId } }),
    ]);
    return { nativeDeviceCount, webSubscriptionCount, nativeConfigured: this.fcm.configured, webConfigured: this.vapidConfigured };
  }

  async sendTestToUser(userId: number) {
    if (!this.fcm.configured) return { status: 'not_configured', registered: 0, accepted: 0, failed: 0 };
    const devices = await this.tokenRepo.find({ where: { userId } });
    if (!devices.length) return { status: 'no_device', registered: 0, accepted: 0, failed: 0 };
    const payload: FcmPayload = { title: 'Kentexa', body: 'Jaribio la arifa limefanikiwa kufika kwenye huduma ya FCM.', data: { url: '/inbox', tag: 'push-test' } };
    const outcomes = await Promise.all(devices.map(async (device) => {
      try {
        const result = await this.fcm.send(device.token, payload);
        if (result.invalidToken) await this.tokenRepo.delete({ token: device.token });
        return result.ok ? 'accepted' : 'failed';
      } catch {
        this.logger.warn('Test push failed for a registered device');
        return 'failed';
      }
    }));
    const accepted = outcomes.filter((x) => x === 'accepted').length;
    const failed = outcomes.length - accepted;
    this.logger.log(`FCM self-test for user ${userId}: accepted=${accepted}, failed=${failed}`);
    return { status: accepted ? 'accepted' : 'failed', registered: devices.length, accepted, failed };
  }

  private async sendNativeToUser(userId: number, payload: FcmPayload): Promise<void> {
    if (!this.fcm.configured) return;
    const devices = await this.tokenRepo.find({ where: { userId } });
    await Promise.allSettled(devices.map(async (device) => {
      const result = await this.fcm.send(device.token, payload);
      if (result.invalidToken) {
        await this.tokenRepo.delete({ token: device.token });
        this.logger.log(`Removed dead device token for user ${userId}`);
      } else if (!result.ok) this.logger.warn(`Native push delivery failed for user ${userId}`);
    }));
  }

  async sendToUser(userId: number, payload: { title: string; body: string; icon?: string; url?: string; tag?: string }): Promise<void> {
    await Promise.allSettled([
      this.sendWebToUser(userId, payload),
      this.sendNativeToUser(userId, { title: payload.title, body: payload.body, data: { url: payload.url || '/', tag: payload.tag || 'kentexa' } }),
    ]);
  }

  private async sendWebToUser(userId: number, payload: { title: string; body: string; icon?: string; url?: string; tag?: string }): Promise<void> {
    if (!webpush || !this.vapidConfigured) return;
    const subs = await this.subRepo.find({ where: { userId } });
    if (!subs.length) return;
    const pushPayload = JSON.stringify({ title: payload.title, body: payload.body, icon: payload.icon || '/logo512.png', url: payload.url || '/', tag: payload.tag || 'kentexa' });
    const results = await Promise.allSettled(subs.map((sub) => webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, pushPayload)));
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        const status = result.reason?.statusCode;
        if (status === 410 || status === 404) {
          await this.subRepo.delete({ endpoint: subs[i].endpoint, userId });
          this.logger.log(`Removed expired push subscription for user ${userId}`);
        } else this.logger.warn(`Web push delivery failed (status ${status || 'unknown'})`);
      }
    }
  }

  getPublicKey(): string { return this.vapidConfigured ? this.config.get('VAPID_PUBLIC_KEY') || '' : ''; }
  async getSubscriptionCount(): Promise<number> { return this.subRepo.count(); }
  async hasSubscription(userId: number, endpoint: string): Promise<boolean> {
    if (!endpoint || !endpoint.startsWith('https://')) return false;
    return Boolean(await this.subRepo.findOne({ where: { userId, endpoint } }));
  }
}
