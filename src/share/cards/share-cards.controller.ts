import { Controller, Get, NotFoundException, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DataSource } from 'typeorm';
import { PUBLIC_TO_GUESTS } from '../../commerce-profiles/public-visibility';
import { CardFormat, CardInput, coverFor, drawCard } from './card';

const KIND: Record<string, string> = { question: 'Swali', poll: 'Kura', discussion: 'Mjadala', offer: 'Ofa', experience: 'Uzoefu' };
const oneLine = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();
/** A name typed all small gets a capital first letter (KenteXa text style, #374 E). */
// KenteXa name style (owner 2026-11-16), same rule as the app's formatName: each word starts with a
// capital, small joining words stay small, words with the writer's own capitals stay, KenteXa as KenteXa.
const NAME_SMALL = new Set(['na', 'wa', 'ya', 'la', 'za', 'kwa', 'cha', 'vya', 'pa', 'mwa', 'ni', 'au', 'katika', 'kwenye', 'and', 'of', 'the', 'in', 'for', 'de', 'du', 'et']);
export const nameStyle = (s: unknown) => oneLine(s).split(' ').filter(Boolean).map((w, i) => {
  const bare = w.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
  if (bare === 'kentexa') return w.replace(/kentexa/i, 'KenteXa');
  if (/\p{Lu}/u.test(w)) return w;
  if (i > 0 && NAME_SMALL.has(bare)) return w;
  const at = w.search(/\p{L}/u);
  return at < 0 ? w : w.slice(0, at) + w.charAt(at).toUpperCase() + w.slice(at + 1);
}).join(' ');
const SITE = 'kentexa.com';

/**
 * Viral engine A3 (issue #381): share card pictures.
 *   GET /share/card/post/88.png            link card 1200x630 (preview picture)
 *   GET /share/card/post/88.png?f=status   Status card 1080x1920, with ?s=<code> printing the short link
 *   GET /share/card/community/3.png
 * Only content public to guests (the same rule as previews); anything else is 404.
 */
@Controller('share/card')
export class ShareCardsController {
  private readonly cache = new Map<string, Buffer>();

  constructor(private readonly db: DataSource) {}

  @Get(':type/:file')
  async card(@Param('type') type: string, @Param('file') file: string, @Query('f') f: string, @Query('s') code: string, @Res() res: Response) {
    const m = /^(\d{1,10})\.png$/.exec(String(file || ''));
    if (!m || !['post', 'community'].includes(type)) throw new NotFoundException();
    const id = Number(m[1]);
    const format: CardFormat = f === 'status' ? 'status' : 'link';
    const input = await this.inputFor(type as 'post' | 'community', id, code);
    if (!input) throw new NotFoundException('Hakipatikani.');
    const key = JSON.stringify([type, id, format, input]);
    let png = this.cache.get(key);
    if (!png) {
      png = drawCard(input, format);
      this.cache.set(key, png);
      if (this.cache.size > 300) this.cache.delete(this.cache.keys().next().value as string);
    }
    res.set('Cache-Control', 'public, max-age=600');
    res.type('image/png').send(png);
  }

  /** The card's words, from the content's own public data. Null when not public to guests. */
  async inputFor(type: 'post' | 'community', id: number, code?: string): Promise<CardInput | null> {
    const link = await this.linkFor(type, id, code);
    if (type === 'post') {
      const [r] = await this.db.query(
        `SELECT x.title, x.body, x.intent::text AS intent, x."communityId", c.name AS community,
                COALESCE(cp."displayName", u.name) AS owner,
                (SELECT COUNT(*)::int FROM public.post_comment pc WHERE pc."postId" = x.id AND pc."isDeleted" = false) AS replies
           FROM public.business_feed_item x
           LEFT JOIN public.commerce_profile cp ON cp.id = x."commerceProfileId"
           LEFT JOIN public."user" u ON u.id = x."businessId"
           LEFT JOIN public.community c ON c.id = x."communityId"
          WHERE x.id = $1 AND ${PUBLIC_TO_GUESTS('x')}`, [id]).catch(() => []);
      if (!r) return null;
      const title = oneLine(r.title) !== 'Moment' ? oneLine(r.title) : '';
      const replies = Number(r.replies || 0);
      return {
        kind: 'post',
        badge: KIND[String(r.intent)] || 'Chapisho',
        headline: title || oneLine(r.body) || 'Chapisho kwenye KenteXa',
        context: r.community ? nameStyle(r.community) : undefined,
        meta: [nameStyle(r.owner), replies ? `majibu ${replies}` : ''].filter(Boolean).join(' · '),
        link,
        cover: coverFor(r.communityId),
      };
    }
    const [c] = await this.db.query(
      `SELECT name, purpose, "memberCount" FROM public.community WHERE id = $1 AND status = 'active' AND "joinPolicy" = 'open'`, [id]).catch(() => []);
    if (!c) return null;
    return {
      kind: 'community',
      badge: 'Jumuiya',
      headline: nameStyle(c.name),
      context: oneLine(c.purpose) || undefined,
      meta: `wanachama ${Number(c.memberCount || 0).toLocaleString('en-US')}`,
      link,
      cover: coverFor(id),
    };
  }

  /** The address printed on the card: the short link when the code is this content's. */
  private async linkFor(type: string, id: number, code?: string): Promise<string> {
    if (code && /^[A-Za-z0-9]{5,12}$/.test(code)) {
      const [r] = await this.db.query(
        `SELECT 1 FROM public.share_link WHERE code = $1 AND "contentType" = $2 AND "contentId" = $3`, [code, type, id]).catch(() => []);
      if (r) return `${SITE}/s/${code}`;
    }
    return `${SITE}/${type}/${id}`;
  }
}
