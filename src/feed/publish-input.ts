import { BadRequestException } from '@nestjs/common';
import {
  FeedItemType, MomentActionType, MomentIntent, MomentUrgencyLevel, MomentVisibility,
} from '../business/entities/business-feed-item.entity';

/**
 * Checks a feed publish request before anything is saved (Social Engagement phase A).
 * `POST /feed/publish` used to take any body (`dto: any`): an unknown type, intent or
 * visibility, or a huge text, reached the database. Enum fields must be known values;
 * text has an upper bound; numbers must be numbers. Messages are in simple Swahili.
 * Internal callers (product and service Moments) pass the same check.
 */
export const PUBLISH_LIMITS = Object.freeze({ title: 300, body: 5000, category: 120, label: 200 });

/** Home Feed phase D (owner approved 2026-11-02): what a person writes in the composer. */
export const COMPOSER_LIMITS = Object.freeze({ text: 500, photos: 4, editMinutes: 15 });

const oneOf = (value: unknown, allowed: object, field: string) => {
  if (value === undefined || value === null || value === '') return;
  if (!Object.values(allowed).includes(value as any)) {
    throw new BadRequestException(`Thamani ya "${field}" haitambuliki.`);
  }
};
const text = (value: unknown, max: number, field: string) => {
  if (value === undefined || value === null) return;
  if (typeof value !== 'string') throw new BadRequestException(`"${field}" lazima iwe maandishi.`);
  if (value.length > max) throw new BadRequestException(`"${field}" ni ndefu mno (herufi ${max} zaidi).`);
};
const num = (value: unknown, field: string) => {
  if (value === undefined || value === null || value === '') return;
  if (!Number.isFinite(Number(value)) || Number(value) < 0) throw new BadRequestException(`"${field}" lazima iwe namba.`);
};
const date = (value: unknown, field: string) => {
  if (value === undefined || value === null || value === '') return;
  if (Number.isNaN(Date.parse(String(value)))) throw new BadRequestException(`"${field}" si tarehe sahihi.`);
};

export function assertPublishInput(dto: any): void {
  if (!dto || typeof dto !== 'object') throw new BadRequestException('Chapisho halina maudhui.');
  if (!dto.type) throw new BadRequestException('Chagua aina ya chapisho.');
  oneOf(dto.type, FeedItemType, 'type');
  oneOf(dto.intent, MomentIntent, 'intent');
  oneOf(dto.actionType, MomentActionType, 'actionType');
  oneOf(dto.urgencyLevel, MomentUrgencyLevel, 'urgencyLevel');
  oneOf(dto.visibility, MomentVisibility, 'visibility');
  // Smart Post (owner 2026-11-09): new posts are for everyone or for followers. 'limited' stays
  // readable on old rows (treated like followers) but is not offered for new ones.
  if (dto.visibility === MomentVisibility.LIMITED) throw new BadRequestException('Chagua "Wote" au "Wanaofuata".');
  if (typeof dto.title !== 'string' || !dto.title.trim()) throw new BadRequestException('Andika kitu kwenye chapisho.');
  text(dto.title, PUBLISH_LIMITS.title, 'title');
  text(dto.body, PUBLISH_LIMITS.body, 'body');
  text(dto.imageUrl, 2000, 'imageUrl');
  text(dto.category, PUBLISH_LIMITS.category, 'category');
  text(dto.ctaLabel, PUBLISH_LIMITS.label, 'ctaLabel');
  text(dto.linkedEntityType, 40, 'linkedEntityType');
  for (const f of ['locationRegion', 'locationDistrict', 'locationWard', 'locationLabel', 'availabilityStatus']) {
    text(dto[f], PUBLISH_LIMITS.label, f);
  }
  assertMedia(dto.media);
  num(dto.price, 'price');
  num(dto.linkedEntityId, 'linkedEntityId');
  num(dto.commerceProfileId, 'commerceProfileId');
  date(dto.expiresAt, 'expiresAt');
  date(dto.startsAt, 'startsAt');
}

/** Phase D: up to 4 photos, each a URL with an optional width and height. */
export function assertMedia(media: unknown): void {
  if (media === undefined || media === null) return;
  if (!Array.isArray(media)) throw new BadRequestException('Picha hazikutumwa vizuri.');
  if (media.length > COMPOSER_LIMITS.photos) throw new BadRequestException(`Picha zisizidi ${COMPOSER_LIMITS.photos}.`);
  for (const m of media) {
    if (!m || typeof m !== 'object' || typeof (m as any).url !== 'string' || !(m as any).url.trim()) {
      throw new BadRequestException('Kila picha lazima iwe na anwani yake.');
    }
    text((m as any).url, 2000, 'media.url');
    num((m as any).width, 'media.width');
    num((m as any).height, 'media.height');
  }
}

/** Only the photo fields that are stored: url, width, height (anything else is dropped). */
export const cleanMedia = (media: any): { url: string; width: number | null; height: number | null }[] | null =>
  Array.isArray(media) && media.length
    ? media.map((m) => ({
        url: String(m.url).trim(),
        width: Number.isFinite(Number(m.width)) && Number(m.width) > 0 ? Math.round(Number(m.width)) : null,
        height: Number.isFinite(Number(m.height)) && Number(m.height) > 0 ? Math.round(Number(m.height)) : null,
      }))
    : null;

/**
 * Phase D: the text a person types in the composer is at most 500 characters. Checked on the
 * person's own publish and edit only; listings that post themselves keep the general limits.
 */
export function assertComposerText(dto: { title?: unknown; body?: unknown }): void {
  for (const f of ['title', 'body'] as const) {
    const v = dto?.[f];
    if (typeof v === 'string' && v.length > COMPOSER_LIMITS.text) {
      throw new BadRequestException(`Maandishi yasizidi herufi ${COMPOSER_LIMITS.text}.`);
    }
  }
}
