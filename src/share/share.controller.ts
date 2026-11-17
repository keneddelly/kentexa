import { Controller, Get, Optional, Param, Req, Res } from '@nestjs/common';
import { PUBLIC_TO_GUESTS } from '../commerce-profiles/public-visibility';
import { DataSource } from 'typeorm';
import { injectMeta, parseRef, slugify } from './share-html';
import type { Request, Response } from 'express';
import { ProductsService } from '../products/products.service';
import { ClassifiedsService } from '../classifieds/classifieds.service';
import { ServicesService } from '../services/services.service';
import { SellerService } from '../seller/seller.service';
import { TransportService } from '../transport/transport.service';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import { CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';
import { FRONTEND_URL, BACKEND_URL } from '../config/urls.config';
import { nameStyle } from './cards/share-cards.controller';
import { stripArticle } from '../feed/article-text';

// Social/search crawlers never execute JavaScript, so a pure client-side
// React fix can't give shared links a rich preview card — this route is the
// one place in the app that returns server-rendered HTML. Everyone else
// (real visitors) gets bounced straight into the live SPA via a 302; only a
// recognized crawler UA gets the hand-built HTML with real og:* tags.
const CRAWLER_UA =
  /facebookexternalhit|Facebot|WhatsApp|Twitterbot|Slackbot|LinkedInBot|TelegramBot|Discordbot|Googlebot|bingbot|bot|crawler|spider/i;

const SITE_FALLBACK = {
  title: 'KenteXa: biashara, jumuiya na mazungumzo Tanzania',
  description:
    'Soma mijadala, jiunge na jumuiya, nunua na uza kwa usalama popote Tanzania.',
  image: 'https://kentexa.com/og-image.png',
};

const PREVIEW_KIND: Record<string, string> = { question: 'Swali', poll: 'Kura', discussion: 'Mjadala', offer: 'Ofa', experience: 'Uzoefu', article: 'Makala' };
const oneLine = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Viral engine A2 (issue #381): a discussion's own preview. Title: its kind and its words
 * ("Swali: Biashara gani kwa mtaji wa 100,000?"); description: where and how alive it is
 * ("Wafanyabiashara Kariakoo · majibu 12 · kened"), then the start of its text.
 */
export const postPreview = (r: { title?: string; body?: string; intent?: string; owner?: string; community?: string; replies?: number }) => {
  const title = oneLine(r.title) && oneLine(r.title) !== 'Moment' ? oneLine(r.title) : '';
  // A Makala's text has layout marks (## , - , **); a preview shows its plain words.
  const body = oneLine(r.intent === 'article' ? stripArticle(r.body) : r.body);
  const words = title || body || 'Chapisho';
  const kind = PREVIEW_KIND[String(r.intent || '')];
  const replies = Number(r.replies || 0);
  const meta = [r.community ? oneLine(r.community) : '', replies ? `majibu ${replies}` : '', r.owner ? oneLine(r.owner) : ''].filter(Boolean).join(' · ');
  const rest = title && body && body.toLowerCase() !== title.toLowerCase() ? body : '';
  return {
    title: kind ? `${kind}: ${words}` : (title || `${oneLine(r.owner) || 'Chapisho'} kwenye KenteXa`),
    description: [meta, rest || (kind || title ? '' : body)].filter(Boolean).join(' · ') || 'Soma kwenye KenteXa',
  };
};

/** Viral engine A2: a community's own preview. A request-only one shows only its name. */
export const communityPreview = (r: { name: string; purpose?: string; memberCount?: number; joinPolicy?: string }) => {
  const open = r.joinPolicy === 'open';
  const members = Number(r.memberCount || 0);
  return {
    title: `${nameStyle(r.name)} · Jumuiya ya KenteXa`, // KenteXa name style (owner 2026-11-16)
    description: open
      ? [oneLine(r.purpose), `wanachama ${members.toLocaleString('en-US')}`, 'Jiunge kwenye KenteXa'].filter(Boolean).join(' · ')
      : 'Jumuiya ya wanachama kwenye KenteXa. Omba kujiunga.',
  };
};

const escapeHtml = (s: string): string =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[c] as string,
  );

// Some images are already absolute (Cloudinary etc.); others are stored as
// a relative /uploads path served by main.ts's useStaticAssets — normalize
// both to an absolute URL for og:image, which social crawlers require.
const absoluteImage = (url: string | null | undefined): string | null => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `${BACKEND_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

const truncate = (s: string, max = 200): string => {
  const str = String(s || '');
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
};

interface SharePayload {
  title: string;
  description: string;
  image: string | null;
  path: string; // canonical SPA path, e.g. /product/42
  target?: string; // a short link: the page the app opens
}

@Controller('share')
export class ShareController {
  constructor(
    private productsService: ProductsService,
    private classifiedsService: ClassifiedsService,
    private servicesService: ServicesService,
    private sellerService: SellerService,
    private transportService: TransportService,
    private commerceProfilesService: CommerceProfilesService,
    @Optional() private readonly db?: DataSource,
  ) {}

  // ── Professional links (owner 2026-11-03) ──────────────────────────────
  // kentexa.com/product/42-simu-samsung, /classified/.., /service/.., /post/88 and /@handle
  // are rewritten by the website host to these routes. Every visitor (person or WhatsApp /
  // Facebook) gets the app's own page with the title, picture and price filled in, and the
  // address stays on kentexa.com. If the app page cannot be read, the visitor is sent to the
  // app with ?go=<path>, which opens the same page.
  private indexCache: { html: string; at: number } | null = null;

  private async appIndex(): Promise<string | null> {
    if (this.indexCache && Date.now() - this.indexCache.at < 5 * 60_000) return this.indexCache.html;
    try {
      const res = await fetch(`${FRONTEND_URL}/index.html`, { headers: { 'user-agent': 'KenteXa-share' } });
      if (!res.ok) return this.indexCache?.html ?? null;
      const html = await res.text();
      if (!/<head[\s>]/i.test(html)) return this.indexCache?.html ?? null;
      this.indexCache = { html, at: Date.now() };
      return html;
    } catch {
      return this.indexCache?.html ?? null;
    }
  }

  /** Database-backed sitemap of content that is currently public to unauthenticated visitors. */
  @Get('sitemap.xml')
  async publicSitemap(@Res() res: Response) {
    if (!this.db) return res.status(503).type('text').send('Sitemap temporarily unavailable');
    const base = FRONTEND_URL.endsWith('/') ? FRONTEND_URL.slice(0, -1) : FRONTEND_URL;
    const xml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
    })[ch] as string);
    const rows: Array<{ loc: string; lastmod?: string }> = [];
    const add = (items: any[], path: (row: any) => string) => {
      for (const row of items || []) rows.push({ loc: base + path(row), lastmod: row.updatedAt || row.createdAt });
    };
    try {
      const [profiles, products, classifieds, services, posts, communities] = await Promise.all([
        this.db.query(`SELECT username, "updatedAt" FROM public.commerce_profile
          WHERE status::text = 'active' AND "hiddenFromPublic" = false ORDER BY "updatedAt" DESC`),
        this.db.query(`SELECT x.id, x."updatedAt" FROM public.product x
          LEFT JOIN public.commerce_profile cp ON cp.id = x."commerceProfileId"
          WHERE x."isActive" = true AND x."isAvailable" = true AND x."availableOnline" = true AND x.stock > 0
          AND (x."commerceProfileId" IS NULL OR (cp.status::text = 'active' AND cp."hiddenFromPublic" = false))
          ORDER BY x."updatedAt" DESC`),
        this.db.query(`SELECT x.id, x."updatedAt" FROM public.classified x
          LEFT JOIN public.commerce_profile cp ON cp.id = x."commerceProfileId"
          WHERE x.status::text = 'active'
          AND (x."commerceProfileId" IS NULL OR (cp.status::text = 'active' AND cp."hiddenFromPublic" = false))
          ORDER BY x."updatedAt" DESC`),
        this.db.query(`SELECT x.id, x."updatedAt" FROM public.service_ad x
          LEFT JOIN public.commerce_profile cp ON cp.id = x."commerceProfileId"
          WHERE x.status::text = 'active'
          AND (x."commerceProfileId" IS NULL OR (cp.status::text = 'active' AND cp."hiddenFromPublic" = false))
          AND (x."createdAt" < TIMESTAMPTZ '2026-10-14T00:00:00+03:00'
            OR EXISTS (SELECT 1 FROM public.identity_profile ip WHERE ip."userId" = x."providerId" AND ip.status::text = 'verified'))
          ORDER BY x."updatedAt" DESC`),
        // Viral engine A1: posts by the one public-to-guests rule (no followers-only posts, none
        // from request-only communities or hidden profiles).
        this.db.query(`SELECT x.id, x."createdAt" FROM public.business_feed_item x
          WHERE ${PUBLIC_TO_GUESTS('x')}
          ORDER BY x."createdAt" DESC`),
        // Viral engine A2: open communities (request-only ones stay out of search engines).
        Promise.resolve(this.db.query(`SELECT c.id, c."updatedAt" FROM public.community c
          WHERE c.status = 'active' AND c."joinPolicy" = 'open' ORDER BY c."updatedAt" DESC`)).catch(() => []),
      ]);
      // Mfululizo (#410 phase 2): published series and active topics (none before the migration).
      const [seriesRows, topicRows] = await Promise.all([
        Promise.resolve(this.db.query(`SELECT s.id, s.title, s."updatedAt" FROM public.content_series s
          WHERE s.status = 'published' ORDER BY s."updatedAt" DESC`)).catch(() => []),
        Promise.resolve(this.db.query(`SELECT key FROM public.feed_topic WHERE active = true ORDER BY position`)).catch(() => []),
      ]);
      add(profiles, (r) => '/@' + encodeURIComponent(r.username));
      add(products, (r) => '/product/' + r.id);
      add(classifieds, (r) => '/classified/' + r.id);
      add(services, (r) => '/service/' + r.id);
      add(posts, (r) => '/post/' + r.id);
      add(communities, (r) => '/community/' + r.id);
      add(seriesRows, (r) => `/series/${r.id}${slugify(r.title) ? `-${slugify(r.title)}` : ''}`);
      add(topicRows, (r) => '/topic/' + r.key);
      const body = rows.map((r) => `<url><loc>${xml(r.loc)}</loc>${r.lastmod ? `<lastmod>${new Date(r.lastmod).toISOString()}</lastmod>` : ''}</url>`).join('');
      res.set('Cache-Control', 'public, max-age=300');
      return res.status(200).type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`);
    } catch {
      return res.status(503).type('text').send('Sitemap temporarily unavailable');
    }
  }

  @Get('html/:type/:ref')
  async html(@Param('type') type: string, @Param('ref') ref: string, @Res() res: Response) {
    const payload = await this.pagePayload(type, ref);
    if (!payload) return res.redirect(302, FRONTEND_URL);
    const index = await this.appIndex();
    if (!index) return res.redirect(302, `${FRONTEND_URL}/?go=${encodeURIComponent(payload.path)}`);
    res.set('Cache-Control', 'public, max-age=60');
    res.type('html').send(injectMeta(index, { ...payload, url: `${FRONTEND_URL}${payload.path}`, fallbackImage: SITE_FALLBACK.image }));
  }

  /** The page's title, description, picture and its own kentexa.com path. Null = not a link we know. */
  private async pagePayload(type: string, ref: string): Promise<SharePayload | null> {
    // Viral engine A2: kentexa.com/s/<code> shows the preview of what it points to; the page
    // address (canonical) is that content's own address.
    if (type === 's') {
      const code = String(ref || '');
      if (!/^[A-Za-z0-9]{5,12}$/.test(code) || !this.db) return null;
      const [link] = await this.db.query(
        `SELECT "contentType", "contentId" FROM public.share_link WHERE code = $1`, [code]).catch(() => []);
      if (!link) return { ...SITE_FALLBACK, path: '/' };
      const target = await this.pagePayload(link.contentType, String(link.contentId));
      return target ? { ...target, target: target.path } : { ...SITE_FALLBACK, path: '/' };
    }
    if (type === 'u') {
      const handle = String(ref || '').replace(/^@/, '').toLowerCase();
      if (!/^[a-z0-9_]{2,40}$/.test(handle)) return null;
      const [p] = this.db ? await this.db.query(
        `SELECT "displayName", bio, "photoUrl", "coverImage", location FROM public.commerce_profile
          WHERE lower(username) = $1::varchar AND "hiddenFromPublic" = false LIMIT 1`, [handle]).catch(() => []) : [];
      const path = `/@${handle}`;
      if (!p) return { ...SITE_FALLBACK, path };
      return {
        title: `${p.displayName} (@${handle}) | KenteXa`,
        description: [p.bio, p.location].filter(Boolean).join(' · ') || `${p.displayName} kwenye KenteXa`,
        image: absoluteImage(p.photoUrl || p.coverImage), path,
      };
    }
    // Mfululizo (#410 phase 2): a topic's page, kentexa.com/topic/<key>.
    if (type === 'topic') {
      const key = String(ref || '').toLowerCase();
      if (!/^[a-z_]{2,40}$/.test(key) || !this.db) return null;
      const [t] = await this.db.query(`SELECT label, note FROM public.feed_topic WHERE key = $1::varchar AND active = true`, [key]).catch(() => []);
      const path = `/topic/${key}`;
      if (!t) return { ...SITE_FALLBACK, path };
      const [d] = await this.db.query(`SELECT description FROM public.feed_topic WHERE key = $1::varchar`, [key]).catch(() => []);
      return { title: `${t.label} · Mada kwenye KenteXa`, description: d?.description || t.note || `Mazungumzo na mfululizo kuhusu ${t.label} kwenye KenteXa.`, image: null, path };
    }
    const id = parseRef(ref);
    if (!id) return null;
    const owner = `COALESCE(cp."displayName", u.name)`;
    const tzs = (n: unknown) => (Number(n) > 0 ? `TZS ${Math.round(Number(n)).toLocaleString('en-US')}` : '');
    const first = (imgs: unknown) => (Array.isArray(imgs) ? imgs[0] : String(imgs || '').split(',')[0]) || null;
    const q = async (sql: string) => (this.db ? (await this.db.query(sql, [id]).catch(() => []))[0] : null);
    if (type === 'product') {
      const r = await q(`SELECT x.name AS title, x.description, x."basePrice" AS price, x.images, ${owner} AS owner
        FROM public.product x LEFT JOIN public.commerce_profile cp ON cp.id = x."commerceProfileId" LEFT JOIN public."user" u ON u.id = x."sellerId"
        WHERE x.id = $1::int`);
      const path = `/product/${id}${r ? `-${slugify(r.title)}` : ''}`;
      return r ? { title: [r.title, tzs(r.price)].filter(Boolean).join(' · '), description: [r.owner, r.description].filter(Boolean).join(' · '), image: absoluteImage(first(r.images)), path } : { ...SITE_FALLBACK, path };
    }
    if (type === 'classified') {
      const r = await q(`SELECT x.title, x.description, x.price, x.images, ${owner} AS owner
        FROM public.classified x LEFT JOIN public.commerce_profile cp ON cp.id = x."commerceProfileId" LEFT JOIN public."user" u ON u.id = x."sellerId"
        WHERE x.id = $1::int`);
      const path = `/classified/${id}${r ? `-${slugify(r.title)}` : ''}`;
      return r ? { title: [r.title, tzs(r.price)].filter(Boolean).join(' · '), description: [r.owner, r.description].filter(Boolean).join(' · '), image: absoluteImage(first(r.images)), path } : { ...SITE_FALLBACK, path };
    }
    if (type === 'service') {
      const r = await q(`SELECT x.title, x.description, x.price, x.images, ${owner} AS owner
        FROM public.service_ad x LEFT JOIN public.commerce_profile cp ON cp.id = x."commerceProfileId" LEFT JOIN public."user" u ON u.id = x."providerId"
        WHERE x.id = $1::int`);
      const path = `/service/${id}${r ? `-${slugify(r.title)}` : ''}`;
      return r ? { title: [r.title, tzs(r.price)].filter(Boolean).join(' · '), description: [r.owner, r.description].filter(Boolean).join(' · '), image: absoluteImage(first(r.images)), path } : { ...SITE_FALLBACK, path };
    }
    if (type === 'post') {
      const r = await q(`SELECT x.title, x.body, x."imageUrl", x.media, x.intent::text AS intent, ${owner} AS owner,
          c.name AS community,
          (SELECT COUNT(*)::int FROM public.post_comment pc WHERE pc."postId" = x.id AND pc."isDeleted" = false) AS replies
        FROM public.business_feed_item x LEFT JOIN public.commerce_profile cp ON cp.id = x."commerceProfileId" LEFT JOIN public."user" u ON u.id = x."businessId"
        LEFT JOIN public.community c ON c.id = x."communityId"
        WHERE x.id = $1::int AND ${PUBLIC_TO_GUESTS('x')}`);
      const path = `/post/${id}`;
      // Viral engine A1: a post that is not public to guests (followers-only, in a request-only
      // community, from a hidden profile, removed) shows only the general KenteXa card.
      if (!r) return { ...SITE_FALLBACK, path };
      const media = Array.isArray(r.media) ? r.media : [];
      // Viral engine A3: a post without a photo shows its KenteXa card.
      return { ...postPreview(r), image: absoluteImage(r.imageUrl || media[0]?.url) || `${BACKEND_URL}/share/card/post/${id}.png`, path };
    }
    // Mfululizo (#410 phase 2): a published series; a draft or archived one shows the general card.
    if (type === 'series') {
      const r = await q(`SELECT s.title, s.description, s."coverUrl", ${owner} AS owner,
          (SELECT COUNT(*)::int FROM public.content_series_episode e JOIN public.business_feed_item x ON x.id = e."postId"
            WHERE e."seriesId" = s.id AND ${PUBLIC_TO_GUESTS('x')}) AS episodes
        FROM public.content_series s LEFT JOIN public.commerce_profile cp ON cp.id = s."commerceProfileId" LEFT JOIN public."user" u ON u.id = s."ownerUserId"
        WHERE s.id = $1::int AND s.status = 'published'`);
      const path = `/series/${id}${r ? `-${slugify(r.title)}` : ''}`;
      if (!r) return { ...SITE_FALLBACK, path };
      const count = Number(r.episodes || 0);
      return {
        title: `${r.title} · Mfululizo kwenye KenteXa`,
        description: [`Sehemu ${count}`, r.owner, r.description].filter(Boolean).join(' · '),
        image: absoluteImage(r.coverUrl), path,
      };
    }
    if (type === 'community') {
      const r = await q(`SELECT name, purpose, "memberCount", "joinPolicy" FROM public.community WHERE id = $1::int AND status = 'active'`);
      const path = `/community/${id}`;
      if (!r) return { ...SITE_FALLBACK, path };
      // Viral engine A3: an open community shows its KenteXa card; a request-only one the general card.
      return { ...communityPreview(r), image: r.joinPolicy === 'open' ? `${BACKEND_URL}/share/card/community/${id}.png` : null, path };
    }
    return null;
  }

  @Get(':type/:id')
  async share(
    @Param('type') type: string,
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const numId = Number(id);
    if (!Number.isFinite(numId)) {
      return res.redirect(302, FRONTEND_URL);
    }

    const path = await this.pathFor(type, numId);
    if (!path) {
      return res.redirect(302, FRONTEND_URL);
    }

    const ua = req.headers['user-agent'] || '';
    const isCrawler = CRAWLER_UA.test(ua);

    if (!isCrawler) {
      return res.redirect(302, `${FRONTEND_URL}${path}`);
    }

    const payload = await this.resolvePayload(type, numId, path);
    res.type('html').send(this.renderHtml(payload));
  }

  // CommerceProfile.js can't tell WHICH of an account's profiles
  // (personal/business/hub/transport) to show from a bare user id alone —
  // every other in-app link to it passes an explicit commerceProfileId for
  // exactly this reason; without one it silently falls back to showing the
  // owner's PERSONAL profile instead of their store/transport identity.
  // Resolving it here and carrying it as ?cp= keeps that contract intact
  // for share links too, for both the crawler payload and the plain 302
  // real visitors take (so a page reload on the landed page still works).
  private async pathFor(type: string, id: number): Promise<string | null> {
    switch (type) {
      case 'product':
        return `/product/${id}`;
      case 'classified':
        return `/classified/${id}`;
      case 'service':
        return `/service/${id}`;
      case 'store': {
        const cp = await this.commerceProfilesService
          .findForUserByType(id, CommerceProfileType.BUSINESS)
          .catch(() => null);
        return cp ? `/store/${id}?cp=${cp.id}` : `/store/${id}`;
      }
      case 'transport': {
        const cp = await this.commerceProfilesService
          .findForUserByType(id, CommerceProfileType.TRANSPORT_PROVIDER)
          .catch(() => null);
        return cp ? `/store/${id}?cp=${cp.id}` : `/store/${id}`;
      }
      default:
        return null;
    }
  }

  private async resolvePayload(
    type: string,
    id: number,
    path: string,
  ): Promise<SharePayload> {
    try {
      switch (type) {
        case 'product': {
          const p = await this.productsService.findOne(id);
          return {
            title: p.name,
            description: p.description || '',
            image: absoluteImage(p.images?.[0]),
            path,
          };
        }
        case 'classified': {
          const c = await this.classifiedsService.findOne(id);
          return {
            title: c.title,
            description: c.description || '',
            image: absoluteImage((c as any).images?.[0]),
            path,
          };
        }
        case 'service': {
          const s = await this.servicesService.getById(id);
          return {
            title: s.title,
            description: s.description || '',
            image: absoluteImage((s as any).images?.[0]),
            path,
          };
        }
        case 'store': {
          const seller = await this.sellerService.findByUserId(id);
          return {
            title: seller.storeName || seller.name,
            description:
              seller.storeTagline || seller.storeDescription || seller.bio || '',
            image: absoluteImage(seller.logo || seller.coverImage),
            path,
          };
        }
        case 'transport': {
          const provider = await this.transportService.findPublicByUserId(id);
          if (!provider) break;
          return {
            title: provider.name,
            description: provider.description || '',
            image: absoluteImage(provider.logoUrl),
            path,
          };
        }
      }
    } catch {
      // Deleted/invalid id — fall through to the generic site card below
      // rather than erroring; a stale shared link should still work.
    }
    return { ...SITE_FALLBACK, path };
  }

  private renderHtml(payload: SharePayload): string {
    const title = escapeHtml(truncate(payload.title || SITE_FALLBACK.title, 70));
    const description = escapeHtml(
      truncate(payload.description || SITE_FALLBACK.description),
    );
    const image = payload.image || SITE_FALLBACK.image;
    const url = `${FRONTEND_URL}${payload.path}`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<meta name="description" content="${description}" />
<meta property="og:type" content="website" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${escapeHtml(image)}" />
<meta property="og:site_name" content="KenteXa" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${escapeHtml(image)}" />
<meta http-equiv="refresh" content="0; url=${url}" />
</head>
<body>
<p>Redirecting to <a href="${url}">${title}</a>…</p>
</body>
</html>`;
  }
}
