import {
  BadRequestException, ConflictException, ForbiddenException, GoneException, Injectable, Logger, NotFoundException,
  OnModuleInit, ServiceUnavailableException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import {
  checkPartnerInviteToken, hashPartnerInviteToken, ownSmsInviteUrl, partnerInviteExpiry,
  PARTNER_INVITE_LIFETIME_DAYS, signPartnerInviteToken, whatsappInviteUrl,
} from './partner-invitation-link';
import { refreshSellerPartnerTable, sellerPartnerFirstMinutes } from './seller-agent-partner-gate';
import { normalizeTzPhone } from '../common/utils/phone.util';
import { User } from '../users/entities/user.entity';

/**
 * Seller partner agents (owner 2026-10-22): a seller invites the person who delivers
 * for them to work with them on KenteXa as an agent.
 *
 * - The message goes from the seller's OWN WhatsApp or SMS app; KenteXa never sends it.
 * - The invited person applies and is approved as a normal agent. Nothing here approves
 *   anyone; the agent is never locked to the seller and can take any other job.
 * - Once accepted, the seller's own pickup jobs go to their partner agents first, for a
 *   few minutes (seller-agent-partner-gate.ts). Either side can end it at any time.
 */
export const SELLER_AGENT_MESSAGES = {
  badPhone: 'Weka namba sahihi ya simu (mf. 0712345678).',
  badChannel: 'Chagua WhatsApp au SMS yako.',
  invalidLink: 'Kiungo hiki si sahihi.',
  expiredLink: `Kiungo hiki kimekwisha muda (kinadumu siku ${PARTNER_INVITE_LIFETIME_DAYS}). Muombe muuzaji akutumie kingine.`,
  endedLink: 'Ushirikiano huu umesitishwa. Muombe muuzaji akutumie mwaliko mpya.',
  wrongPhone: 'Mwaliko huu ni kwa namba nyingine. Ingia kwa akaunti ya namba iliyoalikwa.',
  usedByAnother: 'Mwaliko huu tayari umetumiwa na akaunti nyingine.',
  notReady: 'Huduma hii bado haijawashwa. Jaribu tena baadaye.',
  notFound: 'Haupatikani.',
} as const;

const OPEN = ['sent', 'opened'];
const tz = (phone: unknown) => (typeof phone === 'string' && phone.trim() ? normalizeTzPhone(phone) : '');

export function sellerAgentInviteLink(token: string, frontendUrl = process.env.FRONTEND_URL): string {
  const base = (frontendUrl || 'https://kentexa.com').replace(/\/+$/, '');
  return `${base}/?agentInvite=${token}`;
}

/** Swahili, built only from the seller's own records. */
export function buildSellerAgentInviteMessage(m: { invitedName?: string | null; shopName: string; link: string }): string {
  const hello = m.invitedName ? `Habari ${m.invitedName},` : 'Habari,';
  return `${hello} ni ${m.shopName} kwenye KenteXa. Ningependa uwe wakala wetu wa kuchukua na kufikisha mizigo yetu. `
    + `Jiunge nasi hapa: ${m.link} (kiungo kinadumu siku ${PARTNER_INVITE_LIFETIME_DAYS}).`;
}

@Injectable()
export class SellerAgentPartnersService implements OnModuleInit {
  private readonly logger = new Logger(SellerAgentPartnersService.name);
  constructor(private readonly db: DataSource) {}

  /** The job queries only use the partner table once it exists (migration 1792400000000). */
  async onModuleInit() {
    const ready = await refreshSellerPartnerTable(this.db, true);
    this.logger.log(`Seller partner agents: ${ready ? 'on' : 'waiting for migration 1792400000000'}`);
  }

  @Cron('* * * * *')
  async recheckTable() {
    await refreshSellerPartnerTable(this.db, true);
  }

  private async ready() {
    if (!(await refreshSellerPartnerTable(this.db, true))) throw new ServiceUnavailableException(SELLER_AGENT_MESSAGES.notReady);
  }

  private async shopName(sellerUserId: number): Promise<string> {
    const rows: any[] = await this.db.query(`
      SELECT COALESCE(NULLIF(btrim(sp."businessName"), ''), NULLIF(btrim(u."storeName"), ''), u.name) AS name
        FROM public."user" u
        LEFT JOIN LATERAL (SELECT x."businessName" FROM public.seller_profile x
                            WHERE x."userId" = u.id ORDER BY x.id ASC LIMIT 1) sp ON true
       WHERE u.id = $1`, [sellerUserId]);
    return String(rows[0]?.name || 'Muuzaji').trim().slice(0, 80);
  }

  /** sent/opened past expiresAt become expired (no scheduled job needed). */
  private async expireDue(where: string, params: any[]) {
    await this.db.query(`UPDATE public.seller_agent_partner SET status = 'expired', "updatedAt" = now()
      WHERE status IN ('sent','opened') AND "expiresAt" <= now() AND ${where}`, params);
  }

  // ── Seller ────────────────────────────────────────────────────────────────
  async invite(sellerUserId: number, user: User, dto: { phone?: string; name?: string; channel?: string }) {
    await this.ready();
    const channel = String(dto?.channel || '');
    if (channel !== 'whatsapp' && channel !== 'sms') throw new BadRequestException(SELLER_AGENT_MESSAGES.badChannel);
    const phone = tz(dto?.phone);
    if (!/^255\d{9}$/.test(phone)) throw new BadRequestException(SELLER_AGENT_MESSAGES.badPhone);
    const invitedName = typeof dto?.name === 'string' && dto.name.trim() ? dto.name.trim().slice(0, 100) : null;

    const expiresAt = partnerInviteExpiry();
    const token = signPartnerInviteToken(expiresAt, process.env.JWT_SECRET);
    const rows: any[] = await this.db.query(`INSERT INTO public.seller_agent_partner
        ("sellerUserId", "invitedByUserId", "invitedPhone", "invitedName", channel, "tokenHash", status, "expiresAt")
      VALUES ($1, $2, $3, $4, $5, $6, 'sent', $7) RETURNING id`,
      [sellerUserId, user?.id ?? null, phone, invitedName, channel, hashPartnerInviteToken(token), expiresAt]);

    const link = sellerAgentInviteLink(token);
    const message = buildSellerAgentInviteMessage({ invitedName, shopName: await this.shopName(sellerUserId), link });
    return {
      id: Number(rows[0].id), link, message,
      whatsappUrl: whatsappInviteUrl(phone, message), smsUrl: ownSmsInviteUrl(phone, message),
    };
  }

  /** The seller's invitations and partner agents, newest first. */
  async listForSeller(sellerUserId: number) {
    await this.ready();
    await this.expireDue(`"sellerUserId" = $1`, [sellerUserId]);
    const rows: any[] = await this.db.query(`
      SELECT sap.id, sap."invitedPhone", sap."invitedName", sap.channel, sap.status, sap."expiresAt",
             sap."openedAt", sap."acceptedAt", sap."endedAt", sap."endedBy", sap."createdAt",
             a.status AS "agentStatus", a."fullName" AS "agentName", a.city AS "agentCity", a."isOnline" AS "agentOnline"
        FROM public.seller_agent_partner sap
        LEFT JOIN public.agent a ON a."userId" = sap."agentUserId"
       WHERE sap."sellerUserId" = $1
       ORDER BY (sap.status = 'accepted') DESC, sap."createdAt" DESC LIMIT 100`, [sellerUserId]);
    return {
      firstMinutes: sellerPartnerFirstMinutes(),
      items: rows.map((r) => ({
        id: r.id, invitedPhone: r.invitedPhone, invitedName: r.invitedName, channel: r.channel,
        status: r.status, expiresAt: r.expiresAt, openedAt: r.openedAt, acceptedAt: r.acceptedAt,
        endedAt: r.endedAt, endedBy: r.endedBy, createdAt: r.createdAt,
        // What the seller needs to know about the person, never more.
        agent: r.status === 'accepted' ? {
          status: r.agentStatus ?? 'not_applied', name: r.agentName ?? null, city: r.agentCity ?? null, online: !!r.agentOnline,
        } : null,
      })),
    };
  }

  /** Seller ends a partnership, or cancels an invitation not yet accepted. */
  async endBySeller(sellerUserId: number, id: number) {
    await this.ready();
    const rows: any[] = await this.db.query(`UPDATE public.seller_agent_partner
        SET status = CASE WHEN status = 'accepted' THEN 'ended' ELSE 'expired' END,
            "endedAt" = CASE WHEN status = 'accepted' THEN now() ELSE "endedAt" END,
            "endedBy" = CASE WHEN status = 'accepted' THEN 'seller' ELSE "endedBy" END,
            "updatedAt" = now()
      WHERE id = $1 AND "sellerUserId" = $2 AND status IN ('sent','opened','accepted') RETURNING id, status`,
      [id, sellerUserId]);
    if (!rows.length) throw new NotFoundException(SELLER_AGENT_MESSAGES.notFound);
    return { id: rows[0].id, status: rows[0].status };
  }

  // ── The invited person ────────────────────────────────────────────────────
  private async rowForToken(token: string) {
    await this.ready();
    const check = checkPartnerInviteToken(token, process.env.JWT_SECRET);
    if (check === 'invalid') throw new NotFoundException(SELLER_AGENT_MESSAGES.invalidLink);
    const hash = hashPartnerInviteToken(token);
    if (check === 'expired') {
      await this.db.query(`UPDATE public.seller_agent_partner SET status = 'expired', "updatedAt" = now()
        WHERE "tokenHash" = $1 AND status IN ('sent','opened')`, [hash]);
    } else {
      await this.expireDue(`"tokenHash" = $1`, [hash]);
    }
    const rows: any[] = await this.db.query(`SELECT * FROM public.seller_agent_partner WHERE "tokenHash" = $1`, [hash]);
    const row = rows[0];
    if (!row) throw new NotFoundException(SELLER_AGENT_MESSAGES.invalidLink);
    if (row.status === 'expired') throw new GoneException(SELLER_AGENT_MESSAGES.expiredLink);
    if (row.status === 'ended') throw new GoneException(SELLER_AGENT_MESSAGES.endedLink);
    return row;
  }

  /** Public join page: who invites, nothing else. Opening marks it opened. */
  async publicView(token: string) {
    const row = await this.rowForToken(token);
    if (row.status === 'sent') {
      await this.db.query(`UPDATE public.seller_agent_partner SET status = 'opened', "openedAt" = now(), "updatedAt" = now()
        WHERE id = $1 AND status = 'sent'`, [row.id]);
      row.status = 'opened';
    }
    return {
      status: row.status, invitedName: row.invitedName, expiresAt: row.expiresAt,
      shopName: await this.shopName(row.sellerUserId),
    };
  }

  private async agentStatusOf(userId: number): Promise<string | null> {
    const rows: any[] = await this.db.query(`SELECT status FROM public.agent WHERE "userId" = $1 ORDER BY id ASC LIMIT 1`, [userId]);
    return rows[0]?.status ?? null;
  }

  /**
   * The invited number accepts: the partnership starts now. It takes effect for jobs
   * once their agent application is approved; until then `next` says what to do.
   */
  async accept(user: User, token: string) {
    const row = await this.rowForToken(token);
    if (tz(user?.phone) !== row.invitedPhone) throw new ForbiddenException(SELLER_AGENT_MESSAGES.wrongPhone);
    if (row.agentUserId && row.agentUserId !== user.id) throw new ConflictException(SELLER_AGENT_MESSAGES.usedByAnother);

    if (OPEN.includes(row.status)) {
      const existing: any[] = await this.db.query(`SELECT id FROM public.seller_agent_partner
        WHERE "sellerUserId" = $1 AND "agentUserId" = $2 AND status = 'accepted' LIMIT 1`, [row.sellerUserId, user.id]);
      if (!existing.length) {
        await this.db.query(`UPDATE public.seller_agent_partner
            SET status = 'accepted', "agentUserId" = $2, "acceptedAt" = now(),
                "openedAt" = COALESCE("openedAt", now()), "updatedAt" = now()
          WHERE id = $1 AND status IN ('sent','opened')`, [row.id, user.id]);
      }
    }
    const agentStatus = await this.agentStatusOf(user.id);
    const next = agentStatus === 'approved' ? 'done' : agentStatus === 'pending' ? 'wait_approval' : 'apply';
    return { status: 'accepted', next, shopName: await this.shopName(row.sellerUserId) };
  }

  // ── The agent ─────────────────────────────────────────────────────────────
  /** The sellers this person works with. */
  async listForAgent(agentUserId: number) {
    if (!(await refreshSellerPartnerTable(this.db, true))) return [];
    const rows: any[] = await this.db.query(`SELECT id, "sellerUserId", "acceptedAt" FROM public.seller_agent_partner
      WHERE "agentUserId" = $1 AND status = 'accepted' ORDER BY "acceptedAt" DESC LIMIT 50`, [agentUserId]);
    const out = [];
    for (const r of rows) out.push({ id: r.id, shopName: await this.shopName(r.sellerUserId), acceptedAt: r.acceptedAt });
    return out;
  }

  /** The agent leaves a seller. Always allowed. */
  async endByAgent(agentUserId: number, id: number) {
    await this.ready();
    const rows: any[] = await this.db.query(`UPDATE public.seller_agent_partner
        SET status = 'ended', "endedAt" = now(), "endedBy" = 'agent', "updatedAt" = now()
      WHERE id = $1 AND "agentUserId" = $2 AND status = 'accepted' RETURNING id`, [id, agentUserId]);
    if (!rows.length) throw new NotFoundException(SELLER_AGENT_MESSAGES.notFound);
    return { id: rows[0].id, status: 'ended' };
  }
}
