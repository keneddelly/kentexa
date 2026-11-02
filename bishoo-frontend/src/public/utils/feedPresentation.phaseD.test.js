import { postPhotos, formatTag, canEditPost, POST_KINDS } from './feedPresentation';

describe('phase D presentation (owner approved 2026-11-02)', () => {
  it('a post made before phase D shows its single photo; a new one its list, at most 4', () => {
    expect(postPhotos({ imageUrl: 'a.jpg' })).toEqual([{ url: 'a.jpg', width: null, height: null }]);
    expect(postPhotos({ imageUrl: 'a.jpg', media: [{ url: 'a.jpg', width: 4, height: 3 }, { url: 'b.jpg' }] }).map((p) => p.url)).toEqual(['a.jpg', 'b.jpg']);
    expect(postPhotos({ media: [1, 2, 3, 4, 5].map((n) => ({ url: `${n}.jpg` })) })).toHaveLength(4);
    expect(postPhotos({})).toEqual([]);
  });
  it('question, discussion and offer show a tag; a plain Moment none', () => {
    expect(formatTag('question')).toBe('Swali');
    expect(formatTag('discussion')).toBe('Mjadala');
    expect(formatTag('offer')).toBe('Ofa');
    expect(formatTag('update')).toBe('');
  });
  it('only the author, only within 15 minutes, only a real post', () => {
    const now = Date.parse('2026-11-02T10:20:00Z');
    const post = { id: 7, businessId: 3, createdAt: '2026-11-02T10:10:00Z' };
    expect(canEditPost(post, 3, now)).toBe(true);
    expect(canEditPost(post, 4, now)).toBe(false);
    expect(canEditPost({ ...post, createdAt: '2026-11-02T10:04:00Z' }, 3, now)).toBe(false);
    expect(canEditPost({ ...post, id: 'prd-7' }, 3, now)).toBe(false);
  });
  it('the composer offers seven kinds, Kura included (phase E)', () => {
    expect(POST_KINDS.map((k) => k.label)).toEqual(['Moment', 'Swali', 'Mjadala', 'Onyesha bidhaa', 'Ofa', 'Kura', 'Natafuta']);
  });
});

describe('Social Home topics', () => {
  const { topicLabel } = require('./feedPresentation');
  it('a topic shows its label from the server list, else the starting label', () => {
    expect(topicLabel('kilimo', [{ key: 'kilimo', label: 'Kilimo na mifugo' }])).toBe('Kilimo na mifugo');
    expect(topicLabel('usafiri')).toBe('Usafiri na mizigo');
    expect(topicLabel('haipo')).toBe('');
  });
});
