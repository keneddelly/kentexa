import { BadRequestException, Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { AiPromptTemplateService } from '../ai/ai-prompt-templates.service';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';
import { COMPOSER_LIMITS } from './publish-input';

/**
 * Smart Post "Pendekeza" (owner 2026-11-09: "do what is best and used by many companies"; spec
 * step C). Runs only when the person taps the button, never on its own, so it costs nothing
 * unless used. One suggestion: a kind of post that fits and, if it helps, lightly better text.
 * The person chooses "Tumia" or "Hapana"; nothing is changed or posted for them. If the AI is
 * not available the answer is simply "no suggestion"; posting is never blocked.
 */
export const SUGGEST_KINDS = ['moment', 'question', 'discussion', 'poll', 'experience', 'looking_for', 'showcase'] as const;
export const SUGGEST_MIN_TEXT = 15;

export interface PostSuggestion {
  kind: (typeof SUGGEST_KINDS)[number];
  text: string | null;
  options: string[];
  reason: string;
}

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** Keeps only what the composer can use: a known kind, text within 500, 2-6 short poll options. */
export function cleanSuggestion(data: any, draft: { text: string; kind: string }): PostSuggestion | null {
  if (!data || typeof data !== 'object') return null;
  const kind = (SUGGEST_KINDS as readonly string[]).includes(data.kind) ? data.kind : null;
  if (!kind) return null; // 'none' or anything unknown: the draft is fine as it is
  let text: string | null = typeof data.text === 'string' ? data.text.trim().slice(0, COMPOSER_LIMITS.text) || null : null;
  if (text && text === draft.text.trim()) text = null;
  const options = kind === 'poll'
    ? [...new Set((Array.isArray(data.options) ? data.options : []).map((o: unknown) => clip(o, 80)).filter(Boolean))].slice(0, 6) as string[]
    : [];
  if (kind === 'poll' && options.length < 2) return null;
  if (kind === draft.kind && !text) return null; // nothing new to offer
  return { kind, text, options, reason: clip(data.reason, 160) };
}

@Injectable()
export class PostSuggestService {
  constructor(
    private readonly ai: AiService,
    private readonly prompts: AiPromptTemplateService,
    private readonly events: ActivityEventService,
  ) {}

  async suggest(userId: number, body: { text?: unknown; kind?: unknown }): Promise<{ suggestion: PostSuggestion | null; unavailable?: boolean }> {
    const text = typeof body?.text === 'string' ? body.text.trim().slice(0, COMPOSER_LIMITS.text) : '';
    const kind = (SUGGEST_KINDS as readonly string[]).includes(String(body?.kind)) ? String(body.kind) : 'moment';
    if (text.length < SUGGEST_MIN_TEXT) throw new BadRequestException('Andika kidogo zaidi kwanza, kisha bonyeza Pendekeza.');
    const t = this.prompts.postSuggestPrompt();
    let suggestion: PostSuggestion | null = null;
    try {
      const res = await this.ai.generate<any>({
        task: 'post-suggest', userId, system: t.system, schema: t.schema, schemaName: t.schemaName,
        prompt: `Aina ya chapisho: ${kind}\nMaandishi:\n${text}`, maxTokens: 400, temperature: 0.4,
      });
      suggestion = cleanSuggestion(res?.data, { text, kind });
    } catch {
      return { suggestion: null, unavailable: true };
    }
    // CLAUDE.md: the AI's recommendation is itself an event (no text kept, only what it proposed).
    void this.events.record({
      eventType: 'AI_POST_SUGGESTED', category: ActivityCategory.AI, actorId: userId, actorType: 'user', targetType: 'composer',
      metadata: { fromKind: kind, toKind: suggestion?.kind ?? null, newText: !!suggestion?.text, options: suggestion?.options.length ?? 0 },
    });
    return { suggestion };
  }
}
