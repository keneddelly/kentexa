import { pageToPath, pathToPage } from './urlSync';
import { destinationForPage } from '../navigation/destinationRegistry';
import { postShareUrl } from '../public/utils/feedPresentation';

describe('post links (Home Feed phase C, 2026-11-02)', () => {
  it('a post page has its own address both ways', () => {
    expect(pageToPath('PostDetail-7')).toBe('/post/7');
    expect(pageToPath('PostDetail-7-comments')).toBe('/post/7');
    expect(pathToPage('/post/7')).toBe('PostDetail-7');
  });
  it('the post page is public, with or without the comments suffix', () => {
    expect(destinationForPage('PostDetail-7')).not.toBeNull();
    expect(destinationForPage('PostDetail-7-comments')).not.toBeNull();
  });
  it('a real post shares its page; a listing in the feed shares the listing', () => {
    expect(postShareUrl({ id: 7 })).toBe('https://kentexa.com/post/7');
    expect(postShareUrl({ id: 'prd-4' }, 'product', 4)).toBe('https://kentexa.com/product/4');
    expect(postShareUrl({ id: 'svc-2' }, 'new_service', 2)).toBe('https://kentexa.com/service/2');
  });
});

describe('readable links (owner 2026-11-03)', () => {
  it('a number followed by a name opens the same page', () => {
    const { pathToPage } = require('./urlSync');
    expect(pathToPage('/product/42-simu-samsung-a15')).toBe('ProductDetail-42');
    expect(pathToPage('/classified/7-saa-ya-ukutani/')).toBe('ClassifiedDetail-7');
    expect(pathToPage('/product/42')).toBe('ProductDetail-42');
    expect(pathToPage('/product/abc')).toBeNull();
  });
});
