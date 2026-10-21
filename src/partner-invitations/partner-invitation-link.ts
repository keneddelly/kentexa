import * as crypto from 'crypto';

/**
 * Partner invitation links: ${FRONTEND_URL}/?partnerInvite=<token>, signed with a key
 * derived from JWT_SECRET under its own label (no new Render setting), the same scheme
 * as the seller checkout link. The token carries a random nonce and its expiry; the
 * database keeps only sha256(token), so a stored row can never be turned back into a link.
 *
 * The message goes out through the sender's own WhatsApp (wa.me, pre-filled) or their
 * own SMS app (sms: link). Nothing here sends anything, and KenteXa's SMS is never used.
 */

export const PARTNER_INVITE_LIFETIME_DAYS = 7;
const TOKEN_KEY_LABEL = 'kentexa-partner-invite-v1';

const b64url = (buf: Buffer) => buf.toString('base64url');
const tokenKey = (secret: string) => crypto.createHmac('sha256', secret).update(TOKEN_KEY_LABEL).digest();

export function partnerInviteExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + PARTNER_INVITE_LIFETIME_DAYS * 24 * 60 * 60 * 1000);
}

/** Throws if the secret is missing: a link must never be signed with an empty key. */
export function signPartnerInviteToken(expiresAt: Date, secret: string | undefined): string {
  if (!secret) throw new Error('JWT_SECRET is required to sign partner invitation links');
  const body = b64url(Buffer.from(JSON.stringify({ n: b64url(crypto.randomBytes(16)), e: Math.floor(expiresAt.getTime() / 1000) })));
  const sig = b64url(crypto.createHmac('sha256', tokenKey(secret)).update(body).digest());
  return `${body}.${sig}`;
}

export type PartnerInviteTokenCheck = 'valid' | 'expired' | 'invalid';

/** Never throws. 'expired' only for a genuine, correctly signed token past its expiry. */
export function checkPartnerInviteToken(
  token: string | null | undefined,
  secret: string | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): PartnerInviteTokenCheck {
  if (!secret || typeof token !== 'string' || token.length > 400) return 'invalid';
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return 'invalid';
  const expected = crypto.createHmac('sha256', tokenKey(secret)).update(parts[0]).digest();
  let given: Buffer;
  try { given = Buffer.from(parts[1], 'base64url'); } catch { return 'invalid'; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return 'invalid';
  let payload: { n?: unknown; e?: unknown };
  try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8')); } catch { return 'invalid'; }
  if (typeof payload?.n !== 'string' || !Number.isInteger(payload.e)) return 'invalid';
  return (payload.e as number) <= nowSeconds ? 'expired' : 'valid';
}

export const hashPartnerInviteToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export function partnerInviteLink(token: string, frontendUrl = process.env.FRONTEND_URL): string {
  const base = (frontendUrl || 'https://kentexa.com').replace(/\/+$/, '');
  return `${base}/?partnerInvite=${token}`;
}

export interface PartnerInviteMessageInput {
  invitedName?: string | null;
  officeName: string;
  officeCity?: string | null;
  waybillNumber: string;
  originCity?: string | null;
  destinationCity?: string | null;
  role: 'transport_provider' | 'super_agent';
  link: string;
}

/** Swahili first, built only from the inviting office's own records. */
export function buildPartnerInviteMessage(m: PartnerInviteMessageInput): string {
  const hello = m.invitedName ? `Habari ${m.invitedName},` : 'Habari,';
  const office = m.officeCity ? `${m.officeName} (${m.officeCity})` : m.officeName;
  const route = m.originCity && m.destinationCity ? ` ${m.originCity} → ${m.destinationCity}` : '';
  const as = m.role === 'super_agent' ? 'ofisi ya mizigo' : 'msafirishaji';
  return `${hello} ni ${office} kwenye KenteXa. Nina mzigo ${m.waybillNumber}${route}. `
    + `Jiunge nami KenteXa kama ${as} tufanye kazi pamoja: ${m.link} `
    + `(kiungo kinadumu siku ${PARTNER_INVITE_LIFETIME_DAYS}).`;
}

export const whatsappInviteUrl = (phone255: string, text: string) =>
  `https://wa.me/${phone255}?text=${encodeURIComponent(text)}`;

/** Opens the sender's own SMS app with the text filled in. */
export const ownSmsInviteUrl = (phone255: string, text: string) =>
  `sms:+${phone255}?body=${encodeURIComponent(text)}`;
