import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Native push (Firebase Cloud Messaging) device tokens, one row per phone.
 * Additive only. Owner rule: never run down() on live.
 */
export class AddDevicePushToken1797800000000 implements MigrationInterface {
  name = 'AddDevicePushToken1797800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS public.device_push_token (
        id serial PRIMARY KEY,
        "userId" integer NOT NULL,
        token varchar NOT NULL UNIQUE,
        platform varchar(16) NOT NULL,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_device_push_token_userId" ON public.device_push_token ("userId")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS public.device_push_token`);
  }
}
