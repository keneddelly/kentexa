// Sign-in and sign-up errors in the person's language (owner approved 2026-11-16, issue #361).
// The server sends a stable `code`; the page shows it in Swahili, English or French. A message
// the server wrote in English never reaches the screen when a code exists.
const KNOWN = ['PHONE_TAKEN', 'EMAIL_TAKEN', 'ACCOUNT_NOT_FOUND', 'ALREADY_VERIFIED', 'OTP_TOO_MANY',
  'OTP_EXPIRED', 'OTP_WRONG', 'INVALID_CREDENTIALS', 'ACCOUNT_NOT_VERIFIED'];

const SWAHILI = /\b(namba|akaunti|jina|weka|andika|imeshindikana|tafadhali|umejaribu|muda|kuingia)\b/i;

/** The code behind an error, for showing and for the help request. */
export function authErrorCode(err) {
  const data = err?.response?.data;
  if (data && KNOWN.includes(data.code)) return data.code;
  if (err?.response?.status === 429) return 'TOO_MANY_REQUESTS';
  if (err && !err.response && (err.request || err.code === 'ERR_NETWORK' || err.message === 'Network Error')) return 'NETWORK';
  return null;
}

/** What to show for an error: the translated code, else a Swahili server message, else the fallback. */
export function authErrorText(err, t, fallbackKey) {
  const code = authErrorCode(err);
  if (code) {
    const remaining = err?.response?.data?.remaining;
    return remaining === undefined ? t(`signin.errors.${code}`) : t(`signin.errors.${code}`, { remaining });
  }
  const message = err?.response?.data?.message;
  // A server message already written in Swahili (e.g. checkout's "Weka namba sahihi...") is
  // shown as is; English sentences and validation lists get the plain fallback instead.
  if (typeof message === 'string' && SWAHILI.test(message)) return message;
  return t(fallbackKey);
}
