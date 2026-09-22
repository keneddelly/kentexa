import {
  parseUpperBound,
  migrationTimestamp,
  selectMigrations,
  DiscoveredMigration,
} from './run-migrations-direct';

/**
 * Gate H bounded migration runner — fast, DB-free unit tests of the pure selection logic
 * (parseUpperBound / migrationTimestamp / selectMigrations). The real-Postgres end-to-end proof
 * that a bounded run actually leaves migration 6 pending in typeorm_migrations lives in
 * run-migrations-direct.real-postgres.spec.ts.
 */
describe('run-migrations-direct — bounded selection', () => {
  const named = (name: string): Pick<{ name: string }, 'name'> => ({ name });

  // The real I2G six, by name, exactly as the migration classes declare `name = '...'`.
  const I2G_NAMES = [
    'AddWorkspaceOwnershipToOrderAndSale1788264000000',
    'AddWalletXorOwnership1788264600000',
    'AddMoneyRoutingEntry1788265200000',
    'AddPayoutDestination1788265800000',
    'AddFinancialReconciliationJournal1788266400000',
    'HardenFinancialHistoryForeignKeys1788267000000',
  ];

  const discoveredFromNames = (names: string[]): DiscoveredMigration[] =>
    names.map((name) => ({ instance: { name } as any, name, timestamp: migrationTimestamp({ name }) }));

  describe('migrationTimestamp()', () => {
    it('extracts the trailing 13-digit timestamp exactly like TypeORM\'s own MigrationExecutor', () => {
      expect(migrationTimestamp(named('HardenFinancialHistoryForeignKeys1788267000000'))).toBe(1788267000000);
      expect(migrationTimestamp(named('AddFinancialReconciliationJournal1788266400000'))).toBe(1788266400000);
    });

    it('throws for a class name with no valid trailing timestamp', () => {
      expect(() => migrationTimestamp(named('NotATimestampAtAll'))).toThrow(/migration name is wrong/);
    });
  });

  describe('parseUpperBound()', () => {
    it('accepts a plain positive integer string', () => {
      expect(parseUpperBound('1788266400000')).toBe(1788266400000);
    });

    // C: malformed bounds fail closed
    it.each([
      ['empty string', ''],
      ['whitespace only', '   '],
      ['leading/trailing whitespace around a real value', ' 1788266400000 '],
      ['decimal', '1788266400000.5'],
      ['negative', '-1788266400000'],
      ['leading plus sign', '+1788266400000'],
      ['scientific notation', '1.7882664e12'],
      ['non-numeric', 'abc'],
      ['hex-looking', '0x1a'],
      ['leading zero', '01788266400000'],
      ['trailing garbage', '1788266400000x'],
    ])('rejects a malformed bound: %s ("%s")', (_label, raw) => {
      expect(() => parseUpperBound(raw)).toThrow(/malformed/);
    });
  });

  describe('selectMigrations()', () => {
    const discovered = discoveredFromNames(I2G_NAMES);

    // B: no upper bound retains existing all-pending behaviour
    it('with upperBound=null, selects every discovered migration and excludes none', () => {
      const { selected, excluded } = selectMigrations(discovered, null);
      expect(selected.map((m) => m.name)).toEqual(I2G_NAMES); // sorted ascending, matches source order here
      expect(excluded).toHaveLength(0);
    });

    // A: upper bound 1788266400000 selects migrations 1-5 and excludes migration 6
    it('with upperBound=1788266400000 (AddFinancialReconciliationJournal), selects exactly migrations 1-5 and excludes HardenFinancialHistoryForeignKeys', () => {
      const { selected, excluded } = selectMigrations(discovered, 1788266400000);
      expect(selected.map((m) => m.name)).toEqual([
        'AddWorkspaceOwnershipToOrderAndSale1788264000000',
        'AddWalletXorOwnership1788264600000',
        'AddMoneyRoutingEntry1788265200000',
        'AddPayoutDestination1788265800000',
        'AddFinancialReconciliationJournal1788266400000',
      ]);
      expect(excluded.map((m) => m.name)).toEqual(['HardenFinancialHistoryForeignKeys1788267000000']);
      expect(selected.some((m) => m.name.startsWith('HardenFinancialHistoryForeignKeys'))).toBe(false);
    });

    it('an intermediate bound (e.g. migration 3) selects only that far and excludes everything after, including migration 6', () => {
      const { selected, excluded } = selectMigrations(discovered, 1788265200000);
      expect(selected.map((m) => m.name)).toEqual([
        'AddWorkspaceOwnershipToOrderAndSale1788264000000',
        'AddWalletXorOwnership1788264600000',
        'AddMoneyRoutingEntry1788265200000',
      ]);
      expect(excluded.map((m) => m.name)).toEqual([
        'AddPayoutDestination1788265800000',
        'AddFinancialReconciliationJournal1788266400000',
        'HardenFinancialHistoryForeignKeys1788267000000',
      ]);
    });

    // D: unknown/nonexistent bound fails closed
    it('a well-formed but unknown timestamp (matches no discovered migration) fails closed', () => {
      expect(() => selectMigrations(discovered, 1788266400001)).toThrow(/does not match any discovered migration/);
    });

    it('a well-formed timestamp from a plausible neighbouring migration outside this discovered set also fails closed', () => {
      expect(() => selectMigrations(discovered, 1788263400000)).toThrow(/does not match any discovered migration/);
    });

    it('is order-independent in its input and always returns ascending-sorted selected/excluded', () => {
      const shuffled = discoveredFromNames([...I2G_NAMES].reverse());
      const { selected, excluded } = selectMigrations(shuffled, 1788265800000);
      expect(selected.map((m) => m.timestamp)).toEqual([...selected.map((m) => m.timestamp)].sort((a, b) => a - b));
      expect(excluded.map((m) => m.timestamp)).toEqual([...excluded.map((m) => m.timestamp)].sort((a, b) => a - b));
    });
  });
});
