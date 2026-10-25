import { AGENT_BASE_MESSAGES, distanceM, readAgentBasePoint, roughDistanceLabel } from './pickup-pin';
import { PickupTasksService } from './pickup-tasks.service';
import { LogisticsDispatchService } from './logistics-dispatch.service';
import { AgentsService } from '../agents/agents.service';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

const POSTA = { lat: -6.8160, lng: 39.2895 };
const KARIAKOO = { lat: -6.8183, lng: 39.2766 };
const MBEZI = { lat: -6.7240, lng: 39.2210 };

describe('agent base point (section 18 b)', () => {
  it('accepts a GPS point inside Tanzania with accuracy up to 500 m', () => {
    expect(readAgentBasePoint({ latitude: POSTA.lat, longitude: POSTA.lng, accuracyM: 30 })).toEqual({ latitude: -6.816, longitude: 39.2895 });
    expect(() => readAgentBasePoint({ latitude: POSTA.lat, longitude: POSTA.lng, accuracyM: 900 })).toThrow(AGENT_BASE_MESSAGES.weak);
    expect(() => readAgentBasePoint({ latitude: 51.5, longitude: -0.12 })).toThrow('hapakuonekana Tanzania');
    expect(() => readAgentBasePoint({})).toThrow('si sahihi');
  });

  const agentsService = (agent: any) => {
    const s: any = Object.create(AgentsService.prototype);
    s.agentRepo = { findOne: jest.fn(async () => agent), update: jest.fn(async () => undefined) };
    return s;
  };

  it('saves the base point for the logged-in agent', async () => {
    const s = agentsService({ id: 7, status: 'approved' });
    const r = await s.setBasePoint({ id: 50 }, { latitude: POSTA.lat, longitude: POSTA.lng, accuracyM: 25 });
    expect(s.agentRepo.update).toHaveBeenCalledWith(7, expect.objectContaining({ baseLatitude: -6.816, baseLongitude: 39.2895 }));
    expect(r).toMatchObject({ hasBasePoint: true, message: AGENT_BASE_MESSAGES.saved });
  });

  it('cannot go online without a base point (Swahili message); can with one', async () => {
    const without = agentsService({ id: 7, status: 'approved', isOnline: false, baseLatitude: null, baseLongitude: null });
    await expect(without.toggleOnline({ id: 50 })).rejects.toThrow(AGENT_BASE_MESSAGES.required);
    expect(without.agentRepo.update).not.toHaveBeenCalled();
    const withBase = agentsService({ id: 7, status: 'approved', isOnline: false, baseLatitude: POSTA.lat, baseLongitude: POSTA.lng });
    await expect(withBase.toggleOnline({ id: 50 })).resolves.toMatchObject({ isOnline: true });
    // Going OFFline never needs a base point.
    const goingOff = agentsService({ id: 7, status: 'approved', isOnline: true, baseLatitude: null, baseLongitude: null });
    await expect(goingOff.toggleOnline({ id: 50 })).resolves.toMatchObject({ isOnline: false });
  });
});

describe('nearest first', () => {
  it('distance and the rounded label shown before accepting', () => {
    const d = distanceM(POSTA.lat, POSTA.lng, KARIAKOO.lat, KARIAKOO.lng);
    expect(d).toBeGreaterThan(1300); expect(d).toBeLessThan(1600);
    expect(roughDistanceLabel(d)).toBe('~1.5 km');
    expect(roughDistanceLabel(40)).toBe('~100 m');
    expect(roughDistanceLabel(null)).toBeNull();
  });

  const role: any = { userId: 50, profileId: 5, roleType: AccountRoleType.AGENT };
  const job = (id: number, p: { lat: number; lng: number } | null) => ({
    id, status: 'requested', servicePath: 'direct_delivery', createdAt: new Date(), originSnapshot: {}, originCity: 'Dar es Salaam',
    destinationCity: 'Dar es Salaam', itemDescription: `Job ${id}`, weightKg: 1, pointLat: p?.lat ?? null, pointLng: p?.lng ?? null });
  const tasks = (agent: any, rows: any[]) => {
    const s: any = Object.create(PickupTasksService.prototype);
    s.db = { query: jest.fn(async () => rows) };
    s.assertAgentRole = jest.fn();
    s.approvedAgent = jest.fn(async () => agent);
    return s;
  };

  it('the open-jobs list is sorted nearest first from the agent base; jobs without a point last', async () => {
    const s = tasks({ id: 5, city: 'Dar es Salaam', baseLatitude: POSTA.lat, baseLongitude: POSTA.lng },
      [job(1, MBEZI), job(2, null), job(3, KARIAKOO)]);
    const list = await s.listAvailable(50, role);
    expect(list.map((j: any) => j.id)).toEqual([3, 1, 2]);
    expect(list[0].distance).toBe('~1.5 km');
    expect(list[2].distance).toBeNull();
  });

  it('accepting needs a base point', async () => {
    const s: any = Object.create(PickupTasksService.prototype);
    const em = { query: jest.fn(async (sql: string) => {
      if (/FROM public\.shipment/.test(sql)) return [{ id: 1, status: 'confirmed', originCity: 'Dar es Salaam' }];
      if (/FROM public\.parcel WHERE/.test(sql)) return [{ id: 2, status: 'pending', shipmentId: 1 }];
      if (/FROM public\.parcel_pickup_task WHERE/.test(sql)) return [{ id: 9, parcelId: 2, status: 'requested', agentProfileId: null }];
      if (/FROM public\.agent/.test(sql)) return [{ id: 5, city: 'Dar es Salaam', status: 'approved', userId: 50, baseLatitude: null, baseLongitude: null }];
      return [];
    }) };
    s.db = { query: jest.fn(async () => [{ parcelId: 2, shipmentId: 1 }]), transaction: async (fn: any) => fn(em) };
    await expect(s.claim(9, 50, role)).rejects.toThrow(AGENT_BASE_MESSAGES.required);
    expect(em.query.mock.calls.some(([sql]: any) => /UPDATE public\.parcel_pickup_task/.test(sql))).toBe(false);
  });

  it('pickup alerts are ordered by distance from the pin/place to the agent base, then rating', async () => {
    const s: any = Object.create(LogisticsDispatchService.prototype);
    s.db = { query: jest.fn(async () => [{ agentId: 3, userId: 30, originCity: 'Dar es Salaam', destinationCity: 'Dar es Salaam', distanceM: 812.4 }]) };
    s.communication = { dispatch: jest.fn(async () => undefined) };
    const r = await s.dispatchPickup(9);
    const sql = s.db.query.mock.calls[0][0];
    expect(sql).toMatch(/COALESCE\(s\."pickupPinLatitude", s\."originLatitude"\)/);
    // Equally near: an agent who is online first, then rating (2026-10-25: online is not required).
    expect(sql).toMatch(/ORDER BY \(a\."baseLatitude" IS NULL\) ASC, "distanceM" ASC NULLS LAST, \(a\."isOnline" IS TRUE\) DESC, COALESCE\(a\.rating,0\) DESC/);
    expect(sql).not.toMatch(/a\."isOnline"\s*=\s*true/);
    expect(r).toMatchObject({ dispatched: 1, candidateAgentIds: [3], candidateDistancesM: [812] });
  });
});
