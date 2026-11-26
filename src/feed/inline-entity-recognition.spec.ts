import { recognizeInlineEntities } from './inline-entity-recognition';

describe('recognizeInlineEntities', () => {
  const business = { entityType: 'business' as const, entityId: 11, name: 'BIS', aliases: ['Bishoo Intelligence Systems'], discoverable: true };
  const product = { entityType: 'product' as const, entityId: 21, name: 'GPS Tracker GF-21', aliases: ['GF-21'], discoverable: true };

  it('recognizes exact case-insensitive names and aliases at word boundaries', () => {
    const text = 'Nimeona gf-21 ya bis.';
    const result = recognizeInlineEntities(text, [business, product]);
    expect(result.map((r) => r.matchedText)).toEqual(['gf-21', 'bis']);
  });

  it('recognizes repeated occurrences as separate text ranges', () => {
    const result = recognizeInlineEntities('BIS na BIS', [business]);
    expect(result).toHaveLength(2);
  });

  it('does not match partial words', () => {
    expect(recognizeInlineEntities('BISness and GF-210', [business, product])).toEqual([]);
  });

  it('does not link common terms', () => {
    expect(recognizeInlineEntities('Biashara, bidhaa, huduma', [
      { entityType: 'business', entityId: 1, name: 'Biashara', discoverable: true },
      { entityType: 'product', entityId: 2, name: 'Bidhaa', discoverable: true },
      { entityType: 'service', entityId: 3, name: 'Huduma', discoverable: true },
    ])).toEqual([]);
  });

  it('does not resolve ambiguous aliases shared by different entities', () => {
    const result = recognizeInlineEntities('BIS', [
      business,
      { entityType: 'business', entityId: 12, name: 'BIS Tanzania', aliases: ['BIS'], discoverable: true },
    ]);
    expect(result).toEqual([]);
  });

  it('does not expose non-discoverable candidates', () => {
    expect(recognizeInlineEntities('Secret Business', [
      { entityType: 'business', entityId: 99, name: 'Secret Business', discoverable: false },
    ])).toEqual([]);
  });

  it('prefers the longest overlapping exact phrase', () => {
    const result = recognizeInlineEntities('GPS Tracker GF-21', [
      { entityType: 'product', entityId: 21, name: 'GPS Tracker', discoverable: true },
      product,
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].matchedText).toBe('GPS Tracker GF-21');
  });

  it('supports Unicode text and keeps JavaScript offsets', () => {
    const text = '😀 vifaa vya BIS';
    const result = recognizeInlineEntities(text, [business]);
    expect(result[0].startOffset).toBe(13);
    expect(text.slice(result[0].startOffset, result[0].endOffset)).toBe('BIS');
  });
});
