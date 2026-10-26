import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { QuoteRequestsService, QUOTE_MESSAGES } from './quote-requests.service';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

const office = (over = {}) => ({ type: 'office' as const, id: 4, name: 'Geita Express', phone: null, city: 'Geita', goodsTypes: ['parcel', 'large'], providerTypes: [], ...over });
const transporter = (types: string[]) => ({ type: 'transport' as const, id: 9, name: 'Mtandao', phone: null, city: null, goodsTypes: [], providerTypes: types });

describe('QuoteRequestsService rules', () => {
  it('an office that never set its goods takes small parcels only', () => {
    expect(QuoteRequestsService.readGoodsTypes(null)).toEqual(['parcel']);
    expect(QuoteRequestsService.readGoodsTypes(['container', 'junk', 'large'])).toEqual(['large', 'container']);
  });

  it('large goods go to offices in the sender town that ticked that type', () => {
    const r = { kind: 'goods', goodsType: 'large', fromCity: 'geita ' };
    expect(QuoteRequestsService.canAnswer(office(), r)).toBe(true);
    expect(QuoteRequestsService.canAnswer(office({ city: 'Mwanza' }), r)).toBe(false);
    expect(QuoteRequestsService.canAnswer(office(), { ...r, goodsType: 'container' })).toBe(false);
    expect(QuoteRequestsService.canAnswer(transporter(['truck']), r)).toBe(false);
  });

  it('a whole vehicle goes to transporters with that kind of vehicle', () => {
    const fuso = { kind: 'vehicle', vehicleType: 'fuso' };
    expect(QuoteRequestsService.canAnswer(transporter(['truck']), fuso)).toBe(true);
    expect(QuoteRequestsService.canAnswer(transporter(['bus']), fuso)).toBe(false);
    expect(QuoteRequestsService.canAnswer(transporter(['van']), { kind: 'vehicle', vehicleType: 'kirikuu' })).toBe(true);
    expect(QuoteRequestsService.canAnswer(office(), fuso)).toBe(false);
  });
});

describe('QuoteRequestsService requests', () => {
  const ready = (rows: Record<string, any[]> = {}) => {
    const calls: Array<[string, any[]]> = [];
    const db: any = {
      query: jest.fn(async (sql: string, params: any[] = []) => {
        calls.push([sql, params]);
        if (sql.includes('to_regclass')) return [{ ok: true }];
        if (sql.includes('INSERT INTO public.quote_request')) return [{ id: 77 }];
        for (const [k, v] of Object.entries(rows)) if (sql.includes(k)) return v;
        return [];
      }),
    };
    return { db, calls, service: new QuoteRequestsService(db, { notify: jest.fn(async () => undefined) } as any) };
  };
  const ctx = { userId: 5, roleType: AccountRoleType.BUYER, profileId: 0 } as any;
  const good = { kind: 'vehicle', vehicleType: 'fuso', fromCity: 'Dar es Salaam', toCity: 'Mwanza', description: 'Mabati 200', phone: '0712345678' };

  it('a customer asks for a whole vehicle; phone saved as 255…', async () => {
    const { service, calls } = ready();
    await expect(service.create(5, ctx, good)).resolves.toEqual({ id: 77, status: 'open' });
    const insert = calls.find(([sql]) => sql.includes('INSERT INTO public.quote_request'))!;
    expect(insert[1][0]).toBe('vehicle');
    expect(insert[1][2]).toBeNull();               // not asked as an office
    expect(insert[1][8]).toBe('fuso');
    expect(insert[1][12]).toBe('255712345678');
  });

  it('refuses a request with no vehicle type, no description or a bad phone', async () => {
    const { service } = ready();
    await expect(service.create(5, ctx, { ...good, vehicleType: 'lorry' })).rejects.toThrow(QUOTE_MESSAGES.badVehicle);
    await expect(service.create(5, ctx, { ...good, description: '' })).rejects.toThrow(QUOTE_MESSAGES.badDescription);
    await expect(service.create(5, ctx, { ...good, phone: '12' })).rejects.toThrow(BadRequestException);
    await expect(service.create(5, ctx, { ...good, kind: 'goods', goodsType: 'parcel' })).rejects.toThrow(QUOTE_MESSAGES.badGoods);
  });

  it('only an office or a transporter can answer', async () => {
    const { service } = ready();
    await expect(service.offer(5, ctx, 1, { price: 100000 })).rejects.toThrow(ForbiddenException);
  });

  it('before the migration ran: a clear message, nothing written', async () => {
    const db: any = { query: jest.fn(async () => [{ ok: false }]) };
    const service = new QuoteRequestsService(db);
    await expect(service.create(5, ctx, good)).rejects.toThrow(QUOTE_MESSAGES.notReady);
  });
});
