import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Tuma taarifa" (owner 2026-11-09: admin and staff send app notifications or SMS to users, with
 * a link inside KenteXa; manager writes, admin approves sends to more than 100 people or any SMS;
 * customer care may message one person). Adds the send flow to announcements: status, the
 * in-app link (page + id), schedule, who approved, and how many it reached. Old rows become
 * 'sent' (they were shown or sent already). Additive only.
 */
export class AddAnnouncementSendFlow1795600000000 implements MigrationInterface {
  name = 'AddAnnouncementSendFlow1795600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "announcements"
      ADD COLUMN IF NOT EXISTS "status" varchar NOT NULL DEFAULT 'sent',
      ADD COLUMN IF NOT EXISTS "actionPage" varchar NULL,
      ADD COLUMN IF NOT EXISTS "actionParam" varchar NULL,
      ADD COLUMN IF NOT EXISTS "scheduledAt" timestamp NULL,
      ADD COLUMN IF NOT EXISTS "sentAt" timestamp NULL,
      ADD COLUMN IF NOT EXISTS "recipientCount" int NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "smsCount" int NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "createdByRole" varchar NULL,
      ADD COLUMN IF NOT EXISTS "approvedById" int NULL,
      ADD COLUMN IF NOT EXISTS "approvedAt" timestamp NULL,
      ADD COLUMN IF NOT EXISTS "rejectReason" text NULL`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_announcements_status_scheduled" ON "announcements" ("status", "scheduledAt")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_notification_source" ON "notification" ("sourceType", "sourceId")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Owner rule: never run down() on live. Kept for local resets only.
    await q.query(`DROP INDEX IF EXISTS "IDX_notification_source"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_announcements_status_scheduled"`);
    for (const c of ['rejectReason', 'approvedAt', 'approvedById', 'createdByRole', 'smsCount', 'recipientCount', 'sentAt', 'scheduledAt', 'actionParam', 'actionPage', 'status']) {
      await q.query(`ALTER TABLE "announcements" DROP COLUMN IF EXISTS "${c}"`);
    }
  }
}
