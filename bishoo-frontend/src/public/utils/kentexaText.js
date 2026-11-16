// One KenteXa text style (owner approved 2026-11-16, issue #374 part E).
// Everything people type (posts, comments, names, descriptions, bios...) is shown the same way on
// every screen. Display only: what the person typed is saved unchanged. Never changes meaning:
// no spelling fixes, no translation, no AI.

const LETTER = /\p{L}/u;
const UPPER = /\p{Lu}/u;
const LOWER = /\p{Ll}/u;

// Short codes that stay in capitals when a shouted line is shown in normal case.
const KEEP_CAPS = new Set([
  'TZS', 'USD', 'KES', 'UGX', 'EUR', 'M-PESA', 'MPESA', 'TIGO', 'AIRTEL', 'HALOPESA', 'CRDB', 'NMB', 'NBC',
  'TRA', 'TBS', 'TMDA', 'TIN', 'VAT', 'NIDA', 'DSM', 'DAR', 'KKOO', 'CBD', 'OK', 'TV', 'PC', 'GB', 'TB', 'MB',
  'KG', 'CM', 'MM', 'KM', 'SIM', 'ATM', 'POS', 'PDF', 'ID', 'LTD', 'CO', 'NGO', 'USA', 'UK', 'EA', 'AC', 'DC',
  'HD', 'LED', 'LCD', 'USB', 'QR', 'SMS', 'WIFI', 'GPS', 'AM', 'PM', 'KENTEXA',
]);

const BRAND = { KENTEXA: 'KenteXa' };

const isAllLower = (s) => LETTER.test(s) && !UPPER.test(s);

const lettersOf = (s) => Array.from(s).filter((ch) => LETTER.test(ch));

/** A line typed all in capitals (over 20 letters) — shouting. */
export const isShouting = (line) => {
  const letters = lettersOf(line || '');
  return letters.length > 20 && !letters.some((ch) => LOWER.test(ch));
};

// Words that must not be touched when giving a sentence its capital.
const SKIP_WORD = /^(?:[#@]|https?:|www\.|\S+@\S+\.\S)/i;

const capFirst = (word) => {
  const chars = Array.from(word);
  const i = chars.findIndex((ch) => LETTER.test(ch));
  if (i < 0) return word;
  chars[i] = chars[i].toLocaleUpperCase('sw');
  return chars.join('');
};

/** Give a sentence-starting word its capital only if it is typed all small and is a plain word. */
const capSentenceWord = (word) => {
  if (!word || SKIP_WORD.test(word)) return word;
  if (!LETTER.test(word.charAt(0)) && !/^["'(“‘«]/.test(word)) return word; // starts with a number or emoji
  if (!isAllLower(word)) return word; // iPhone, eBay, KenteXa stay as written
  return capFirst(word);
};

const unshoutLine = (line) => line
  .split(/(\s+)/)
  .map((w) => {
    if (/^\s+$/.test(w) || SKIP_WORD.test(w)) return w;
    const bare = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}-]+$/gu, '').toUpperCase();
    if (KEEP_CAPS.has(bare)) return BRAND[bare] ? w.replace(new RegExp(bare, 'i'), BRAND[bare]) : w;
    return w.toLocaleLowerCase('sw');
  })
  .join('');

/** Capital at the start of the text and after . ? ! when the writer used none. */
const sentenceCaps = (text) => {
  let start = true;
  return text.split(/(\s+)/).map((tok) => {
    if (/^\s+$/.test(tok)) { if (tok.includes('\n')) start = true; return tok; }
    const out = start ? capSentenceWord(tok) : tok;
    if (!/[\p{L}\p{N}]/u.test(tok)) return out; // an emoji or a sign alone: the next word still starts the sentence
    start = /[.?!]["')”’»]*$/.test(tok) && !/\.\.$/.test(tok) && !/^(?:https?:|www\.)/i.test(tok);
    return out;
  }).join('');
};

/** Spaces: no double spaces, no space before , . ? ! ; :, at most one empty line. Line breaks and emoji kept. */
export const tidySpaces = (text) => String(text == null ? '' : text)
  .replace(/\r\n?/g, '\n')
  .replace(/[\t  ]+/g, ' ')
  .replace(/ +([,.?!;:])(?=\s|$)/g, '$1')
  .split('\n').map((l) => l.trim()).join('\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

/** Running text: a post, a comment, a description, a bio. */
export const formatText = (text) => {
  const tidy = tidySpaces(text);
  if (!tidy) return '';
  const lines = tidy.split('\n').map((l) => (isShouting(l) ? unshoutLine(l) : l));
  return sentenceCaps(lines.join('\n'));
};

/** A title or heading written as a sentence: first letter capital if typed all small. */
export const formatTitle = (title) => {
  const tidy = tidySpaces(title).replace(/\n+/g, ' ');
  if (!tidy) return '';
  if (isShouting(tidy)) return capFirst(unshoutLine(tidy));
  return isAllLower(tidy) ? capFirst(tidy) : tidy;
};

// Small joining words stay small inside a name ("Duka la Juma", "Wafanya Biashara wa Kariakoo").
const NAME_SMALL = new Set(['na', 'wa', 'ya', 'la', 'za', 'kwa', 'cha', 'vya', 'pa', 'mwa', 'ni', 'au', 'katika', 'kwenye',
  'and', 'of', 'the', 'in', 'for', 'de', 'du', 'et']);
const NAME_BRANDS = { kentexa: 'KenteXa' };

/**
 * A name (person, business, community, product), owner 2026-11-16: each word starts with a capital
 * ("wafanya biashara kariakoo" -> "Wafanya Biashara Kariakoo"); small joining words stay small;
 * a word already written with a capital inside (iPhone, BiS, TBC, M-PESA) stays exactly as typed;
 * KenteXa always as KenteXa. A long name typed all in capitals is shown in normal case first.
 */
export const formatName = (name) => {
  let tidy = tidySpaces(name).replace(/\n+/g, ' ');
  if (!tidy) return '';
  if (isShouting(tidy)) tidy = unshoutLine(tidy);
  return tidy.split(' ').map((w, i) => {
    const bare = w.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
    if (NAME_BRANDS[bare]) return w.replace(new RegExp(bare, 'i'), NAME_BRANDS[bare]);
    if (UPPER.test(w)) return w; // the writer's own capitals
    if (i > 0 && NAME_SMALL.has(bare)) return w;
    return capFirst(w);
  }).join(' ');
};

const sameWords = (a, b) => {
  const norm = (s) => String(s || '').toLocaleLowerCase('sw').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return norm(a) && norm(a) === norm(b);
};

/**
 * A caption: the title becomes the bold start of the text, followed by a colon. A title and text
 * that say the same thing (or text that already starts with the title) show once.
 * Returns { lead, text }: lead is '' when there is no separate title.
 */
export const formatCaption = (title, body) => {
  const t = formatTitle(title);
  const b = formatText(body);
  if (!t) return { lead: '', text: b };
  if (!b || sameWords(t, b)) return { lead: '', text: b || formatText(title) };
  const first = b.split('\n')[0];
  if (sameWords(t, first)) return { lead: '', text: b };
  if (sameWords(t, first.slice(0, t.length))) return { lead: '', text: b };
  return { lead: t.replace(/[\s:;,.-]+$/u, ''), text: b };
};

/** The separator after a lead: a colon, unless the title already ends a sentence (? or !). */
export const leadSeparator = (lead) => (/[?!]$/.test(lead || '') ? ' ' : ': ');

/** A price: 100000 -> "100,000 TZS". Empty for nothing or zero. */
export const formatPrice = (amount, currency = 'TZS') => {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${Math.round(n).toLocaleString('en-US')} ${currency}`;
};

/** A Tanzanian phone number: 0712345678 / +255712345678 -> "0712 345 678" / "+255 712 345 678". */
export const formatPhone = (phone) => {
  const raw = String(phone || '').trim();
  const digits = raw.replace(/[^\d+]/g, '');
  let m = digits.match(/^(?:\+?255)(\d{3})(\d{3})(\d{3})$/);
  if (m) return `+255 ${m[1]} ${m[2]} ${m[3]}`;
  m = digits.match(/^0(\d{3})(\d{3})(\d{3})$/);
  if (m) return `0${m[1]} ${m[2]} ${m[3]}`;
  return raw;
};

/** Fixed KenteXa type sizes (Twitter style). */
export const TYPE = {
  name: { fontSize: 15, fontWeight: 700, color: '#0f1419' },
  body: { fontSize: 16, lineHeight: '22px', fontWeight: 400, color: '#0f1419' },
  bodyDetail: { fontSize: 17, lineHeight: '24px', fontWeight: 400, color: '#0f1419' },
  small: { fontSize: 13, color: '#536471' },
};
