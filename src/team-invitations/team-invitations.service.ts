/**
 * team-invitations.service.ts — invite a person to work for a business (owner approved 2026-11-03).
 *   create      owner/manager (canManageTeam on the profile) invites by name + phone + role; a person
 *               who already has KenteXa gets an in-app notification; for anyone the owner gets a link
 *               to send from their own WhatsApp or SMS (never a KenteXa SMS).
 *   preview     anyone holding the link sees the business, the role and a masked number.
 *   respond     the invited person, signed in with THAT number, taps Kubali or Kataa. Kubali joins the
 *               profile team (commerce_profile_member, what Timu lists) AND the seller team
 *               (business_team_member, what the POS and every seller tool check). The owner is told.
 *   workplaces  the businesses a person works for, with their permissions (Kazi shows "POS ya X").
 * Nobody joins a team without saying yes; the raw events stay in their own rows (status, respondedAt).
 */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { cleanPermissions, invitePhone, inviteLink, inviteMessage, maskPhone, roleLabel, samePhone } from './team-invitation-rules';

const ROLES = new Set(['sales', 'customer_support', 'inventory', 'delivery']);
const frontend = () => (process.env.FRONTEND_URL || 'https://kentexa.com').replace(/\/+$/, '');

@Injectable()
export class TeamInvitationsService {
  private readyAt = 0;
  private ready = false;

  constructor(private readonly db: DataSource, private readonly notify: InAppNotificationService) {}

  async tableReady(): Promise<boolean> {
    if (this.ready || Date.now() - this.readyAt < 60000) return this.ready;
    this.readyAt = Date.now();
    const [r] = await this.db.query(`SELECT to_regclass('public.team_invitation') IS NOT NULL AS ok`);
    this.ready = Boolean(r?.ok);
    return this.ready;
  }

  private async mustBeReady() {
    if (!(await this.tableReady())) throw new BadRequestException('Mialiko bado haijawashwa. Jaribu tena baadaye.');
  }

  private shape(row: any, businessName?: string) {
    const link = inviteLink(frontend(), row.token);
    return {
      id: row.id, name: row.name, phone: row.phone, role: row.role, roleLabel: roleLabel(row.role),
      permissions: row.permissions || {}, status: row.status, createdAt: row.createdAt, respondedAt: row.respondedAt,
      link, message: inviteMessage(row.name, businessName || '', row.role, link),
    };
  }

  private async profile(profileId: number) {
    const [p] = await this.db.query(`SELECT id, "ownerId", "displayName" FROM public.commerce_profile WHERE id = $1::int`, [profileId]);
    if (!p) throw new NotFoundException('Biashara haijapatikana.');
    return p;
  }

  async create(profileId: number, actor: { id: number; name?: string }, dto: any) {
    await this.mustBeReady();
    const name = String(dto?.name || '').trim().slice(0, 120);
    const phone = invitePhone(dto?.phone);
    const role = ROLES.has(dto?.role) ? dto.role : 'sales';
    if (!name) throw new BadRequestException('Andika jina la mfanyakazi.');
    if (!phone) throw new BadRequestException('Andika namba sahihi ya simu (mfano 0712 345 678).');
    const p = await this.profile(profileId);
    const [owner] = await this.db.query(`SELECT phone FROM public."user" WHERE id = $1::int`, [p.ownerId]);
    if (samePhone(owner?.phone, phone)) throw new BadRequestException('Huwezi kujialika mwenyewe.');
    const [user] = await this.db.query(`SELECT id, name FROM public."user" WHERE phone = $1::varchar`, [phone]);
    if (user) {
      const [member] = await this.db.query(`SELECT 1 AS ok FROM public.commerce_profile_member
        WHERE "commerceProfileId" = $1::int AND "userId" = $2::int AND "isActive" = true`, [profileId, user.id]);
      if (member?.ok) throw new BadRequestException(`${user.name || name} tayari yuko kwenye timu.`);
    }
    const permissions = JSON.stringify(cleanPermissions(dto?.permissions));
    const [pending] = await this.db.query(`SELECT id FROM public.team_invitation WHERE "commerceProfileId" = $1::int AND phone = $2::varchar AND status = 'pending'`, [profileId, phone]);
    let row: any;
    if (pending) {
      [row] = await this.db.query(`UPDATE public.team_invitation SET name = $2::varchar, role = $3::varchar, permissions = $4::jsonb,
        "invitedByUserId" = $5::int, "updatedAt" = now() WHERE id = $1::int RETURNING *`, [pending.id, name, role, permissions, actor.id]);
    } else {
      [row] = await this.db.query(`INSERT INTO public.team_invitation ("commerceProfileId", "sellerId", "invitedByUserId", name, phone, role, permissions, token)
        VALUES ($1::int, $2::int, $3::int, $4::varchar, $5::varchar, $6::varchar, $7::jsonb, $8::varchar) RETURNING *`,
        [profileId, p.ownerId, actor.id, name, phone, role, permissions, randomBytes(18).toString('base64url')]);
    }
    if (user) {
      await this.notify.notify({
        userId: user.id, type: 'team_invite', icon: '',
        title: `Mwaliko wa kazi: ${p.displayName}`,
        body: `${p.displayName} imekualika kuwa ${roleLabel(role)}. Fungua ukubali au ukatae.`,
        actionPage: 'TeamInvite', actionParam: row.token, sourceType: 'team_invitation', sourceId: row.id,
      }).catch(() => null);
    }
    return { ...this.shape(row, p.displayName), hasAccount: Boolean(user) };
  }

  async forProfile(profileId: number) {
    if (!(await this.tableReady())) return [];
    const p = await this.profile(profileId);
    const rows = await this.db.query(`SELECT * FROM public.team_invitation WHERE "commerceProfileId" = $1::int AND status = 'pending' ORDER BY "createdAt" DESC`, [profileId]);
    return rows.map((r: any) => this.shape(r, p.displayName));
  }

  async cancel(profileId: number, id: number) {
    await this.mustBeReady();
    const [r] = await this.db.query(`UPDATE public.team_invitation SET status = 'cancelled', "respondedAt" = now(), "updatedAt" = now()
      WHERE id = $1::int AND "commerceProfileId" = $2::int AND status = 'pending' RETURNING id`, [id, profileId]);
    if (!r) throw new NotFoundException('Mwaliko haujapatikana.');
    return { ok: true };
  }

  private async byToken(token: string) {
    const t = String(token || '');
    if (!/^[A-Za-z0-9_-]{16,48}$/.test(t)) throw new NotFoundException('Mwaliko haujapatikana.');
    const [row] = await this.db.query(`SELECT i.*, cp."displayName" AS "businessName", cp."ownerId"
      FROM public.team_invitation i JOIN public.commerce_profile cp ON cp.id = i."commerceProfileId" WHERE i.token = $1::varchar`, [t]);
    if (!row) throw new NotFoundException('Mwaliko haujapatikana.');
    return row;
  }

  /** What the link shows to whoever opens it: never the full number. */
  async preview(token: string) {
    await this.mustBeReady();
    const row = await this.byToken(token);
    return { businessName: row.businessName, commerceProfileId: row.commerceProfileId, name: row.name, role: row.role,
      roleLabel: roleLabel(row.role), status: row.status, phoneMasked: maskPhone(row.phone), token: row.token,
      pos: Boolean(row.permissions?.canOperatePOS) };
  }

  async mine(user: { id: number; phone?: string | null }) {
    if (!(await this.tableReady())) return [];
    const phone = invitePhone(user.phone);
    const rows = await this.db.query(`SELECT i.token, i.name, i.role, i."createdAt", cp."displayName" AS "businessName"
      FROM public.team_invitation i JOIN public.commerce_profile cp ON cp.id = i."commerceProfileId"
      WHERE i.status = 'pending' AND (i.phone = $1::varchar OR i."userId" = $2::int) ORDER BY i."createdAt" DESC`, [phone || '-', user.id]);
    return rows.map((r: any) => ({ ...r, roleLabel: roleLabel(r.role) }));
  }

  async respond(token: string, user: { id: number; name?: string; phone?: string | null }, accept: boolean) {
    await this.mustBeReady();
    const row = await this.byToken(token);
    if (row.status !== 'pending') throw new BadRequestException(row.status === 'accepted' ? 'Mwaliko huu umeshakubaliwa.' : 'Mwaliko huu haupo tena.');
    if (!samePhone(user.phone, row.phone)) {
      throw new ForbiddenException(`Mwaliko huu ni wa namba ${maskPhone(row.phone)}. Ingia kwa akaunti ya namba hiyo.`);
    }
    if (Number(row.ownerId) === Number(user.id)) throw new BadRequestException('Huwezi kujialika mwenyewe.');
    await this.db.transaction(async (m) => {
      const [locked] = await m.query(`SELECT status FROM public.team_invitation WHERE id = $1::int FOR UPDATE`, [row.id]);
      if (locked?.status !== 'pending') throw new BadRequestException('Mwaliko huu haupo tena.');
      await m.query(`UPDATE public.team_invitation SET status = $2::varchar, "userId" = $3::int, "respondedAt" = now(), "updatedAt" = now() WHERE id = $1::int`,
        [row.id, accept ? 'accepted' : 'declined', user.id]);
      if (!accept) return;
      const perms = JSON.stringify(row.permissions || {});
      const [cpm] = await m.query(`UPDATE public.commerce_profile_member SET role = $3::varchar, permissions = $4::jsonb, "isActive" = true
        WHERE "commerceProfileId" = $1::int AND "userId" = $2::int RETURNING id`, [row.commerceProfileId, user.id, row.role, perms]);
      if (!cpm) {
        await m.query(`INSERT INTO public.commerce_profile_member ("commerceProfileId", "userId", role, permissions, "isActive")
          VALUES ($1::int, $2::int, $3::varchar, $4::jsonb, true)`, [row.commerceProfileId, user.id, row.role, perms]);
      }
      const [btm] = await m.query(`UPDATE public.business_team_member SET role = $3::varchar, permissions = $4::jsonb, "isActive" = true,
        "joinedAt" = COALESCE("joinedAt", now()), "updatedAt" = now() WHERE seller_id = $1::int AND user_id = $2::int RETURNING id`,
        [row.ownerId, user.id, row.role, perms]);
      if (!btm) {
        await m.query(`INSERT INTO public.business_team_member (seller_id, user_id, role, permissions, "isActive", "joinedAt", "createdAt", "updatedAt")
          VALUES ($1::int, $2::int, $3::varchar, $4::jsonb, true, now(), now(), now())`, [row.ownerId, user.id, row.role, perms]);
      }
    });
    const who = user.name || row.name;
    await this.notify.notify({
      userId: Number(row.invitedByUserId), type: 'team_invite_answer', icon: '',
      title: accept ? `${who} amejiunga na timu` : `${who} amekataa mwaliko`,
      body: accept ? `${who} sasa ni ${roleLabel(row.role)} wa ${row.businessName}.` : `${who} hakukubali kuwa ${roleLabel(row.role)} wa ${row.businessName}.`,
      actionPage: 'SellerTeam', sourceType: 'team_invitation', sourceId: row.id,
    }).catch(() => null);
    return { status: accept ? 'accepted' : 'declined', businessName: row.businessName, commerceProfileId: row.commerceProfileId };
  }

  /** The businesses this person works for (active seller-team rows), with the profile to open them in. */
  async workplaces(userId: number) {
    const rows = await this.db.query(`
      SELECT t.seller_id AS "sellerId", t.role, t.permissions, cp.id AS "commerceProfileId", cp."displayName" AS "businessName"
        FROM public.business_team_member t
        LEFT JOIN LATERAL (
          SELECT p.id, p."displayName" FROM public.commerce_profile p
           WHERE p."ownerId" = t.seller_id
           -- The till sells the profile that holds the shop's products (the owner may have invited from
           -- another profile of theirs), then the one she was invited to (owner 2026-11-03).
           -- Counted like the till's own product filter: stamped to this profile, or unstamped when this is
           -- one of the account's original profiles (legacy-rows.ts LEGACY_ROWS_FOR).
           ORDER BY (SELECT count(*) FROM public.product pr WHERE pr."sellerId" = t.seller_id AND pr."isActive" = true
               AND (pr."commerceProfileId" = p.id OR (pr."commerceProfileId" IS NULL AND NOT (p.type::text = 'business' AND EXISTS (
                 SELECT 1 FROM public.commerce_profile o WHERE o."ownerId" = p."ownerId" AND o.type::text = 'business' AND o.id < p.id))))) DESC,
             EXISTS (SELECT 1 FROM public.commerce_profile_member m WHERE m."commerceProfileId" = p.id AND m."userId" = t.user_id AND m."isActive" = true) DESC, p.id
           LIMIT 1) cp ON true
       WHERE t.user_id = $1::int AND t."isActive" = true AND t.seller_id <> $1::int
       ORDER BY t."joinedAt" DESC NULLS LAST`, [userId]);
    return rows.map((r: any) => ({ ...r, roleLabel: roleLabel(r.role), permissions: r.permissions || {} }));
  }
}
