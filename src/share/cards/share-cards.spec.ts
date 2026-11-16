import { readFileSync } from 'fs';
import { join } from 'path';
import { inflateSync } from 'zlib';
import { TrueTypeFont } from './ttf';
import { drawCard, coverFor, CARD_SIZES } from './card';
import { wrap } from './canvas';
import { ShareCardsController } from './share-cards.controller';
import { PUBLIC_TO_GUESTS } from '../../commerce-profiles/public-visibility';

/** Viral engine A3 (issue #381): share cards drawn on the server, no packages. */
const font = () => new TrueTypeFont(readFileSync(join(process.cwd(), 'assets', 'fonts', 'LiberationSans-Bold.ttf')));
const pngSize = (b: Buffer) => ({ w: b.readUInt32BE(16), h: b.readUInt32BE(20) });

describe('font', () => {
  it('reads letters, widths and outlines (simple and composite glyphs)', () => {
    const f = font();
    expect(f.unitsPerEm).toBe(2048);
    const a = f.glyphOf('a'.codePointAt(0)!);
    expect(a).toBeGreaterThan(0);
    expect(f.advance(a)).toBeGreaterThan(0);
    expect(f.outline(a).length).toBeGreaterThan(0);
    const e = f.glyphOf('é'.codePointAt(0)!); // composite: e + accent
    expect(f.outline(e).length).toBeGreaterThanOrEqual(2);
    expect(f.glyphOf(0x1f600)).toBe(0); // an emoji is left out, never a box
  });

  it('wraps long text and ends a cut line with "…"', () => {
    const lines = wrap(font(), 'Biashara gani unaweza kuanza na mtaji wa 100,000 hapa Kariakoo leo hii', 66, 600, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
  });
});

describe('cards', () => {
  const input = { kind: 'post' as const, badge: 'Swali', headline: 'Biashara gani kwa mtaji wa 100,000?', context: 'Wafanyabiashara Kariakoo', meta: 'Kened · majibu 12', link: 'kentexa.com/s/AbC12dE', cover: '#1d4ed8' };

  it('draws a 1200x630 link card and a 1080x1920 Status card as real PNGs', () => {
    for (const format of ['link', 'status'] as const) {
      const png = drawCard(input, format);
      expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
      expect(pngSize(png)).toEqual({ w: CARD_SIZES[format].w, h: CARD_SIZES[format].h });
    }
  });

  it('the card has white words on the community colour', () => {
    const png = drawCard(input, 'link');
    // first IDAT: decode and look at a pixel in the corner (cover) and count white pixels (text)
    const idatAt = png.indexOf(Buffer.from('IDAT'));
    const len = png.readUInt32BE(idatAt - 4);
    const raw = inflateSync(png.subarray(idatAt + 4, idatAt + 4 + len));
    const row = 1200 * 3 + 1;
    expect([raw[1], raw[2], raw[3]]).toEqual([0x1d, 0x4e, 0xd8]);
    let white = 0;
    for (let y = 150; y < 300; y++) for (let x = 72; x < 1100; x++) { const i = y * row + 1 + x * 3; if (raw[i] > 240 && raw[i + 1] > 240 && raw[i + 2] > 240) white++; }
    expect(white).toBeGreaterThan(5000);
  });

  it('colours follow the community page', () => {
    expect(coverFor(null)).toBe('#1d4ed8');
    expect(coverFor(3)).toBe('#0f1419');
  });
});

describe('GET /share/card', () => {
  const ctrl = (rows: Record<string, any[]>) => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM public.share_link')) return rows.link || [];
      if (sql.includes('FROM public.business_feed_item')) return rows.post || [];
      if (sql.includes('FROM public.community')) return rows.community || [];
      return [];
    });
    return { c: new ShareCardsController({ query } as any), query };
  };

  it('a post card uses only public words and the one public rule', async () => {
    const { c, query } = ctrl({ post: [{ title: 'Moment', body: 'Biashara gani?', intent: 'question', communityId: 3, community: 'wafanyabiashara', owner: 'kened', replies: 2 }], link: [{ 1: 1 }] });
    const input = await c.inputFor('post', 88, 'AbC12dE');
    expect(input).toEqual({ kind: 'post', badge: 'Swali', headline: 'Biashara gani?', context: 'Wafanyabiashara', meta: 'Kened · majibu 2', link: 'kentexa.com/s/AbC12dE', cover: '#0f1419' });
    expect(query.mock.calls.some((c: any[]) => String(c[0]).includes(PUBLIC_TO_GUESTS('x')))).toBe(true);
  });

  it('not public to guests: no card; a wrong code prints the normal address', async () => {
    expect(await ctrl({ post: [] }).c.inputFor('post', 88)).toBeNull();
    const { c } = ctrl({ community: [{ name: 'Wakulima', purpose: 'Mvua', memberCount: 1200 }], link: [] });
    expect((await c.inputFor('community', 4, 'Wrong12'))!.link).toBe('kentexa.com/community/4');
  });

  it('serves a PNG and refuses other files', async () => {
    const { c } = ctrl({ community: [{ name: 'Wakulima', purpose: 'Mvua', memberCount: 3 }] });
    const res: any = { headers: {}, set(k: string, v: string) { this.headers[k] = v; return this; }, type(t: string) { this.t = t; return this; }, send(b: Buffer) { this.body = b; return this; } };
    await c.card('community', '4.png', 'status', '', res);
    expect(res.t).toBe('image/png');
    expect(pngSize(res.body)).toEqual({ w: 1080, h: 1920 });
    await expect(c.card('community', '4.svg', '', '', res)).rejects.toThrow();
    await expect(c.card('product', '4.png', '', '', res)).rejects.toThrow();
  });
});
