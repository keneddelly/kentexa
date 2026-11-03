/**
 * SMS cost (owner 2026-11-03): Africa's Talking charges TZS 22 for each SMS part. One part
 * holds 160 plain (GSM-7) characters, but ONE emoji or typographic character (the long dash,
 * curly quotes, "...") switches the whole message to Unicode, where a part holds only 70
 * (multi-part: 153 / 67 each). That is why many messages cost TZS 44.
 *
 * Every SMS passes through `smsReady()` in SmsService.sendSms, so all senders benefit:
 *   - typographic characters become their plain versions, emoji are removed;
 *   - spaces at line ends and blank lines are removed (a blank line costs a character);
 * The words themselves are never changed.
 */

// The GSM 03.38 basic set (plus the extension characters that cost two).
const GSM_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXTENDED = '^{}\\[~]|€';
const BASIC = new Set(GSM_BASIC);
const EXTENDED = new Set(GSM_EXTENDED);

const REPLACE: Array<[RegExp, string]> = [
  [/[‒–—―−]/g, '-'], // dashes, minus
  [/[‘’‚′´`]/g, "'"], // single quotes, prime, accents
  [/[“”„″«»]/g, '"'], // double quotes
  [/…/g, '...'],
  [/[  -   　]/g, ' '], // odd spaces
  [/[​-‍⁠﻿️]/g, ''], // zero-width, emoji variation selector
  [/•|·/g, '-'], // bullets, middle dot
  [/→|➔|➡/g, '->'], // arrows
  [/×/g, 'x'],
  [/[áâã]/g, 'a'], [/[êë]/g, 'e'], [/[íîï]/g, 'i'],
  [/[óôõ]/g, 'o'], [/[úû]/g, 'u'], [/ç/g, 'c'],
];

/** Plain text that stays in the 160-character mode. Characters with no plain version are dropped. */
export function toGsm7(text: string): string {
  let s = String(text ?? '');
  for (const [re, to] of REPLACE) s = s.replace(re, to);
  let out = '';
  for (const ch of s) if (BASIC.has(ch) || EXTENDED.has(ch)) out += ch;
  return out;
}

/** No spaces at line ends, no blank lines, no space runs. */
export function compactSms(text: string): string {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function smsReady(text: string): string {
  return compactSms(toGsm7(text));
}

/** How many parts (each charged) this text costs. */
export function smsParts(text: string): number {
  const s = String(text ?? '');
  if (!s) return 0;
  let gsm = true;
  let units = 0;
  for (const ch of s) {
    if (BASIC.has(ch)) units += 1;
    else if (EXTENDED.has(ch)) units += 2;
    else { gsm = false; break; }
  }
  if (!gsm) {
    const n = [...s].reduce((sum, ch) => sum + (ch.codePointAt(0)! > 0xffff ? 2 : 1), 0);
    return n <= 70 ? 1 : Math.ceil(n / 67);
  }
  return units <= 160 ? 1 : Math.ceil(units / 153);
}
