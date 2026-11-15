/**
 * Page error reports from phones and computers (owner approved 2026-11-15: "KenteXa should work
 * fine on all" browsers). When a page fails, the site sends a short report so we see which
 * page, what error, and which browser, instead of waiting for people to complain.
 *
 * Only what is needed to fix the fault is kept: never the address's query (it can hold private
 * order links), never form contents; texts are cut short.
 */
export const CLIENT_ERROR_KINDS = ['page', 'app', 'script', 'boot', 'slow'] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

export interface ClientErrorReport {
  kind: ClientErrorKind;
  page: string | null;
  path: string | null;
  message: string;
  stack: string | null;
  appMode: 'android_app' | 'installed' | 'web';
  browser: { name: string; version: number | null; os: string; osVersion: string | null };
  appVersion: string | null;
}

const text = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, ' ').trim();
  return s ? s.slice(0, max) : null;
};

/** The browser and phone system from a user agent, coarse (name and major version only). */
export function describeBrowser(ua: string | null | undefined): ClientErrorReport['browser'] {
  const s = String(ua || '').slice(0, 500);
  const os = /Android/i.test(s) ? 'Android' : /iPhone|iPad|iPod/i.test(s) ? 'iOS' : /Windows/i.test(s) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(s) ? 'macOS' : /Linux/i.test(s) ? 'Linux' : 'other';
  const osVersion = (s.match(/Android ([\d.]+)/i) || s.match(/OS (\d+[_.]\d+)/i) || [])[1]?.replace('_', '.') || null;
  const rules: Array<[string, RegExp]> = [
    ['Opera Mini', /Opera Mini\/(\d+)/i],
    ['Opera', /(?:OPR|Opera)\/(\d+)/i],
    ['Samsung Internet', /SamsungBrowser\/(\d+)/i],
    ['UC Browser', /UCBrowser\/(\d+)/i],
    ['Edge', /Edg(?:A|iOS)?\/(\d+)/i],
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/i],
    ['Android WebView', /; wv\).*Chrome\/(\d+)/i],
    ['Chrome', /(?:Chrome|CriOS)\/(\d+)/i],
    ['Safari', /Version\/(\d+).*Safari/i],
  ];
  for (const [name, re] of rules) {
    const m = s.match(re);
    if (m) return { name, version: Number(m[1]) || null, os, osVersion };
  }
  return { name: 'other', version: null, os, osVersion };
}

/** A cleaned report, or null when the body is not a report. */
export function cleanClientError(body: any, userAgent: string | null | undefined): ClientErrorReport | null {
  if (!body || typeof body !== 'object') return null;
  const kind = CLIENT_ERROR_KINDS.includes(body.kind) ? (body.kind as ClientErrorKind) : null;
  const message = text(body.message, 300);
  if (!kind || !message) return null;
  const rawPath = text(body.path, 200);
  return {
    kind,
    page: text(body.page, 80),
    // The path only: anything after ? or # can hold a private link.
    path: rawPath ? rawPath.split(/[?#]/)[0] : null,
    message,
    stack: text(body.stack, 1500),
    appMode: body.appMode === 'android_app' || body.appMode === 'installed' ? body.appMode : 'web',
    browser: describeBrowser(userAgent),
    appVersion: text(body.appVersion, 40),
  };
}
