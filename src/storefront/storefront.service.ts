import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';
import { UNSTAMPED_FOR } from '../commerce-profiles/legacy-rows';
import { MAX_COLLECTIONS, cleanHours, cleanIds, cleanTemplate, cleanTitle } from './storefront-rules';

/**
 * Duka page template (owner approved 2026-11-18, store-mock): the owner's settings for the shop
 * page (page type, opening hours) and the owner's own shelves ("collections"). The products,
 * categories and the automatic shelves come from the products the page already loads.
 * Before migration 1797600000000 runs, everything reads as "not set".
 */
@Injectable()
export class StorefrontService {
  private ready = false;
  private checkedAt = 0;

  constructor(private readonly db: DataSource, @Optional() private readonly activity?: ActivityEventService) {}

  private async tables() {
    if (!this.ready && Date.now() - this.checkedAt > 60_000) {
      this.checkedAt = Date.now();
      try {
        const [r] = await this.db.query(`SELECT to_regclass('public.store_collection') IS NOT NULL AS ok`);
        this.ready = Boolean(r?.ok);
      } catch { this.ready = false; }
    }
    return this.ready;
  }

  private event(eventType: string, actorId: number, profileId: number, metadata: Record<string, unknown> = {}) {
    try {
      this.activity?.record({
        eventType, category: ActivityCategory.BUSINESS, actorId, actorType: 'user',
        targetType: 'commerce_profile', targetId: profileId, metadata, visibility: 'system', severity: 'info',
      } as any)?.catch?.(() => undefined);
    } catch { /* never blocks */ }
  }

  private async owned(profileId: number, userId: number) {
    const [p] = await this.db.query(`SELECT id, "ownerId", type::text AS type FROM public.commerce_profile WHERE id = $1`, [profileId]);
    if (!p) throw new NotFoundException('Ukurasa haupatikani.');
    if (Number(p.ownerId) !== Number(userId)) throw new ForbiddenException('Huu si ukurasa wako.');
    if (!(await this.tables())) throw new BadRequestException('Huduma hii bado inaandaliwa. Jaribu tena baadaye.');
    return p as { id: number; ownerId: number; type: string };
  }

  private creatorReady = false;

  private async creatorColumns() {
    if (!this.creatorReady) {
      try {
        const [r] = await this.db.query(`SELECT COUNT(*)::int AS n FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'commerce_profile' AND column_name IN ('headline', 'pinnedPostId')`);
        this.creatorReady = Number(r?.n) === 2;
      } catch { this.creatorReady = false; }
    }
    return this.creatorReady;
  }

  /** Public: page type, opening hours, the shelves (in order), and the personal brand line and pin. */
  async get(profileId: number) {
    if (!(await this.tables())) return { pageTemplate: null, openingHours: null, collections: [], headline: null, pinnedPostId: null };
    const creator = await this.creatorColumns();
    const [p] = await this.db.query(`SELECT "pageTemplate", "openingHours"${creator ? ', headline, "pinnedPostId"' : ''} FROM public.commerce_profile WHERE id = $1`, [profileId]);
    if (!p) throw new NotFoundException('Ukurasa haupatikani.');
    const collections = await this.db.query(`
      SELECT id, title, note, "productIds", position FROM public.store_collection
       WHERE "commerceProfileId" = $1 ORDER BY position, id LIMIT ${MAX_COLLECTIONS}`, [profileId]);
    return {
      pageTemplate: cleanTemplate(p.pageTemplate), openingHours: cleanHours(p.openingHours), collections,
      headline: creator ? (p.headline || null) : null,
      pinnedPostId: creator && p.pinnedPostId ? Number(p.pinnedPostId) : null,
    };
  }

  /** A pin must be this profile's own live post (a personal profile's older posts carry no profile). */
  private async ownPost(profile: { id: number; ownerId: number; type: string }, postId: number) {
    const [row] = await this.db.query(`
      SELECT id FROM public.business_feed_item
       WHERE id = $1 AND "isActive" = true
         AND ("commerceProfileId" = $2 OR ($4::boolean AND "commerceProfileId" IS NULL AND "businessId" = $3))`,
    [postId, profile.id, profile.ownerId, profile.type === 'personal']);
    return Boolean(row);
  }

  async saveSettings(profileId: number, userId: number, body: any) {
    const profile = await this.owned(profileId, userId);
    const sets: string[] = [];
    const params: any[] = [profileId];
    if (body && 'pageTemplate' in body) { params.push(cleanTemplate(body.pageTemplate)); sets.push(`"pageTemplate" = $${params.length}`); }
    if (body && 'openingHours' in body) {
      const h = body.openingHours === null ? null : cleanHours(body.openingHours);
      if (body.openingHours !== null && !h) throw new BadRequestException('Saa za kufungua si sahihi (mf. 08:00 hadi 20:00).');
      params.push(h ? JSON.stringify(h) : null); sets.push(`"openingHours" = $${params.length}::jsonb`);
    }
    if (body && ('headline' in body || 'pinnedPostId' in body)) {
      if (!(await this.creatorColumns())) throw new BadRequestException('Huduma hii bado inaandaliwa. Jaribu tena baadaye.');
      if ('headline' in body) { params.push(cleanTitle(body.headline, 120) || null); sets.push(`headline = $${params.length}`); }
      if ('pinnedPostId' in body) {
        const pin = body.pinnedPostId == null ? null : Number(body.pinnedPostId);
        if (pin !== null && (!Number.isInteger(pin) || pin <= 0 || !(await this.ownPost(profile, pin)))) {
          throw new BadRequestException('Unaweza kubandika chapisho lako tu.');
        }
        params.push(pin); sets.push(`"pinnedPostId" = $${params.length}`);
      }
    }
    if (sets.length) await this.db.query(`UPDATE public.commerce_profile SET ${sets.join(', ')} WHERE id = $1`, params);
    this.event('STORE_SETTINGS_UPDATED', userId, profileId, { fields: Object.keys(body || {}) });
    return this.get(profileId);
  }

  /** Only the shop's own products may sit on its shelves. */
  private async ownProducts(profile: { id: number; ownerId: number; type: string }, ids: number[]) {
    if (!ids.length) return [];
    const qb = this.db.createQueryBuilder().select('p.id', 'id').from('product', 'p').where('p.id IN (:...ids)', { ids });
    if (profile.type === 'business') {
      qb.andWhere(`(p."commerceProfileId" = :cpid OR (${UNSTAMPED_FOR('p', 'cpid')} AND p."sellerId" = :ownerId))`, { cpid: profile.id, ownerId: profile.ownerId });
    } else {
      qb.andWhere('p."commerceProfileId" = :cpid', { cpid: profile.id });
    }
    const rows: Array<{ id: number }> = await qb.getRawMany();
    const allowed = new Set(rows.map((r) => Number(r.id)));
    return ids.filter((id) => allowed.has(id));
  }

  async addCollection(profileId: number, userId: number, body: any) {
    const p = await this.owned(profileId, userId);
    const title = cleanTitle(body?.title, 60);
    if (!title) throw new BadRequestException('Andika jina la mkusanyiko.');
    const [count] = await this.db.query(`SELECT COUNT(*)::int AS n FROM public.store_collection WHERE "commerceProfileId" = $1`, [profileId]);
    if (Number(count?.n) >= MAX_COLLECTIONS) throw new BadRequestException(`Mikusanyiko isizidi ${MAX_COLLECTIONS}.`);
    const ids = await this.ownProducts(p, cleanIds(body?.productIds));
    const [row] = await this.db.query(`
      INSERT INTO public.store_collection ("commerceProfileId", title, note, "productIds", position)
      VALUES ($1, $2, $3, $4::int[], $5) RETURNING id`, [profileId, title, cleanTitle(body?.note, 120) || null, ids, Number(count?.n) || 0]);
    this.event('STORE_COLLECTION_CREATED', userId, profileId, { collectionId: row.id, products: ids.length });
    return this.get(profileId);
  }

  async updateCollection(profileId: number, userId: number, collectionId: number, body: any) {
    const p = await this.owned(profileId, userId);
    const sets: string[] = ['"updatedAt" = now()'];
    const params: any[] = [collectionId, profileId];
    if (body && 'title' in body) {
      const title = cleanTitle(body.title, 60);
      if (!title) throw new BadRequestException('Andika jina la mkusanyiko.');
      params.push(title); sets.push(`title = $${params.length}`);
    }
    if (body && 'note' in body) { params.push(cleanTitle(body.note, 120) || null); sets.push(`note = $${params.length}`); }
    if (body && 'productIds' in body) { params.push(await this.ownProducts(p, cleanIds(body.productIds))); sets.push(`"productIds" = $${params.length}::int[]`); }
    if (body && 'position' in body && Number.isInteger(Number(body.position))) { params.push(Math.max(0, Number(body.position))); sets.push(`position = $${params.length}`); }
    const rows = await this.db.query(`UPDATE public.store_collection SET ${sets.join(', ')} WHERE id = $1 AND "commerceProfileId" = $2 RETURNING id`, params);
    if (!rows.length) throw new NotFoundException('Mkusanyiko haupatikani.');
    this.event('STORE_COLLECTION_UPDATED', userId, profileId, { collectionId });
    return this.get(profileId);
  }

  async removeCollection(profileId: number, userId: number, collectionId: number) {
    await this.owned(profileId, userId);
    const rows = await this.db.query(`DELETE FROM public.store_collection WHERE id = $1 AND "commerceProfileId" = $2 RETURNING id`, [collectionId, profileId]);
    if (!rows.length) throw new NotFoundException('Mkusanyiko haupatikani.');
    this.event('STORE_COLLECTION_REMOVED', userId, profileId, { collectionId });
    return this.get(profileId);
  }
}
