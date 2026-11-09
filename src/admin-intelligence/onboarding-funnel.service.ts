import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Onboarding progress for admin (owner 2026-11-09: "onboarding progress in admin"): of the people
 * who joined in the last N days, how many reached each welcome step and where they stopped.
 * Counts only, from the database; each step is read on its own, so a missing table blanks only
 * that step (null), never the whole page. Never invents a number.
 */
export const FUNNEL_STEPS: { key: string; label: string; sql: string }[] = [
  { key: 'joined', label: 'Walijiunga', sql: `SELECT count(*) FROM public."user" u WHERE u."createdAt" >= $1` },
  { key: 'verified', label: 'Walithibitisha simu', sql: `SELECT count(*) FROM public."user" u WHERE u."createdAt" >= $1 AND u."isVerified" = true` },
  { key: 'photo', label: 'Waliweka picha', sql: `SELECT count(*) FROM public."user" u WHERE u."createdAt" >= $1 AND u."avatarUrl" IS NOT NULL AND u."avatarUrl" <> ''` },
  { key: 'town', label: 'Walichagua mji', sql: `SELECT count(*) FROM public."user" u WHERE u."createdAt" >= $1 AND u.city IS NOT NULL AND u.city <> ''` },
  { key: 'topics', label: 'Walichagua mada 3+', sql: `SELECT count(*) FROM public."user" u WHERE u."createdAt" >= $1 AND (SELECT count(*) FROM public.user_topic_follow t WHERE t."userId" = u.id) >= 3` },
  { key: 'goals', label: 'Walisema wanataka kufanya nini', sql: `SELECT count(*) FROM public."user" u WHERE u."createdAt" >= $1 AND jsonb_array_length(COALESCE(u."onboardingState"->'goals', '[]'::jsonb)) > 0` },
  { key: 'community', label: 'Walijiunga na jumuiya', sql: `SELECT count(*) FROM public."user" u WHERE u."createdAt" >= $1 AND EXISTS (SELECT 1 FROM public.community_member m WHERE m."userId" = u.id AND m.status = 'active')` },
  { key: 'follow', label: 'Walifuata mtu au biashara', sql: `SELECT count(*) FROM public."user" u WHERE u."createdAt" >= $1 AND (EXISTS (SELECT 1 FROM public.commerce_profile_follow f WHERE f."followerId" = u.id) OR EXISTS (SELECT 1 FROM public.follow f WHERE f."followerId" = u.id))` },
  { key: 'post', label: 'Walichapisha', sql: `SELECT count(*) FROM public."user" u WHERE u."createdAt" >= $1 AND EXISTS (SELECT 1 FROM public.business_feed_item p WHERE p."businessId" = u.id)` },
  { key: 'completed', label: 'Walimaliza karibu', sql: `SELECT count(*) FROM public."user" u WHERE u."createdAt" >= $1 AND u."onboardingCompleted" = true` },
  { key: 'role', label: 'Waliomba kazi (uza, ofisi, agent...)', sql: `SELECT count(*) FROM public."user" u WHERE u."createdAt" >= $1 AND EXISTS (SELECT 1 FROM public.account_role r WHERE r."userId" = u.id AND r."roleType"::text <> 'buyer')` },
];

export const GOAL_KEYS = ['buy', 'sell', 'service', 'business', 'office', 'agent', 'transport', 'send'];

@Injectable()
export class OnboardingFunnelService {
  constructor(private readonly db: DataSource) {}

  private async count(sql: string, params: unknown[]): Promise<number | null> {
    try { const [r] = await this.db.query(sql, params); return r ? Number(Object.values(r)[0]) : null; } catch { return null; }
  }

  async funnel(days = 30) {
    const d = Math.min(365, Math.max(1, Math.floor(Number(days) || 30)));
    const since = new Date(Date.now() - d * 86400000);
    const steps = await Promise.all(FUNNEL_STEPS.map(async (s) => ({ key: s.key, label: s.label, count: await this.count(s.sql, [since]) })));
    const joined = steps[0].count || 0;
    const goals = await Promise.all(GOAL_KEYS.map(async (g) => ({
      key: g,
      count: await this.count(`SELECT count(*) FROM public."user" u WHERE u."createdAt" >= $1 AND COALESCE(u."onboardingState"->'goals', '[]'::jsonb) ? $2`, [since, g]),
    })));
    return {
      days: d, since,
      steps: steps.map((s) => ({ ...s, percent: joined && s.count != null ? Math.round((s.count / joined) * 100) : null })),
      goals,
    };
  }
}
