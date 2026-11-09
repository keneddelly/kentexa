import { UserRole } from '../users/entities/user.entity';

/**
 * KenteXa staff areas (owner 2026-11-09: "create role for manager / customer care and etc ...
 * make KenteXa look like a professional company"; owner chose Manager, Customer care, Finance,
 * Moderator). Admin stays the top role with every right. For a route that requires ADMIN, a staff
 * role is let in only when its area allows the method and route below:
 *
 *   manager        everything, except KenteXa fees and adding / removing staff
 *   customer_care  sees everything except money pages; answers customer messages and disputes
 *   finance        sees everything; changes money only (payments, payouts, invoices, fees, earnings)
 *   moderator      sees everything except money pages; checks content, IDs, sellers, businesses
 *
 * Routes are matched without the leading slash, on the route pattern (e.g. seller/:id/approve).
 * Every staff action is recorded with the person and role by the action recorder.
 */
export const STAFF_USER_ROLES: ReadonlySet<string> = new Set([UserRole.MANAGER, UserRole.CUSTOMER_CARE, UserRole.FINANCE, UserRole.MODERATOR]);

const MONEY = /^(payments|payouts|wallet|kentexa-fee|invoices\/admin|super-agent-settlement|super-agent-commission|money-routing)(\/|$)|^admin-intelligence\/finance|^super-agents\/admin\/(courier-cost|sellers\/[^/]+\/(billing-payment|grant-free-orders))|^agents\/[^/]+\/release-earnings|^agents\/admin\/pending-earnings/;
const STAFF_ADMIN = /^admin\/staff(\/|$)/;
// Users' inbox chats (owner 2026-11-09: admin reads all chats): not for finance.
const CHATS = /^activity\/admin\/chats(\/|$)/;

interface Area { read: (r: string) => boolean; write: (r: string) => boolean }
const AREAS: Record<string, Area> = {
  [UserRole.MANAGER]: {
    read: (r) => !STAFF_ADMIN.test(r),
    write: (r) => !STAFF_ADMIN.test(r) && !/^kentexa-fee(\/|$)/.test(r),
  },
  [UserRole.CUSTOMER_CARE]: {
    read: (r) => !MONEY.test(r) && !STAFF_ADMIN.test(r),
    write: (r) => /^(contact|disputes)(\/|$)/.test(r),
  },
  [UserRole.FINANCE]: {
    read: (r) => !STAFF_ADMIN.test(r) && !CHATS.test(r),
    write: (r) => MONEY.test(r) || /^invoices(\/|$)/.test(r),
  },
  [UserRole.MODERATOR]: {
    read: (r) => !MONEY.test(r) && !STAFF_ADMIN.test(r),
    write: (r) => /^(admin-intelligence\/reports|identity|seller|admin\/business-capability-applications|classifieds|products|official-products|services|feed|communities|brands|brand-authorizations|warranty|commerce-profiles)(\/|$)/.test(r),
  },
};

export function staffMayUse(role: string, method: string, route: string): boolean {
  const area = AREAS[role];
  if (!area) return false;
  const r = String(route || '').replace(/^\/+/, '');
  return String(method).toUpperCase() === 'GET' ? area.read(r) : area.write(r);
}
