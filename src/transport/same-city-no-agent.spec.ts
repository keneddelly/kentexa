import { BadRequestException } from '@nestjs/common';
import { LogisticsServiceOfferService } from './logistics-service-offer.service';
import { findNearestOffice, NO_AGENT_NOW } from './nearest-office';

// KNOWN_FAULTS #24: same-city door pickup with no agent available. Checked
// EARLY (door-check) and again at "Thibitisha Kifurushi" (commit), with the
// same Swahili answer and the nearest Super Agent office.
const withBase = { id: 3, hasBasePoint: true, collectionFeeUrban: 2000, deliveryFee: 1000, deliveryTime: 'Masaa 1-2' };
const noBase = { id: 4, hasBasePoint: false, collectionFeeUrban: 1500, deliveryFee: 1000 };
const office = { id: 11, name: 'Kariakoo Hub', phone: '0755000111', address: 'Mtaa wa Congo', latitude: -6.8185, longitude: 39.2770, distanceM: 640 };

function build(agents: any[], officeRows: any[] = [office]) {
  const db = { query: jest.fn(async () => officeRows) };
  const locations = { resolve: jest.fn(async () => ({ latitude: -6.816, longitude: 39.2895 })) };
  const journeys = { selectDirectDelivery: jest.fn(async () => ({ id: 1 })) };
  const svc = new LogisticsServiceOfferService(
    { getAvailableAgents: jest.fn(async () => agents) } as any, {} as any, journeys as any, db as any, locations as any);
  return { svc, db, locations, journeys };
}
const sameCity = { fromCity: 'Dar es Salaam', toCity: 'Dar es Salaam', weightKg: 3, pickup: 'door' as const, delivery: 'door' as const,
  origin: { place: { providerKey: 'tz_seed', providerPlaceId: 'kariakoo' } } };

describe('same-city door pickup needs an online agent WITH a base point', () => {
  it('an online agent without a base point is not enough (no offer)', async () => {
    expect(await build([noBase]).svc.discover(sameCity)).toEqual([]);
  });

  it('with a base point: offered, priced from that agent', async () => {
    const offers = await build([noBase, withBase]).svc.discover(sameCity);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ serviceType: 'direct_delivery', price: 2000,
      firstAction: { type: 'offer_pickup_task', candidateAgentIds: [3] } });
  });
});

describe('early check (door-check)', () => {
  it('agent available: no office card', async () => {
    const t = build([withBase]);
    expect(await t.svc.doorCheck(sameCity)).toEqual({ available: true, nearestOffice: null });
    expect(t.db.query).not.toHaveBeenCalled();
  });

  it('no agent: Swahili answer + nearest office measured from the chosen place', async () => {
    const t = build([noBase]);
    const r = await t.svc.doorCheck(sameCity);
    expect(r).toEqual({ available: false, code: 'NO_AGENT_NOW', message: NO_AGENT_NOW.message, nearestOffice: {
      id: 11, name: 'Kariakoo Hub', phone: '0755000111', address: 'Mtaa wa Congo',
      mapsUrl: 'https://www.google.com/maps/dir/?api=1&destination=-6.8185,39.277', distance: '~600 m' } });
    expect(t.locations.resolve).toHaveBeenCalledWith({ providerKey: 'tz_seed', providerPlaceId: 'kariakoo' });
    expect((t.db.query as jest.Mock).mock.calls[0][1]).toEqual([-6.816, 39.2895, 'Dar es Salaam']);
  });

  it('no agent and no office in that city: nearestOffice is null (the screen says so)', async () => {
    const r = await build([], []).svc.doorCheck(sameCity);
    expect(r).toMatchObject({ available: false, nearestOffice: null });
  });

  it('refuses a missing city or weight', async () => {
    await expect(build([]).svc.doorCheck({ fromCity: '', weightKg: 3 })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('"Thibitisha Kifurushi" with no agent', () => {
  it('the English "no longer fulfillable" is replaced by the same Swahili answer with the office', async () => {
    const t = build([noBase]);
    const err: any = await t.svc.commit(50, { ...sameCity, serviceType: 'direct_delivery' }).catch((e) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect(err.getResponse()).toMatchObject({ statusCode: 400, code: 'NO_AGENT_NOW', message: NO_AGENT_NOW.message,
      nearestOffice: { name: 'Kariakoo Hub', phone: '0755000111' } });
    expect(JSON.stringify(err.getResponse())).not.toMatch(/fulfillable/);
    expect(t.journeys.selectDirectDelivery).not.toHaveBeenCalled();
  });

  it('with an agent: the booking goes on as before', async () => {
    const t = build([withBase]);
    await t.svc.commit(50, { ...sameCity, serviceType: 'direct_delivery' });
    expect(t.journeys.selectDirectDelivery).toHaveBeenCalled();
  });
});

describe('findNearestOffice', () => {
  it('only active offices WITH a map point can be shown (never a guess, never an office without a point)', async () => {
    const query = jest.fn(async () => []);
    expect(await findNearestOffice({ query }, 'Dar es Salaam', null)).toBeNull();
    expect((query.mock.calls[0] as any[])[0]).toMatch(/sa\.status = 'active' AND sa\.latitude IS NOT NULL AND sa\.longitude IS NOT NULL/);
  });

  it('no pickup point: still an office with a map point, without a distance', async () => {
    const r = await findNearestOffice({ query: async () => [{ ...office, distanceM: null }] }, 'Dar es Salaam', null);
    expect(r).toMatchObject({ name: 'Kariakoo Hub', mapsUrl: expect.stringContaining('google.com/maps/dir'), distance: null });
  });
});
