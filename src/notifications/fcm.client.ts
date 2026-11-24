/**
 * FcmClient — sends native pushes through Firebase Cloud Messaging HTTP v1.
 *
 * Uses the service account JSON in FIREBASE_SERVICE_ACCOUNT_JSON. No extra
 * package: the OAuth token is a signed JWT made with Node's crypto module.
 * Never logs tokens, keys or the raw service account.
 */
import { createSign } from 'crypto';

export interface FcmPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface FcmResult {
  ok: boolean;
  /** The device token is dead (app uninstalled or token rotated) and should be deleted. */
  invalidToken: boolean;
}

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const KENTEXA_ANDROID_CHANNEL = 'kentexa_updates';

export class FcmClient {
  private account: ServiceAccount | null = null;
  private cachedAccessToken: { value: string; expiresAt: number } | null = null;

  constructor(serviceAccountJson?: string | null) {
    if (!serviceAccountJson) return;
    try {
      const parsed = JSON.parse(serviceAccountJson);
      if (parsed?.project_id && parsed?.client_email && parsed?.private_key) {
        this.account = parsed as ServiceAccount;
      }
    } catch {
      /* invalid JSON — native push stays disabled */
    }
  }

  get configured(): boolean {
    return this.account !== null;
  }

  async send(token: string, payload: FcmPayload): Promise<FcmResult> {
    if (!this.account) return { ok: false, invalidToken: false };
    const accessToken = await this.getAccessToken();
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${this.account.project_id}/messages:send`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: payload.title, body: payload.body },
            data: payload.data || {},
            android: {
              priority: 'HIGH',
              notification: {
                channel_id: KENTEXA_ANDROID_CHANNEL,
                sound: 'kentexa_signature_tone',
              },
            },
          },
        }),
      },
    );
    if (res.ok) return { ok: true, invalidToken: false };
    // 404 UNREGISTERED means the token is gone for good.
    const text = await res.text().catch(() => '');
    const invalidToken = res.status === 404 || text.includes('"UNREGISTERED"');
    return { ok: false, invalidToken };
  }

  private async getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedAccessToken && this.cachedAccessToken.expiresAt - 60 > now) {
      return this.cachedAccessToken.value;
    }
    const account = this.account!;
    const header = base64Url({ alg: 'RS256', typ: 'JWT' });
    const claims = base64Url({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 });
    const unsigned = `${header}.${claims}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url');
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${signature}`,
      }),
    });
    if (!res.ok) throw new Error(`FCM auth failed (status ${res.status})`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.cachedAccessToken = { value: json.access_token, expiresAt: now + (json.expires_in || 3600) };
    return json.access_token;
  }
}

function base64Url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
