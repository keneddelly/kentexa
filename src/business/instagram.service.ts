import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  HttpException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { InstagramBusinessConnection } from './entities/instagram-business-connection.entity';

const GRAPH_VERSION = 'v26.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const REQUIRED_SCOPES = [
  'instagram_basic',
  'instagram_manage_messages',
  'instagram_manage_comments',
  'instagram_content_publish',
];

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);

  constructor(
    @InjectRepository(InstagramBusinessConnection)
    private readonly connections: Repository<InstagramBusinessConnection>,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  async createAuthorizationUrl(sellerId: number): Promise<{ authorizationUrl: string }> {
    const appId = this.requiredConfig('META_APP_ID');
    const configId = this.requiredConfig('META_INSTAGRAM_CONFIG_ID');
    const redirectUri = this.requiredConfig('META_INSTAGRAM_REDIRECT_URI');

    const state = await this.jwt.signAsync(
      { purpose: 'kentexa-instagram-oauth', sellerId },
      { expiresIn: '10m' },
    );

    const url = new URL('https://www.facebook.com/dialog/oauth');
    url.searchParams.set('client_id', appId);
    url.searchParams.set('config_id', configId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('override_default_response_type', 'true');
    url.searchParams.set('prompt', 'login');
    url.searchParams.set('state', state);

    return { authorizationUrl: url.toString() };
  }

  async completeAuthorization(code: string, state: string) {
    if (!code || !state) throw new BadRequestException('Missing Instagram OAuth code or state');

    let payload: { purpose?: string; sellerId?: number };
    try {
      payload = await this.jwt.verifyAsync(state);
    } catch {
      throw new UnauthorizedException('Instagram connection session expired. Please try again.');
    }
    if (payload.purpose !== 'kentexa-instagram-oauth' || !Number.isInteger(payload.sellerId)) {
      throw new UnauthorizedException('Invalid Instagram connection state');
    }

    const appId = this.requiredConfig('META_APP_ID');
    const appSecret = this.requiredConfig('META_APP_SECRET');
    const redirectUri = this.requiredConfig('META_INSTAGRAM_REDIRECT_URI');

    let tokenResponse: any;
    try {
      const response = await axios.get(`${GRAPH_BASE}/oauth/access_token`, {
        params: { client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code },
        timeout: 15000,
      });
      tokenResponse = response.data;
    } catch (error) {
      this.logger.error(`Instagram OAuth code exchange failed: ${error.response?.data?.error?.message || error.message}`);
      throw new BadRequestException('Meta could not authorize this Instagram connection. Please try again.');
    }

    const accessToken = tokenResponse?.access_token;
    if (!accessToken) throw new BadRequestException('Meta did not return an access token');

    try {
      const [businessResponse, accountsResponse] = await Promise.all([
        axios.get(`${GRAPH_BASE}/me`, {
          params: { fields: 'client_business_id', access_token: accessToken },
          timeout: 15000,
        }),
        axios.get(`${GRAPH_BASE}/me/assigned_instagram_accounts`, {
          params: { fields: 'id,username', access_token: accessToken },
          timeout: 15000,
        }),
      ]);

      const businessId = businessResponse.data?.client_business_id || null;
      const accounts = accountsResponse.data?.data || [];
      if (!accounts.length) {
        throw new BadRequestException(
          'No Instagram professional account was shared with Kentexa. Reconnect and select a Business or Creator account.',
        );
      }

      const encrypted = this.encryptToken(accessToken);
      const saved: InstagramBusinessConnection[] = [];
      for (const account of accounts) {
        if (!account?.id) continue;
        const existing = await this.connections.findOne({
          where: { instagramUserId: String(account.id) },
        });
        if (existing && existing.sellerId !== payload.sellerId) {
          throw new ConflictException('This Instagram account is already connected to another Kentexa account.');
        }

        const connection = existing || this.connections.create({
          sellerId: payload.sellerId,
          instagramUserId: String(account.id),
        });
        connection.businessId = businessId ? String(businessId) : null;
        connection.instagramUsername = account.username || null;
        connection.accessTokenEncrypted = encrypted;
        connection.tokenExpiresAt = null;
        connection.scopes = REQUIRED_SCOPES;
        connection.status = 'connected';
        connection.connectedAt = new Date();
        saved.push(await this.connections.save(connection));
      }

      if (!saved.length) throw new BadRequestException('Meta did not return a usable Instagram account.');
      return {
        success: true,
        connectedAccounts: saved.map((item) => ({
          instagramUserId: item.instagramUserId,
          username: item.instagramUsername,
          status: item.status,
        })),
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`Instagram account discovery failed: ${error.response?.data?.error?.message || error.message}`);
      throw new BadRequestException('Kentexa could not identify the Instagram account shared with Meta. Check the configuration and try again.');
    }
  }

  async getConnections(sellerId: number) {
    const rows = await this.connections.find({
      where: { sellerId, status: 'connected' },
      order: { connectedAt: 'DESC' },
    });
    return rows.map((row) => ({
      instagramUserId: row.instagramUserId,
      username: row.instagramUsername,
      status: row.status,
      connectedAt: row.connectedAt,
      lastSyncedAt: row.lastSyncedAt,
    }));
  }

  async disconnect(sellerId: number, instagramUserId?: string) {
    if (instagramUserId) {
      await this.connections.delete({ sellerId, instagramUserId });
    } else {
      await this.connections.delete({ sellerId });
    }
    return { success: true };
  }

  private requiredConfig(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) throw new InternalServerErrorException(`Server configuration is missing ${key}`);
    return value;
  }

  private encryptionKey(): Buffer {
    const raw = this.requiredConfig('INSTAGRAM_TOKEN_ENCRYPTION_KEY');
    const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new InternalServerErrorException('INSTAGRAM_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes');
    }
    return key;
  }

  private encryptToken(token: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
  }

  // Kept private until the messaging sender is wired in the next integration stage.
  private decryptToken(encrypted: string): string {
    const [version, iv, tag, ciphertext] = encrypted.split(':');
    if (version !== 'v1' || !iv || !tag || !ciphertext) {
      throw new InternalServerErrorException('Stored Instagram token has an unsupported format');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
