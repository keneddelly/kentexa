// A registration link (?ref=CODE: an office's KTX-SA-.. or an advertiser's K......)
// is kept until the visitor registers, even if they browse first (owner 2026-10-26:
// advertisers earn for each user they bring). Browser storage can be missing; then
// only the current URL counts.
const KEY = 'kx_ref';
const VALID = /^[A-Za-z0-9-]{3,24}$/;

export function rememberReferral(search = typeof window !== 'undefined' ? window.location.search : '') {
  const ref = new URLSearchParams(search).get('ref');
  if (ref && VALID.test(ref)) {
    try { window.localStorage.setItem(KEY, ref); } catch { /* storage blocked */ }
  }
  return ref && VALID.test(ref) ? ref : null;
}

export function referralCode(search = typeof window !== 'undefined' ? window.location.search : '') {
  const fromUrl = new URLSearchParams(search).get('ref');
  if (fromUrl && VALID.test(fromUrl)) return fromUrl;
  try {
    const kept = window.localStorage.getItem(KEY);
    return kept && VALID.test(kept) ? kept : '';
  } catch { return ''; }
}

export function forgetReferral() {
  try { window.localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}
