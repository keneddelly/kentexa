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
 */
export class AddCommunicationParticipantAudience1788258600000
  implements MigrationInterface
{
  name = 'AddCommunicationParticipantAudience1788258600000';

  async up(queryRunner: QueryRunner): Promise<void> {
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

      CREATE UNIQUE INDEX idx_conv_participant_unique_account
        ON public.conversation_participant (conversation_id, user_id)
        WHERE "principalType" = 'account' AND status = 'active';
      CREATE UNIQUE INDEX idx_conv_participant_unique_account_role
        ON public.conversation_participant (conversation_id, account_role_id)
        WHERE "principalType" = 'account_role' AND status = 'active';
      CREATE UNIQUE INDEX idx_conv_participant_unique_workspace
        ON public.conversation_participant (conversation_id, "workspaceType", "workspaceId")
        WHERE "principalType" = 'workspace' AND status = 'active';
      CREATE UNIQUE INDEX idx_conv_participant_unique_external
        ON public.conversation_participant (conversation_id, external_customer_id)
        WHERE "principalType" = 'external_contact' AND status = 'active';
      CREATE INDEX idx_conv_participant_conversation ON public.conversation_participant (conversation_id);
      CREATE INDEX idx_conv_participant_account_role ON public.conversation_participant (account_role_id);

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
      CREATE UNIQUE INDEX idx_conv_participant_state_unique_participant
        ON public.conversation_participant_state (conversation_participant_id);
    `);

    await queryRunner.query(`
      ALTER TABLE public.conversation
        ADD COLUMN "scopeType" character varying,
        ADD COLUMN "sourceType" character varying,
        ADD COLUMN "sourceId" integer,
        ADD COLUMN "ownerWorkspaceType" character varying,
        ADD COLUMN "ownerWorkspaceId" integer,
        ADD COLUMN "classificationStatus" character varying NOT NULL DEFAULT 'legacy_unscoped',
        ADD COLUMN "classificationReason" character varying,
        ADD COLUMN "classifiedAt" timestamp;
      CREATE INDEX idx_conversation_classification_status ON public.conversation ("classificationStatus");
    `);

    await queryRunner.query(`
      ALTER TABLE public.conversation_message
        ADD COLUMN "senderParticipantId" integer,
        ADD COLUMN "senderAccountRoleId" integer,
        ADD COLUMN "senderWorkspaceType" character varying,
        ADD COLUMN "senderWorkspaceId" integer;
    `);

    await queryRunner.query(`
      ALTER TABLE public.notification
        ADD COLUMN "audienceScope" character varying NOT NULL DEFAULT 'ACCOUNT',
        ADD COLUMN "recipientAccountRoleId" integer,
        ADD COLUMN "recipientWorkspaceType" character varying,
        ADD COLUMN "recipientWorkspaceId" integer,
        ADD COLUMN "sourceType" character varying,
        ADD COLUMN "sourceId" integer,
        ADD COLUMN "actionRouteKey" character varying,
        ADD COLUMN "actionParams" jsonb,
        ADD COLUMN "classificationStatus" character varying NOT NULL DEFAULT 'legacy_unscoped';
      CREATE INDEX idx_notification_audience_scope ON public.notification ("audienceScope");
      CREATE INDEX idx_notification_recipient_account_role ON public.notification ("recipientAccountRoleId");
    `);

    await queryRunner.query(`
      ALTER TABLE public.communication_log
        ADD COLUMN "recipientAccountRoleId" integer,
        ADD COLUMN "recipientWorkspaceType" character varying,
        ADD COLUMN "recipientWorkspaceId" integer,
        ADD COLUMN "audienceScope" character varying,
        ADD COLUMN "transactionType" character varying,
        ADD COLUMN "transactionId" integer;
      CREATE UNIQUE INDEX idx_communication_log_unique_scoped
        ON public.communication_log ("eventType", "sourceType", "sourceId", "recipientAccountRoleId", channel)
        WHERE "recipientAccountRoleId" IS NOT NULL;
    `);
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
