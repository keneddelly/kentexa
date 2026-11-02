import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';
import { NOT_FROM_HIDDEN_PROFILE, VISIBLE_TO_VIEWER } from '../commerce-profiles/public-visibility';

/**
 * Home Feed phase E, "Kura" (owner approved 2026-11-02).
 *
 *  - A poll belongs to one feed post (intent 'poll'): a question, 2 to 6 options of at most
 *    80 characters, closing after 1, 3 or 7 days.
 *  - One vote per person (unique on poll and user), never changed.
 *  - Before voting a person sees the options and the total only; after voting, after the
 *    close, or as the author, the counts and percentages. Counts come only from real votes.
 *  - Who may see the post (phase A rules) is who may see and vote on its poll.
 */
export const POLL_LIMITS = Object.freeze({ minOptions: 2, maxOptions: 6, optionLength: 80, days: [1, 3, 7] as number[] });

export interface PollInput { options: string[]; durationDays: number }

/** Checks a poll before the post is saved. Returns the cleaned options. */
export function assertPollInput(poll: unknown): PollInput {
  if (!poll || typeof poll !== 'object') throw new BadRequestException('Kura haina machaguo.');
  const raw = (poll as any).options;
  if (!Array.isArray(raw)) throw new BadRequestException('Kura haina machaguo.');
  const options = raw.map((o) => (typeof o === 'string' ? o.trim() : ''));
  if (options.some((o) => !o)) throw new BadRequestException('Kila chaguo lazima liwe na maneno.');
  if (options.length < POLL_LIMITS.minOptions || options.length > POLL_LIMITS.maxOptions) {
    throw new BadRequestException(`Kura iwe na machaguo ${POLL_LIMITS.minOptions} hadi ${POLL_LIMITS.maxOptions}.`);
  }
  if (options.some((o) => o.length > POLL_LIMITS.optionLength)) {
    throw new BadRequestException(`Kila chaguo lisizidi herufi ${POLL_LIMITS.optionLength}.`);
  }
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
    throw new BadRequestException('Machaguo mawili yanafanana.');
  }
  const durationDays = Number((poll as any).durationDays);
  if (!POLL_LIMITS.days.includes(durationDays)) throw new BadRequestException('Chagua siku 1, 3 au 7.');
  return { options, durationDays };
}

@Injectable()
export class PollService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly activityEvents: ActivityEventService,
  ) {}

  /** Creates the poll of a post just published (input already checked by assertPollInput). */
  async create(postId: number, question: string, input: PollInput, now: Date = new Date()): Promise<void> {
    const closesAt = new Date(now.getTime() + input.durationDays * 24 * 60 * 60 * 1000);
    await this.dataSource.transaction(async (m) => {
      const [poll] = await m.query(
        `INSERT INTO public.post_poll ("postId", question, "closesAt", "resultPolicy") VALUES ($1, $2, $3, 'after_vote') RETURNING id`,
        [postId, String(question || '').slice(0, 300), closesAt],
      );
      for (let i = 0; i < input.options.length; i++) {
        await m.query(`INSERT INTO public.post_poll_option ("pollId", label, position) VALUES ($1, $2, $3)`, [poll.id, input.options[i], i]);
      }
    });
  }

  /** The post, if this viewer may see it (same rules as the feed); else "not found". */
  private async visiblePost(postId: number, viewerId: number | null): Promise<{ id: number; businessId: number; commerceProfileId: number | null }> {
    const rows = await this.dataSource.createQueryBuilder()
      .select(['f.id AS id', 'f."businessId" AS "businessId"', 'f."commerceProfileId" AS "commerceProfileId"'])
      .from('business_feed_item', 'f')
      .where('f.id = :postId', { postId })
      .andWhere('f."isActive" = true')
      .andWhere(NOT_FROM_HIDDEN_PROFILE('f'))
      .andWhere(VISIBLE_TO_VIEWER('f'), { feedViewerId: viewerId || 0 })
      .getRawMany();
    if (!rows.length) throw new NotFoundException('Chapisho halipatikani.');
    return rows[0];
  }

  /** What this viewer sees of the poll. */
  async view(postId: number, viewerId: number | null, now: Date = new Date()): Promise<any> {
    const post = await this.visiblePost(postId, viewerId);
    const [poll] = await this.dataSource.query(
      `SELECT id, question, "closesAt" FROM public.post_poll WHERE "postId" = $1`, [postId]);
    if (!poll) throw new NotFoundException('Kura haipatikani.');
    const options = await this.dataSource.query(
      `SELECT id, label, "voteCount" FROM public.post_poll_option WHERE "pollId" = $1 ORDER BY position`, [poll.id]);
    const [mine] = viewerId
      ? await this.dataSource.query(`SELECT "optionId" FROM public.post_poll_vote WHERE "pollId" = $1 AND "userId" = $2`, [poll.id, viewerId])
      : [];
    const total = options.reduce((s: number, o: any) => s + Number(o.voteCount || 0), 0);
    const closed = new Date(poll.closesAt).getTime() <= now.getTime();
    const isAuthor = !!viewerId && Number(post.businessId) === Number(viewerId);
    const showResults = closed || !!mine || isAuthor;
    return {
      postId,
      question: poll.question,
      closesAt: poll.closesAt,
      closed,
      totalVotes: total,
      myOptionId: mine ? Number(mine.optionId) : null,
      showResults,
      options: options.map((o: any) => {
        const votes = Number(o.voteCount || 0);
        return showResults
          ? { id: Number(o.id), label: o.label, votes, percent: total ? Math.round((votes / total) * 100) : 0 }
          : { id: Number(o.id), label: o.label };
      }),
    };
  }

  /** One vote per person, never changed. A closed poll takes no votes. */
  async vote(postId: number, userId: number, optionId: number, now: Date = new Date()): Promise<any> {
    const post = await this.visiblePost(postId, userId);
    const [poll] = await this.dataSource.query(
      `SELECT id, "closesAt" FROM public.post_poll WHERE "postId" = $1`, [postId]);
    if (!poll) throw new NotFoundException('Kura haipatikani.');
    if (new Date(poll.closesAt).getTime() <= now.getTime()) throw new ForbiddenException('Kura imefungwa.');
    const [option] = await this.dataSource.query(
      `SELECT id FROM public.post_poll_option WHERE id = $1 AND "pollId" = $2`, [optionId, poll.id]);
    if (!option) throw new BadRequestException('Chaguo hili halipo kwenye kura hii.');

    const recorded = await this.dataSource.transaction(async (m) => {
      const inserted = await m.query(
        `INSERT INTO public.post_poll_vote ("pollId", "optionId", "userId") VALUES ($1, $2, $3)
         ON CONFLICT ("pollId", "userId") DO NOTHING RETURNING id`, [poll.id, option.id, userId]);
      if (!inserted.length) return false;
      await m.query(`UPDATE public.post_poll_option SET "voteCount" = "voteCount" + 1 WHERE id = $1`, [option.id]);
      return true;
    });
    if (!recorded) throw new BadRequestException('Umeshapiga kura kwenye kura hii.');

    this.activityEvents.record({
      eventType: 'POLL_VOTED',
      category: ActivityCategory.CONTENT,
      actorId: userId,
      businessId: post.businessId,
      targetType: 'moment',
      targetId: postId,
      relatedBusinessId: post.businessId,
      metadata: { pollId: Number(poll.id), optionId: Number(option.id), commerceProfileId: post.commerceProfileId || null },
    });
    return this.view(postId, userId, now);
  }
}
