/**
 * posTeam.js — the business a cashier sells for on this device (owner approved 2026-11-03:
 * "a cashier invited ... can access the POS"). Set when she opens "POS ya X" in Kazi or right after
 * accepting the invitation, so the installed KenteXa POS (/pos) opens that business's till.
 */
const KEY = 'kx_pos_team';
export const savePosTeam = (team) => {
  try {
    if (team && team.sellerId) localStorage.setItem(KEY, JSON.stringify({
      sellerId: Number(team.sellerId), commerceProfileId: team.commerceProfileId ? Number(team.commerceProfileId) : null, businessName: team.businessName || '',
    }));
  } catch { /* private mode */ }
};
export const loadPosTeam = () => {
  try { const t = JSON.parse(localStorage.getItem(KEY) || 'null'); return t && t.sellerId ? t : null; } catch { return null; }
};
export const clearPosTeam = () => { try { localStorage.removeItem(KEY); } catch { /* private mode */ } };
/** Accounts that have a till of their own open their own POS; anyone else opens the business they work for. */
export const OWN_TILL_ROLES = ['seller', 'admin', 'manager', 'super_agent'];
