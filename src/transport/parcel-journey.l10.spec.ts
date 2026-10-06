import { ParcelJourneyService } from './parcel-journey.service';

describe('L10 admin logistics exception projection', () => {
  it('projects exceptions from canonical assignment and parcel states', async () => {
    const dataSource: any = { query: jest.fn().mockResolvedValue([]) };
    const svc = new ParcelJourneyService(dataSource, {} as any);
    await svc.adminListOperationalExceptions();
    const sql = dataSource.query.mock.calls[0][0] as string;
    expect(sql).toContain("'awaiting_hub_receipt'");
    expect(sql).toContain("a.status='unloaded'");
    expect(sql).toContain("'awaiting_last_mile'");
    expect(sql).toContain("p.status IN ('arrived_at_hub','awaiting_buyer')");
  });
});
