/**
 * Viral engine A3 (issue #381): a small TrueType reader for KenteXa's share cards. It reads only
 * what a card needs: character -> glyph (cmap format 4), widths (hmtx) and outlines (glyf, simple
 * and composite). No packages: the cards are drawn on the server with Node alone.
 */

export type Point = { x: number; y: number };
/** One closed outline: a list of segments in font units, y up. */
export type Contour = Array<{ kind: 'line'; to: Point } | { kind: 'quad'; c: Point; to: Point } | { kind: 'move'; to: Point }>;

export class TrueTypeFont {
  readonly unitsPerEm: number;
  readonly ascent: number;
  readonly descent: number;
  private readonly d: DataView;
  private readonly tables = new Map<string, { offset: number; length: number }>();
  private readonly locaLong: boolean;
  private readonly numGlyphs: number;
  private readonly numHMetrics: number;
  private readonly cmap = new Map<number, number>();
  private readonly outlines = new Map<number, Contour[]>();

  constructor(buf: Buffer) {
    this.d = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const n = this.d.getUint16(4);
    for (let i = 0; i < n; i++) {
      const r = 12 + i * 16;
      const tag = String.fromCharCode(this.d.getUint8(r), this.d.getUint8(r + 1), this.d.getUint8(r + 2), this.d.getUint8(r + 3));
      this.tables.set(tag, { offset: this.d.getUint32(r + 8), length: this.d.getUint32(r + 12) });
    }
    const head = this.t('head');
    this.unitsPerEm = this.d.getUint16(head + 18);
    this.locaLong = this.d.getInt16(head + 50) === 1;
    this.numGlyphs = this.d.getUint16(this.t('maxp') + 4);
    const hhea = this.t('hhea');
    this.ascent = this.d.getInt16(hhea + 4);
    this.descent = this.d.getInt16(hhea + 6);
    this.numHMetrics = this.d.getUint16(hhea + 34);
    this.readCmap();
  }

  private t(tag: string): number {
    const e = this.tables.get(tag);
    if (!e) throw new Error(`font table ${tag} missing`);
    return e.offset;
  }

  private readCmap() {
    const base = this.t('cmap');
    const n = this.d.getUint16(base + 2);
    let sub = -1;
    for (let i = 0; i < n; i++) {
      const pid = this.d.getUint16(base + 4 + i * 8);
      const eid = this.d.getUint16(base + 6 + i * 8);
      const off = this.d.getUint32(base + 8 + i * 8);
      if (this.d.getUint16(base + off) === 4 && ((pid === 3 && eid === 1) || pid === 0)) { sub = base + off; break; }
    }
    if (sub < 0) throw new Error('font has no unicode cmap');
    const segX2 = this.d.getUint16(sub + 6);
    const ends = sub + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = this.d.getUint16(ends + s * 2);
      const start = this.d.getUint16(starts + s * 2);
      const delta = this.d.getInt16(deltas + s * 2);
      const roff = this.d.getUint16(ranges + s * 2);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g: number;
        if (roff === 0) g = (c + delta) & 0xffff;
        else {
          const at = ranges + s * 2 + roff + (c - start) * 2;
          g = this.d.getUint16(at);
          if (g) g = (g + delta) & 0xffff;
        }
        if (g) this.cmap.set(c, g);
      }
    }
  }

  /** Glyph for a character; 0 when the font does not have it (it is then left out). */
  glyphOf(codePoint: number): number { return this.cmap.get(codePoint) || 0; }

  advance(glyph: number): number {
    const hmtx = this.t('hmtx');
    const i = Math.min(glyph, this.numHMetrics - 1);
    return this.d.getUint16(hmtx + i * 4);
  }

  private glyphRange(glyph: number): [number, number] {
    const loca = this.t('loca');
    const at = (i: number) => (this.locaLong ? this.d.getUint32(loca + i * 4) : this.d.getUint16(loca + i * 2) * 2);
    return [at(glyph), at(glyph + 1)];
  }

  /** The glyph's outlines in font units (y up). */
  outline(glyph: number): Contour[] {
    const hit = this.outlines.get(glyph);
    if (hit) return hit;
    const out = glyph >= 0 && glyph < this.numGlyphs ? this.readGlyph(glyph, 0) : [];
    this.outlines.set(glyph, out);
    return out;
  }

  private readGlyph(glyph: number, depth: number): Contour[] {
    const [start, end] = this.glyphRange(glyph);
    if (end <= start || depth > 6) return [];
    const g = this.t('glyf') + start;
    const nContours = this.d.getInt16(g);
    return nContours >= 0 ? this.simple(g, nContours) : this.composite(g, depth);
  }

  private simple(g: number, nContours: number): Contour[] {
    const endPts: number[] = [];
    for (let i = 0; i < nContours; i++) endPts.push(this.d.getUint16(g + 10 + i * 2));
    const nPts = nContours ? endPts[nContours - 1] + 1 : 0;
    let p = g + 10 + nContours * 2;
    p += 2 + this.d.getUint16(p); // instructions
    const flags: number[] = [];
    while (flags.length < nPts) {
      const f = this.d.getUint8(p++);
      flags.push(f);
      if (f & 8) { let r = this.d.getUint8(p++); while (r-- > 0) flags.push(f); }
    }
    const xs: number[] = [];
    let v = 0;
    for (const f of flags) {
      if (f & 2) { const dx = this.d.getUint8(p++); v += f & 16 ? dx : -dx; }
      else if (!(f & 16)) { v += this.d.getInt16(p); p += 2; }
      xs.push(v);
    }
    const ys: number[] = [];
    v = 0;
    for (const f of flags) {
      if (f & 4) { const dy = this.d.getUint8(p++); v += f & 32 ? dy : -dy; }
      else if (!(f & 32)) { v += this.d.getInt16(p); p += 2; }
      ys.push(v);
    }
    const contours: Contour[] = [];
    let s = 0;
    for (const e of endPts) {
      const pts = [];
      for (let i = s; i <= e; i++) pts.push({ x: xs[i], y: ys[i], on: !!(flags[i] & 1) });
      s = e + 1;
      if (pts.length) contours.push(toContour(pts));
    }
    return contours;
  }

  private composite(g: number, depth: number): Contour[] {
    const out: Contour[] = [];
    let p = g + 10;
    for (;;) {
      const flags = this.d.getUint16(p);
      const comp = this.d.getUint16(p + 2);
      p += 4;
      let dx = 0;
      let dy = 0;
      if (flags & 1) { dx = this.d.getInt16(p); dy = this.d.getInt16(p + 2); p += 4; }
      else { dx = this.d.getInt8(p); dy = this.d.getInt8(p + 1); p += 2; }
      if (!(flags & 2)) { dx = 0; dy = 0; } // point-matched components: rare; placed at origin
      let a = 1, b = 0, c = 0, d = 1;
      const f2 = (at: number) => this.d.getInt16(at) / 16384;
      if (flags & 8) { a = d = f2(p); p += 2; }
      else if (flags & 0x40) { a = f2(p); d = f2(p + 2); p += 4; }
      else if (flags & 0x80) { a = f2(p); b = f2(p + 2); c = f2(p + 4); d = f2(p + 6); p += 8; }
      const map = (q: Point): Point => ({ x: a * q.x + c * q.y + dx, y: b * q.x + d * q.y + dy });
      for (const contour of this.readGlyph(comp, depth + 1)) {
        out.push(contour.map((s) => (s.kind === 'quad' ? { kind: 'quad', c: map(s.c), to: map(s.to) } : { kind: s.kind, to: map(s.to) })) as Contour);
      }
      if (!(flags & 0x20)) break;
    }
    return out;
  }
}

/** TrueType points (on/off curve) -> move, lines and quadratic curves. */
function toContour(pts: Array<{ x: number; y: number; on: boolean }>): Contour {
  const n = pts.length;
  // Start on an on-curve point (or the middle of two off-curve points).
  let startIdx = pts.findIndex((q) => q.on);
  let start: Point;
  if (startIdx < 0) { start = mid(pts[0], pts[1 % n]); startIdx = 0; } else start = pts[startIdx];
  const c: Contour = [{ kind: 'move', to: { x: start.x, y: start.y } }];
  let pending: Point | null = null;
  for (let k = 1; k <= n; k++) {
    const q = pts[(startIdx + k) % n];
    const target = k === n ? start : q;
    if (k === n || q.on) {
      if (pending) { c.push({ kind: 'quad', c: pending, to: { x: target.x, y: target.y } }); pending = null; }
      else c.push({ kind: 'line', to: { x: target.x, y: target.y } });
    } else if (pending) {
      const m = mid(pending, q);
      c.push({ kind: 'quad', c: pending, to: m });
      pending = { x: q.x, y: q.y };
    } else pending = { x: q.x, y: q.y };
  }
  return c;
}

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
