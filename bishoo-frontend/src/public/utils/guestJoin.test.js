import { askToJoin, rememberGuestPlace, takeGuestDraft, peopleLine } from './guestJoin';

beforeEach(() => { window.localStorage.clear(); window.__kxJoinSheet = false; });

test('B: without the sheet on the page, the caller signs in as before', () => {
  expect(askToJoin({ action: 'like' })).toBe(false);
});

test('B: with the sheet, the request goes to it', () => {
  window.__kxJoinSheet = true;
  const seen = jest.fn();
  window.addEventListener('kx:ask-to-join', seen);
  expect(askToJoin({ action: 'vote', destination: 'PostDetail-5' })).toBe(true);
  expect(seen.mock.calls[0][0].detail).toEqual({ action: 'vote', destination: 'PostDetail-5' });
  window.removeEventListener('kx:ask-to-join', seen);
});

test('B: the place and the reply are kept; the reply is read once, only on its own post, only for 1 hour', () => {
  rememberGuestPlace('PostDetail-88', { postId: 88, body: 'Mayai ni biashara nzuri', parentId: 11, replyName: 'Asha' });
  expect(window.localStorage.getItem('kentexa_after_login')).toBe('PostDetail-88');
  expect(takeGuestDraft(99)).toBeNull();
  expect(takeGuestDraft(88)).toEqual(expect.objectContaining({ body: 'Mayai ni biashara nzuri', parentId: 11, replyName: 'Asha' }));
  expect(takeGuestDraft(88)).toBeNull();
  rememberGuestPlace('PostDetail-88', { postId: 88, body: 'zamani' });
  const old = JSON.parse(window.localStorage.getItem('kx_guest_draft'));
  window.localStorage.setItem('kx_guest_draft', JSON.stringify({ ...old, at: Date.now() - 2 * 3600 * 1000 }));
  expect(takeGuestDraft(88)).toBeNull();
  rememberGuestPlace('Community-3', { postId: 1, body: '   ' }); // an empty reply is not kept
  expect(window.localStorage.getItem('kx_guest_draft')).toBeNull();
});

test('B: social proof uses only real names on the page, never invented', () => {
  expect(peopleLine({ people: ['Asha', 'Juma'], others: 7 })).toBe('Asha, Juma na wengine 7 wanajadili hili');
  expect(peopleLine({ people: ['Asha'], others: 0 })).toBe('Asha anajadili hili');
  expect(peopleLine({ people: [], replies: 12 })).toBe('Mazungumzo haya yana majibu 12');
  expect(peopleLine({})).toBe('Jiunge na mazungumzo kwenye KenteXa');
});
