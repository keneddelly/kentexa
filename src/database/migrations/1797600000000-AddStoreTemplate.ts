import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Duka page template (owner approved 2026-11-18, store-mock).
 *
 * product."compareAtPrice"          the old price a customer saw, so an Ofa shows a real discount.
 * commerce_profile."pageTemplate"   null = automatic; 'store' | 'basic' chosen by the owner.
 * commerce_profile."openingHours"   { open: "08:00", close: "20:00", closedDays: [0] } for "Wazi sasa".
 * store_collection                  the owner's own shelves ("Ofa za wiki", "Zawadi chini ya 50K").
 *
 * Additive only. Owner rule: never run down() on live.
 */
export class AddStoreTemplate1797600000000 implements MigrationInterface {
  name = 'AddStoreTemplate1797600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE public.product ADD COLUMN IF NOT EXISTS "compareAtPrice" numeric(10,2) NULL`);
    await q.query(`ALTER TABLE public.commerce_profile ADD COLUMN IF NOT EXISTS "pageTemplate" varchar(20) NULL`);
    await q.query(`ALTER TABLE public.commerce_profile ADD COLUMN IF NOT EXISTS "openingHours" jsonb NULL`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS public.store_collection (
        id serial PRIMARY KEY,
        "commerceProfileId" integer NOT NULL REFERENCES public.commerce_profile(id) ON DELETE CASCADE,
        title varchar(60) NOT NULL,
        note varchar(120) NULL,
        "productIds" integer[] NOT NULL DEFAULT '{}',
        position integer NOT NULL DEFAULT 0,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_store_collection_profile" ON public.store_collection ("commerceProfileId", position)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS public.store_collection`);
    await q.query(`ALTER TABLE public.commerce_profile DROP COLUMN IF EXISTS "openingHours"`);
    await q.query(`ALTER TABLE public.commerce_profile DROP COLUMN IF EXISTS "pageTemplate"`);
    await q.query(`ALTER TABLE public.product DROP COLUMN IF EXISTS "compareAtPrice"`);
  }
}
