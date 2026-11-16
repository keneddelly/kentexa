import { ShareController } from './share.controller';
import { PUBLIC_TO_GUESTS } from '../commerce-profiles/public-visibility';

/**
 * Viral engine A1 (issue #381): previews and the sitemap never show a post that a guest may not
 * read: followers-only, in a request-only community, from a hidden profile, or removed.
 */
describe('the public-to-guests rule', () => {
  const rule = PUBLIC_TO_GUESTS('x');
  it('needs a live, published, public post', () => {
    expect(rule).toContain(`x."isActive" = true`);
    expect(rule).toContain(`x.status::text = 'published'`);
    expect(rule).toContain(`x.visibility::text = 'public'`);
    expect(rule).toContain(`x."expiresAt" IS NULL OR x."expiresAt" > NOW()`);
  });
  it('excludes hidden or inactive profiles and request-only or closed communities', () => {
    expect(rule).toContain(`gp."hiddenFromPublic" = true OR gp.status::text <> 'active'`);
    expect(rule).toContain(`x."communityId" IS NULL OR EXISTS`);
    expect(rule).toContain(`gc.status = 'active' AND gc."joinPolicy" = 'open'`);
  });
});

describe('share previews and sitemap use it', () => {
  const ctrl = (db: any) => new ShareController({} as any, {} as any, {} as any, {} as any, {} as any, {} as any, db);

  it('a post that is not public to guests gets only the general card', async () => {
    const db = { query: jest.fn(async () => []) };
    const payload = await (ctrl(db) as any).pagePayload('post', '88');
    expect(db.query.mock.calls[0][0]).toContain(PUBLIC_TO_GUESTS('x'));
    expect(payload.path).toBe('/post/88');
    expect(payload.title).toMatch(/KenteXa/);
    expect(payload.description).not.toMatch(/siri/);
  });

  it('a public post shows its own text', async () => {
    const db = { query: jest.fn(async () => [{ title: 'Moment', body: 'Biashara gani?', imageUrl: null, media: null, owner: 'Kened' }]) };
    const payload = await (ctrl(db) as any).pagePayload('post', '88');
    expect(payload.description).toBe('Kened · Biashara gani?'); // A2: writer first, then the words
  });

  it('the sitemap reads posts through the same rule', async () => {
    const db = { query: jest.fn(async () => []) };
    const r: any = { status: () => r, type: () => r, set: () => r, send: () => r };
    await ctrl(db).publicSitemap(r);
    const sql = db.query.mock.calls.map((c: any[]) => c[0]).join('\n');
    expect(sql).toContain(PUBLIC_TO_GUESTS('x'));
  });
});
