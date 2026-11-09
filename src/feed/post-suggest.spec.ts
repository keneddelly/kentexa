import { BadRequestException } from '@nestjs/common';
import { PostSuggestService, cleanSuggestion } from './post-suggest.service';

/** Smart Post "Pendekeza" (owner 2026-11-09): one optional suggestion, never blocking. */
describe('Pendekeza', () => {
  const draft = { text: 'Nina viatu rangi nyeusi na nyekundu, ipi nzuri?', kind: 'moment' };

  it('keeps a usable suggestion: a known kind, text within 500, 2 to 6 poll options', () => {
    expect(cleanSuggestion({ kind: 'poll', text: 'Rangi ipi?', options: ['Nyeusi', 'Nyekundu', 'Nyeusi', ' '], reason: 'Kura hujibiwa haraka.' }, draft))
      .toEqual({ kind: 'poll', text: 'Rangi ipi?', options: ['Nyeusi', 'Nyekundu'], reason: 'Kura hujibiwa haraka.' });
    expect(cleanSuggestion({ kind: 'question', text: 'x'.repeat(700), options: [], reason: '' }, draft)!.text).toHaveLength(500);
  });

  it('drops: none, unknown kinds, a poll without 2 options, the same kind with no new text', () => {
    expect(cleanSuggestion({ kind: 'none', text: '', options: [], reason: '' }, draft)).toBeNull();
    expect(cleanSuggestion({ kind: 'ad', text: 'x', options: [], reason: '' }, draft)).toBeNull();
    expect(cleanSuggestion({ kind: 'poll', text: 'x', options: ['A'], reason: '' }, draft)).toBeNull();
    expect(cleanSuggestion({ kind: 'moment', text: draft.text, options: [], reason: '' }, draft)).toBeNull();
    expect(cleanSuggestion(null, draft)).toBeNull();
  });

  const build = (generate: any) => {
    const ai: any = { generate };
    const prompts: any = { postSuggestPrompt: () => ({ system: 's', schema: {}, schemaName: 'post_suggestion' }) };
    const events: any = { record: jest.fn(async () => undefined) };
    return { svc: new PostSuggestService(ai, prompts, events), ai, events };
  };

  it('asks the AI with the draft and records an AI event without the text', async () => {
    const { svc, ai, events } = build(jest.fn(async () => ({ data: { kind: 'question', text: '', options: [], reason: 'Uliza moja kwa moja.' } })));
    const r = await svc.suggest(5, { text: draft.text, kind: 'moment' });
    expect(r).toEqual({ suggestion: { kind: 'question', text: null, options: [], reason: 'Uliza moja kwa moja.' } });
    expect(ai.generate).toHaveBeenCalledWith(expect.objectContaining({ task: 'post-suggest', userId: 5 }));
    const ev = events.record.mock.calls[0][0];
    expect(ev).toMatchObject({ eventType: 'AI_POST_SUGGESTED', metadata: { fromKind: 'moment', toKind: 'question' } });
    expect(JSON.stringify(ev)).not.toContain('viatu');
  });

  it('AI down: no suggestion, never an error; too short a draft is refused before the AI', async () => {
    const down = build(jest.fn(async () => { throw new Error('timeout'); }));
    await expect(down.svc.suggest(5, { text: draft.text })).resolves.toEqual({ suggestion: null, unavailable: true });
    const short = build(jest.fn());
    await expect(short.svc.suggest(5, { text: 'Habari' })).rejects.toBeInstanceOf(BadRequestException);
    expect(short.ai.generate).not.toHaveBeenCalled();
  });
});
