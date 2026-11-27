/**
 * Smart Post: topic suggestions under a post (approved design, 2026-11-27).
 * Pure helpers only. Eligibility is checked in FeedService on every publish, and
 * stored suggestions are re-checked on read.
 */
export const TOPIC_SUGGESTION_LIMIT = 3;
export const TOPIC_SUGGESTION_MIN_SCORE = 0.4;
const MAX_QUERY_CHARS = 600;

export function topicSuggestionsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TOPIC_SUGGESTIONS_ENABLED === 'true';
}

/** Post title plus the topic's label, note and description. Post body is not used (approved spec). */
export function buildTopicQuery(input: {
  title?: string | null;
  topicLabel?: string | null;
  topicNote?: string | null;
  topicDescription?: string | null;
}): string {
  const text = [input.title, input.topicLabel, input.topicNote, input.topicDescription]
    .map((part) => (part || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('. ')
    .slice(0, MAX_QUERY_CHARS)
    .trim();
  return text.length >= 3 ? text : '';
}
