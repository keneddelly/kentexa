// One navigation (owner approved 2026-11-16, issue #374 part A): the browser's own history is the
// single list of where the person has been. Every page opened adds an entry (its page, its
// details and, when left, how far it was scrolled), so the back arrow, the phone's back button
// and the browser's back button all return to exactly the same place.

/** How many KenteXa pages are behind this one in this tab. 0 = opened from a link or refreshed first page. */
export const currentDepth = () => {
  try { return Number(window.history.state?.kxDepth) || 0; } catch { return 0; }
};

export const canGoBack = () => currentDepth() > 0;

const write = (method, state, path) => {
  try {
    window.history[method](state, '', path);
  } catch {
    // Details that cannot be stored (a function, a file) are left out rather than failing.
    const { params, ...rest } = state; // eslint-disable-line no-unused-vars
    try { window.history[method](rest, '', path); } catch { /* history unavailable */ }
  }
};

/** Remember how far the current page is scrolled, before leaving it. */
export const rememberScroll = () => {
  try {
    const cur = window.history.state;
    if (cur && cur.kx) window.history.replaceState({ ...cur, scrollY: Math.round(window.scrollY || 0) }, '');
  } catch { /* history unavailable */ }
};

/** Add (push) or replace the entry for a page. `path` is its address; null keeps the address. */
export const writeEntry = (path, state, mode = 'push') => {
  const push = mode !== 'replace';
  if (push) rememberScroll();
  const depth = push ? currentDepth() + 1 : currentDepth();
  write(push ? 'pushState' : 'replaceState', { ...state, kx: true, kxDepth: depth }, path || undefined);
};

/** The first page of the tab gets an entry too, so coming back to it restores it. */
export const markFirstEntry = (state) => {
  try {
    if (window.history.state && window.history.state.kx) return;
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
    write('replaceState', { ...(window.history.state || {}), ...state, kx: true, kxDepth: 0 }, undefined);
  } catch { /* history unavailable */ }
};

/** After going back: scroll to where the person was, waiting (up to 2.5 s) for the page to fill. */
export const restoreScroll = (y) => {
  if (typeof window === 'undefined') return;
  const target = Number(y) || 0;
  if (!target) { window.scrollTo(0, 0); return; }
  const start = Date.now();
  const tick = () => {
    const max = Math.max(0, (document.documentElement.scrollHeight || 0) - (window.innerHeight || 0));
    if (max >= target - 4 || Date.now() - start > 2500) { window.scrollTo(0, Math.min(target, max)); return; }
    window.scrollTo(0, max);
    window.requestAnimationFrame(tick);
  };
  window.requestAnimationFrame(tick);
};
