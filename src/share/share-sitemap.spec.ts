import { ShareController } from './share.controller';

/** The live sitemap of public content (ChatGPT PR #290, re-introduced 2026-11-09). */
describe('GET /share/sitemap.xml', () => {
  const res = () => {
    const r: any = { statusCode: 0, body: '', headers: {} as Record<string, string> };
    r.status = (c: number) => { r.statusCode = c; return r; };
    r.type = (t: string) => { r.headers['content-type'] = t; return r; };
    r.set = (k: string, v: string) => { r.headers[k] = v; return r; };
    r.send = (b: string) => { r.body = b; return r; };
    return r;
  };
  const ctrl = (db: any) => new ShareController({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, db);

  it('lists public profiles, products, adverts, services and posts, escaped, with lastmod', async () => {
    const at = new Date('2026-11-01T10:00:00Z');
    const answers = [[{ username: 'duka_la_baraka', updatedAt: at }], [{ id: 42, updatedAt: at }], [{ id: 7, updatedAt: at }], [{ id: 3, updatedAt: at }], [{ id: 9, createdAt: at }]];
    const db = { query: jest.fn(async () => answers.shift()) };
    const r = res();
    await ctrl(db).publicSitemap(r);
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('application/xml');
    for (const path of ['/@duka_la_baraka', '/product/42', '/classified/7', '/service/3', '/post/9']) expect(r.body).toContain(`${path}</loc>`);
    expect(r.body).toContain('<lastmod>2026-11-01T10:00:00.000Z</lastmod>');
    // Only public content: hidden profiles, out of stock, unpublished or expired posts are filtered in SQL.
    const sql = db.query.mock.calls.map((c: any[]) => c[0]).join('\n');
    expect(sql).toMatch(/"hiddenFromPublic" = false/);
    expect(sql).toMatch(/x\.stock > 0/);
    expect(sql).toMatch(/"expiresAt" IS NULL OR x\."expiresAt" > NOW\(\)/);
  });

  it('a database failure is a 503, never a broken or empty 200', async () => {
    const r = res();
    await ctrl({ query: jest.fn(async () => { throw new Error('down'); }) }).publicSitemap(r);
    expect(r.statusCode).toBe(503);
    const r2 = res();
    await ctrl(undefined).publicSitemap(r2);
    expect(r2.statusCode).toBe(503);
  });
});
