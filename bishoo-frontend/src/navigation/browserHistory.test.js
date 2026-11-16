import { canGoBack, currentDepth, markFirstEntry, restoreScroll, writeEntry } from './browserHistory';
import { pageToAddress, pathToPage } from '../utils/urlSync';

beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('one navigation (#374): every page has an entry and an address', () => {
  test('Home is /, a community /community/<id>, a post /post/<id>, any other page /p/<Name>', () => {
    expect(pageToAddress('Home')).toBe('/');
    expect(pageToAddress('Community-12')).toBe('/community/12');
    expect(pageToAddress('PostDetail-9')).toBe('/post/9');
    expect(pageToAddress('MyOrders')).toBe('/p/MyOrders');
    expect(pageToAddress('bad page!')).toBeNull();
    expect(pathToPage('/community/12')).toBe('Community-12');
    expect(pathToPage('/p/MyOrders')).toBe('MyOrders');
  });

  test('community → post: back has somewhere to go, and the entry keeps page, details and depth', () => {
    markFirstEntry({ page: 'Home', params: null });
    expect(canGoBack()).toBe(false);
    writeEntry('/community/12', { page: 'Community-12', params: null });
    writeEntry('/post/9', { page: 'PostDetail-9', params: { from: 'community' } });
    expect(currentDepth()).toBe(2);
    expect(window.location.pathname).toBe('/post/9');
    expect(window.history.state).toMatchObject({ kx: true, page: 'PostDetail-9', params: { from: 'community' } });
    expect(canGoBack()).toBe(true);
  });

  test('leaving a page remembers how far it was scrolled', () => {
    markFirstEntry({ page: 'Home', params: null });
    Object.defineProperty(window, 'scrollY', { value: 640, configurable: true });
    const spy = jest.spyOn(window.history, 'replaceState');
    writeEntry('/community/12', { page: 'Community-12', params: null });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ page: 'Home', scrollY: 640 }), '');
    spy.mockRestore();
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  test('details that cannot be kept (a function) are dropped, never a crash', () => {
    expect(() => writeEntry('/p/MyOrders', { page: 'MyOrders', params: { onDone: () => {} } })).not.toThrow();
    expect(window.history.state.page).toBe('MyOrders');
  });

  test('a replace keeps the depth; a page opened from a link has nothing behind it', () => {
    markFirstEntry({ page: 'PostDetail-9', params: null });
    writeEntry('/post/9', { page: 'PostDetail-9', params: null }, 'replace');
    expect(currentDepth()).toBe(0);
    expect(canGoBack()).toBe(false);
  });

  test('scroll is restored once the page is long enough', () => {
    const spy = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const raf = jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => { cb(); return 1; });
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 5000, configurable: true });
    restoreScroll(1200);
    expect(spy).toHaveBeenLastCalledWith(0, 1200);
    restoreScroll(0);
    expect(spy).toHaveBeenLastCalledWith(0, 0);
    spy.mockRestore(); raf.mockRestore();
  });
});
