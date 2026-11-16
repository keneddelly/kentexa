/**
 * Viral engine A3 (issue #381, owner approved mockups 2026-11-16): KenteXa's two share cards,
 * drawn on the server from a post's or community's own public words.
 *  - link card 1200x630: the preview picture WhatsApp, Facebook, X and Telegram show;
 *  - Status card 1080x1920: the picture for WhatsApp Status and Instagram Stories, with the
 *    short link printed on it.
 * Swahili first. No private data: the caller passes only content public to guests.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { Canvas, RGB, hex, mix, wrap, measure } from './canvas';
import { TrueTypeFont } from './ttf';

export type CardInput = {
  kind: 'post' | 'community' | 'writer';
  /** Badge: Swali, Kura, Mjadala, Ofa, Uzoefu, Chapisho, Jumuiya. */
  badge: string;
  /** The big words: the question, title or community name. */
  headline: string;
  /** Where it lives (community name) or what it is about. */
  context?: string;
  /** One quiet line: "kened · majibu 12" or "wanachama 1,200". */
  meta?: string;
  /** The link printed on the Status card, e.g. kentexa.com/s/AbC12. */
  link: string;
  /** The card colour (the community's colour). */
  cover?: string;
};

export const CARD_SIZES = { link: { w: 1200, h: 630 }, status: { w: 1080, h: 1920 } } as const;
export type CardFormat = keyof typeof CARD_SIZES;

const COVERS = ['#1d4ed8', '#0f766e', '#7c2d12', '#0f1419', '#6d28d9', '#b45309'];
/** Same colours as the community page header (CommunityPage.coverColor). */
export const coverFor = (communityId?: number | null): string => (communityId ? COVERS[Math.abs(Number(communityId)) % COVERS.length] : COVERS[0]);

let fonts: { bold: TrueTypeFont; regular: TrueTypeFont } | null = null;
const fontPath = (name: string) => {
  for (const base of [join(process.cwd(), 'assets', 'fonts'), join(__dirname, '..', '..', '..', 'assets', 'fonts'), join(__dirname, '..', '..', '..', '..', 'assets', 'fonts')]) {
    const p = join(base, name);
    if (existsSync(p)) return p;
  }
  throw new Error(`share card font ${name} not found`);
};
const loadFonts = () => {
  if (!fonts) {
    fonts = {
      bold: new TrueTypeFont(readFileSync(fontPath('LiberationSans-Bold.ttf'))),
      regular: new TrueTypeFont(readFileSync(fontPath('LiberationSans-Regular.ttf'))),
    };
  }
  return fonts;
};

const WHITE: RGB = [255, 255, 255];
const INK: RGB = hex('#0f1419');
const MUTED: RGB = hex('#536471');

/** KenteXa's mark (two wings) in a white rounded square at (x, y), side `s`. */
function logo(c: Canvas, x: number, y: number, s: number) {
  c.roundRect(x, y, s, s, s * 0.27, WHITE);
  const k = (s * 0.62) / 22;
  const ox = x + (s - 22 * k) / 2, oy = y + (s - 22 * k) / 2 + k;
  const P = (px: number, py: number) => ({ x: ox + px * k, y: oy + py * k });
  c.poly([P(2, 2), P(7, 8), P(11, 5), P(11, 20), P(5, 14)], hex('#1d4ed8'));
  c.poly([P(20, 2), P(15, 8), P(11, 5), P(11, 20), P(17, 14)], hex('#60a5fa'));
}

/** "Pakua app ya KenteXa: Google Play", with a small green play mark. */
export const PLAY_LINE = 'Pakua app ya KenteXa: Google Play';
function playLine(c: Canvas, f: TrueTypeFont, x: number, y: number, size: number) {
  const s = size * 0.9;
  c.poly([{ x, y: y - s }, { x: x + s * 0.85, y: y - s / 2 }, { x, y }], hex('#01875f'));
  c.text(f, PLAY_LINE, x + s * 0.85 + 14, y, size, hex('#01875f'));
}

/** A badge pill with dark text on white. Returns its width. */
function badge(c: Canvas, f: TrueTypeFont, text: string, x: number, y: number, size: number, color: RGB): number {
  const padX = size * 0.6, h = size * 1.55;
  const w = measure(f, text, size) + padX * 2;
  c.roundRect(x, y, w, h, size * 0.38, WHITE);
  c.text(f, text, x + padX, y + h * 0.5 + size * 0.36, size, color);
  return w;
}

export function drawCard(input: CardInput, format: CardFormat): Buffer {
  const { bold, regular } = loadFonts();
  const { w, h } = CARD_SIZES[format];
  const cover = hex(input.cover || COVERS[0]);
  const soft = mix(cover, WHITE, 0.82); // light text on the colour
  const c = new Canvas(w, h, cover);

  if (format === 'link') {
    const L = 72;
    let bx = L;
    bx += badge(c, bold, input.badge, L, 60, 28, cover) + 20;
    if (input.context) {
      const ctx = wrap(bold, input.context, 28, w - bx - L, 1)[0];
      c.text(bold, ctx, bx, 60 + 28 * 1.55 * 0.5 + 10, 28, soft);
    }
    const lines = wrap(bold, input.headline, 66, w - L * 2, 3);
    let y = 200;
    for (const line of lines) { c.text(bold, line, L, y, 66, WHITE); y += 78; }
    if (input.meta) c.text(regular, wrap(regular, input.meta, 30, w - L * 2, 1)[0], L, y + 14, 30, soft);
    logo(c, L, h - 60 - 56, 56);
    c.text(bold, 'KenteXa', L + 74, h - 60 - 14, 38, WHITE);
    const cta = input.kind === 'community' ? 'Jiunge kwenye KenteXa'
      : input.kind === 'writer' ? 'Fuata kwenye KenteXa'
        : input.badge === 'Makala' ? 'Soma kwenye KenteXa' : 'Jibu kwenye KenteXa';
    const cw = measure(bold, cta, 30) + 56;
    c.roundRect(w - L - cw, h - 60 - 62, cw, 62, 31, mix(cover, WHITE, 0.18));
    c.text(bold, cta, w - L - cw + 28, h - 60 - 20, 30, WHITE);
    return c.png();
  }

  // Status card 1080x1920 (safe area: WhatsApp covers the top ~150 px and bottom ~200 px).
  const L = 96;
  logo(c, L, 180, 88);
  c.text(bold, 'KenteXa', L + 112, 180 + 64, 58, WHITE);
  let y = 470;
  const bw = badge(c, bold, input.badge, L, y, 44, cover);
  if (input.context) {
    const ctx = wrap(bold, input.context, 40, w - L * 2 - bw - 24, 1)[0];
    c.text(bold, ctx, L + bw + 24, y + 44 * 1.55 * 0.5 + 15, 40, soft);
  }
  y += 215;
  const lines = wrap(bold, input.headline, 100, w - L * 2, 6);
  for (const line of lines) { c.text(bold, line, L, y, 100, WHITE); y += 118; }
  if (input.meta) c.text(regular, wrap(regular, input.meta, 44, w - L * 2, 1)[0], L, y + 20, 44, soft);

  const boxY = h - 160 - 420;
  c.roundRect(L - 16, boxY, w - (L - 16) * 2, 420, 48, WHITE);
  const ask = input.kind === 'community' ? 'Jiunge na mazungumzo kwenye KenteXa'
    : input.kind === 'writer' ? 'Soma alichoandika na umfuate kwenye KenteXa'
      : input.badge === 'Makala' ? 'Soma makala hii kwenye KenteXa' : 'Unaweza kujibu? Toa maoni yako kwenye KenteXa';
  let ty = boxY + 100;
  for (const line of wrap(bold, ask, 52, w - L * 2 - 40, 2)) { c.text(bold, line, L + 40, ty, 52, INK); ty += 64; }
  c.text(bold, wrap(bold, input.link, 50, w - L * 2 - 40, 1)[0], L + 40, ty + 26, 50, hex('#1d4ed8'));
  c.text(regular, 'Soma bila kujisajili', L + 40, ty + 90, 34, MUTED);
  // Owner 2026-11-16: every card invites people without the app to get it from Google Play.
  playLine(c, bold, L + 40, ty + 150, 34);
  return c.png();
}
