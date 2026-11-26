import {
  buildInlineTextSegments,
  normalizeInlineReferences,
  parseHashtagRanges,
} from './inlineReferences';

describe('inlineReferences', () => {
  test('parses hashtags with Unicode and preserves offsets', () => {
    const text = 'Habari #Biashara na #Teknolojia';
    expect(parseHashtagRanges(text).map((r) => r.hashtag)).toEqual(['Biashara', 'Teknolojia']);
    expect(parseHashtagRanges('Habari,#Kentexa!').map((r) => r.hashtag)).toEqual(['Kentexa']);
  });

  test('does not parse hashtag without a boundary or an empty hashtag', () => {
    expect(parseHashtagRanges('word#tag ## #')).toEqual([]);
  });

  test('validates UTF-16 offsets against exact matched text', () => {
    const text = '😀 BIS';
    const ref = { entityType: 'business', entityId: 7, matchedText: 'BIS', startOffset: 3, endOffset: 6, source: 'automatic' };
    expect(normalizeInlineReferences(text, [ref])).toEqual([ref]);
    expect(normalizeInlineReferences(text, [{ ...ref, startOffset: 2 }])).toEqual([]);
  });

  test('rejects invalid entity types and out-of-bounds ranges', () => {
    const text = 'BIS';
    const base = { entityId: 7, matchedText: 'BIS', startOffset: 0, endOffset: 3, source: 'automatic' };
    expect(normalizeInlineReferences(text, [{ ...base, entityType: 'unknown' }])).toEqual([]);
    expect(normalizeInlineReferences(text, [{ ...base, entityType: 'business', endOffset: 8 }])).toEqual([]);
  });

  test('explicit references win overlapping automatic matches', () => {
    const text = 'GPS Tracker GF-21';
    const auto = { entityType: 'product', entityId: 1, matchedText: 'GPS Tracker', startOffset: 0, endOffset: 11, source: 'automatic' };
    const manual = { entityType: 'product', entityId: 2, matchedText: 'GPS Tracker GF-21', startOffset: 0, endOffset: 17, source: 'manual' };
    expect(normalizeInlineReferences(text, [auto, manual])).toEqual([manual]);
  });

  test('hashtag takes precedence over an automatic entity match inside its token', () => {
    const text = '#BIS';
    const ref = { entityType: 'business', entityId: 3, matchedText: 'BIS', startOffset: 1, endOffset: 4, source: 'automatic' };
    expect(buildInlineTextSegments(text, [ref])).toEqual([
      { kind: 'hashtag', startOffset: 0, endOffset: 4, matchedText: '#BIS', hashtag: 'BIS', text: '#BIS' },
    ]);
  });

  test('builds segments preserving original punctuation and whitespace', () => {
    const text = 'BIS – Vifaa #CCTV!';
    const ref = { entityType: 'business', entityId: 3, matchedText: 'BIS', startOffset: 0, endOffset: 3, source: 'automatic' };
    expect(buildInlineTextSegments(text, [ref])).toEqual([
      { kind: 'reference', ...ref, text: 'BIS' },
      { kind: 'text', text: ' – Vifaa ' },
      { kind: 'hashtag', startOffset: 12, endOffset: 17, matchedText: '#CCTV', hashtag: 'CCTV', text: '#CCTV' },
      { kind: 'text', text: '!' },
    ]);
  });
});
