/**
 * Smart Post (owner 2026-11-09): the composer's steps, so we learn where people stop before
 * posting (spec section 8, "composer start-to-publish completion and abandonment").
 *
 * Only the step, the kind and a few counts are kept: never the text, the photos or who the post
 * was for. Posting itself is already recorded as MOMENT_CREATED. Anything else is ignored.
 */
export const COMPOSER_STEPS = Object.freeze({
  opened: 'COMPOSER_OPENED',
  kind: 'COMPOSER_KIND_CHOSEN',
  preview: 'COMPOSER_PREVIEWED',
  abandoned: 'COMPOSER_ABANDONED',
} as const);

export const COMPOSER_KINDS = Object.freeze([
  'moment', 'question', 'discussion', 'showcase', 'offer', 'poll', 'experience', 'looking_for',
]);

export interface ComposerEvent {
  eventType: string;
  metadata: { kind: string | null; at?: string; hasText?: boolean; photos?: number; audience?: string };
}

/** The event to record for a composer step, or null when the body is not one we keep. */
export function composerEvent(body: any): ComposerEvent | null {
  if (!body || typeof body !== 'object') return null;
  const step = String(body.step);
  if (!Object.prototype.hasOwnProperty.call(COMPOSER_STEPS, step)) return null;
  const eventType = (COMPOSER_STEPS as Record<string, string>)[step];
  const kind = COMPOSER_KINDS.includes(String(body.kind)) ? String(body.kind) : null;
  const metadata: ComposerEvent['metadata'] = { kind };
  if (body.at === 'write' || body.at === 'preview') metadata.at = body.at;
  if (typeof body.hasText === 'boolean') metadata.hasText = body.hasText;
  const photos = Number(body.photos);
  if (Number.isInteger(photos) && photos >= 0 && photos <= 4) metadata.photos = photos;
  if (body.audience === 'public' || body.audience === 'followers') metadata.audience = body.audience;
  return { eventType, metadata };
}

/** At most this many composer events per person per minute; more are dropped quietly. */
export const COMPOSER_EVENTS_PER_MINUTE = 30;

export class ComposerEventLimiter {
  private readonly seen = new Map<number, { minute: number; count: number }>();

  allow(userId: number, now = Date.now()): boolean {
    const minute = Math.floor(now / 60_000);
    const row = this.seen.get(userId);
    if (!row || row.minute !== minute) {
      if (this.seen.size > 10_000) this.seen.clear();
      this.seen.set(userId, { minute, count: 1 });
      return true;
    }
    row.count += 1;
    return row.count <= COMPOSER_EVENTS_PER_MINUTE;
  }
}
