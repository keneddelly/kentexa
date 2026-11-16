import api from '../../api/api';
import { openShortLinkIfAny, prefetchShortLink, readyShortLink, arrivalShareCode, shortLinkFor } from './shortLinks';

jest.mock('../../api/api', () => ({ post: jest.fn() }));

beforeEach(() => { window.localStorage.clear(); document.head.innerHTML = ''; window.history.replaceState(null, '', '/'); });

test('A2: a short link opens the page the server named, and the code is remembered', async () => {
  window.history.replaceState(null, '', '/s/AbC12d');
  document.head.innerHTML = '<meta name="kx-target" content="/post/88">';
  await openShortLinkIfAny();
  expect(window.location.pathname).toBe('/post/88');
  expect(arrivalShareCode()).toBe('AbC12d');
});

test('A2: without the server hint, the app asks once; unknown codes go Home', async () => {
  window.history.replaceState(null, '', '/s/Zz9yy');
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ path: '/community/3' }) });
  await openShortLinkIfAny();
  expect(window.location.pathname).toBe('/community/3');
  window.history.replaceState(null, '', '/s/Nope1');
  global.fetch = jest.fn().mockResolvedValue({ ok: false });
  await openShortLinkIfAny();
  expect(window.location.pathname).toBe('/');
});

test('A2: other addresses are left alone', async () => {
  window.history.replaceState(null, '', '/post/5');
  await openShortLinkIfAny();
  expect(window.location.pathname).toBe('/post/5');
});

test('A2: a link is made ahead and ready at the tap; members-only content falls back', async () => {
  api.post.mockResolvedValueOnce({ data: { url: 'https://kentexa.com/s/AbC12' } });
  prefetchShortLink('post', 7);
  expect(readyShortLink('post', 7)).toBeNull();
  await new Promise((r) => setTimeout(r, 0));
  expect(readyShortLink('post', 7)).toBe('https://kentexa.com/s/AbC12');
  api.post.mockRejectedValueOnce(new Error('400'));
  expect(await shortLinkFor('post', 9, 'copy', 'https://kentexa.com/post/9')).toBe('https://kentexa.com/post/9');
});

test('B8: an open is counted once per tab, and a new account claims its arrival once', async () => {
  const { claimArrival } = require('./shortLinks');
  api.post.mockReset();
  api.post.mockResolvedValue({ data: {} });
  window.history.replaceState(null, '', '/s/AbC12d');
  document.head.innerHTML = '<meta name="kx-target" content="/post/88">';
  await openShortLinkIfAny();
  await new Promise((r) => setTimeout(r, 0));
  expect(api.post).toHaveBeenCalledWith('/share-links/AbC12d/visit', { sessionKey: expect.any(String) });
  claimArrival();
  await new Promise((r) => setTimeout(r, 0));
  expect(api.post).toHaveBeenCalledWith('/share-links/AbC12d/claim');
  api.post.mockClear();
  claimArrival();
  await new Promise((r) => setTimeout(r, 0));
  expect(api.post).not.toHaveBeenCalled();
});
