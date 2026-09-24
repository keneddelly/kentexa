import { AddParcelCustodyEvent1788278400000 } from './1788278400000-AddParcelCustodyEvent';

describe('Stage 3A1 custody schema rollback', () => {
  const migration = new AddParcelCustodyEvent1788278400000();

  it('refuses to drop the table after it contains custody evidence', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ exists: true }]);
    await expect(migration.down({ query } as any)).rejects.toThrow('nonempty parcel custody ledger');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('removes its own schema when the ledger is still empty', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ exists: false }]);
    await migration.down({ query } as any);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      expect.stringContaining('SELECT EXISTS'),
      expect.stringContaining('DROP TRIGGER IF EXISTS'),
      expect.stringContaining('DROP FUNCTION IF EXISTS'),
      expect.stringContaining('DROP TABLE IF EXISTS'),
    ]);
  });
});
