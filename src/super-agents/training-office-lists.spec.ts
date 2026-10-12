import { BadRequestException } from '@nestjs/common';
import { SuperAgentsService } from './super-agents.service';
import { discoverHubCandidates } from '../shipments/shipment-hub-selection';
import { findNearestOffice } from '../transport/nearest-office';
import { TransportRunService } from '../transport/transport-run.service';

// Training office ("ofisi ya mafunzo"): never in a customer/seller/transporter
// list; office-to-office choices stay within the same kind.
describe('training offices in office lists', () => {
  const svc = () => {
    const s: any = Object.create(SuperAgentsService.prototype);
    s.superAgentRepo = { find: jest.fn(async () => []), findOne: jest.fn(async () => null) };
    return s;
  };

  it('an office picking another office in a city sees only offices of its own kind', async () => {
    const s = svc();
    await s.findAllActiveByCity('Dar es Salaam', 1);           // a real office, a seller or an admin
    await s.findAllActiveByCity('Dar es Salaam', 7, true);     // a training office
    expect(s.superAgentRepo.find.mock.calls[0][0].where).toMatchObject({ isTrainingOffice: false });
    expect(s.superAgentRepo.find.mock.calls[1][0].where).toMatchObject({ isTrainingOffice: true });
  });

  it('automatic best office for a city never picks a training office', async () => {
    const s = svc();
    await s.findAgentForCity('Mwanza');
    expect(s.superAgentRepo.find.mock.calls[0][0].where).toMatchObject({ isTrainingOffice: false });
  });

  it('last-mile office for a consolidated shipment: same kind as the acting office', async () => {
    const s = svc();
    s.superAgentRepo.findOne = jest.fn(async () => ({ id: 9, city: 'Mwanza' }));
    await s.resolveLastMile({ destinationSuperAgentId: 9 }, true);
    await s.resolveLastMile({ destinationSuperAgentId: 9 }, false);
    expect(s.superAgentRepo.findOne.mock.calls[0][0].where).toMatchObject({ id: 9, isTrainingOffice: true });
    expect(s.superAgentRepo.findOne.mock.calls[1][0].where).toMatchObject({ id: 9, isTrainingOffice: false });
  });

  it('the send form office candidates exclude training offices', async () => {
    const calls: string[] = [];
    const qb: any = {
      select: () => qb, where: (c: string) => { calls.push(c); return qb; }, andWhere: (c: string) => { calls.push(c); return qb; },
      orderBy: () => qb, setLock: () => qb, getMany: async () => [],
    };
    await discoverHubCandidates({ createQueryBuilder: () => qb } as any, ['dar es salaam'], false);
    expect(calls).toContain('hub.isTrainingOffice = false');
  });

  it('the no-agent office card never shows a training office', async () => {
    const query = jest.fn(async () => []);
    await findNearestOffice({ query }, 'Dar es Salaam', null);
    expect((query.mock.calls[0] as any[])[0]).toMatch(/sa\."isTrainingOffice" = false/);
  });

  it('a transporter cannot list or bind a training office as a route stop', async () => {
    const t: any = Object.create(TransportRunService.prototype);
    t.transportService = { getMyProfile: jest.fn(async () => ({ id: 1 })) };
    t.dataSource = { query: jest.fn(async (sql: string) => (/"isTrainingOffice" FROM/.test(sql) ? [{ id: 7, isTrainingOffice: true }] : [])) };
    await t.listActiveHubsForProvider(5, '');
    expect(t.dataSource.query.mock.calls[0][0]).toMatch(/status='active' AND "isTrainingOffice" = false/);
    await expect(t.assertSuperAgentExists(7)).rejects.toThrow(BadRequestException);
    await expect(t.assertSuperAgentExists(7)).rejects.toThrow('mafunzo');
  });
});
