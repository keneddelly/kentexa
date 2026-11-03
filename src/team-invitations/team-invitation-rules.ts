/**
 * Team invitations (owner approved 2026-11-03): pure rules, kept apart so they can be tested alone.
 */
import { normalizeTzPhone } from '../common/utils/phone.util';

export const TEAM_ROLE_LABEL: Record<string, string> = {
  sales: 'mhudumu wa mauzo',
  customer_support: 'huduma kwa wateja',
  inventory: 'msimamizi wa stoo',
  delivery: 'msafirishaji',
};
export const roleLabel = (role: string | null | undefined) => TEAM_ROLE_LABEL[String(role || '')] || 'mfanyakazi';

/** A Tanzanian mobile number in the stored form 255XXXXXXXXX, or null. */
export function invitePhone(raw: unknown): string | null {
  const p = normalizeTzPhone(String(raw ?? ''));
  return /^255[67]\d{8}$/.test(p) ? p : null;
}

/** 255712345678 -> "07•• ••• 678" (what an invitation preview may show to anyone holding the link). */
export function maskPhone(p: string | null | undefined): string {
  const d = String(p || '');
  if (d.length < 6) return '';
  return `0${d.slice(3, 4)}•• ••• ${d.slice(-3)}`;
}

/** The person accepting must be signed in with the number the owner typed. */
export const samePhone = (a: unknown, b: unknown) => {
  const x = invitePhone(a);
  return Boolean(x) && x === invitePhone(b);
};

export const PERMISSION_KEYS = ['canViewOrders', 'canCreateOrders', 'canViewCustomers', 'canSendMessages', 'canViewRevenue',
  'canManageProducts', 'canManageTeam', 'canOperatePOS', 'canManageInventory'] as const;

/** Only the known permission switches, as booleans (never anything else from the request body). */
export function cleanPermissions(raw: unknown): Record<string, boolean> {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Record<string, boolean> = {};
  for (const k of PERMISSION_KEYS) if (src[k] === true) out[k] = true;
  return out;
}

export const inviteLink = (base: string, token: string) => `${base.replace(/\/+$/, '')}/?teamInvite=${encodeURIComponent(token)}`;

/** The message the owner sends from their own WhatsApp or SMS. */
export const inviteMessage = (name: string, businessName: string, role: string, link: string) =>
  `Habari ${String(name || '').trim().split(/\s+/)[0] || ''}, ${businessName} imekualika kuwa ${roleLabel(role)} kwenye KenteXa. Fungua ukubali: ${link}`.replace(/\s+,/, ',');
