import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * KenteXa staff (owner 2026-11-09): the admin gives a person a staff role, and can pause it.
 * A staff role is an AccountRole on the person's own user profile (like admin and manager); the
 * person switches to it from their account and sees the admin with only their area
 * (auth/staff-access.ts). One role of each kind per person. Pausing sets the role 'suspended',
 * so their next request in that role is refused (RoleContextService checks the status).
 */
export const STAFF_ROLE_TYPES = ['manager', 'customer_care', 'finance', 'moderator'] as const;
export type StaffRoleType = (typeof STAFF_ROLE_TYPES)[number];

@Injectable()
export class StaffService {
  constructor(private readonly db: DataSource) {}

  async list() {
    return this.db.query(
      `SELECT ar.id, ar."userId", ar."roleType"::text AS "roleType", ar.status::text AS status, ar."approvedAt", ar."approvedByUserId",
              ar."suspendedAt", ar."createdAt", u.name, u.phone, u.email
         FROM public.account_role ar JOIN public."user" u ON u.id = ar."userId"
        WHERE ar."roleType"::text = ANY($1::text[]) ORDER BY ar."roleType", u.name`, [[...STAFF_ROLE_TYPES]]);
  }

  /** Find the person by phone (or user id) and give them the role; an existing one is re-opened. */
  async grant(input: { phone?: string; userId?: number; roleType?: string }, adminId: number) {
    const roleType = String(input.roleType || '') as StaffRoleType;
    if (!STAFF_ROLE_TYPES.includes(roleType)) throw new BadRequestException('Chagua kazi: manager, customer_care, finance au moderator');
    const digits = String(input.phone || '').replace(/\D/g, '');
    const last9 = digits.slice(-9);
    const [user] = input.userId
      ? await this.db.query(`SELECT id, name FROM public."user" WHERE id = $1`, [Number(input.userId)])
      : last9.length === 9
        ? await this.db.query(`SELECT id, name FROM public."user" WHERE right(regexp_replace(coalesce(phone, ''), '\\D', '', 'g'), 9) = $1 ORDER BY id LIMIT 1`, [last9])
        : [];
    if (!user) throw new NotFoundException('Hakuna akaunti ya KenteXa yenye namba hii. Mwambie ajisajili kwanza.');
    const [existing] = await this.db.query(
      `SELECT id, status::text AS status FROM public.account_role WHERE "userId" = $1 AND "roleType"::text = $2`, [user.id, roleType]);
    if (existing) {
      if (existing.status === 'active') throw new ConflictException(`${user.name || 'Mtu huyu'} tayari ana kazi hii.`);
      await this.db.query(
        `UPDATE public.account_role SET status = 'active', "approvedAt" = now(), "approvedByUserId" = $2, "suspendedAt" = NULL,
           "suspendedByUserId" = NULL, "statusReason" = NULL, "contextVersion" = "contextVersion" + 1, "updatedAt" = now() WHERE id = $1`,
        [existing.id, adminId]);
      return { id: existing.id, userId: user.id, roleType, status: 'active' };
    }
    const [row] = await this.db.query(
      `INSERT INTO public.account_role ("userId", "roleType", status, "profileType", "profileId", "approvedAt", "approvedByUserId", "statusReason")
       VALUES ($1, $2::public.account_role_type_enum, 'active', 'user', $1, now(), $3, 'staff role given by admin') RETURNING id`,
      [user.id, roleType, adminId]);
    return { id: row.id, userId: user.id, roleType, status: 'active' };
  }

  /** Pause (suspended) or re-open (active) one staff role. */
  async setStatus(accountRoleId: number, status: string, adminId: number) {
    if (status !== 'active' && status !== 'suspended') throw new BadRequestException('Hali: active au suspended');
    const [role] = await this.db.query(
      `SELECT id, "roleType"::text AS "roleType" FROM public.account_role WHERE id = $1`, [accountRoleId]);
    if (!role || !STAFF_ROLE_TYPES.includes(role.roleType)) throw new NotFoundException('Kazi ya mfanyakazi haipo');
    await this.db.query(
      `UPDATE public.account_role SET status = $2::public.account_role_status_enum,
         "suspendedAt" = CASE WHEN $2 = 'suspended' THEN now() ELSE NULL END,
         "suspendedByUserId" = CASE WHEN $2 = 'suspended' THEN $3::int ELSE NULL END,
         "contextVersion" = "contextVersion" + 1, "updatedAt" = now() WHERE id = $1`, [accountRoleId, status, adminId]);
    return { id: accountRoleId, status };
  }
}
