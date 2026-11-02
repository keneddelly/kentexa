import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';
import { NOT_FROM_HIDDEN_PROFILE, VISIBLE_TO_VIEWER } from '../commerce-profiles/public-visibility';

/**
 * Home Feed phase F (owner approved 2026-11-02): report and mute.
 *
 *  - Report: one per person per post, with a reason. It waits for an admin (status 'open').
 *    Nothing is hidden or removed automatically: detection -> review -> action (CLAUDE.md).
 *  - Mute: a person hides one identity's posts from their own feeds. Only their own view
 *    changes; the muted identity is not told.
 */
export const REPORT_REASONS = Object.freeze(['fraud', 'prohibited', 'abuse', 'spam', 'false_info', 'other'] as const);
export type ReportReason = (typeof REPORT_REASONS)[number];

@Injectable()
export class SocialSafetyService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly activityEvents: ActivityEventService,
  ) {}

  async report(postId: number, reporterId: number, reason: unknown, note?: unknown): Promise<{ reported: true }> {
    if (!REPORT_REASONS.includes(reason as ReportReason)) throw new BadRequestException('Chagua sababu ya kuripoti.');
    const text = typeof note === 'string' ? note.trim().slice(0, 500) : '';
    const rows = await this.dataSource.createQueryBuilder()
      .select(['f.id AS id', 'f."businessId" AS "businessId"', 'f."commerceProfileId" AS "commerceProfileId"'])
      .from('business_feed_item', 'f')
      .where('f.id = :postId', { postId })
      .andWhere('f."isActive" = true')
      .andWhere(NOT_FROM_HIDDEN_PROFILE('f'))
      .andWhere(VISIBLE_TO_VIEWER('f'), { feedViewerId: reporterId })
      .getRawMany();
    if (!rows.length) throw new NotFoundException('Chapisho halipatikani.');
    const post = rows[0];
    if (Number(post.businessId) === Number(reporterId)) throw new BadRequestException('Huwezi kuripoti chapisho lako.');

    const inserted = await this.dataSource.query(
      `INSERT INTO public.post_report ("postId", "reporterId", reason, note) VALUES ($1, $2, $3, $4)
       ON CONFLICT ("postId", "reporterId") DO NOTHING RETURNING id`,
      [postId, reporterId, reason, text || null],
    );
    if (!inserted.length) throw new BadRequestException('Umeshaliripoti chapisho hili.');

    this.activityEvents.record({
      eventType: 'MOMENT_REPORTED',
      category: ActivityCategory.CONTENT,
      actorId: reporterId,
      businessId: post.businessId,
      targetType: 'moment',
      targetId: postId,
      relatedBusinessId: post.businessId,
      metadata: { reportId: Number(inserted[0].id), reason, commerceProfileId: post.commerceProfileId || null },
    });
    return { reported: true };
  }

  /** Which identity a mute names: a commerce profile, or the account for posts without one. */
  private async target(userId: number, body: { commerceProfileId?: unknown; accountId?: unknown }) {
    const profileId = Number(body?.commerceProfileId);
    if (Number.isInteger(profileId) && profileId > 0) {
      const [p] = await this.dataSource.query(`SELECT id, "ownerId" FROM public.commerce_profile WHERE id = $1`, [profileId]);
      if (!p) throw new NotFoundException('Wasifu haupatikani.');
      if (Number(p.ownerId) === Number(userId)) throw new BadRequestException('Huwezi kujinyamazisha.');
      return { column: '"mutedProfileId"', id: profileId };
    }
    const accountId = Number(body?.accountId);
    if (Number.isInteger(accountId) && accountId > 0) {
      if (accountId === Number(userId)) throw new BadRequestException('Huwezi kujinyamazisha.');
      return { column: '"mutedUserId"', id: accountId };
    }
    throw new BadRequestException('Chagua wasifu wa kunyamazisha.');
  }

  /** Mute, or undo a mute, of one identity for this person. */
  async toggleMute(userId: number, body: { commerceProfileId?: unknown; accountId?: unknown }): Promise<{ muted: boolean }> {
    const t = await this.target(userId, body);
    const removed = await this.dataSource.query(
      `DELETE FROM public.profile_mute WHERE "userId" = $1 AND ${t.column} = $2 RETURNING id`, [userId, t.id]);
    if (removed.length) return { muted: false };
    await this.dataSource.query(
      `INSERT INTO public.profile_mute ("userId", ${t.column}) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, t.id]);
    this.activityEvents.record({
      eventType: 'PROFILE_MUTED',
      category: ActivityCategory.SOCIAL,
      actorId: userId,
      targetType: t.column === '"mutedProfileId"' ? 'commerce_profile' : 'user',
      targetId: t.id,
      metadata: {},
    });
    return { muted: true };
  }

  async muteStatus(userId: number, body: { commerceProfileId?: unknown; accountId?: unknown }): Promise<{ muted: boolean }> {
    const t = await this.target(userId, body);
    const rows = await this.dataSource.query(
      `SELECT 1 FROM public.profile_mute WHERE "userId" = $1 AND ${t.column} = $2`, [userId, t.id]);
    return { muted: rows.length > 0 };
  }
}
