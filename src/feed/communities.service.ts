import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';

/**
 * Social Home part 3: Jumuiya (communities). Owner approved 2026-11-02:
 *  - any user with a verified phone opens one (up to 5 at first); the opener is its admin and
 *    can name helpers; KenteXa can hide a community that breaks its rules;
 *  - the opener chooses who joins: anyone ('open') or by request ('request', approved by the
 *    admin or a helper); a request community's posts are for its members only;
 *  - posts from an open community can also reach For You under its topic.
 * Who sees a community post is enforced in SQL by COMMUNITY_OPEN_TO_VIEWER (public-visibility).
 */
export const COMMUNITY_LIMITS = Object.freeze({ perPerson: 5, name: 80, purpose: 300, rules: 500, pinned: 3 });

type Role = 'admin' | 'helper' | 'member';

@Injectable()
export class CommunitiesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly activityEvents: ActivityEventService,
  ) {}

  private text(v: unknown, max: number, field: string, required = false): string | null {
    const s = typeof v === 'string' ? v.trim() : '';
    if (!s) { if (required) throw new BadRequestException(`Jaza ${field}.`); return null; }
    if (s.length > max) throw new BadRequestException(`${field[0].toUpperCase()}${field.slice(1)} isizidi herufi ${max}.`);
    return s;
  }

  async create(userId: number, dto: any): Promise<any> {
    const [user] = await this.dataSource.query(`SELECT "isVerified" FROM public."user" WHERE id = $1`, [userId]);
    if (!user?.isVerified) throw new ForbiddenException('Thibitisha namba yako ya simu kwanza ili ufungue jumuiya.');
    const name = this.text(dto?.name, COMMUNITY_LIMITS.name, 'jina', true)!;
    const purpose = this.text(dto?.purpose, COMMUNITY_LIMITS.purpose, 'inahusu nini', true)!;
    const rules = this.text(dto?.rules, COMMUNITY_LIMITS.rules, 'kanuni');
    const joinPolicy = dto?.joinPolicy === 'request' ? 'request' : 'open';
    const [topic] = await this.dataSource.query(`SELECT key FROM public.feed_topic WHERE key = $1 AND active = true`, [dto?.topicKey]);
    if (!topic) throw new BadRequestException('Chagua mada ya jumuiya.');
    const [{ n }] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS n FROM public.community WHERE "createdById" = $1 AND status = 'active'`, [userId]);
    if (n >= COMMUNITY_LIMITS.perPerson) throw new BadRequestException(`Unaweza kufungua jumuiya ${COMMUNITY_LIMITS.perPerson} tu kwa sasa.`);
    const [taken] = await this.dataSource.query(`SELECT 1 FROM public.community WHERE lower(name) = lower($1)`, [name]);
    if (taken) throw new BadRequestException('Jina hili tayari lina jumuiya. Chagua jingine.');

    const id = await this.dataSource.transaction(async (m) => {
      const [c] = await m.query(
        `INSERT INTO public.community (name, purpose, "topicKey", rules, "joinPolicy", "createdById", "memberCount")
         VALUES ($1, $2, $3, $4, $5, $6, 1) RETURNING id`, [name, purpose, topic.key, rules, joinPolicy, userId]);
      await m.query(`INSERT INTO public.community_member ("communityId", "userId", role, status) VALUES ($1, $2, 'admin', 'active')`, [c.id, userId]);
      return Number(c.id);
    });
    this.activityEvents.record({
      eventType: 'COMMUNITY_CREATED', category: ActivityCategory.SOCIAL, actorId: userId,
      targetType: 'community', targetId: id, metadata: { topic: topic.key, joinPolicy },
    });
    return this.get(id, userId);
  }

  private async membership(communityId: number, userId: number | null): Promise<{ role: Role; status: string } | null> {
    if (!userId) return null;
    const [m] = await this.dataSource.query(
      `SELECT role, status FROM public.community_member WHERE "communityId" = $1 AND "userId" = $2`, [communityId, userId]);
    return m || null;
  }

  private async active(communityId: number): Promise<any> {
    const [c] = await this.dataSource.query(`SELECT * FROM public.community WHERE id = $1 AND status = 'active'`, [communityId]);
    if (!c) throw new NotFoundException('Jumuiya haipatikani.');
    return c;
  }

  private present(c: any, m: { role: Role; status: string } | null) {
    return {
      id: Number(c.id), name: c.name, purpose: c.purpose, topicKey: c.topicKey, rules: c.rules,
      joinPolicy: c.joinPolicy, memberCount: Number(c.memberCount || 0), createdAt: c.createdAt,
      myRole: m?.status === 'active' ? m.role : null,
      myStatus: m?.status || null,
    };
  }

  async get(communityId: number, viewerId: number | null): Promise<any> {
    const c = await this.active(communityId);
    return this.present(c, await this.membership(communityId, viewerId));
  }

  /** Communities: mine (active member), or to discover (not a member), optionally by topic. */
  async list(viewerId: number | null, opts: { mine?: boolean; topic?: string | null } = {}): Promise<any[]> {
    const params: any[] = [viewerId || 0];
    let where = `c.status = 'active'`;
    if (opts.topic) { params.push(opts.topic); where += ` AND c."topicKey" = $${params.length}`; }
    if (opts.mine) where += ` AND m.status = 'active'`;
    else where += ` AND (m.status IS NULL OR m.status <> 'active')`;
    const rows = await this.dataSource.query(
      `SELECT c.*, m.role AS "myRoleRaw", m.status AS "myStatusRaw"
         FROM public.community c
         LEFT JOIN public.community_member m ON m."communityId" = c.id AND m."userId" = $1
        WHERE ${where}
        ORDER BY ${opts.mine ? 'c.name' : 'c."memberCount" DESC, c."createdAt" DESC'}
        LIMIT 50`, params);
    return rows.map((c: any) => this.present(c, c.myStatusRaw ? { role: c.myRoleRaw, status: c.myStatusRaw } : null));
  }

  /**
   * New profiles part 2: the open communities the owner of a PERSONAL profile is in. A
   * business profile shows none, and "join by request" communities are never listed.
   */
  async listForProfile(commerceProfileId: number): Promise<any[]> {
    const [p] = await this.dataSource.query(
      `SELECT "ownerId", type::text AS type FROM public.commerce_profile WHERE id = $1`, [commerceProfileId]);
    if (!p || p.type !== 'personal') return [];
    const rows = await this.dataSource.query(
      `SELECT c.* FROM public.community c JOIN public.community_member m ON m."communityId" = c.id
        WHERE m."userId" = $1 AND m.status = 'active' AND c.status = 'active' AND c."joinPolicy" = 'open'
        ORDER BY c."memberCount" DESC LIMIT 30`, [p.ownerId]);
    return rows.map((c: any) => this.present(c, null));
  }

  /** Ids of the communities this person is an active member of (for the Jumuiya tab). */
  async myCommunityIds(userId: number): Promise<number[]> {
    const rows = await this.dataSource.query(
      `SELECT m."communityId" FROM public.community_member m JOIN public.community c ON c.id = m."communityId"
        WHERE m."userId" = $1 AND m.status = 'active' AND c.status = 'active'`, [userId]).catch(() => []);
    return rows.map((r: any) => Number(r.communityId));
  }

  async join(communityId: number, userId: number): Promise<any> {
    const c = await this.active(communityId);
    const m = await this.membership(communityId, userId);
    if (m?.status === 'active') return this.present(c, m);
    const status = c.joinPolicy === 'request' ? 'pending' : 'active';
    await this.dataSource.transaction(async (q) => {
      await q.query(
        `INSERT INTO public.community_member ("communityId", "userId", role, status) VALUES ($1, $2, 'member', $3)
         ON CONFLICT ("communityId", "userId") DO UPDATE SET status = EXCLUDED.status, role = 'member'`, [communityId, userId, status]);
      if (status === 'active') await q.query(`UPDATE public.community SET "memberCount" = "memberCount" + 1 WHERE id = $1`, [communityId]);
    });
    if (status === 'active') {
      this.activityEvents.record({ eventType: 'COMMUNITY_JOINED', category: ActivityCategory.SOCIAL, actorId: userId, targetType: 'community', targetId: communityId, metadata: {} });
    }
    return this.get(communityId, userId);
  }

  async leave(communityId: number, userId: number): Promise<any> {
    await this.active(communityId);
    const m = await this.membership(communityId, userId);
    if (!m || m.status === 'removed') return this.get(communityId, userId);
    if (m.role === 'admin' && m.status === 'active') throw new BadRequestException('Wewe ndiye msimamizi wa jumuiya hii; huwezi kuiacha.');
    await this.dataSource.transaction(async (q) => {
      await q.query(`DELETE FROM public.community_member WHERE "communityId" = $1 AND "userId" = $2`, [communityId, userId]);
      if (m.status === 'active') await q.query(`UPDATE public.community SET "memberCount" = GREATEST("memberCount" - 1, 0) WHERE id = $1`, [communityId]);
    });
    if (m.status === 'active') {
      this.activityEvents.record({ eventType: 'COMMUNITY_LEFT', category: ActivityCategory.SOCIAL, actorId: userId, targetType: 'community', targetId: communityId, metadata: {} });
    }
    return this.get(communityId, userId);
  }

  private async assertModerator(communityId: number, userId: number, adminOnly = false) {
    await this.active(communityId);
    const m = await this.membership(communityId, userId);
    const ok = m?.status === 'active' && (m.role === 'admin' || (!adminOnly && m.role === 'helper'));
    if (!ok) throw new ForbiddenException(adminOnly ? 'Msimamizi tu ndiye anaweza kufanya hivi.' : 'Wasimamizi tu ndio wanaweza kufanya hivi.');
  }

  async pending(communityId: number, moderatorId: number): Promise<any[]> {
    await this.assertModerator(communityId, moderatorId);
    return this.dataSource.query(
      `SELECT m."userId", u.name, m."createdAt" FROM public.community_member m JOIN public."user" u ON u.id = m."userId"
        WHERE m."communityId" = $1 AND m.status = 'pending' ORDER BY m."createdAt"`, [communityId]);
  }

  async members(communityId: number, viewerId: number | null): Promise<any[]> {
    const c = await this.active(communityId);
    if (c.joinPolicy === 'request') {
      const m = await this.membership(communityId, viewerId);
      if (m?.status !== 'active') throw new ForbiddenException('Wanachama tu ndio wanaona orodha hii.');
    }
    return this.dataSource.query(
      `SELECT m."userId", u.name, m.role FROM public.community_member m JOIN public."user" u ON u.id = m."userId"
        WHERE m."communityId" = $1 AND m.status = 'active'
        ORDER BY CASE m.role WHEN 'admin' THEN 0 WHEN 'helper' THEN 1 ELSE 2 END, m."createdAt" LIMIT 200`, [communityId]);
  }

  async decide(communityId: number, moderatorId: number, userId: number, approve: boolean): Promise<{ ok: true }> {
    await this.assertModerator(communityId, moderatorId);
    const m = await this.membership(communityId, userId);
    if (m?.status !== 'pending') throw new BadRequestException('Hakuna ombi la mtu huyu.');
    await this.dataSource.transaction(async (q) => {
      if (approve) {
        await q.query(`UPDATE public.community_member SET status = 'active' WHERE "communityId" = $1 AND "userId" = $2`, [communityId, userId]);
        await q.query(`UPDATE public.community SET "memberCount" = "memberCount" + 1 WHERE id = $1`, [communityId]);
      } else {
        await q.query(`DELETE FROM public.community_member WHERE "communityId" = $1 AND "userId" = $2`, [communityId, userId]);
      }
    });
    if (approve) {
      this.activityEvents.record({ eventType: 'COMMUNITY_JOINED', category: ActivityCategory.SOCIAL, actorId: userId, targetType: 'community', targetId: communityId, metadata: { approvedBy: moderatorId } });
    }
    return { ok: true };
  }

  /** The admin names or removes a helper (an active member). */
  async setHelper(communityId: number, adminId: number, userId: number, helper: boolean): Promise<{ ok: true }> {
    await this.assertModerator(communityId, adminId, true);
    const m = await this.membership(communityId, userId);
    if (m?.status !== 'active' || m.role === 'admin') throw new BadRequestException('Chagua mwanachama.');
    await this.dataSource.query(
      `UPDATE public.community_member SET role = $3 WHERE "communityId" = $1 AND "userId" = $2`, [communityId, userId, helper ? 'helper' : 'member']);
    return { ok: true };
  }

  /**
   * #374 D: when the member last opened the community's list. Returns the previous time (for the
   * "new since your last visit" dots) and records now. Not a member: null, nothing recorded.
   */
  async markSeen(communityId: number, userId: number | null): Promise<Date | null> {
    if (!userId) return null;
    const rows = await this.dataSource.query(
      `UPDATE public.community_member m SET "lastSeenAt" = now()
         FROM (SELECT "lastSeenAt" AS prev FROM public.community_member WHERE "communityId" = $1 AND "userId" = $2 AND status = 'active') old
        WHERE m."communityId" = $1 AND m."userId" = $2 AND m.status = 'active'
        RETURNING old.prev`, [communityId, userId]).catch(() => []);
    const prev = Array.isArray(rows) ? (Array.isArray(rows[0]) ? rows[0][0]?.prev : rows[0]?.prev) : null;
    return prev ? new Date(prev) : null;
  }

  private async communityPost(communityId: number, postId: number): Promise<any> {
    const [p] = await this.dataSource.query(
      `SELECT id, "businessId", "pinnedAt", "repliesLocked", "bestCommentId" FROM public.business_feed_item
        WHERE id = $1 AND "communityId" = $2 AND "isActive" = true`, [postId, communityId]);
    if (!p) throw new NotFoundException('Chapisho halipatikani kwenye jumuiya hii.');
    return p;
  }

  /** #374 D: a moderator pins a post to the top of the community (at most 3 at a time), or unpins it. */
  async pinPost(communityId: number, moderatorId: number, postId: number, pinned: boolean): Promise<{ pinned: boolean }> {
    await this.assertModerator(communityId, moderatorId);
    await this.communityPost(communityId, postId);
    if (pinned) {
      const [{ n }] = await this.dataSource.query(
        `SELECT COUNT(*)::int AS n FROM public.business_feed_item WHERE "communityId" = $1 AND "pinnedAt" IS NOT NULL AND "isActive" = true AND id <> $2`,
        [communityId, postId]);
      if (n >= COMMUNITY_LIMITS.pinned) throw new BadRequestException(`Unaweza kubandika machapisho ${COMMUNITY_LIMITS.pinned} tu. Ondoa moja kwanza.`);
    }
    await this.dataSource.query(`UPDATE public.business_feed_item SET "pinnedAt" = ${pinned ? 'COALESCE("pinnedAt", now())' : 'NULL'} WHERE id = $1`, [postId]);
    this.activityEvents.record({
      eventType: pinned ? 'COMMUNITY_POST_PINNED' : 'COMMUNITY_POST_UNPINNED', category: ActivityCategory.CONTENT, actorId: moderatorId,
      targetType: 'moment', targetId: postId, metadata: { communityId },
    });
    return { pinned };
  }

  /** #374 D: a moderator closes (or opens again) the replies on a post. */
  async lockReplies(communityId: number, moderatorId: number, postId: number, locked: boolean): Promise<{ repliesLocked: boolean }> {
    await this.assertModerator(communityId, moderatorId);
    await this.communityPost(communityId, postId);
    await this.dataSource.query(`UPDATE public.business_feed_item SET "repliesLocked" = $2 WHERE id = $1`, [postId, locked]);
    this.activityEvents.record({
      eventType: locked ? 'COMMUNITY_REPLIES_LOCKED' : 'COMMUNITY_REPLIES_OPENED', category: ActivityCategory.CONTENT, actorId: moderatorId,
      targetType: 'moment', targetId: postId, metadata: { communityId },
    });
    return { repliesLocked: locked };
  }

  /**
   * #374 D: "Jibu bora". The post's writer, or a moderator, chooses one reply (a comment made
   * directly on that post) as the best answer; null clears it.
   */
  async setBestAnswer(communityId: number, userId: number, postId: number, commentId: number | null): Promise<{ bestCommentId: number | null }> {
    await this.active(communityId);
    const post = await this.communityPost(communityId, postId);
    if (Number(post.businessId) !== Number(userId)) {
      const m = await this.membership(communityId, userId);
      if (!(m?.status === 'active' && (m.role === 'admin' || m.role === 'helper'))) {
        throw new ForbiddenException('Mwandishi wa chapisho au msimamizi tu ndiye anachagua jibu bora.');
      }
    }
    if (commentId !== null) {
      const [c] = await this.dataSource.query(
        `SELECT id FROM public.post_comment WHERE id = $1 AND "postId" = $2 AND "isDeleted" = false`, [commentId, postId]);
      if (!c) throw new BadRequestException('Jibu hili halipatikani kwenye chapisho hili.');
    }
    await this.dataSource.query(`UPDATE public.business_feed_item SET "bestCommentId" = $2 WHERE id = $1`, [postId, commentId]);
    this.activityEvents.record({
      eventType: 'COMMUNITY_BEST_ANSWER_SET', category: ActivityCategory.CONTENT, actorId: userId,
      targetType: 'moment', targetId: postId, metadata: { communityId, commentId },
    });
    return { bestCommentId: commentId };
  }

  /**
   * Viral engine C12 (#381): what all invitations to this community brought (every member's
   * shared links to it): opens and new members. Moderators only; numbers, never names.
   */
  async invitationStats(communityId: number, userId: number): Promise<{ links: number; opens: number; joined: number }> {
    await this.assertModerator(communityId, userId);
    const [r] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT l.id)::int AS links,
              (SELECT COUNT(*)::int FROM public.share_visit v JOIN public.share_link x ON x.id = v."shareLinkId"
                WHERE x."contentType" = 'community' AND x."contentId" = $1) AS opens,
              (SELECT COUNT(*)::int FROM public.share_conversion c JOIN public.share_link x ON x.id = c."shareLinkId"
                WHERE x."contentType" = 'community' AND x."contentId" = $1) AS joined
         FROM public.share_link l WHERE l."contentType" = 'community' AND l."contentId" = $1`, [communityId]).catch(() => []);
    return { links: Number(r?.links || 0), opens: Number(r?.opens || 0), joined: Number(r?.joined || 0) };
  }

  /** A moderator takes down a post made in the community (it is archived, never deleted). */
  async removePost(communityId: number, moderatorId: number, postId: number): Promise<{ ok: true }> {
    await this.assertModerator(communityId, moderatorId);
    const rows = await this.dataSource.query(
      `UPDATE public.business_feed_item SET "isActive" = false, status = 'archived'
        WHERE id = $1 AND "communityId" = $2 AND "isActive" = true RETURNING id`, [postId, communityId]);
    if (!rows.length) throw new NotFoundException('Chapisho halipatikani kwenye jumuiya hii.');
    this.activityEvents.record({
      eventType: 'COMMUNITY_POST_REMOVED', category: ActivityCategory.CONTENT, actorId: moderatorId,
      targetType: 'moment', targetId: postId, metadata: { communityId },
    });
    return { ok: true };
  }

  /** Before a post is made in a community: an active community, and the author an active member. */
  async assertCanPost(communityId: unknown, userId: number): Promise<{ id: number; topicKey: string } | null> {
    if (communityId === undefined || communityId === null || communityId === '') return null;
    const id = Number(communityId);
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('Jumuiya haitambuliki.');
    const c = await this.active(id);
    const m = await this.membership(id, userId);
    if (m?.status !== 'active') throw new ForbiddenException('Jiunge na jumuiya kwanza ili uchapishe humo.');
    return { id, topicKey: c.topicKey };
  }
}
