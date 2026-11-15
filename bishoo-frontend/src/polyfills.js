// Older phones (owner approved 2026-11-15). Newer functions the site and its libraries use that
// an old Chrome (64+) or Safari (12+) does not have. Only what is needed, to keep the site light.
import 'core-js/stable/global-this';
import 'core-js/stable/array/at';
import 'core-js/stable/array/flat';
import 'core-js/stable/array/flat-map';
import 'core-js/stable/array/find-last';
import 'core-js/stable/array/find-last-index';
import 'core-js/stable/array/includes';
import 'core-js/stable/object/entries';
import 'core-js/stable/object/values';
import 'core-js/stable/object/from-entries';
import 'core-js/stable/object/has-own';
import 'core-js/stable/promise/finally';
import 'core-js/stable/promise/all-settled';
import 'core-js/stable/promise/any';
import 'core-js/stable/string/at';
import 'core-js/stable/string/match-all';
import 'core-js/stable/string/replace-all';
import 'core-js/stable/string/pad-start';
import 'core-js/stable/string/pad-end';
import 'core-js/stable/string/trim-start';
import 'core-js/stable/string/trim-end';
import 'core-js/stable/queue-microtask';

// crypto.randomUUID needs Chrome 92 and a secure page; a random v4 id from getRandomValues
// (Chrome 11+) is the same thing for our use (request keys, offline sale ids).
if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID !== 'function'
    && typeof window.crypto.getRandomValues === 'function') {
  try {
    window.crypto.randomUUID = function randomUUID() {
      const b = window.crypto.getRandomValues(new Uint8Array(16));
      b[6] = (b[6] & 0x0f) | 0x40;
      b[8] = (b[8] & 0x3f) | 0x80;
      const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    };
  } catch { /* read-only crypto: callers keep their own fallbacks */ }
}
