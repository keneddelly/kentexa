import { evaluateMigration, FINGERPRINTS } from './reconcile-role-context-migrations';

/**
 * Migration-ledger reconciliation must never infer completion from a
 * single table's presence, never guess on partial/incompatible schema,
 * and must recognize a migration already recorded under either its
 * current filename-derived name OR a known historical alias.
 *
 * Migration 4 specifically: `conversation`/`conversation_message`/
 * `notification`/`communication_log` are pre-existing legacy tables this
 * migration only adds columns to (confirmed directly from the migration's
 * source — grep for CREATE TABLE finds only conversation_participant and
 * conversation_participant_state). Their bare existence must never gate
 * NOT_APPLICABLE/AMBIGUOUS the way a genuinely new table does; only their
 * specific new columns matter, and are checked via requiredColumns.
 */
describe('reconcile-role-context-migrations — evaluateMigration()', () => {
  const stage1Fp = FINGERPRINTS.find((f) => f.canonicalName.startsWith('AddAccountRoleAndActiveRoleSession'))!;
  const fixUuidFp = FINGERPRINTS.find((f) => f.canonicalName.startsWith('FixActiveRoleSessionUuidDefault'))!;
  const stage2Fp = FINGERPRINTS.find((f) => f.canonicalName.startsWith('AddCommunicationParticipantAudience'))!;

  const buildQueryRunner = (opts: {
    ledgerNames?: string[];
    tables?: Set<string>;
    columns?: Set<string>; // "table.column"
    constraints?: Set<string>;
  }) => {
    const ledgerNames = new Set(opts.ledgerNames ?? []);
    const tables = opts.tables ?? new Set<string>();
    const columns = opts.columns ?? new Set<string>();
    const constraints = opts.constraints ?? new Set<string>();
    const queryLog: string[] = [];

    return {
      hasTable: jest.fn((t: string) => Promise.resolve(tables.has(t))),
      hasColumn: jest.fn((t: string, c: string) => Promise.resolve(columns.has(`${t}.${c}`))),
      query: jest.fn((sql: string, params?: any[]) => {
        queryLog.push(sql);
        if (sql.includes('typeorm_migrations WHERE name = ANY')) {
          const requested: string[] = params?.[0] ?? [];
          const match = requested.find((n) => ledgerNames.has(n));
          return Promise.resolve(match ? [{ name: match }] : []);
        }
        if (sql.includes('pg_get_constraintdef')) {
          // Content-based CHK_conv_participant_one_principal check — return
          // a definition containing every required fragment when the test
          // says the constraint is present (under ANY name), else nothing.
          if (constraints.has('CHK_conv_participant_one_principal')) {
            return Promise.resolve([
              {
                definition:
                  `CHECK ((("principalType" = 'account'::text) OR ("principalType" = 'account_role'::text) ` +
                  `OR ("principalType" = 'workspace'::text) OR ("principalType" = 'external_contact'::text)) ` +
                  `AND user_id IS NULL AND account_role_id IS NULL AND external_customer_id IS NULL)`,
              },
            ]);
          }
          return Promise.resolve([]);
        }
        if (sql.includes('pg_constraint')) {
          return Promise.resolve(constraints.has(params?.[0]) ? [{ x: 1 }] : []);
        }
        return Promise.resolve([]);
      }),
      __queryLog: queryLog,
    } as any;
  };

  const fullStage2Columns = () =>
    new Set(stage2Fp.requiredColumns.map((c) => `${c.table}.${c.column}`));

  // Scenario A — empty database.
  it('scenario A (empty database): NOT_APPLICABLE for every migration — nothing to adopt, real migration should run', async () => {
    const qr = buildQueryRunner({});
    for (const fp of [stage1Fp, fixUuidFp, stage2Fp]) {
      const result = await evaluateMigration(qr, fp);
      expect(result.verdict).toBe('NOT_APPLICABLE');
    }
  });

  // Scenario B — pre-Stage1 legacy database: same as empty from this
  // tool's perspective (none of the Stage 1/2 tables exist yet).
  it('scenario B (pre-Stage1 legacy database): NOT_APPLICABLE — no Stage 1/2 objects exist regardless of legacy tables', async () => {
    const qr = buildQueryRunner({ tables: new Set(['user', 'order', 'seller_profile']) });
    const result = await evaluateMigration(qr, stage1Fp);
    expect(result.verdict).toBe('NOT_APPLICABLE');
  });

  // Scenario C — Stage 1 schema present, ledger missing/mismatched.
  it('scenario C (Stage 1 schema present, ledger mismatched): ADOPTABLE, never RESOLVED merely from old ledger name mismatch', async () => {
    const qr = buildQueryRunner({
      ledgerNames: ['BaselineLiveKentexaSchema20260901100000'], // unrelated old row present
      tables: new Set(['account_role', 'active_role_session', 'role_migration_audit']),
      columns: new Set(
        stage1Fp.requiredColumns.map((c) => `${c.table}.${c.column}`),
      ),
      constraints: new Set(stage1Fp.requiredConstraints),
    });
    const result = await evaluateMigration(qr, stage1Fp);
    expect(result.verdict).toBe('ADOPTABLE');
  });

  it('recognizes a known historical alias in the ledger as RESOLVED, without re-checking schema', async () => {
    const qr = buildQueryRunner({
      ledgerNames: ['AddAccountRoleAndActiveRoleSession20260901101000'],
    });
    const result = await evaluateMigration(qr, stage1Fp);
    expect(result.verdict).toBe('RESOLVED');
    expect(qr.hasTable).not.toHaveBeenCalled();
  });

  it('recognizes the current canonical name in the ledger as RESOLVED', async () => {
    const qr = buildQueryRunner({
      ledgerNames: ['AddAccountRoleAndActiveRoleSession1788257400000'],
    });
    const result = await evaluateMigration(qr, stage1Fp);
    expect(result.verdict).toBe('RESOLVED');
  });

  // Scenario D — Stage 2 schema present, ledger missing/mismatched.
  it('scenario D (Stage 2 schema present, ledger mismatched): ADOPTABLE only when the FULL footprint matches, not just conversation_participant', async () => {
    const qr = buildQueryRunner({
      tables: new Set(stage2Fp.newTables),
      columns: fullStage2Columns(),
      constraints: new Set(stage2Fp.requiredConstraints),
    });
    const result = await evaluateMigration(qr, stage2Fp);
    expect(result.verdict).toBe('ADOPTABLE');
  });

  it('never marks Stage 2 ADOPTABLE from conversation_participant alone — missing notification/communication_log columns is AMBIGUOUS', async () => {
    const qr = buildQueryRunner({
      tables: new Set(stage2Fp.newTables), // both new tables "exist"
      columns: new Set([
        'conversation_participant.principalType',
        'conversation_participant.account_role_id',
        'conversation_participant.participantKind',
        'conversation_participant_state.unreadCount',
        'conversation.classificationStatus',
        'conversation_message.senderAccountRoleId',
        // notification.* and communication_log.* columns deliberately omitted
      ]),
      constraints: new Set(stage2Fp.requiredConstraints),
    });
    const result = await evaluateMigration(qr, stage2Fp);
    expect(result.verdict).toBe('AMBIGUOUS');
    expect(result.detail).toMatch(/notification\.audienceScope|communication_log\.recipientAccountRoleId/);
  });

  // Scenario E — correct schema + correct ledger.
  it('scenario E (correct schema + correct ledger): RESOLVED, no schema inspection needed', async () => {
    const qr = buildQueryRunner({ ledgerNames: [stage2Fp.canonicalName] });
    const result = await evaluateMigration(qr, stage2Fp);
    expect(result.verdict).toBe('RESOLVED');
  });

  // Scenario F — partial/incompatible Stage 2 schema.
  it('scenario F (one of two new tables exists): AMBIGUOUS, never guessed as adoptable or not-applicable', async () => {
    const qr = buildQueryRunner({
      tables: new Set(['conversation_participant']), // only one of the two genuinely-new tables
    });
    const result = await evaluateMigration(qr, stage2Fp);
    expect(result.verdict).toBe('AMBIGUOUS');
  });

  it('scenario F (incompatible Stage 2 schema — tables exist but missing the CHECK constraint): AMBIGUOUS', async () => {
    const qr = buildQueryRunner({
      tables: new Set(stage2Fp.newTables),
      columns: fullStage2Columns(),
      constraints: new Set(), // constraint missing
    });
    const result = await evaluateMigration(qr, stage2Fp);
    expect(result.verdict).toBe('AMBIGUOUS');
    expect(result.detail).toMatch(/CHK_conv_participant_one_principal/);
  });

  // --- The specific bug this fix closes ---------------------------------
  // A production database that has ALWAYS had conversation/notification/
  // communication_log (they predate this entire project) but has NEVER
  // run Stage 2 must be NOT_APPLICABLE, not AMBIGUOUS, merely because
  // those four legacy tables "exist."
  it('a real-world production shape (legacy communication tables exist, nothing Stage-2 does) is NOT_APPLICABLE, not AMBIGUOUS', async () => {
    const qr = buildQueryRunner({
      tables: new Set(['conversation', 'conversation_message', 'notification', 'communication_log']),
      // No conversation_participant, no conversation_participant_state,
      // no Stage 2 columns on any of the four legacy tables.
    });
    const result = await evaluateMigration(qr, stage2Fp);
    expect(result.verdict).toBe('NOT_APPLICABLE');
  });

  // both new tables absent but one Stage 2 column already exists -> AMBIGUOUS
  it('both new tables absent but one Stage 2 column already exists on a legacy table: AMBIGUOUS, not NOT_APPLICABLE', async () => {
    const qr = buildQueryRunner({
      tables: new Set(['conversation', 'conversation_message', 'notification', 'communication_log']),
      columns: new Set(['notification.audienceScope']), // one stray Stage 2 column, e.g. from a failed partial run
    });
    const result = await evaluateMigration(qr, stage2Fp);
    expect(result.verdict).toBe('AMBIGUOUS');
  });

  it('the trivial UUID-default fix is ADOPTABLE once its target column state is already true', async () => {
    const qr = buildQueryRunner({
      tables: new Set(['active_role_session']),
      columns: new Set(['active_role_session.id']),
    });
    const result = await evaluateMigration(qr, fixUuidFp);
    expect(result.verdict).toBe('ADOPTABLE');
  });

  it('the trivial UUID-default fix is NOT_APPLICABLE when active_role_session does not exist yet (migration 2 has not run)', async () => {
    const qr = buildQueryRunner({});
    const result = await evaluateMigration(qr, fixUuidFp);
    expect(result.verdict).toBe('NOT_APPLICABLE');
  });

  // Read-only guarantee: evaluateMigration must never issue a write.
  it('evaluateMigration never issues an INSERT/UPDATE/DELETE/CREATE/ALTER/DROP query in any scenario', async () => {
    const scenarios = [
      buildQueryRunner({}),
      buildQueryRunner({ ledgerNames: [stage2Fp.canonicalName] }),
      buildQueryRunner({ tables: new Set(stage2Fp.newTables), columns: fullStage2Columns(), constraints: new Set(stage2Fp.requiredConstraints) }),
      buildQueryRunner({ tables: new Set(['conversation_participant']) }),
    ];
    for (const qr of scenarios) {
      await evaluateMigration(qr, stage2Fp);
      const writes = (qr.__queryLog as string[]).filter((sql) =>
        /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i.test(sql),
      );
      expect(writes).toEqual([]);
    }
  });
});
