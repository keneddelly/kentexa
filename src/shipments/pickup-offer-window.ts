/**
 * pickup-offer-window.ts - a job is offered to agents for a few minutes (owner 2026-11-09: "if an
 * agent didn't accept the job, put a time limit, a few minutes, then the job disappears from his
 * dashboard ... this is business, it goes with time"; owner chose 5 minutes, then the sender
 * decides).
 *
 *   window   PICKUP_OFFER_MINUTES (2..60, default 5) from when the job opens to all agents:
 *            its creation, after the seller's partner agents' head start (partnerHeadStartSql);
 *            or the last re-offer ("offeredAt": the sender's "Waambie tena", or an agent who
 *            accepted gave it back).
 *   after    the job leaves every agent's Kazi list and cannot be accepted; nothing else changes.
 *            The sender sees "Hakuna aliyekubali" and decides: call an agent, "Waambie tena"
 *            (a new window), or take it to the office.
 * Read through to_jsonb(): before the migration "offeredAt" is absent and creation is used.
 */
import { partnerHeadStartSql } from '../partner-invitations/seller-agent-partner-gate';

const int = (v: unknown) => { const n = Number.parseInt(String(v ?? '').trim(), 10); return Number.isFinite(n) ? n : null; };

export function pickupOfferMinutes(env: Record<string, string | undefined> = process.env): number {
  return Math.min(60, Math.max(2, int(env.PICKUP_OFFER_MINUTES) ?? 5));
}

/** SQL timestamp: when the offer of task alias `t` ends. */
export function offerEndsSql(minutes = pickupOfferMinutes()): string {
  return `(COALESCE((to_jsonb(t)->>'offeredAt')::timestamp, t."createdAt" + make_interval(mins => ${partnerHeadStartSql()}))
    + make_interval(mins => ${Math.round(minutes)}))`;
}

/** SQL condition: the offer of task alias `t` is still open. */
export function offerOpenSql(minutes = pickupOfferMinutes()): string {
  return `(${offerEndsSql(minutes)} > now())`;
}

export const OFFER_ENDED_MESSAGE = 'Muda wa kazi hii umeisha. Mtumaji ataamua kuwaambia tena mawakala.';
