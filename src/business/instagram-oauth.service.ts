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
type MetaAccount = { id?: string; username?: string };

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
      const tokenResponse = await axios.get<MetaTokenResponse>(`${graph}/oauth/access_token`, {
        params: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code },
        timeout: 15000,
      });
      const token = tokenResponse.data?.access_token;
      if (!token) throw new Error('Meta did not return an access token.');

      const [permissionResponse, accountResponse] = await Promise.all([
        axios.get(`${graph}/me/permissions`, { params: { access_token: token }, timeout: 15000 }),
        axios.get(`${graph}/me/assigned_instagram_accounts`, {
          params: { fields: 'id,username', access_token: token }, timeout: 15000,
        }),
      ]);

      const permissions: Array<{ permission?: string; status?: string }> = permissionResponse.data?.data || [];
      const hasMessaging = permissions.some(p =>
        p.permission === 'instagram_manage_messages' && p.status === 'granted',
      );
      if (!hasMessaging) {
        throw new BadRequestException('Instagram messaging permission was not granted. Check the Meta login configuration and reconnect.');
      }

      const accounts: MetaAccount[] = accountResponse.data?.data || [];
      const validAccounts = accounts.filter(a => /^\d{1,128}$/.test(String(a.id || '')) && typeof a.username === 'string' && a.username.trim());
      if (!validAccounts.length) {
        throw new BadRequestException('No Instagram professional accounts were shared with this integration. Check the selected business portfolio and account permissions.');
      }

      const encrypted = this.crypto.encrypt(token);
      const expiresAt = Number(tokenResponse.data.expires_in) > 0
        ? new Date(Date.now() + Number(tokenResponse.data.expires_in) * 1000)
        : null;
      const connected: Array<{ id: number; username: string; webhookSubscribed: boolean }> = [];

      for (const account of validAccounts) {
        const instagramUserId = String(account.id);
        let connection = await this.connections.findOne({ where: { businessId, instagramUserId } });
        if (!connection) {
          connection = this.connections.create({
            businessId,
            instagramUserId,
            instagramUsername: String(account.username || '').trim().replace(/^@/, ''),
            accessTokenEncrypted: encrypted,
            tokenExpiresAt: expiresAt,
            grantedScopes: permissions.filter(p => p.status === 'granted').map(p => p.permission!).filter(Boolean),
            status: InstagramBusinessConnectionStatus.ACTIVE,
            connectedByUserId: userId,
            connectedAt: now,
            lastVerifiedAt: now,
          });
        } else {
          connection.instagramUsername = String(account.username || '').trim().replace(/^@/, '');
          connection.accessTokenEncrypted = encrypted;
          connection.tokenExpiresAt = expiresAt;
          connection.grantedScopes = permissions.filter(p => p.status === 'granted').map(p => p.permission!).filter(Boolean);
          connection.status = InstagramBusinessConnectionStatus.ACTIVE;
          connection.connectedByUserId = userId;
          connection.connectedAt = now;
          connection.lastVerifiedAt = now;
        }
        const saved = await this.connections.save(connection);
        let webhookSubscribed = false;
        try {
          await axios.post(
            `${graph}/${instagramUserId}/subscribed_apps`,
            {},
            { params: { subscribed_fields: 'messages', access_token: token }, timeout: 15000 },
          );
          webhookSubscribed = true;
        } catch {
          // Account connection remains valid, but inbound DMs will not arrive
          // until the app-level webhook is configured and subscription succeeds.
          this.logger.warn(`Instagram webhook subscription is pending for connection ${saved.id}.`);
        }
        await this.connections.update(saved.id, { webhookSubscribed });
        connected.push({ id: saved.id, username: saved.instagramUsername, webhookSubscribed });
      }

      return { connected, businessId };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.error('Instagram OAuth exchange or account discovery failed.');
      throw new ServiceUnavailableException('Meta could not complete the Instagram connection. Please retry the connection flow.');
    }
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
