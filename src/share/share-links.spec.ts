import { BadRequestException } from '@nestjs/common';
import { ShareLinksService, newShareCode } from './share-links.service';
import { ShareController, postPreview, communityPreview } from './share.controller';
import { injectMeta } from './share-html';

/** Viral engine A2 (issue #381): short links and discussion/community previews. */
const svc = (o: { public?: boolean; existing?: string | null; clash?: number } = {}) => {
  let clashes = o.clash || 0;
  const inserted: any[] = [];
  const query = jest.fn(async (sql: string, p: any[] = []) => {
    if (sql.startsWith('SELECT 1 FROM')) return o.public === false ? [] : [{ '?column?': 1 }];
    if (sql.includes('SELECT code FROM public.share_link')) return o.existing ? [{ code: o.existing }] : [];
    if (sql.startsWith('INSERT INTO public.share_link')) {
      if (clashes-- > 0) { const e: any = new Error('dup'); e.code = '23505'; throw e; }
      inserted.push(p); return [];
    }
    if (sql.includes('FROM public.share_link WHERE code')) return p[0] === 'AbC12dE' ? [{ contentType: 'post', contentId: 88, sharerUserId: 5 }] : [];
    return [];
  });
  return { s: new ShareLinksService({ query } as any), inserted, query };
};

describe('short links', () => {
  it('codes are short and easy to read (no 0/O, 1/l/I)', () => {
    const c = newShareCode();
    expect(c).toMatch(/^[A-Za-z2-9]{7}$/);
    expect(c).not.toMatch(/[0O1lI]/);
  });

  it('a public post gets a link; the same sharer, post and channel reuse it', async () => {
    const a = svc();
    const out = await a.s.create(5, 'post', 88, 'whatsapp');
    expect(out.url).toMatch(/\/s\/[A-Za-z2-9]{7}$/);
    expect(out.path).toBe('/post/88');
    expect(a.inserted[0].slice(1)).toEqual([5, 'post', 88, 'whatsapp']);
    const b = svc({ existing: 'Reuse12' });
    expect((await b.s.create(5, 'post', 88, 'whatsapp')).code).toBe('Reuse12');
    expect(b.inserted).toHaveLength(0);
  });

  it('members-only or followers-only content cannot travel outside', async () => {
    await expect(svc({ public: false }).s.create(5, 'post', 88, 'copy')).rejects.toThrow(BadRequestException);
    await expect(svc().s.create(5, 'product', 1, 'copy')).rejects.toThrow(BadRequestException);
  });

  it('a code clash is retried; an unknown channel becomes "link"; a guest may share', async () => {
    const a = svc({ clash: 2 });
    const out = await a.s.create(null, 'community', 3, 'pigeon');
    expect(out.channel).toBe('link');
    expect(a.inserted[0].slice(1)).toEqual([null, 'community', 3, 'link']);
  });

  it('resolves a code to its page; bad or unknown codes give nothing', async () => {
    const a = svc();
    expect(await a.s.resolve('AbC12dE')).toEqual({ contentType: 'post', contentId: 88, path: '/post/88', sharerUserId: 5 });
    expect(await a.s.resolve('nope!')).toBeNull();
    expect(await a.s.resolve('Zzzzzzz')).toBeNull();
  });
});

describe('previews', () => {
  it('a discussion shows its kind, words, community, replies and writer', () => {
    expect(postPreview({ title: 'Moment', body: 'Biashara gani kwa mtaji wa 100,000?', intent: 'question', owner: 'kened', community: 'Wafanyabiashara Kariakoo', replies: 12 }))
      .toEqual({ title: 'Swali: Biashara gani kwa mtaji wa 100,000?', description: 'Wafanyabiashara Kariakoo · majibu 12 · kened' });
    expect(postPreview({ title: 'Ofa ya leo', body: 'Simu zote punguzo 20%', owner: 'Duka', replies: 0 }))
      .toEqual({ title: 'Ofa ya leo', description: 'Duka · Simu zote punguzo 20%' });
  });

  it('an open community invites; a request-only one shows only its name', () => {
    expect(communityPreview({ name: 'Wakulima Igoma', purpose: 'Mbegu na mvua', memberCount: 1200, joinPolicy: 'open' }))
      .toEqual({ title: 'Wakulima Igoma · Jumuiya ya KenteXa', description: 'Mbegu na mvua · wanachama 1,200 · Jiunge kwenye KenteXa' });
    expect(communityPreview({ name: 'Siri', purpose: 'mambo ya ndani', memberCount: 3, joinPolicy: 'request' }).description).not.toMatch(/ndani/);
  });

  it('/s/<code> previews its target, with the target as the page address', async () => {
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM public.share_link')) return [{ contentType: 'community', contentId: 3 }];
      if (sql.includes('FROM public.community WHERE id')) return [{ name: 'Wakulima', purpose: 'Mvua', memberCount: 4, joinPolicy: 'open' }];
      return [];
    });
    const ctrl: any = new ShareController({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, { query } as any);
    const p = await ctrl.pagePayload('s', 'AbC12dE');
    expect(p.path).toBe('/community/3');
    expect(p.target).toBe('/community/3');
    expect(p.title).toBe('Wakulima · Jumuiya ya KenteXa');
  });

  it('the page tells the app where to go', () => {
    const html = injectMeta('<html><head></head><body></body></html>', { title: 't', description: 'd', image: null, url: 'u', fallbackImage: 'f', target: '/post/88' });
    expect(html).toContain('<meta name="kx-target" content="/post/88" />');
    expect(injectMeta('<head></head>', { title: 't', description: 'd', image: null, url: 'u', fallbackImage: 'f', target: 'javascript:x' })).not.toContain('kx-target');
  });
});
