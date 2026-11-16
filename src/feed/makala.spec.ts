import { BadRequestException } from '@nestjs/common';
import { assertComposerText, assertPublishInput, assertMedia, ARTICLE_LIMITS } from './publish-input';
import { readMinutes, stripArticle } from './article-text';
import { postPreview } from '../share/share.controller';

/** Makala (owner approved 2026-11-16): long articles. */
describe('Makala', () => {
  const article = { type: 'moment', intent: 'article', title: 'Jinsi ya kuanza biashara', body: 'x'.repeat(ARTICLE_LIMITS.text) };

  it('a title up to 150 and the text up to 20,000; other posts keep 3,000', () => {
    expect(() => assertComposerText(article)).not.toThrow();
    expect(() => assertPublishInput(article)).not.toThrow();
    expect(() => assertComposerText({ ...article, title: 'a'.repeat(151) })).toThrow(BadRequestException);
    expect(() => assertComposerText({ ...article, body: 'a'.repeat(20001) })).toThrow(BadRequestException);
    expect(() => assertComposerText({ intent: 'discussion', body: 'a'.repeat(3001) })).toThrow(BadRequestException);
  });

  it('a cover and up to 4 photos inside', () => {
    const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `p${i}.jpg` }));
    expect(() => assertPublishInput({ ...article, media: photos(5) })).not.toThrow();
    expect(() => assertPublishInput({ ...article, media: photos(6) })).toThrow(BadRequestException);
    expect(() => assertMedia(photos(5))).toThrow(BadRequestException); // a normal post keeps 4
  });

  it('plain words and reading time come from the text without its layout marks', () => {
    const body = '## Anza na bidhaa\n- Viatu\n> **Mtaji** mdogo\n[picha 2]\nManeno mengine';
    expect(stripArticle(body)).toBe('Anza na bidhaa\nViatu\nMtaji mdogo\nManeno mengine');
    expect(readMinutes('neno '.repeat(1200))).toBe(6);
    expect(readMinutes('')).toBe(1);
  });

  it('a shared Makala reads "Makala: <title>" and its start without marks', () => {
    const p = postPreview({ intent: 'article', title: 'Jinsi ya kuanza biashara', body: '## Utangulizi\nWatu **wengi** hufikiri', owner: 'Kened' });
    expect(p.title).toBe('Makala: Jinsi ya kuanza biashara');
    expect(p.description).toContain('Utangulizi Watu wengi hufikiri');
    expect(p.description).not.toContain('**');
  });
});
