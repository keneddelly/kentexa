import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ProductsService } from '../products/products.service';
import { ClassifiedsService } from '../classifieds/classifieds.service';
import { ServicesService } from '../services/services.service';
import { SellerService } from '../seller/seller.service';
import { TransportService } from '../transport/transport.service';
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
  ) {}

  @Get(':type/:id')
  async share(
    @Param('type') type: string,
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const numId = Number(id);
    const path = this.pathFor(type, id);
    const ua = req.headers['user-agent'] || '';
    const isCrawler = CRAWLER_UA.test(ua);

    if (!path || !Number.isFinite(numId)) {
      return res.redirect(302, FRONTEND_URL);
    }

    if (!isCrawler) {
      return res.redirect(302, `${FRONTEND_URL}${path}`);
    }

    const payload = await this.resolvePayload(type, numId, path);
    res.type('html').send(this.renderHtml(payload));
  }

  private pathFor(type: string, id: string): string | null {
    switch (type) {
      case 'product':
        return `/product/${id}`;
      case 'classified':
        return `/classified/${id}`;
      case 'service':
        return `/service/${id}`;
      case 'store':
      case 'transport':
        return `/store/${id}`;
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
