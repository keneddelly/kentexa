import { VersionController } from './version.controller';

describe('VersionController', () => {
  const saved = { ...process.env };
  afterEach(() => { process.env = { ...saved }; });

  it('reports the commit and branch Render deployed', () => {
    process.env.RENDER_GIT_COMMIT = 'abc1234';
    process.env.RENDER_GIT_BRANCH = 'worktree-service-provider-profiles';
    const body = new VersionController().getVersion();
    expect(body.commit).toBe('abc1234');
    expect(body.branch).toBe('worktree-service-provider-profiles');
    expect(body.service).toBe('kentexa-backend');
    expect(Number.isNaN(Date.parse(body.startedAt))).toBe(false);
  });

  it('reports null, never a guess, outside a Render deploy', () => {
    delete process.env.RENDER_GIT_COMMIT;
    delete process.env.RENDER_GIT_BRANCH;
    const body = new VersionController().getVersion();
    expect(body.commit).toBeNull();
    expect(body.branch).toBeNull();
  });

  // Gate 2: the schema this process is running against.
  describe('GET /version/migrations', () => {
    const ledgerOf = (rows: Array<{ timestamp: string; name: string }>) =>
      ({ query: jest.fn(async () => rows) }) as any;

    it('reports null, never a guess, when there is no ledger to read', async () => {
      expect((await new VersionController().getMigrations()).ledger).toBeNull();
      const broken: any = { query: jest.fn(async () => { throw new Error('relation "typeorm_migrations" does not exist'); }) };
      const body = await new VersionController(broken).getMigrations();
      expect(body.ledger).toBeNull();
      expect(body.shipped).toBeGreaterThan(40);
    });

    it('lists shipped migrations the ledger does not hold as pending', async () => {
      const body: any = await new VersionController(ledgerOf([
        { timestamp: '1788288600000', name: 'AddParcelMovementTender1788288600000' },
      ])).getMigrations();
      expect(body.applied).toBe(1);
      expect(body.latestApplied).toBe('AddParcelMovementTender1788288600000');
      expect(body.pending).toContain('AddTransportRecurringSchedule1788291600000');
      expect(body.pending).toContain('AddJourneyFoundation1788291000000');
      // Two files share 1788288600000: each is judged by NAME, not timestamp.
      expect(body.pending).toContain('AddSuperAgentSettlementFoundation1788288600000');
      expect(body.pending).not.toContain('AddParcelMovementTender1788288600000');
      expect(body.sharedTimestamps['1788288600000']).toEqual({
        files: ['AddParcelMovementTender1788288600000', 'AddSuperAgentSettlementFoundation1788288600000'],
        applied: ['AddParcelMovementTender1788288600000'],
      });
    });

    it('nothing is pending when the ledger holds every shipped migration', async () => {
      const shipped: any = await new VersionController(ledgerOf([])).getMigrations();
      const all = shipped.pending.map((name: string) => ({ timestamp: name.slice(-13), name }));
      const body: any = await new VersionController(ledgerOf(all)).getMigrations();
      expect(body.pending).toEqual([]);
      expect(body.applied).toBe(body.shipped);
    });
  });
});
