import { extractHashtags, hashtagSearchQuery } from './hashtags';

describe('extractHashtags', () => {
  test('extracts unique hashtags and preserves their display spelling', () => {
    expect(extractHashtags('Karibu #Biashara #CCTV #biashara')).toEqual([
      { label: 'Biashara', normalized: 'biashara' },
      { label: 'CCTV', normalized: 'cctv' },
    ]);
  });

  test('supports Swahili and other Unicode letters', () => {
    expect(extractHashtags('Habari #Teknolojia #kilimoChaMbogamboga')).toHaveLength(2);
  });

  test('ignores one-character tags, email fragments and punctuation-only tokens', () => {
    expect(extractHashtags('x #a person@example.com #!!!')).toEqual([]);
  });

  test('does not treat a hashtag embedded in a word as a tag', () => {
    expect(extractHashtags('abc#notatag')).toEqual([]);
  });

  test('normalizes full-width characters for duplicate detection', () => {
    expect(extractHashtags('#ＣＣＴＶ #cctv')).toHaveLength(1);
  });
});

test('hashtagSearchQuery removes the leading hash', () => {
  expect(hashtagSearchQuery('#CCTV')).toBe('CCTV');
});
