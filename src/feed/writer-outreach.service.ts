import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MailService } from '../mail/mail.service';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';
import { BACKEND_URL, FRONTEND_URL } from '../config/urls.config';
import {
  OUTREACH_RULES, cleanText, cleanUrl, inviteHtml, inviteSubject, leftToday, newToken, normEmail,
  outreachEnabled, startOfEatDay, validEmail,
} from './writer-outreach-rules';

/**
 * Writers & Contributors Programme, step B (#417, owner approved 2026-11-18): invitations to writers
 * an admin found and reviewed, plus the Founding Contributor label ("Mchangiaji Mwanzilishi").
 * See writer-outreach-rules.ts for the rules. Every step is an activity event. Before migration
 * 1797500000000 runs, everything here is empty and nothing can be sent.
 */
@Injectable()
export class WriterOutreachService {
  private tablesReady = false;
  private checkedAt = 0;

  constructor(
    private readonly db: DataSource,
    @Optional() private readonly mail?: MailService,
    @Optional() private readonly activityEvents?: ActivityEventService,
  ) {}

  async ready(): Promise<boolean> {
    if (!this.tablesReady && Date.now() - this.checkedAt > 60_000) {
      this.checkedAt = Date.now();
      try {
        const [row] = await this.db.query(`SELECT to_regclass('public.writer_prospect') IS NOT NULL AS ok`);
        this.tablesReady = Boolean(row?.ok);
      } catch { this.tablesReady = false; }
    }
    return this.tablesReady;
  }

  private async need() {
    if (!(await this.ready())) throw new BadRequestException('Huduma hii bado inaandaliwa. Jaribu tena baadaye.');
  }

  private event(eventType: string, actorId: number | null, targetType: string, targetId: number, metadata: Record<string, unknown> = {}) {
    try {
      this.activityEvents?.record({
        eventType, category: ActivityCategory.CONTENT, actorId, actorType: actorId ? 'user' : 'system',
        targetType, targetId, metadata, visibility: 'system', severity: 'info',
      } as any)?.catch?.(() => undefined);
    } catch { /* recording never blocks the action */ }
  }

  private async suppressed(email: string) {
    const [row] = await this.db.query(`SELECT 1 FROM public.email_suppression WHERE email = $1 LIMIT 1`, [email]);
    return Boolean(row);
  }

  private async sentToday() {
    const [row] = await this.db.query(`SELECT COUNT(*)::int AS n FROM public.writer_prospect WHERE "sentAt" >= $1`, [startOfEatDay()]);
    return Number(row?.n) || 0;
  }

  // ── Admin ──────────────────────────────────────────────────────────────
  async summary() {
    const enabled = outreachEnabled();
    if (!(await this.ready())) return { ready: false, enabled, cap: OUTREACH_RULES.dailyCap, sentToday: 0, left: 0, counts: {}, joined: 0, wrote: 0 };
    const rows: any[] = await this.db.query(`SELECT status, COUNT(*)::int AS n FROM public.writer_prospect GROUP BY status`);
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.status] = Number(r.n) || 0;
    const [conv] = await this.db.query(`
      SELECT COUNT(DISTINCT u.id)::int AS joined,
             COUNT(DISTINCT u.id) FILTER (WHERE EXISTS (
               SELECT 1 FROM public.business_feed_item f WHERE f."businessId" = u.id AND f.intent::text = 'article'
                AND f."isActive" = true AND f.status::text = 'published'))::int AS wrote
        FROM public.writer_prospect p
        JOIN public."user" u ON u.id = p."joinedUserId" OR (p."sentAt" IS NOT NULL AND lower(u.email) = p.email)
       WHERE p."sentAt" IS NOT NULL`);
    const sentToday = await this.sentToday();
    return { ready: true, enabled, cap: OUTREACH_RULES.dailyCap, sentToday, left: enabled ? leftToday(sentToday) : 0, counts, joined: Number(conv?.joined) || 0, wrote: Number(conv?.wrote) || 0 };
  }

  async list(status?: string) {
    if (!(await this.ready())) return [];
    const params: any[] = [];
    let where = 'true';
    if (status && (OUTREACH_RULES.statuses as readonly string[]).includes(status)) { params.push(status); where = `p.status = $1`; }
    const rows: any[] = await this.db.query(`
      SELECT p.id, p.name, p.email, p.topic, p.source, p.note, p.status, p."createdAt", p."reviewedAt", p."sentAt", p."sendError",
             u.id AS "userId", u."createdAt" AS "joinedAt",
             (SELECT MIN(f."createdAt") FROM public.business_feed_item f WHERE u.id IS NOT NULL AND f."businessId" = u.id
                AND f.intent::text = 'article' AND f."isActive" = true AND f.status::text = 'published') AS "firstArticleAt"
        FROM public.writer_prospect p
        LEFT JOIN LATERAL (
          SELECT u.id, u."createdAt" FROM public."user" u
           WHERE p."sentAt" IS NOT NULL AND (u.id = p."joinedUserId" OR lower(u.email) = p.email)
           ORDER BY (u.id = p."joinedUserId") DESC LIMIT 1) u ON true
       WHERE ${where}
       ORDER BY p."createdAt" DESC
       LIMIT 300`, params);
    return rows.map((r) => ({ ...r, joined: Boolean(r.userId), wroteArticle: Boolean(r.firstArticleAt) }));
  }

  async add(adminId: number, body: any) {
    await this.need();
    const email = normEmail(body?.email);
    const name = cleanText(body?.name, 120);
    if (!name) throw new BadRequestException('Andika jina.');
    if (!validEmail(email)) throw new BadRequestException('Barua pepe si sahihi.');
    if (await this.suppressed(email)) throw new BadRequestException('Mtu huyu aliomba asitumiwe mialiko. Hatutamtumia.');
    const [exists] = await this.db.query(`SELECT id FROM public.writer_prospect WHERE email = $1`, [email]);
    if (exists) throw new BadRequestException('Barua pepe hii tayari iko kwenye orodha.');
    const [user] = await this.db.query(`SELECT id FROM public."user" WHERE lower(email) = $1 LIMIT 1`, [email]);
    if (user) throw new BadRequestException('Mtu huyu tayari ana akaunti ya KenteXa.');
    const [row] = await this.db.query(`
      INSERT INTO public.writer_prospect (name, email, topic, source, note, token, "addedById")
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [name, email, cleanText(body?.topic, 80) || null, cleanUrl(body?.source) || null, cleanText(body?.note, 500) || null, newToken(), adminId]);
    this.event('WRITER_PROSPECT_ADDED', adminId, 'writer_prospect', row.id);
    return { id: row.id };
  }

  async review(adminId: number, id: number, decision: string) {
    await this.need();
    const to = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : null;
    if (!to) throw new BadRequestException('Chagua kukubali au kukataa.');
    const rows: any[] = await this.db.query(`
      UPDATE public.writer_prospect SET status = $2, "reviewedById" = $3, "reviewedAt" = now()
       WHERE id = $1 AND status IN ('new', 'approved', 'rejected') RETURNING id`, [id, to, adminId]);
    if (!rows.length) throw new NotFoundException('Haipatikani au tayari imetumwa.');
    this.event(to === 'approved' ? 'WRITER_PROSPECT_APPROVED' : 'WRITER_PROSPECT_REJECTED', adminId, 'writer_prospect', id);
    return { id, status: to };
  }

  private links(token: string) {
    const frontend = FRONTEND_URL.replace(/\/$/, '');
    return {
      frontend,
      joinUrl: `${frontend}/waandishi/?ref=${token}`,
      unsubscribeUrl: `${BACKEND_URL.replace(/\/$/, '')}/writer-outreach/unsubscribe?t=${token}`,
      contactEmail: process.env.MAIL_USER || '',
    };
  }

  async preview(id: number) {
    await this.need();
    const [p] = await this.db.query(`SELECT name, topic, token FROM public.writer_prospect WHERE id = $1`, [id]);
    if (!p) throw new NotFoundException('Haipatikani.');
    return { subject: inviteSubject(p.name), html: inviteHtml(p, this.links(p.token)) };
  }

  /** Sends the chosen approved invitations, one by one, within today's cap. Only an admin press reaches here. */
  async send(adminId: number, ids: unknown) {
    await this.need();
    if (!outreachEnabled()) throw new BadRequestException('Mialiko imezimwa. Weka WRITER_OUTREACH_ENABLED=true kwenye Render ili kutuma.');
    if (!this.mail) throw new BadRequestException('Huduma ya barua pepe haipo.');
    const list = Array.isArray(ids) ? [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, OUTREACH_RULES.dailyCap) : [];
    if (!list.length) throw new BadRequestException('Chagua mialiko ya kutuma.');
    let left = leftToday(await this.sentToday());
    const out = { sent: 0, failed: 0, skipped: 0, left: 0 };
    for (const id of list) {
      if (left <= 0) { out.skipped += 1; continue; }
      // Claim the row first, so two presses never send twice.
      const [p] = await this.db.query(`
        UPDATE public.writer_prospect SET status = 'sent', "sentAt" = now(), "sentById" = $2, "sendError" = NULL
         WHERE id = $1 AND status = 'approved' AND "sentAt" IS NULL
         RETURNING id, name, email, topic, token`, [id, adminId]);
      if (!p) { out.skipped += 1; continue; }
      if (await this.suppressed(p.email)) {
        await this.db.query(`UPDATE public.writer_prospect SET status = 'unsubscribed', "sentAt" = NULL WHERE id = $1`, [id]);
        out.skipped += 1; continue;
      }
      const l = this.links(p.token);
      const ok = await this.mail.sendWriterInvite(p.email, inviteSubject(p.name), inviteHtml(p, l), l.unsubscribeUrl);
      if (ok) {
        out.sent += 1; left -= 1;
        this.event('WRITER_INVITE_SENT', adminId, 'writer_prospect', id);
      } else {
        out.failed += 1;
        await this.db.query(`UPDATE public.writer_prospect SET status = 'approved', "sentAt" = NULL, "sentById" = NULL, "sendError" = 'Imeshindikana kutuma' WHERE id = $1`, [id]);
      }
    }
    out.left = left;
    return out;
  }

  // ── Public ─────────────────────────────────────────────────────────────
  async unsubscribe(token: unknown) {
    const t = String(token || '').trim();
    if (!/^[a-f0-9]{20,40}$/.test(t) || !(await this.ready())) return { ok: true };
    const [p] = await this.db.query(`SELECT id, email FROM public.writer_prospect WHERE token = $1`, [t]);
    if (!p) return { ok: true };
    await this.db.query(`INSERT INTO public.email_suppression (email, reason) VALUES ($1, 'unsubscribe') ON CONFLICT (email) DO NOTHING`, [p.email]);
    await this.db.query(`UPDATE public.writer_prospect SET status = 'unsubscribed' WHERE id = $1`, [p.id]);
    this.event('WRITER_INVITE_UNSUBSCRIBED', null, 'writer_prospect', p.id);
    return { ok: true };
  }

  /** A signed-in person who came from an invitation link: count them as joined (once). */
  async claim(userId: number, token: unknown) {
    const t = String(token || '').trim();
    if (!userId || !/^[a-f0-9]{20,40}$/.test(t) || !(await this.ready())) return { ok: false };
    const rows: any[] = await this.db.query(`
      UPDATE public.writer_prospect SET "joinedUserId" = $2, "joinedAt" = now()
       WHERE token = $1 AND "sentAt" IS NOT NULL AND "joinedUserId" IS NULL RETURNING id`, [t, userId]);
    if (rows.length) this.event('WRITER_INVITE_JOINED', userId, 'writer_prospect', rows[0].id);
    return { ok: rows.length > 0 };
  }

  // ── Founding Contributor ("Mchangiaji Mwanzilishi") ────────────────────
  async founding(userId: number) {
    if (!userId || !(await this.ready())) return { founding: false };
    const [row] = await this.db.query(`SELECT "createdAt" FROM public.founding_contributor WHERE "userId" = $1 AND "removedAt" IS NULL`, [userId]);
    return row ? { founding: true, since: row.createdAt } : { founding: false };
  }

  async foundingList() {
    if (!(await this.ready())) return [];
    return this.db.query(`
      SELECT fc."userId", fc.note, fc."createdAt",
             (SELECT cp.username FROM public.commerce_profile cp WHERE cp."ownerId" = fc."userId" ORDER BY (cp.type::text = 'personal') DESC, cp.id LIMIT 1) AS username,
             u.name
        FROM public.founding_contributor fc JOIN public."user" u ON u.id = fc."userId"
       WHERE fc."removedAt" IS NULL ORDER BY fc."createdAt" DESC LIMIT 300`);
  }

  async foundingAssign(adminId: number, body: any) {
    await this.need();
    const handle = String(body?.username || '').trim().replace(/^@/, '').toLowerCase();
    if (!handle) throw new BadRequestException('Andika jina la mtumiaji (@jina).');
    const [cp] = await this.db.query(`SELECT "ownerId" FROM public.commerce_profile WHERE lower(username) = $1 LIMIT 1`, [handle]);
    if (!cp) throw new NotFoundException('Mtumiaji huyu hapatikani.');
    await this.db.query(`
      INSERT INTO public.founding_contributor ("userId", "assignedById", note) VALUES ($1, $2, $3)
      ON CONFLICT ("userId") DO UPDATE SET "removedAt" = NULL, "removedById" = NULL, "assignedById" = $2, note = $3, "createdAt" = now()`,
      [cp.ownerId, adminId, cleanText(body?.note, 200) || null]);
    this.event('FOUNDING_CONTRIBUTOR_ASSIGNED', adminId, 'user', cp.ownerId);
    return { userId: cp.ownerId, founding: true };
  }

  async foundingRemove(adminId: number, userId: number) {
    await this.need();
    const rows: any[] = await this.db.query(`UPDATE public.founding_contributor SET "removedAt" = now(), "removedById" = $2 WHERE "userId" = $1 AND "removedAt" IS NULL RETURNING "userId"`, [userId, adminId]);
    if (!rows.length) throw new NotFoundException('Haipatikani.');
    this.event('FOUNDING_CONTRIBUTOR_REMOVED', adminId, 'user', userId);
    return { userId, founding: false };
  }
}
