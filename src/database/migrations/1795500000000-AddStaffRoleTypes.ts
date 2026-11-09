import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * KenteXa staff roles (owner 2026-11-09: Manager, Customer care, Finance, Moderator). Manager and
 * customer care already exist; this adds finance and moderator to account_role_type_enum. They
 * are granted only by an admin (admin/staff), as account-level roles on the person's own user
 * profile, like admin and manager. One per person is enforced by the staff service (the existing
 * singular unique index cannot name a value added in the same transaction). Additive.
 * Postgres cannot drop an enum value; down() is a no-op. Owner rule: never run down() on live.
 */
export class AddStaffRoleTypes1795500000000 implements MigrationInterface {
  name = 'AddStaffRoleTypes1795500000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE public.account_role_type_enum ADD VALUE IF NOT EXISTS 'finance'`);
    await q.query(`ALTER TYPE public.account_role_type_enum ADD VALUE IF NOT EXISTS 'moderator'`);
  }

  public async down(): Promise<void> {
    // Enum values cannot be removed in Postgres; unused values are harmless.
  }
}
