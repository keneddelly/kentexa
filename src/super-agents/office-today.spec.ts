import 'reflect-metadata';
import { SuperAgentsService } from './super-agents.service';

// Mwanzo's "Leo: X zimepokelewa · Y zimetumwa" (office dashboard mockup): counted from
// the custody record, Tanzania day, into and out of this office only.
describe('office today counts', () => {
  const run = (impl: (sql: string, p: any[]) => any) => {
    const fake: any = { dataSource: { query: jest.fn(async (sql: string, p: any[]) => impl(sql, p)) } };
    return { fake, call: () => (SuperAgentsService.prototype as any).officeToday.call(fake, 5) };
  };

  it('counts parcels into and out of this office since the start of the Tanzania day', async () => {
    const { fake, call } = run(() => [{ received: '14', sent: '11' }]);
    expect(await call()).toEqual({ received: 14, sent: 11 });
    const [sql, params] = fake.dataSource.query.mock.calls[0];
    expect(params).toEqual([5]);
    expect(sql).toMatch(/Africa\/Dar_es_Salaam/);
    expect(sql).toMatch(/"toCustodianType" = 'super_agent' AND e\."toCustodianId" = \$1/);
    expect(sql).toMatch(/"fromCustodianType" = 'super_agent' AND e\."fromCustodianId" = \$1/);
    expect(sql).toMatch(/COUNT\(DISTINCT e\."parcelId"\)/);
  });

  it('when it cannot be read, nothing is shown (never a guessed number)', async () => {
    const { call } = run(() => { throw new Error('down'); });
    expect(await call()).toBeNull();
  });
});
