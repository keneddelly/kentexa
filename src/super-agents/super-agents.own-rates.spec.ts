import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { SuperAgentsService } from './super-agents.service';
import { SuperAgentsController } from './super-agents.controller';
import { JwtAuthGuard } from '../auth/auth.guard';

// GET /super-agents/rates/:city used to list EVERY office's rates in a city (public).
// It now returns only the calling office's own rates (owner 2026-10-22).
describe('GET /super-agents/rates/:city: the calling office\'s own rates only', () => {
  const mine = { id: 10, city: 'Dar es Salaam' };
  const other = { id: 11, city: 'Dar es Salaam' };
  const rows = [
    { id: 1, superAgent: mine, originCity: 'Dar es Salaam', destinationCity: 'Mwanza', ratePerKg: 3000, minimumCharge: 4000, isActive: true },
    { id: 2, superAgent: other, originCity: 'Dar es Salaam', destinationCity: 'Mwanza', ratePerKg: 2850, minimumCharge: 3900, isActive: true },
    { id: 3, superAgent: other, originCity: 'Dar es Salaam', destinationCity: 'Arusha', ratePerKg: 2100, minimumCharge: 3700, isActive: true },
    { id: 4, superAgent: mine, originCity: 'Dar es Salaam', destinationCity: 'Dodoma', ratePerKg: 1500, minimumCharge: 3000, isActive: false },
  ];
  const rateRepo = {
    find: jest.fn(async ({ where }: any) => rows
      .filter((r) => r.superAgent.id === where.superAgent?.id && r.originCity === where.originCity && r.isActive === where.isActive)
      .map(({ superAgent, ...r }) => r)), // like TypeORM: the relation is not loaded
  };
  const as = (office: any) => SuperAgentsService.prototype.getMyShippingRates.call({ getMyProfile: async () => office, rateRepo }, { id: office.id });

  it('another office\'s rate in the same city never appears', async () => {
    const res = await as(mine);
    expect(res.map((r: any) => r.id)).toEqual([1]);
    const text = JSON.stringify(res);
    for (const price of ['2850', '3900', '2100', '3700']) expect(text).not.toContain(price);
    expect(rateRepo.find).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { superAgent: { id: 10 }, originCity: 'Dar es Salaam', isActive: true },
    }));
    // And the other office sees only its own.
    expect((await as(other)).map((r: any) => r.id)).toEqual([2, 3]);
  });

  it('needs a login: the endpoint is no longer public', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, SuperAgentsController.prototype.getShippingRates) || [];
    expect(guards).toContain(JwtAuthGuard);
  });
});
