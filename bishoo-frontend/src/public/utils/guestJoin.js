// Viral engine B (owner approved 2026-11-16, issue #381): a guest who wants to take part (reply,
// like, vote, join, follow) is invited to register at that moment, and comes back to the same
// place afterwards, with their reply ready. One sheet for the whole app (GuestJoinSheet).

const DRAFT_KEY = 'kx_guest_draft';
const DRAFT_MS = 60 * 60 * 1000; // a guest's reply is kept 1 hour on this phone

/**
 * Ask a guest to join. `detail`: { action: 'reply'|'like'|'vote'|'join'|'follow'|'save'|'repost',
 * destination: 'PostDetail-88' | 'Community-3', people: ['Asha', ...], others: 7, replies: 12,
 * draft: { postId, body, parentId, replyName } }. Returns false when no sheet is on the page
 * (the caller then sends the person to sign in as before).
 */
export const askToJoin = (detail) => {
  if (typeof window === 'undefined' || !window.__kxJoinSheet) return false;
  window.dispatchEvent(new CustomEvent('kx:ask-to-join', { detail }));
  return true;
};

/** Where to come back after registering (the existing kentexa_after_login step), and the reply. */
export const rememberGuestPlace = (destination, draft) => {
  try {
    if (destination) window.localStorage.setItem('kentexa_after_login', destination);
    if (draft && String(draft.body || '').trim()) {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, body: String(draft.body).slice(0, 2000), at: Date.now() }));
    }
  } catch { /* storage off: they come back to Home instead */ }
};

/** The reply a guest wrote on this post before registering (fresh only); read once. */
export const takeGuestDraft = (postId) => {
  try {
    const v = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null');
    if (!v || String(v.postId) !== String(postId)) return null;
    window.localStorage.removeItem(DRAFT_KEY);
    return Date.now() - Number(v.at) < DRAFT_MS ? v : null;
  } catch { return null; }
};

/** "Asha, Juma na wengine 7 wanajadili hili" — only from real names already on the page. */
export const peopleLine = ({ people = [], others = 0, replies = 0 }) => {
  const names = people.filter(Boolean).slice(0, 2);
  if (names.length === 2) return `${names[0]}, ${names[1]}${others > 0 ? ` na wengine ${others}` : ''} wanajadili hili`;
  if (names.length === 1) return others > 0 ? `${names[0]} na wengine ${others} wanajadili hili` : `${names[0]} anajadili hili`;
  if (replies > 0) return `Mazungumzo haya yana majibu ${replies}`;
  return 'Jiunge na mazungumzo kwenye KenteXa';
};
