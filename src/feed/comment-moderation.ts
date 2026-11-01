import { BadRequestException } from '@nestjs/common';
import type { AiService } from '../ai/ai.service';
import type { AiPromptTemplateService } from '../ai/ai-prompt-templates.service';

export type ModerationFlag = 'clean' | 'flagged' | 'blocked' | null;

/**
 * Kentexa AI moderation of one comment body: the ONE check every comment path uses
 * (entity comments in /comments and, since Social Engagement phase A, feed comments in
 * /feed/:id/comments). A blocked comment is refused; a flagged one is saved with its flag
 * for review (advisory, never a punishment). Fails open: if the AI is down or not wired,
 * the comment is saved unflagged — posting never depends on the AI's uptime.
 */
export async function moderateCommentBody(
  ai: AiService | undefined,
  prompts: AiPromptTemplateService | undefined,
  body: string | null | undefined,
): Promise<{ moderationFlag: ModerationFlag; moderationReason: string | null }> {
  const text = body?.trim();
  if (!text || !ai || !prompts) return { moderationFlag: null, moderationReason: null };
  try {
    const template = prompts.moderationPrompt();
    const result = await ai.generate<{ verdict: 'clean' | 'flagged' | 'blocked'; reason: string }>({
      task: 'moderation',
      prompt: text,
      system: template.system,
      schema: template.schema,
      schemaName: template.schemaName,
    });
    const verdict = result.data;
    if (verdict.verdict === 'blocked') {
      throw new BadRequestException('This comment could not be posted: ' + verdict.reason);
    }
    return { moderationFlag: verdict.verdict, moderationReason: verdict.verdict === 'clean' ? null : verdict.reason };
  } catch (err) {
    if (err instanceof BadRequestException) throw err;
    return { moderationFlag: null, moderationReason: null };
  }
}
