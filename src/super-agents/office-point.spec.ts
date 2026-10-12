import { BadRequestException } from '@nestjs/common';
import { SuperAgentsService, OFFICE_POINT_MESSAGES } from './super-agents.service';
import { AGENT_BASE_MESSAGES } from '../shipments/pickup-pin';

// "📍 Weka mahali pa ofisi": the office's map point from the phone's GPS, same
// rules as the agent base point; a later place-picker save keeps it.
function service(row: any = { latitude: null, longitude: null, method: null }) {
  const s: any = Object.create(SuperAgentsService.prototype);
  s.getMyProfile = jest.fn(async () => ({ id: 7 }));
  s.dataSource = { query: jest.fn(async (sql: string) => (/^\s*SELECT/.test(sql) ? [row] : [])) };
  return s;
}

describe('office map point (Weka mahali pa ofisi)', () => {
  it('saves the GPS point for the logged-in office and marks it as GPS', async () => {
    const s = service();
    const r = await s.setMyOfficePoint({ id: 50 }, { latitude: -6.8185, longitude: 39.277, accuracyM: 15 });
    const [sql, params] = s.dataSource.query.mock.calls[0];
    expect(sql).toMatch(/UPDATE public\.super_agent SET latitude = \$2, longitude = \$3, "locationResolutionMethod" = \$4 WHERE id = \$1/);
    expect(params).toEqual([7, -6.8185, 39.277, 'device_gps']);
    expect(r).toEqual({ officePointSet: true, officePointByGps: true, message: OFFICE_POINT_MESSAGES.saved });
  });

  it('same rules as the agent base point: weak GPS and outside Tanzania are refused, nothing saved', async () => {
    const s = service();
    await expect(s.setMyOfficePoint({ id: 50 }, { latitude: -6.8, longitude: 39.2, accuracyM: 900 })).rejects.toThrow(AGENT_BASE_MESSAGES.weak);
    await expect(s.setMyOfficePoint({ id: 50 }, { latitude: 51.5, longitude: -0.12 })).rejects.toBeInstanceOf(BadRequestException);
    expect(s.dataSource.query).not.toHaveBeenCalled();
  });

  it('status: GPS point vs approximate place point vs none', async () => {
    expect(await service({ latitude: '-6.8185', longitude: '39.277', method: 'device_gps' }).getOfficePointStatus(7))
      .toEqual({ officePointSet: true, officePointByGps: true });
    expect(await service({ latitude: '-6.81', longitude: '39.27', method: 'seed_exact' }).getOfficePointStatus(7))
      .toEqual({ officePointSet: true, officePointByGps: false });
    expect(await service().getOfficePointStatus(7)).toEqual({ officePointSet: false, officePointByGps: false });
  });

  it('a later place-picker save keeps the GPS point', async () => {
    const s = service({ latitude: '-6.8185', longitude: '39.277', method: 'device_gps' });
    s.locationIntelligence = { resolve: jest.fn(async () => ({ displayLabel: 'Kariakoo, Ilala', latitude: -6.82, longitude: 39.27,
      providerKey: 'tz_seed', providerPlaceId: 'k', resolutionMethod: 'seed_exact', regionName: 'Dar es Salaam' })) };
    const saved: any[] = [];
    s.getMyProfile = jest.fn(async () => ({ id: 7 }));
    s.superAgentRepo = { save: jest.fn(async (a: any) => { saved.push({ ...a }); return a; }) };
    await s.updateMyHubLocation({ id: 50 }, { providerKey: 'tz_seed', providerPlaceId: 'k' });
    expect(saved[0]).toMatchObject({ locationLabel: 'Kariakoo, Ilala', regionName: 'Dar es Salaam' });
    expect(saved[0].latitude).toBeUndefined();
    expect(saved[0].longitude).toBeUndefined();
    expect(saved[0].locationResolutionMethod).toBeUndefined();
  });

  it('without a GPS point, the place pick sets the approximate point as before', async () => {
    const s = service();
    s.locationIntelligence = { resolve: jest.fn(async () => ({ displayLabel: 'Kariakoo', latitude: -6.82, longitude: 39.27,
      providerKey: 'tz_seed', providerPlaceId: 'k', resolutionMethod: 'seed_exact', regionName: 'Dar es Salaam' })) };
    const saved: any[] = [];
    s.superAgentRepo = { save: jest.fn(async (a: any) => { saved.push({ ...a }); return a; }) };
    await s.updateMyHubLocation({ id: 50 }, { providerKey: 'tz_seed', providerPlaceId: 'k' });
    expect(saved[0]).toMatchObject({ latitude: -6.82, longitude: 39.27, locationResolutionMethod: 'seed_exact' });
  });
});
