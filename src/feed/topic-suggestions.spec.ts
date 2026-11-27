import { buildTopicQuery, topicSuggestionsEnabled, TOPIC_SUGGESTION_LIMIT } from './topic-suggestions';

describe('topic suggestions helpers', () => {
  it('is off unless the flag is exactly true', () => {
    expect(topicSuggestionsEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(topicSuggestionsEnabled({ TOPIC_SUGGESTIONS_ENABLED: 'false' } as NodeJS.ProcessEnv)).toBe(false);
    expect(topicSuggestionsEnabled({ TOPIC_SUGGESTIONS_ENABLED: 'true' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('joins title and topic fields and collapses whitespace', () => {
    expect(buildTopicQuery({ title: '  Natafuta  laptop ', topicLabel: 'Biashara', topicNote: 'Bei, wateja', topicDescription: null }))
      .toBe('Natafuta laptop. Biashara. Bei, wateja');
  });

  it('returns empty when there is too little text to match', () => {
    expect(buildTopicQuery({ title: 'ok' })).toBe('');
    expect(buildTopicQuery({})).toBe('');
  });

  it('caps the query length', () => {
    expect(buildTopicQuery({ title: 'x'.repeat(2000) }).length).toBeLessThanOrEqual(600);
  });

  it('keeps the limit at three suggestions', () => {
    expect(TOPIC_SUGGESTION_LIMIT).toBe(3);
  });
});
