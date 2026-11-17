import { createHmac } from 'crypto';

/**
 * Ingia kwa Google / Facebook (owner 2026-11-17). The browser gets a token from Google (an ID
 * token) or Facebook (an access token); the server asks Google / Facebook itself whether it is
 * real and meant for KenteXa, and never trusts a name or email the browser sends.
 *
 * Keys live only in Render (backend):
 *   GOOGLE_CLIENT_ID      the Web client id from Google Cloud (comma-separated if more than one)
 *   FACEBOOK_APP_ID       the Facebook app id
 *   FACEBOOK_APP_SECRET   the Facebook app secret (never sent to the browser)
 * A provider without its keys is simply not shown.
 */
export type SocialProvider = 'google' | 'facebook';

export interface SocialProfile {
  provider: SocialProvider;
  sub: string;
  email: string | null;
  /** Only Google's verified email may sign straight into an existing account with that email. */
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

export const SOCIAL_TEXT = {
  off: 'Kuingia kwa njia hii bado hakujawashwa.',
  bad: 'Imeshindikana kuthibitisha akaunti yako. Jaribu tena.',
  ticket: 'Muda umeisha. Anza tena kuingia.',
  phone: 'Weka namba sahihi ya simu (mf. 0712345678).',
  otherLink: 'Akaunti hii ya KenteXa tayari imeunganishwa na akaunti nyingine ya {p}.',
  linkedElsewhere: 'Akaunti hii ya {p} tayari imeunganishwa na akaunti nyingine ya KenteXa.',
} as const;

export const providerName = (p: SocialProvider) => (p === 'google' ? 'Google' : 'Facebook');

export function socialConfig(env: NodeJS.ProcessEnv = process.env) {
  const google = String(env.GOOGLE_CLIENT_ID || '').split(',').map((s) => s.trim()).filter(Boolean);
  const fbId = String(env.FACEBOOK_APP_ID || '').trim();
  const fbSecret = String(env.FACEBOOK_APP_SECRET || '').trim();
  return {
    google: google[0] || null,
    googleAll: google,
    facebook: fbId && fbSecret ? fbId : null,
    facebookSecret: fbId && fbSecret ? fbSecret : null,
  };
}

type Fetch = (url: string) => Promise<{ ok: boolean; json: () => Promise<any> }>;
const defaultFetch: Fetch = (url) => (globalThis as any).fetch(url, { signal: AbortSignal.timeout(8000) });

/** Google: the ID token must be signed by Google, unexpired, and issued to our client id. */
export async function verifyGoogle(idToken: string, env = process.env, fetchFn: Fetch = defaultFetch): Promise<SocialProfile | null> {
  const cfg = socialConfig(env);
  if (!cfg.googleAll.length || !idToken || idToken.length > 4096) return null;
  const res = await fetchFn(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`).catch(() => null);
  if (!res?.ok) return null;
  const t = await res.json().catch(() => null);
  if (!t?.sub || !cfg.googleAll.includes(String(t.aud))) return null;
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(String(t.iss))) return null;
  if (Number(t.exp) * 1000 < Date.now()) return null;
  const email = t.email ? String(t.email).toLowerCase().trim() : null;
  return {
    provider: 'google', sub: String(t.sub), email,
    emailVerified: Boolean(email) && (t.email_verified === true || t.email_verified === 'true'),
    name: t.name ? String(t.name).slice(0, 100) : null,
    picture: t.picture ? String(t.picture).slice(0, 500) : null,
  };
}

/** Facebook: the access token must belong to our app; then the profile is read with it. */
export async function verifyFacebook(accessToken: string, env = process.env, fetchFn: Fetch = defaultFetch): Promise<SocialProfile | null> {
  const cfg = socialConfig(env);
  if (!cfg.facebook || !cfg.facebookSecret || !accessToken || accessToken.length > 4096) return null;
  const appToken = `${cfg.facebook}|${cfg.facebookSecret}`;
  const dbg = await fetchFn(`https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(appToken)}`).catch(() => null);
  if (!dbg?.ok) return null;
  const d = (await dbg.json().catch(() => null))?.data;
  if (!d?.is_valid || String(d.app_id) !== cfg.facebook || !d.user_id) return null;
  const proof = createHmac('sha256', cfg.facebookSecret).update(accessToken).digest('hex');
  const me = await fetchFn(`https://graph.facebook.com/v19.0/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(accessToken)}&appsecret_proof=${proof}`).catch(() => null);
  if (!me?.ok) return null;
  const p = await me.json().catch(() => null);
  if (!p?.id || String(p.id) !== String(d.user_id)) return null;
  return {
    provider: 'facebook', sub: String(p.id),
    email: p.email ? String(p.email).toLowerCase().trim() : null,
    emailVerified: false, // a Facebook email never signs straight into an existing account: the phone code does
    name: p.name ? String(p.name).slice(0, 100) : null,
    picture: p.picture?.data?.url && !p.picture.data.is_silhouette ? String(p.picture.data.url).slice(0, 500) : null,
  };
}
