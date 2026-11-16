/**
 * Viral engine A3 (issue #381): a tiny drawing surface for share cards: solid fills of outlines
 * (anti-aliased, signed-area accumulation as in font-rs), rounded rectangles, text from a
 * TrueType font, and a PNG writer (zlib from Node). No packages.
 */
import { deflateSync } from 'zlib';
import { Contour, Point, TrueTypeFont } from './ttf';

export type RGB = [number, number, number];
export const hex = (h: string): RGB => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h);
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** A colour mixed with another, `t` of the second (0..1). */
export const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;

type Seg = [number, number, number, number]; // x0, y0, x1, y1 in pixels

export class Canvas {
  readonly px: Uint8Array;
  private readonly acc: Float32Array;
  private readonly stride: number;

  constructor(readonly w: number, readonly h: number, bg: RGB) {
    this.px = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) { this.px[i * 3] = bg[0]; this.px[i * 3 + 1] = bg[1]; this.px[i * 3 + 2] = bg[2]; }
    this.stride = w + 2; // two spare cells per row: a line's spill never reaches the next row
    this.acc = new Float32Array(this.stride * h);
  }

  /** Fill closed outlines given as line segments (pixels, y down), non-zero-ish winding. */
  fill(segs: Seg[], color: RGB, alpha = 1) {
    if (!segs.length) return;
    let minY = this.h, maxY = 0;
    for (const s of segs) {
      const a = this.clamp(s);
      minY = Math.min(minY, a[1], a[3]); maxY = Math.max(maxY, a[1], a[3]);
      this.line(a[0], a[1], a[2], a[3]);
    }
    const y0 = Math.max(0, Math.floor(minY));
    const y1 = Math.min(this.h, Math.ceil(maxY) + 1);
    for (let y = y0; y < y1; y++) {
      let sum = 0;
      const row = y * this.stride;
      for (let x = 0; x < this.w; x++) {
        sum += this.acc[row + x];
        this.acc[row + x] = 0;
        const cov = Math.min(1, Math.abs(sum)) * alpha;
        if (cov > 0.002) {
          const i = (y * this.w + x) * 3;
          this.px[i] += (color[0] - this.px[i]) * cov;
          this.px[i + 1] += (color[1] - this.px[i + 1]) * cov;
          this.px[i + 2] += (color[2] - this.px[i + 2]) * cov;
        }
      }
      this.acc[row + this.w] = 0;
      this.acc[row + this.w + 1] = 0;
    }
  }

  private clamp(s: Seg): Seg {
    const cx = (v: number) => Math.max(0, Math.min(this.w - 1.001, v));
    const cy = (v: number) => Math.max(0, Math.min(this.h, v));
    return [cx(s[0]), cy(s[1]), cx(s[2]), cy(s[3])];
  }

  /** Signed-area accumulation of one line (font-rs). */
  private line(x0p: number, y0p: number, x1p: number, y1p: number) {
    if (y0p === y1p) return;
    let dir = 1;
    let p0x = x0p, p0y = y0p, p1x = x1p, p1y = y1p;
    if (p0y > p1y) { dir = -1; [p0x, p0y, p1x, p1y] = [x1p, y1p, x0p, y0p]; }
    const dxdy = (p1x - p0x) / (p1y - p0y);
    let x = p0x;
    const yStart = Math.floor(p0y);
    const yEnd = Math.min(this.h, Math.ceil(p1y));
    const a = this.acc;
    for (let y = yStart; y < yEnd; y++) {
      const ls = y * this.stride;
      const dy = Math.min(y + 1, p1y) - Math.max(y, p0y);
      const xnext = x + dxdy * dy;
      const d = dy * dir;
      const xa = Math.min(x, xnext), xb = Math.max(x, xnext);
      const x0f = Math.floor(xa), x0i = x0f;
      const x1c = Math.ceil(xb), x1i = x1c;
      if (x1i <= x0i + 1) {
        const xmf = 0.5 * (x + xnext) - x0f;
        a[ls + x0i] += d - d * xmf;
        a[ls + x0i + 1] += d * xmf;
      } else {
        const s = 1 / (xb - xa);
        const fr0 = xa - x0f;
        const a0 = 0.5 * s * (1 - fr0) * (1 - fr0);
        const fr1 = xb - x1c + 1;
        const am = 0.5 * s * fr1 * fr1;
        a[ls + x0i] += d * a0;
        if (x1i === x0i + 2) a[ls + x0i + 1] += d * (1 - a0 - am);
        else {
          const a1 = s * (1.5 - fr0);
          a[ls + x0i + 1] += d * (a1 - a0);
          for (let xi = x0i + 2; xi < x1i - 1; xi++) a[ls + xi] += d * s;
          const a2 = a1 + (x1i - x0i - 3) * s;
          a[ls + x1i - 1] += d * (1 - a2 - am);
        }
        a[ls + x1i] += d * am;
      }
      x = xnext;
    }
  }

  /** A rectangle with round corners. */
  roundRect(x: number, y: number, w: number, h: number, r: number, color: RGB, alpha = 1) {
    const rr = Math.min(r, w / 2, h / 2);
    const pts: Point[] = [];
    const arc = (cx: number, cy: number, a0: number) => {
      for (let k = 0; k <= 8; k++) {
        const t = a0 + (k / 8) * (Math.PI / 2);
        pts.push({ x: cx + rr * Math.cos(t), y: cy + rr * Math.sin(t) });
      }
    };
    arc(x + w - rr, y + rr, -Math.PI / 2);
    arc(x + w - rr, y + h - rr, 0);
    arc(x + rr, y + h - rr, Math.PI / 2);
    arc(x + rr, y + rr, Math.PI);
    this.fill(polygon(pts), color, alpha);
  }

  /** Draw a polygon given in pixels. */
  poly(pts: Point[], color: RGB) { this.fill(polygon(pts), color); }

  /** One line of text; (x, baseline). Returns its width. */
  text(font: TrueTypeFont, str: string, x: number, baseline: number, size: number, color: RGB): number {
    const scale = size / font.unitsPerEm;
    const segs: Seg[] = [];
    let pen = x;
    for (const ch of Array.from(str)) {
      const g = font.glyphOf(ch.codePointAt(0) || 0);
      if (!g) continue;
      for (const c of font.outline(g)) contourSegs(c, pen, baseline, scale, segs);
      pen += font.advance(g) * scale;
    }
    this.fill(segs, color);
    return pen - x;
  }

  png(): Buffer {
    const raw = Buffer.alloc((this.w * 3 + 1) * this.h);
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 3 + 1)] = 0;
      Buffer.from(this.px.buffer, this.px.byteOffset + y * this.w * 3, this.w * 3).copy(raw, y * (this.w * 3 + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.w, 0); ihdr.writeUInt32BE(this.h, 4);
    ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0)),
    ]);
  }
}

/** Width of a line of text in pixels. */
export const measure = (font: TrueTypeFont, str: string, size: number): number => {
  let w = 0;
  for (const ch of Array.from(str)) { const g = font.glyphOf(ch.codePointAt(0) || 0); if (g) w += font.advance(g); }
  return (w * size) / font.unitsPerEm;
};

/** Break text into at most `maxLines` lines no wider than `maxW`; the last one ends with "…" if cut. */
export const wrap = (font: TrueTypeFont, text: string, size: number, maxW: number, maxLines: number): string[] => {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  let i = 0;
  for (; i < words.length; i++) {
    const next = cur ? `${cur} ${words[i]}` : words[i];
    if (measure(font, next, size) <= maxW || !cur) { cur = next; continue; }
    lines.push(cur);
    cur = words[i];
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && cur) { lines.push(cur); cur = ''; i = words.length; }
  if (i < words.length || cur) {
    let last = lines[maxLines - 1] || '';
    while (last && measure(font, `${last}…`, size) > maxW) last = last.slice(0, -1).trimEnd();
    lines[maxLines - 1] = `${last}…`;
  }
  // a single word longer than the line is cut too
  return lines.map((l) => {
    if (measure(font, l, size) <= maxW) return l;
    let s = l;
    while (s && measure(font, `${s}…`, size) > maxW) s = s.slice(0, -1);
    return `${s}…`;
  });
};

function polygon(pts: Point[]): Seg[] {
  const segs: Seg[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    segs.push([a.x, a.y, b.x, b.y]);
  }
  return segs;
}

function contourSegs(c: Contour, ox: number, oy: number, scale: number, out: Seg[]) {
  const P = (p: Point) => ({ x: ox + p.x * scale, y: oy - p.y * scale });
  let cur = { x: 0, y: 0 };
  let first = { x: 0, y: 0 };
  for (const s of c) {
    if (s.kind === 'move') { cur = P(s.to); first = cur; continue; }
    if (s.kind === 'line') { const t = P(s.to); out.push([cur.x, cur.y, t.x, t.y]); cur = t; continue; }
    const cp = P(s.c), t = P(s.to);
    const n = Math.max(2, Math.min(16, Math.ceil(Math.hypot(t.x - cur.x, t.y - cur.y) / 3)));
    let prev = cur;
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      const q = { x: (1 - u) * (1 - u) * cur.x + 2 * (1 - u) * u * cp.x + u * u * t.x, y: (1 - u) * (1 - u) * cur.y + 2 * (1 - u) * u * cp.y + u * u * t.y };
      out.push([prev.x, prev.y, q.x, q.y]);
      prev = q;
    }
    cur = t;
  }
  if (cur.x !== first.x || cur.y !== first.y) out.push([cur.x, cur.y, first.x, first.y]);
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = CRC_TABLE[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
