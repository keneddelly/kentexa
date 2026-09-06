import { AddCommunicationParticipantAudience1788258600000 } from './1788258600000-AddCommunicationParticipantAudience';

/**
 * Migration readiness hardening: AddCommunicationParticipantAudience must
 * distinguish OBJECT ABSENT (create), OBJECT PRESENT AND CORRECT (skip),
 * and OBJECT PRESENT BUT WRONG (stop with a diagnostic) for every table/
 * column/constraint it touches — never silently accept an incompatible
 * schema, never crash with an unhelpful raw Postgres error.
 */
describe('AddCommunicationParticipantAudience1788258600000 — existence-aware up()', () => {
  const buildQueryRunner = (opts: {
    existingTables?: Set<string>;
    existingColumns?: Set<string>; // "table.column"
    existingIndexes?: Set<string>;
    existingConstraints?: Set<string>;
  }) => {
    const existingTables = opts.existingTables ?? new Set<string>();
    const existingColumns = opts.existingColumns ?? new Set<string>();
    const existingIndexes = opts.existingIndexes ?? new Set<string>();
    const existingConstraints = opts.existingConstraints ?? new Set<string>();
    const executed: string[] = [];

    const queryRunner: any = {
      hasTable: jest.fn((table: string) => Promise.resolve(existingTables.has(table))),
      hasColumn: jest.fn((table: string, column: string) =>
        Promise.resolve(existingColumns.has(`${table}.${column}`)),
      ),
      query: jest.fn((sql: string, params?: any[]) => {
        executed.push(sql);
        if (sql.includes('pg_indexes')) {
          const name = params?.[0];
          return Promise.resolve(existingIndexes.has(name) ? [{ x: 1 }] : []);
        }
        if (sql.includes('pg_get_constraintdef')) {
          // Content-based check (name may be an auto-generated hash from
          // synchronize, or the migration's own literal name — either way).
          if (existingConstraints.has('CHK_conv_participant_one_principal')) {
            return Promise.resolve([
              {
                conname: 'CHK_whatever_name',
                definition:
                  `CHECK ((("principalType" = 'account'::text) OR ("principalType" = 'account_role'::text) ` +
                  `OR ("principalType" = 'workspace'::text) OR ("principalType" = 'external_contact'::text)) ` +
                  `AND user_id IS NULL AND account_role_id IS NULL AND external_customer_id IS NULL)`,
              },
            ]);
          }
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      }),
    };
    return { queryRunner, executed };
  };

  it('scenario A — empty schema: creates every table, column, and index', async () => {
    const { queryRunner, executed } = buildQueryRunner({});
    const migration = new AddCommunicationParticipantAudience1788258600000();
    await migration.up(queryRunner);

    expect(executed.some((sql) => sql.includes('CREATE TABLE public.conversation_participant'))).toBe(true);
    expect(executed.some((sql) => sql.includes('CREATE TABLE public.conversation_participant_state'))).toBe(true);
    expect(executed.some((sql) => sql.includes('ALTER TABLE public.conversation ADD COLUMN "scopeType"'))).toBe(true);
    expect(executed.some((sql) => sql.includes('ALTER TABLE public.notification ADD COLUMN "audienceScope"'))).toBe(true);
    expect(executed.some((sql) => sql.includes('ALTER TABLE public.communication_log ADD COLUMN "recipientAccountRoleId"'))).toBe(true);
    expect(executed.some((sql) => sql.includes('CREATE UNIQUE INDEX idx_conv_participant_unique_account'))).toBe(true);
  });

  it('scenario E — equivalent schema already present (e.g. via synchronize): creates nothing, throws nothing', async () => {
    const existingTables = new Set(['conversation_participant', 'conversation_participant_state']);
    const existingColumns = new Set([
      ...[
        'id', 'conversation_id', 'principalType', 'user_id', 'account_role_id',
        'workspaceType', 'workspaceId', 'external_customer_id', 'participantKind',
        'permissions', 'status', 'joinedAt', 'leftAt', 'createdAt', 'updatedAt',
      ].map((c) => `conversation_participant.${c}`),
      ...[
        'id', 'conversation_participant_id', 'lastReadMessageId', 'lastReadAt',
        'unreadCount', 'pinned', 'muted', 'archivedAt', 'createdAt', 'updatedAt',
      ].map((c) => `conversation_participant_state.${c}`),
      // Every column this migration would add to the four existing tables,
      // simulating a fully-synced schema.
      'conversation.scopeType', 'conversation.sourceType', 'conversation.sourceId',
      'conversation.ownerWorkspaceType', 'conversation.ownerWorkspaceId',
      'conversation.classificationStatus', 'conversation.classificationReason',
      'conversation.classifiedAt',
      'conversation_message.senderParticipantId', 'conversation_message.senderAccountRoleId',
      'conversation_message.senderWorkspaceType', 'conversation_message.senderWorkspaceId',
      'notification.audienceScope', 'notification.recipientAccountRoleId',
      'notification.recipientWorkspaceType', 'notification.recipientWorkspaceId',
      'notification.sourceType', 'notification.sourceId', 'notification.actionRouteKey',
      'notification.actionParams', 'notification.classificationStatus',
      'communication_log.recipientAccountRoleId', 'communication_log.recipientWorkspaceType',
      'communication_log.recipientWorkspaceId', 'communication_log.audienceScope',
      'communication_log.transactionType', 'communication_log.transactionId',
    ]);
    const existingConstraints = new Set(['CHK_conv_participant_one_principal']);
    const existingIndexes = new Set([
      'idx_conv_participant_unique_account', 'idx_conv_participant_unique_account_role',
      'idx_conv_participant_unique_workspace', 'idx_conv_participant_unique_external',
      'idx_conv_participant_conversation', 'idx_conv_participant_account_role',
      'idx_conv_participant_state_unique_participant',
      'idx_conversation_classification_status', 'idx_notification_audience_scope',
      'idx_notification_recipient_account_role', 'idx_communication_log_unique_scoped',
    ]);

    const { queryRunner, executed } = buildQueryRunner({
      existingTables, existingColumns, existingConstraints, existingIndexes,
    });
    const migration = new AddCommunicationParticipantAudience1788258600000();
    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    // No CREATE TABLE, no ADD COLUMN, no CREATE INDEX should have run.
    expect(executed.some((sql) => sql.includes('CREATE TABLE'))).toBe(false);
    expect(executed.some((sql) => sql.includes('ADD COLUMN'))).toBe(false);
    expect(executed.some((sql) => sql.startsWith('CREATE'))).toBe(false);
  });

  it('scenario F — table present but missing an expected column: throws a specific diagnostic, no DDL runs after', async () => {
    const existingTables = new Set(['conversation_participant']);
    // Missing "participantKind" — an incompatible/partial shape.
    const existingColumns = new Set([
      'conversation_participant.id',
      'conversation_participant.conversation_id',
      'conversation_participant.principalType',
    ]);
    const existingConstraints = new Set(['CHK_conv_participant_one_principal']);

    const { queryRunner } = buildQueryRunner({ existingTables, existingColumns, existingConstraints });
    const migration = new AddCommunicationParticipantAudience1788258600000();

    await expect(migration.up(queryRunner)).rejects.toThrow(/missing expected column\(s\).*participantKind/s);
  });

  it('scenario F — table present but missing the CHECK constraint: throws a specific diagnostic', async () => {
    const existingTables = new Set(['conversation_participant']);
    const existingColumns = new Set(
      [
        'id', 'conversation_id', 'principalType', 'user_id', 'account_role_id',
        'workspaceType', 'workspaceId', 'external_customer_id', 'participantKind',
        'permissions', 'status', 'joinedAt', 'leftAt', 'createdAt', 'updatedAt',
      ].map((c) => `conversation_participant.${c}`),
    );
    // existingConstraints intentionally empty — constraint missing.
    const { queryRunner } = buildQueryRunner({ existingTables, existingColumns });
    const migration = new AddCommunicationParticipantAudience1788258600000();

    await expect(migration.up(queryRunner)).rejects.toThrow(/no CHECK constraint enforcing "exactly one principal target" was found/);
  });

  it('scenario D — Stage 2 tables present but a downstream column-add is still pending: creates only the missing column', async () => {
    const existingTables = new Set(['conversation_participant', 'conversation_participant_state']);
    const allParticipantColumns = new Set([
      ...[
        'id', 'conversation_id', 'principalType', 'user_id', 'account_role_id',
        'workspaceType', 'workspaceId', 'external_customer_id', 'participantKind',
        'permissions', 'status', 'joinedAt', 'leftAt', 'createdAt', 'updatedAt',
      ].map((c) => `conversation_participant.${c}`),
      ...[
        'id', 'conversation_participant_id', 'lastReadMessageId', 'lastReadAt',
        'unreadCount', 'pinned', 'muted', 'archivedAt', 'createdAt', 'updatedAt',
      ].map((c) => `conversation_participant_state.${c}`),
      // conversation/message/communication_log columns NOT yet added —
      // simulates a run that got partway through before failing.
    ]);
    const existingConstraints = new Set(['CHK_conv_participant_one_principal']);
    const existingIndexes = new Set([
      'idx_conv_participant_unique_account', 'idx_conv_participant_unique_account_role',
      'idx_conv_participant_unique_workspace', 'idx_conv_participant_unique_external',
      'idx_conv_participant_conversation', 'idx_conv_participant_account_role',
      'idx_conv_participant_state_unique_participant',
    ]);

    const { queryRunner, executed } = buildQueryRunner({
      existingTables, existingColumns: allParticipantColumns, existingConstraints, existingIndexes,
    });
    const migration = new AddCommunicationParticipantAudience1788258600000();
    await expect(migration.up(queryRunner)).resolves.toBeUndefined();

    expect(executed.some((sql) => sql.includes('CREATE TABLE'))).toBe(false);
    expect(executed.some((sql) => sql.includes('ALTER TABLE public.conversation ADD COLUMN "scopeType"'))).toBe(true);
    expect(executed.some((sql) => sql.includes('ALTER TABLE public.notification ADD COLUMN "audienceScope"'))).toBe(true);
  });

  it('down() remains a real, unconditional rollback (unchanged from the original)', async () => {
    const { queryRunner, executed } = buildQueryRunner({});
    const migration = new AddCommunicationParticipantAudience1788258600000();
    await migration.down(queryRunner);
    expect(executed.some((sql) => sql.includes('DROP TABLE IF EXISTS public.conversation_participant'))).toBe(true);
  });
});
