import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { PUBLIC_TO_GUESTS } from '../commerce-profiles/public-visibility';

/**
 * Viral engine A2 (issue #381): short share links, kentexa.com/s/<code>. A code stands for
 * (who shared, what, which channel), so later steps can count opens and new members per share.
 * Only content a guest may read can get one (the same PUBLIC_TO_GUESTS rule as previews).
 */
export const SHARE_CONTENT_TYPES = ['post', 'community'] as const;
export type ShareContentType = (typeof SHARE_CONTENT_TYPES)[number];
export const SHARE_CHANNELS = ['whatsapp', 'status', 'facebook', 'telegram', 'x', 'copy', 'native', 'image', 'link'] as const;
export const SHARE_CODE = /^[A-Za-z0-9]{5,12}$/;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; // no 0/O, 1/l/I
export const newShareCode = (len = 7): string => {
  const bytes = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
};

export const pathFor = (type: string, id: number): string => (type === 'community' ? `/community/${id}` : `/post/${id}`);

@Injectable()
export class ShareLinksService {
  constructor(private readonly db: DataSource) {}

  /** Is this content readable by a guest (so it may travel outside KenteXa)? */
  async isPublic(type: ShareContentType, id: number): Promise<boolean> {
    const sql = type === 'post'
      ? `SELECT 1 FROM public.business_feed_item x WHERE x.id = $1 AND ${PUBLIC_TO_GUESTS('x')}`
      : `SELECT 1 FROM public.community c WHERE c.id = $1 AND c.status = 'active' AND c."joinPolicy" = 'open'`;
    const rows = await this.db.query(sql, [id]).catch(() => []);
    return rows.length > 0;
  }

  /** A short link for sharing. The same person, content and channel always get the same code. */
  async create(sharerUserId: number | null, type: string, id: number, channel: string) {
    if (!SHARE_CONTENT_TYPES.includes(type as ShareContentType)) throw new BadRequestException('Aina hii haishirikiwi.');
    if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('Chagua cha kushiriki.');
    const ch = (SHARE_CHANNELS as readonly string[]).includes(channel) ? channel : 'link';
    if (!(await this.isPublic(type as ShareContentType, id))) {
      throw new BadRequestException('Hiki ni cha wanachama au wafuasi tu, hakiwezi kushirikiwa nje.');
    }
    const [existing] = await this.db.query(
      `SELECT code FROM public.share_link WHERE "sharerUserId" IS NOT DISTINCT FROM $1 AND "contentType" = $2 AND "contentId" = $3 AND channel = $4 LIMIT 1`,
      [sharerUserId, type, id, ch]);
    if (existing) return this.present(existing.code, type, id, ch);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newShareCode();
      try {
        await this.db.query(
          `INSERT INTO public.share_link (code, "sharerUserId", "contentType", "contentId", channel) VALUES ($1, $2, $3, $4, $5)`,
          [code, sharerUserId, type, id, ch]);
        return this.present(code, type, id, ch);
      } catch (err: any) {
        if (String(err?.code) !== '23505') throw err; // only a code clash is retried
      }
    }
    throw new BadRequestException('Imeshindikana kutengeneza kiungo. Jaribu tena.');
  }

  /** What a code points to. Unknown code: null. */
  async resolve(code: string): Promise<{ contentType: string; contentId: number; path: string; sharerUserId: number | null } | null> {
    if (!SHARE_CODE.test(String(code || ''))) return null;
    const [r] = await this.db.query(
      `SELECT "contentType", "contentId", "sharerUserId" FROM public.share_link WHERE code = $1`, [code]).catch(() => []);
    if (!r) return null;
    return { contentType: r.contentType, contentId: Number(r.contentId), path: pathFor(r.contentType, Number(r.contentId)), sharerUserId: r.sharerUserId ?? null };
  }

  private present(code: string, type: string, id: number, channel: string) {
    const site = process.env.FRONTEND_URL || 'https://kentexa.com';
    return { code, url: `${site}/s/${code}`, contentType: type, contentId: id, channel, path: pathFor(type, id) };
  }
}

