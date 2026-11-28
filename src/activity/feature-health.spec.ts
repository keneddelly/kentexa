import { evaluateFeature, TableCheck } from './feature-health';

const ok: TableCheck = { table: 'business_feed_item', tableExists: true, expectedColumns: ['id', 'title'], missingColumns: [] };

describe('feature health (Error Watch)', () => {
  it('is healthy when tables and columns are present', () => {
    expect(evaluateFeature('publish', [ok]).healthy).toBe(true);
  });

  it('fails and names the column when a mapped column is missing', () => {
    const r = evaluateFeature('publish', [{ ...ok, missingColumns: ['topicSuggestions'] }]);
    expect(r.healthy).toBe(false);
    expect(r.reason).toContain('business_feed_item.topicSuggestions');
  });

  it('fails when a table is missing', () => {
    const r = evaluateFeature('messaging', [{ table: 'conversation_message', tableExists: false, expectedColumns: [], missingColumns: [] }]);
    expect(r.healthy).toBe(false);
    expect(r.reason).toContain('conversation_message');
  });
});
