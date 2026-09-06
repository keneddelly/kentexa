import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stage 2 communication isolation — additive foundation only.
 *
 * Creates conversation_participant / conversation_participant_state, and
 * adds nullable/defaulted columns to conversation, conversation_message,
 * notification, and communication_log. Nothing here reads or rewrites any
 * existing row's data (no backfill, no destructive change, no dropped
 * column, no forced NOT NULL) — every new column on an existing table is
 * either nullable or has a safe default that preserves current (legacy)
 * behavior when unset. Historical classification/backfill is separate,
 * deliberately-manual tooling (ConversationClassifierService), not part of
 * this migration — see its own module for why.
 *
 * Migration readiness hardening (Stage 1+2 migration reconciliation pass):
 * a local dev database was found where TypeORM `synchronize` had already
 * created some/all of these objects before the migration ledger recorded
 * this migration as applied — running the original unguarded DDL against
 * that database failed immediately on the first "relation already exists"
 * error. Every object this migration touches is now existence-checked
 * first:
 *   - OBJECT ABSENT       → create it (original behavior, unchanged).
 *   - OBJECT PRESENT, and matches the expected column set → skip creating
 *     it, log that it was already present, continue.
 *   - OBJECT PRESENT but missing an expected column/constraint → THROW a
 *     specific diagnostic naming exactly what's missing, rather than
 *     either silently accepting an incompatible schema or crashing on a
 *     generic Postgres "already exists" error with no actionable detail.
 * This migration still assumes it is running against a database that is
 * either genuinely empty of these objects, or was populated by an
 * equivalent `synchronize` run of the SAME entity definitions this
 * migration encodes — it does not attempt to migrate an incompatible or
 * older shape of these tables. That distinction (empty vs. equivalent vs.
 * incompatible) is exactly what the separate migration-ledger
 * reconciliation tool (`reconcile-role-context-migrations.ts`) checks
 * BEFORE ever letting `migration:run` reach this file in production.
 */
export class AddCommunicationParticipantAudience1788258600000
  implements MigrationInterface
{
  name = 'AddCommunicationParticipantAudience1788258600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.ensureConversationParticipantTable(queryRunner);
    await this.ensureConversationParticipantStateTable(queryRunner);
    await this.ensureColumns(queryRunner, 'conversation', [
      { name: 'scopeType', ddl: '"scopeType" character varying' },
      { name: 'sourceType', ddl: '"sourceType" character varying' },
      { name: 'sourceId', ddl: '"sourceId" integer' },
      { name: 'ownerWorkspaceType', ddl: '"ownerWorkspaceType" character varying' },
      { name: 'ownerWorkspaceId', ddl: '"ownerWorkspaceId" integer' },
      {
        name: 'classificationStatus',
        ddl: `"classificationStatus" character varying NOT NULL DEFAULT 'legacy_unscoped'`,
      },
      { name: 'classificationReason', ddl: '"classificationReason" character varying' },
      { name: 'classifiedAt', ddl: '"classifiedAt" timestamp' },
    ]);
    await this.ensureIndex(
      queryRunner,
      'idx_conversation_classification_status',
      `CREATE INDEX idx_conversation_classification_status ON public.conversation ("classificationStatus")`,
    );

    await this.ensureColumns(queryRunner, 'conversation_message', [
      { name: 'senderParticipantId', ddl: '"senderParticipantId" integer' },
      { name: 'senderAccountRoleId', ddl: '"senderAccountRoleId" integer' },
      { name: 'senderWorkspaceType', ddl: '"senderWorkspaceType" character varying' },
      { name: 'senderWorkspaceId', ddl: '"senderWorkspaceId" integer' },
    ]);

    await this.ensureColumns(queryRunner, 'notification', [
      {
        name: 'audienceScope',
        ddl: `"audienceScope" character varying NOT NULL DEFAULT 'ACCOUNT'`,
      },
      { name: 'recipientAccountRoleId', ddl: '"recipientAccountRoleId" integer' },
      { name: 'recipientWorkspaceType', ddl: '"recipientWorkspaceType" character varying' },
      { name: 'recipientWorkspaceId', ddl: '"recipientWorkspaceId" integer' },
      { name: 'sourceType', ddl: '"sourceType" character varying' },
      { name: 'sourceId', ddl: '"sourceId" integer' },
      { name: 'actionRouteKey', ddl: '"actionRouteKey" character varying' },
      { name: 'actionParams', ddl: '"actionParams" jsonb' },
      {
        name: 'classificationStatus',
        ddl: `"classificationStatus" character varying NOT NULL DEFAULT 'legacy_unscoped'`,
      },
    ]);
    await this.ensureIndex(
      queryRunner,
      'idx_notification_audience_scope',
      `CREATE INDEX idx_notification_audience_scope ON public.notification ("audienceScope")`,
    );
    await this.ensureIndex(
      queryRunner,
      'idx_notification_recipient_account_role',
      `CREATE INDEX idx_notification_recipient_account_role ON public.notification ("recipientAccountRoleId")`,
    );

    await this.ensureColumns(queryRunner, 'communication_log', [
      { name: 'recipientAccountRoleId', ddl: '"recipientAccountRoleId" integer' },
      { name: 'recipientWorkspaceType', ddl: '"recipientWorkspaceType" character varying' },
      { name: 'recipientWorkspaceId', ddl: '"recipientWorkspaceId" integer' },
      { name: 'audienceScope', ddl: '"audienceScope" character varying' },
      { name: 'transactionType', ddl: '"transactionType" character varying' },
      { name: 'transactionId', ddl: '"transactionId" integer' },
    ]);
    await this.ensureIndex(
      queryRunner,
      'idx_communication_log_unique_scoped',
      `CREATE UNIQUE INDEX idx_communication_log_unique_scoped
        ON public.communication_log ("eventType", "sourceType", "sourceId", "recipientAccountRoleId", channel)
        WHERE "recipientAccountRoleId" IS NOT NULL`,
    );
  }

  private async ensureConversationParticipantTable(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const expectedColumns = [
      'id',
      'conversation_id',
      'principalType',
      'user_id',
      'account_role_id',
      'workspaceType',
      'workspaceId',
      'external_customer_id',
      'participantKind',
      'permissions',
      'status',
      'joinedAt',
      'leftAt',
      'createdAt',
      'updatedAt',
    ];

    if (await queryRunner.hasTable('conversation_participant')) {
      await this.assertColumnsPresent(
        queryRunner,
        'conversation_participant',
        expectedColumns,
      );
      await this.assertOnePrincipalCheckPresent(queryRunner);
      return; // present and matches the expected shape — nothing to do
    }

    await queryRunner.query(`
      CREATE TABLE public.conversation_participant (
        id SERIAL NOT NULL,
        conversation_id integer NOT NULL,
        "principalType" character varying NOT NULL,
        user_id integer,
        account_role_id integer,
        "workspaceType" character varying,
        "workspaceId" integer,
        external_customer_id integer,
        "participantKind" character varying NOT NULL,
        permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
        status character varying NOT NULL DEFAULT 'active',
        "joinedAt" timestamp NOT NULL DEFAULT now(),
        "leftAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conversation_participant" PRIMARY KEY (id),
        CONSTRAINT "FK_conv_participant_conversation" FOREIGN KEY (conversation_id)
          REFERENCES public.conversation(id) ON DELETE CASCADE,
        CONSTRAINT "FK_conv_participant_user" FOREIGN KEY (user_id)
          REFERENCES public."user"(id) ON DELETE SET NULL,
        CONSTRAINT "FK_conv_participant_account_role" FOREIGN KEY (account_role_id)
          REFERENCES public.account_role(id) ON DELETE CASCADE,
        CONSTRAINT "FK_conv_participant_external_customer" FOREIGN KEY (external_customer_id)
          REFERENCES public.business_customer(id) ON DELETE SET NULL,
        CONSTRAINT "CHK_conv_participant_one_principal" CHECK (
          (
            ("principalType" = 'account' AND user_id IS NOT NULL AND account_role_id IS NULL AND "workspaceType" IS NULL AND "workspaceId" IS NULL AND external_customer_id IS NULL)
            OR ("principalType" = 'account_role' AND account_role_id IS NOT NULL AND user_id IS NULL AND "workspaceType" IS NULL AND "workspaceId" IS NULL AND external_customer_id IS NULL)
            OR ("principalType" = 'workspace' AND "workspaceType" IS NOT NULL AND "workspaceId" IS NOT NULL AND user_id IS NULL AND account_role_id IS NULL AND external_customer_id IS NULL)
            OR ("principalType" = 'external_contact' AND external_customer_id IS NOT NULL AND user_id IS NULL AND account_role_id IS NULL AND "workspaceType" IS NULL AND "workspaceId" IS NULL)
          )
        )
      );
    `);

    await this.ensureIndex(
      queryRunner,
      'idx_conv_participant_unique_account',
      `CREATE UNIQUE INDEX idx_conv_participant_unique_account
        ON public.conversation_participant (conversation_id, user_id)
        WHERE "principalType" = 'account' AND status = 'active'`,
    );
    await this.ensureIndex(
      queryRunner,
      'idx_conv_participant_unique_account_role',
      `CREATE UNIQUE INDEX idx_conv_participant_unique_account_role
        ON public.conversation_participant (conversation_id, account_role_id)
        WHERE "principalType" = 'account_role' AND status = 'active'`,
    );
    await this.ensureIndex(
      queryRunner,
      'idx_conv_participant_unique_workspace',
      `CREATE UNIQUE INDEX idx_conv_participant_unique_workspace
        ON public.conversation_participant (conversation_id, "workspaceType", "workspaceId")
        WHERE "principalType" = 'workspace' AND status = 'active'`,
    );
    await this.ensureIndex(
      queryRunner,
      'idx_conv_participant_unique_external',
      `CREATE UNIQUE INDEX idx_conv_participant_unique_external
        ON public.conversation_participant (conversation_id, external_customer_id)
        WHERE "principalType" = 'external_contact' AND status = 'active'`,
    );
    await this.ensureIndex(
      queryRunner,
      'idx_conv_participant_conversation',
      `CREATE INDEX idx_conv_participant_conversation ON public.conversation_participant (conversation_id)`,
    );
    await this.ensureIndex(
      queryRunner,
      'idx_conv_participant_account_role',
      `CREATE INDEX idx_conv_participant_account_role ON public.conversation_participant (account_role_id)`,
    );
  }

  private async ensureConversationParticipantStateTable(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const expectedColumns = [
      'id',
      'conversation_participant_id',
      'lastReadMessageId',
      'lastReadAt',
      'unreadCount',
      'pinned',
      'muted',
      'archivedAt',
      'createdAt',
      'updatedAt',
    ];

    if (await queryRunner.hasTable('conversation_participant_state')) {
      await this.assertColumnsPresent(
        queryRunner,
        'conversation_participant_state',
        expectedColumns,
      );
      return;
    }

    await queryRunner.query(`
      CREATE TABLE public.conversation_participant_state (
        id SERIAL NOT NULL,
        conversation_participant_id integer NOT NULL,
        "lastReadMessageId" integer,
        "lastReadAt" timestamp,
        "unreadCount" integer NOT NULL DEFAULT 0,
        pinned boolean NOT NULL DEFAULT false,
        muted boolean NOT NULL DEFAULT false,
        "archivedAt" timestamp,
        "createdAt" timestamp NOT NULL DEFAULT now(),
        "updatedAt" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conversation_participant_state" PRIMARY KEY (id),
        CONSTRAINT "FK_conv_participant_state_participant" FOREIGN KEY (conversation_participant_id)
          REFERENCES public.conversation_participant(id) ON DELETE CASCADE
      );
    `);
    await this.ensureIndex(
      queryRunner,
      'idx_conv_participant_state_unique_participant',
      `CREATE UNIQUE INDEX idx_conv_participant_state_unique_participant
        ON public.conversation_participant_state (conversation_participant_id)`,
    );
  }

  /**
   * OBJECT ABSENT → create (each column gets its own guarded ADD COLUMN so
   * a table that has SOME but not all of these columns from a prior
   * partial run is completed rather than rejected). OBJECT PRESENT with
   * the same name → left untouched, never re-added, never altered.
   */
  private async ensureColumns(
    queryRunner: QueryRunner,
    table: string,
    columns: Array<{ name: string; ddl: string }>,
  ): Promise<void> {
    for (const column of columns) {
      const exists = await queryRunner.hasColumn(table, column.name);
      if (exists) continue;
      await queryRunner.query(
        `ALTER TABLE public.${table} ADD COLUMN ${column.ddl}`,
      );
    }
  }

  /** OBJECT ABSENT → create. OBJECT PRESENT (any definition) → skip. */
  private async ensureIndex(
    queryRunner: QueryRunner,
    indexName: string,
    createSql: string,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
      [indexName],
    )) as unknown[];
    if (rows.length > 0) return;
    await queryRunner.query(createSql);
  }

  /**
   * OBJECT PRESENT BUT WRONG → STOP with diagnostic. Used only when the
   * table already exists, to confirm it is the shape this migration
   * expects rather than an incompatible same-named table.
   */
  private async assertColumnsPresent(
    queryRunner: QueryRunner,
    table: string,
    expectedColumns: string[],
  ): Promise<void> {
    const missing: string[] = [];
    for (const column of expectedColumns) {
      if (!(await queryRunner.hasColumn(table, column))) missing.push(column);
    }
    if (missing.length > 0) {
      throw new Error(
        `AddCommunicationParticipantAudience refused: table "${table}" already exists ` +
          `but is missing expected column(s): ${missing.join(', ')}. This table's shape ` +
          `does not match what this migration would create — refusing to guess. ` +
          `Investigate manually before retrying (see reconcile-role-context-migrations.ts).`,
      );
    }
  }

  /**
   * Matches by CONTENT, not by name. TypeORM `synchronize` (driven by the
   * `@Check()` decorator on ConversationParticipant, which carries no
   * explicit name) creates this exact constraint under an auto-generated
   * hash name like "CHK_9523f797e9c4537075b78a1323" — never the literal
   * "CHK_conv_participant_one_principal" this migration's own CREATE TABLE
   * uses. A database bootstrapped via synchronize (the normal local-dev
   * path for this app) is fully equivalent and must not be rejected just
   * because the constraint's NAME differs from this migration's choice.
   */
  private async assertOnePrincipalCheckPresent(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const rows = (await queryRunner.query(`
      SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_catalog.pg_constraint
      WHERE conrelid = 'public.conversation_participant'::regclass
        AND contype = 'c'
    `)) as Array<{ conname: string; definition: string }>;

    const requiredFragments = [
      `'account'`,
      `'account_role'`,
      `'workspace'`,
      `'external_contact'`,
      'user_id',
      'account_role_id',
      'external_customer_id',
    ];
    const matches = rows.some((row) =>
      requiredFragments.every((fragment) => row.definition.includes(fragment)),
    );

    if (!matches) {
      throw new Error(
        `AddCommunicationParticipantAudience refused: table "conversation_participant" ` +
          `already exists but no CHECK constraint enforcing "exactly one principal target" ` +
          `was found (checked by content, not by name — found check constraints: ` +
          `${rows.map((r) => r.conname).join(', ') || '(none)'}). This table's shape does ` +
          `not match what this migration would create — refusing to guess. Investigate ` +
          `manually before retrying.`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.communication_log
        DROP COLUMN IF EXISTS "recipientAccountRoleId",
        DROP COLUMN IF EXISTS "recipientWorkspaceType",
        DROP COLUMN IF EXISTS "recipientWorkspaceId",
        DROP COLUMN IF EXISTS "audienceScope",
        DROP COLUMN IF EXISTS "transactionType",
        DROP COLUMN IF EXISTS "transactionId";

      ALTER TABLE public.notification
        DROP COLUMN IF EXISTS "audienceScope",
        DROP COLUMN IF EXISTS "recipientAccountRoleId",
        DROP COLUMN IF EXISTS "recipientWorkspaceType",
        DROP COLUMN IF EXISTS "recipientWorkspaceId",
        DROP COLUMN IF EXISTS "sourceType",
        DROP COLUMN IF EXISTS "sourceId",
        DROP COLUMN IF EXISTS "actionRouteKey",
        DROP COLUMN IF EXISTS "actionParams",
        DROP COLUMN IF EXISTS "classificationStatus";

      ALTER TABLE public.conversation_message
        DROP COLUMN IF EXISTS "senderParticipantId",
        DROP COLUMN IF EXISTS "senderAccountRoleId",
        DROP COLUMN IF EXISTS "senderWorkspaceType",
        DROP COLUMN IF EXISTS "senderWorkspaceId";

      ALTER TABLE public.conversation
        DROP COLUMN IF EXISTS "scopeType",
        DROP COLUMN IF EXISTS "sourceType",
        DROP COLUMN IF EXISTS "sourceId",
        DROP COLUMN IF EXISTS "ownerWorkspaceType",
        DROP COLUMN IF EXISTS "ownerWorkspaceId",
        DROP COLUMN IF EXISTS "classificationStatus",
        DROP COLUMN IF EXISTS "classificationReason",
        DROP COLUMN IF EXISTS "classifiedAt";

      DROP TABLE IF EXISTS public.conversation_participant_state;
      DROP TABLE IF EXISTS public.conversation_participant;
    `);
  }
}
