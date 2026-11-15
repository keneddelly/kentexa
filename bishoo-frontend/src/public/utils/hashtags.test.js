import { countHashtags, extractHashtags, hashtagBeingTyped, hashtagKey, insertHashtag, MAX_HASHTAGS, splitHashtags } from './hashtags';
import { pageToPath, pathToPage } from '../../utils/urlSync';
import { evaluateDestination } from '../../navigation/navigationPolicy';

// Same cases as the server's reader (src/feed/hashtags.spec.ts): the two must never disagree.
describe('hashtag reader (same rules as the server)', () => {
  test('reads tags at the start and after spaces or brackets', () => {
    expect(extractHashtags('#Mitumba bei nzuri (#Kariakoo) na #dar_es_salaam')).toEqual([
      { key: 'mitumba', display: 'Mitumba' },
      { key: 'kariakoo', display: 'Kariakoo' },
      { key: 'dar_es_salaam', display: 'dar_es_salaam' },
    ]);
  });

  test('one tag whatever the letter case; the first way it was written shows', () => {
    expect(extractHashtags('#Mitumba #MITUMBA #mitumba')).toEqual([{ key: 'mitumba', display: 'Mitumba' }]);
  });

  test('not links, glued words, numbers only, too short or too long', () => {
    expect(extractHashtags('kentexa.com/#juu a#b #2026 #a #' + 'x'.repeat(51))).toEqual([]);
  });

  test('letters with marks and other scripts', () => {
    expect(extractHashtags('#Café #नमस्ते #2026bei').map((t) => t.key)).toEqual(['café', 'नमस्ते', '2026bei']);
  });

  test('at most 5 tags', () => {
    expect(extractHashtags('#a1 #b2 #c3 #d4 #e5 #f6 #g7').map((t) => t.key)).toEqual(['a1', 'b2', 'c3', 'd4', 'e5']);
    expect(countHashtags('#a1 #b2 #c3 #d4 #e5 #f6 #g7')).toBe(7);
    expect(MAX_HASHTAGS).toBe(5);
  });

  test('lookup key', () => {
    expect(hashtagKey('#Mitumba')).toBe('mitumba');
    expect(hashtagKey('ｍｉｔｕｍｂａ')).toBe('mitumba');
    expect(hashtagKey('12')).toBeNull();
    expect(hashtagKey('a b')).toBeNull();
  });
});

describe('tags as links', () => {
  test('splits the text into plain parts and the first 5 tags', () => {
    expect(splitHashtags('Leo #Soko na #soko tena')).toEqual([
      { text: 'Leo ' }, { text: '#Soko', key: 'soko' }, { text: ' na ' }, { text: '#soko', key: 'soko' }, { text: ' tena' },
    ]);
    const parts = splitHashtags('#a1 #b2 #c3 #d4 #e5 #f6');
    expect(parts.filter((p) => p.key).map((p) => p.key)).toEqual(['a1', 'b2', 'c3', 'd4', 'e5']);
    expect(parts.map((p) => p.text).join('')).toBe('#a1 #b2 #c3 #d4 #e5 #f6');
    expect(splitHashtags('hakuna tagi')).toEqual([{ text: 'hakuna tagi' }]);
  });
});

describe('composer', () => {
  test('finds the tag being typed before the cursor', () => {
    expect(hashtagBeingTyped('Nauza #mit', 10)).toEqual({ start: 6, query: 'mit' });
    expect(hashtagBeingTyped('Nauza #mit leo', 10)).toEqual({ start: 6, query: 'mit' });
    expect(hashtagBeingTyped('Nauza #mit leo', 14)).toBeNull();
    expect(hashtagBeingTyped('a#mit', 5)).toBeNull();
    expect(hashtagBeingTyped('#', 1)).toBeNull();
  });

  test('puts the chosen tag in place, with a space after it', () => {
    const typed = hashtagBeingTyped('Nauza #mit', 10);
    expect(insertHashtag('Nauza #mit', typed, 'Mitumba', 10)).toEqual({ text: 'Nauza #Mitumba ', caret: 15 });
    const mid = hashtagBeingTyped('Nauza #mi leo', 9);
    expect(insertHashtag('Nauza #mi leo', mid, 'Mitumba', 9)).toEqual({ text: 'Nauza #Mitumba leo', caret: 14 });
  });
});

describe('tag page address', () => {
  test('kentexa.com/tag/<key> opens the tag page, for everyone', () => {
    expect(pageToPath('Tag-mitumba')).toBe('/tag/mitumba');
    expect(pageToPath('Tag-café')).toBe('/tag/caf%C3%A9');
    expect(pathToPage('/tag/Mitumba')).toBe('Tag-mitumba');
    expect(pathToPage('/tag/caf%C3%A9')).toBe('Tag-café');
    expect(pathToPage('/tag/12')).toBeNull();
    expect(pathToPage('/tag/%E0%A4')).toBeNull();
    expect(evaluateDestination({ page: 'Tag-mitumba', isAuthenticated: false }).allowed).toBe(true);
  });
});
