import { Controller, Get, Optional, Param, Req, Res } from '@nestjs/common';
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

// Social/search crawlers never execute JavaScript, so a pure client-side
// React fix can't give shared links a rich preview card — this route is the
// one place in the app that returns server-rendered HTML. Everyone else
// (real visitors) gets bounced straight into the live SPA via a 302; only a
// recognized crawler UA gets the hand-built HTML with real og:* tags.
const CRAWLER_UA =
  /facebookexternalhit|Facebot|WhatsApp|Twitterbot|Slackbot|LinkedInBot|TelegramBot|Discordbot|Googlebot|bingbot|bot|crawler|spider/i;

const SITE_FALLBACK = {
  title: "KenteXa — Tanzania's #1 Marketplace",
  description:
    'Buy, sell and pay securely anywhere in Tanzania. Nationwide delivery and verified sellers.',
  image: 'https://kentexa.com/og-image.png',
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
      for (const row of items) rows.push({ loc: base + path(row), lastmod: row.updatedAt || row.createdAt });
    };
    try {
      const [profiles, products, classifieds, services, posts] = await Promise.all([
        this.db.query(`SELECT username, "updatedAt" FROM public.commerce_profile
          WHERE status::text = 'active' AND "hiddenFromPublic" = false ORDER BY "updatedAt" DESC`),
        this.db.query(`SELECT x.id, x."updatedAt" FROM public.product x
          LEFT JOIN public.commerce_profile cp ON cp.id = x."commerceProfileId"
          WHERE x."isActive" = true AND x."isAvailable" = true AND x."availableOnline" = true
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
        this.db.query(`SELECT x.id, x."createdAt" FROM public.business_feed_item x
          LEFT JOIN public.commerce_profile cp ON cp.id = x."commerceProfileId"
          WHERE x."isActive" = true AND x.status::text = 'published' AND x.visibility::text = 'public'
          AND (x."expiresAt" IS NULL OR x."expiresAt" > NOW())
          AND (x."commerceProfileId" IS NULL OR (cp.status::text = 'active' AND cp."hiddenFromPublic" = false))
          ORDER BY x."createdAt" DESC`),
      ]);
      add(profiles, (r) => '/@' + encodeURIComponent(r.username));
      add(products, (r) => '/product/' + r.id);
      add(classifieds, (r) => '/classified/' + r.id);
      add(services, (r) => '/service/' + r.id);
      add(posts, (r) => '/post/' + r.id);
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
      const r = await q(`SELECT x.title, x.body, x."imageUrl", x.media, ${owner} AS owner
        FROM public.business_feed_item x LEFT JOIN public.commerce_profile cp ON cp.id = x."commerceProfileId" LEFT JOIN public."user" u ON u.id = x."businessId"
        WHERE x.id = $1::int AND x."isActive" = true`);
      const path = `/post/${id}`;
      if (!r) return { ...SITE_FALLBACK, path };
      const media = Array.isArray(r.media) ? r.media : [];
      const text = String(r.body || r.title || '').trim();
      return { title: `${r.owner || 'KenteXa'} kwenye KenteXa`, description: text, image: absoluteImage(r.imageUrl || media[0]?.url), path };
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
