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
  num(dto.price, 'price');
  num(dto.linkedEntityId, 'linkedEntityId');
  num(dto.commerceProfileId, 'commerceProfileId');
  date(dto.expiresAt, 'expiresAt');
  date(dto.startsAt, 'startsAt');
}
