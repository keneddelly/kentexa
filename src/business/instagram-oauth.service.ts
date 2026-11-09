import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { InstagramOAuthState } from './entities/instagram-oauth-state.entity';
import { InstagramBusinessConnection, InstagramBusinessConnectionStatus } from './entities/instagram-business-connection.entity';
import { InstagramBusinessAccessService } from './instagram-business-access.service';
import { InstagramTokenCryptoService } from './instagram-token-crypto.service';

type MetaTokenResponse = { access_token?: string; token_type?: string; expires_in?: number };
type MetaPage = { id?: string; name?: string; access_token?: string; instagram_business_account?: { id?: string; username?: string } };

/** Permissions the Page-based Instagram messaging needs (Meta: Instagram Messaging, Get started). */
export const REQUIRED_PERMISSIONS = ['instagram_manage_messages', 'pages_manage_metadata', 'pages_show_list'];

/** A connection failure the business can act on; `reason` goes back to the page (no Meta details). */
export class InstagramConnectError extends BadRequestException {
  constructor(readonly reason: 'permission' | 'no_instagram', message: string) { super({ code: 'INSTAGRAM_' + reason.toUpperCase(), message }); }
}

/** Meta's own short error text ("(#200) ..."), never tokens or request details. */
const metaError = (error: any): string | null => {
  const e = error?.response?.data?.error;
  if (!e) return null;
  return [e.code != null ? `(#${e.code})` : null, typeof e.message === 'string' ? e.message.replace(/access_token=[^&\s]+/g, 'access_token=***') : null]
    .filter(Boolean).join(' ') || null;
};

@Injectable()
export class InstagramOAuthService {
  private readonly logger = new Logger(InstagramOAuthService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(InstagramOAuthState) private readonly states: Repository<InstagramOAuthState>,
    @InjectRepository(InstagramBusinessConnection) private readonly connections: Repository<InstagramBusinessConnection>,
    private readonly access: InstagramBusinessAccessService,
    private readonly crypto: InstagramTokenCryptoService,
  ) {}

  async createAuthorizationUrl(businessId: number, userId: number): Promise<{ authorizationUrl: string }> {
    await this.access.assertCanManage(businessId, userId);
    const appId = this.requiredConfig('META_APP_ID');
    const configId = this.requiredConfig('META_INSTAGRAM_CONFIG_ID');
    const redirectUri = this.requiredConfig('META_INSTAGRAM_REDIRECT_URI');
    const state = randomBytes(32).toString('base64url');
    await this.states.save(this.states.create({
      stateHash: this.hash(state),
      businessId,
      userId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      consumedAt: null,
    }));

    const url = new URL('https://www.facebook.com/dialog/oauth');
    url.searchParams.set('client_id', appId);
    url.searchParams.set('config_id', configId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    url.searchParams.set('prompt', 'login');
    return { authorizationUrl: url.toString() };
  }

  async completeAuthorization(code: string, state: string): Promise<{ connected: Array<{ id: number; username: string; webhookSubscribed: boolean }>; businessId: number }> {
    if (!code || code.length > 4096 || !state || state.length > 256) {
      throw new BadRequestException('Instagram authorization callback is incomplete.');
    }

    // Consume the nonce atomically before making any external request. A callback
    // can therefore never be replayed, even if Meta or the browser retries it.
    const now = new Date();
    const claim = await this.states.createQueryBuilder()
      .update(InstagramOAuthState)
      .set({ consumedAt: now })
      .where('"stateHash" = :stateHash AND "consumedAt" IS NULL AND "expiresAt" > :now', {
        stateHash: this.hash(state), now,
      })
      .returning(['id', 'businessId', 'userId'])
      .execute();
    const claimed = claim.raw?.[0];
    if (!claimed) throw new BadRequestException('Instagram authorization state is invalid, expired, or already used.');

    const businessId = Number(claimed.businessId);
    const userId = Number(claimed.userId);
    await this.access.assertCanManage(businessId, userId);

    const appId = this.requiredConfig('META_APP_ID');
    const appSecret = this.requiredConfig('META_APP_SECRET');
    const redirectUri = this.requiredConfig('META_INSTAGRAM_REDIRECT_URI');
    const version = this.config.get<string>('META_GRAPH_API_VERSION') || 'v26.0';
    const graph = `https://graph.facebook.com/${version}`;

    try {
      // 1. The code gives a short-lived user token (about 1 to 2 hours) ...
      const tokenResponse = await axios.get<MetaTokenResponse>(`${graph}/oauth/access_token`, {
        params: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code },
        timeout: 15000,
      });
      const shortToken = tokenResponse.data?.access_token;
      if (!shortToken) throw new Error('Meta did not return an access token.');
      // ... 2. exchanged for a long-lived one, so the Page tokens taken from it do not expire
      // (owner 2026-11-09: the connection kept stopping; the short token was stored before).
      let userToken = shortToken;
      try {
        const long = await axios.get<MetaTokenResponse>(`${graph}/oauth/access_token`, {
          params: { grant_type: 'fb_exchange_token', client_id: appId, client_secret: appSecret, fb_exchange_token: shortToken },
          timeout: 15000,
        });
        if (long.data?.access_token) userToken = long.data.access_token;
      } catch {
        this.logger.warn('Instagram: the long-lived token exchange failed; using the short-lived token.');
      }

      const permissionResponse = await axios.get(`${graph}/me/permissions`, { params: { access_token: userToken }, timeout: 15000 });
      const permissions: Array<{ permission?: string; status?: string }> = permissionResponse.data?.data || [];
      const granted = permissions.filter(p => p.status === 'granted').map(p => p.permission!).filter(Boolean);
      const missing = REQUIRED_PERMISSIONS.filter(p => !granted.includes(p));
      if (missing.length) {
        throw new InstagramConnectError('permission', `Instagram permissions were not granted: ${missing.join(', ')}. Reconnect and allow them.`);
      }

      // 3. The Pages this person manages, each with its Page token and its Instagram account
      // (Meta: GET /me/accounts; the Instagram account is the Page's instagram_business_account).
      const pages = await this.pagesWithInstagram(graph, userToken);
      if (!pages.length) {
        throw new InstagramConnectError('no_instagram',
          'No Facebook Page with a linked Instagram professional account was shared. Link the Instagram account to a Facebook Page, then reconnect.');
      }

      const connected: Array<{ id: number; username: string; webhookSubscribed: boolean }> = [];
      for (const page of pages) {
        const instagramUserId = page.instagramId;
        let connection = await this.connections.findOne({ where: { businessId, instagramUserId } });
        if (!connection) connection = this.connections.create({ businessId, instagramUserId, connectedAt: now });
        connection.instagramUsername = page.instagramUsername;
        connection.facebookPageId = page.pageId;
        connection.facebookPageName = page.pageName;
        connection.accessTokenEncrypted = this.crypto.encrypt(page.pageToken);
        // A Page token from a long-lived user token has no expiry.
        connection.tokenExpiresAt = null;
        connection.grantedScopes = granted;
        connection.status = InstagramBusinessConnectionStatus.ACTIVE;
        connection.connectedByUserId = userId;
        connection.connectedAt = now;
        connection.lastVerifiedAt = now;
        const saved = await this.connections.save(connection);

        // 4. Messages come to Kentexa when the PAGE is subscribed, with the Page token.
        const subscription = await this.subscribePage(graph, page.pageId, page.pageToken);
        await this.connections.update(saved.id, { webhookSubscribed: subscription.ok, webhookError: subscription.error });
        if (!subscription.ok) this.logger.warn(`Instagram: message subscription refused for connection ${saved.id}: ${subscription.error}`);
        connected.push({ id: saved.id, username: saved.instagramUsername, webhookSubscribed: subscription.ok });
      }

      return { connected, businessId };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error(`Instagram OAuth exchange or account discovery failed: ${metaError(error) || 'unknown'}`);
      throw new ServiceUnavailableException('Meta could not complete the Instagram connection. Please retry the connection flow.');
    }
  }

  /** Pages the person manages that have an Instagram professional account, with their tokens. */
  private async pagesWithInstagram(graph: string, userToken: string) {
    const out: Array<{ pageId: string; pageName: string | null; pageToken: string; instagramId: string; instagramUsername: string }> = [];
    let url: string | null = `${graph}/me/accounts`;
    let params: Record<string, unknown> | undefined = {
      fields: 'id,name,access_token,instagram_business_account{id,username}', limit: 100, access_token: userToken,
    };
    for (let i = 0; url && i < 5; i += 1) {
      const response = await axios.get(url, { params, timeout: 15000 });
      for (const page of (response.data?.data || []) as MetaPage[]) {
        const ig = page.instagram_business_account;
        if (!/^\d{1,128}$/.test(String(page.id || '')) || !page.access_token || !/^\d{1,128}$/.test(String(ig?.id || ''))) continue;
        out.push({
          pageId: String(page.id), pageName: page.name ? String(page.name).slice(0, 255) : null, pageToken: String(page.access_token),
          instagramId: String(ig!.id), instagramUsername: String(ig!.username || page.name || 'instagram').trim().replace(/^@/, '').slice(0, 255),
        });
      }
      url = response.data?.paging?.next || null;
      params = undefined; // the next link carries its own query
    }
    return out;
  }

  /** POST /{page-id}/subscribed_apps?subscribed_fields=messages with the Page token. */
  private async subscribePage(graph: string, pageId: string, pageToken: string): Promise<{ ok: boolean; error: string | null }> {
    try {
      const response = await axios.post(`${graph}/${pageId}/subscribed_apps`, {}, {
        params: { subscribed_fields: 'messages', access_token: pageToken }, timeout: 15000,
      });
      return response.data?.success === true ? { ok: true, error: null } : { ok: false, error: 'Meta did not confirm the subscription.' };
    } catch (error) {
      return { ok: false, error: (metaError(error) || 'Meta refused the message subscription.').slice(0, 300) };
    }
  }

  async businessIdForCallbackState(state: string): Promise<number | null> {
    if (!state || state.length > 256) return null;
    const row = await this.states.findOne({
      where: { stateHash: this.hash(state) },
      select: { businessId: true },
    });
    return row?.businessId ?? null;
  }

  private requiredConfig(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) throw new ServiceUnavailableException(`${key} is not configured.`);
    return value;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
