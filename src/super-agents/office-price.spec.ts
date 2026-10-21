import 'reflect-metadata';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  quoteOfficePrice, roundUpTo100, checkChargedAmount, breakdownReceiptLines, isDarEsSalaam,
} from './office-price';
import { OfficePriceService } from './office-price.service';
import { OfficeBodaFeeService, darBodaFee } from './office-boda-fee.service';
import { DEFAULT_DAR_BODA_MATRIX } from '../boda-rates/dar-boda-zones';
import { SuperAgentsService } from './super-agents.service';
import { SuperAgentStatus } from './entities/super-agent.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

const tenPercent = { chargeMode: 'value' as const, valuePercent: 10, valueMinimum: 5000 };

describe('office price calculation', () => {
  it('rounds every amount UP to the nearest 100 TZS', () => {
    expect(roundUpTo100(12345.6)).toBe(12400);
    expect(roundUpTo100(12300)).toBe(12300);
    expect(roundUpTo100(1)).toBe(100);
    expect(roundUpTo100(0)).toBe(0);
    expect(roundUpTo100(5000.0000001)).toBe(5000);
  });

  it('10% with a 5,000 TZS minimum', () => {
    expect(quoteOfficePrice({ rule: tenPercent, kgRate: null, declaredValue: 200000 }).transport.amount).toBe(20000);
    expect(quoteOfficePrice({ rule: tenPercent, kgRate: null, declaredValue: 30000 }).transport.amount).toBe(5000); // 3,000 → minimum
    expect(quoteOfficePrice({ rule: tenPercent, kgRate: null, declaredValue: 123456 }).transport.amount).toBe(12400); // 12,345.6 → up
    const q = quoteOfficePrice({ rule: tenPercent, kgRate: null, declaredValue: 200000 });
    expect(q).toEqual(expect.objectContaining({ total: 20000, currency: 'TZS', ruleSource: 'office', fallback: null }));
    expect(q.pickup).toEqual({ status: 'not_included', amount: 0 });
    expect(q.delivery).toEqual({ status: 'not_included', amount: 0 });
  });

  it('no rule saved: the default is 10% with a minimum of 5,000', () => {
    const q = quoteOfficePrice({ rule: null, kgRate: null, declaredValue: 80000 });
    expect(q.ruleSource).toBe('default');
    expect(q.transport).toEqual(expect.objectContaining({ mode: 'value', percent: 10, minimum: 5000, amount: 8000 }));
    expect(quoteOfficePrice({ rule: null, kgRate: null, declaredValue: 10000 }).transport.amount).toBe(5000);
  });

  it('by kg uses the office\'s own destination rate and its minimum', () => {
    const kgRule = { chargeMode: 'kg' as const, valuePercent: 10, valueMinimum: 5000 };
    expect(quoteOfficePrice({ rule: kgRule, kgRate: { ratePerKg: 3000, minimumCharge: 4000 }, declaredValue: 500000, weightKg: 3.25 }).transport)
      .toEqual(expect.objectContaining({ mode: 'kg', amount: 9800 })); // 9,750 → up
    expect(quoteOfficePrice({ rule: kgRule, kgRate: { ratePerKg: 1000, minimumCharge: 4000 }, declaredValue: 500000, weightKg: 1 }).transport.amount).toBe(4000);
  });

  it('by kg with no rate for that destination: uses the value rule, and says so', () => {
    const kgRule = { chargeMode: 'kg' as const, valuePercent: 8, valueMinimum: 6000 };
    const q = quoteOfficePrice({ rule: kgRule, kgRate: null, declaredValue: 150000, weightKg: 4 });
    expect(q.fallback).toBe('no_destination_rate');
    expect(q.transport).toEqual(expect.objectContaining({ mode: 'value', percent: 8, minimum: 6000, amount: 12000 }));
    expect(quoteOfficePrice({ rule: kgRule, kgRate: null, declaredValue: 50000 }).transport.amount).toBe(6000); // 4,000 → minimum
  });

  it('Dar es Salaam: pickup / delivery lines show the boda fee, "Bure" when it is 0; total adds up', () => {
    const q = quoteOfficePrice({ rule: tenPercent, kgRate: null, declaredValue: 100000, pickupBodaFee: 0, deliveryBodaFee: 6000 });
    expect(q.pickup).toEqual({ status: 'free', amount: 0, source: 'boda' });
    expect(q.delivery).toEqual({ status: 'charged', amount: 6000, source: 'boda' });
    expect(q.total).toBe(10000 + 6000);
    const lines = breakdownReceiptLines(q);
    expect(lines.map((l) => l.value)).toEqual(['Bure (free)', 'TZS 10,000', 'TZS 6,000', 'TZS 16,000']);
  });

  it('same-city in Dar pays only the boda fee: no percent, no minimum, even with a by-kg rule', () => {
    for (const rule of [tenPercent, { chargeMode: 'kg' as const, valuePercent: 10, valueMinimum: 5000 }, null]) {
      const q = quoteOfficePrice({ rule, kgRate: { ratePerKg: 3000, minimumCharge: 4000 }, declaredValue: 900000, weightKg: 10, deliveryBodaFee: 4000, sameCityDar: true });
      expect(q.transport).toEqual({ amount: 0, mode: 'same_city', minimum: 0 });
      expect(q.total).toBe(4000);
      expect(q.fallback).toBeNull();
    }
    const free = quoteOfficePrice({ rule: tenPercent, kgRate: null, declaredValue: 50000, deliveryBodaFee: 0, sameCityDar: true });
    expect(free.total).toBe(0);
    expect(breakdownReceiptLines(free).map((l) => l.value)).toEqual(['Haihusiki (not included)', 'Haihusiki (not included)', 'Bure (free)', 'TZS 0']);
  });

  it('the agent may change the price only with a reason', () => {
    expect(checkChargedAmount({ total: 16000 }, 16000, undefined)).toEqual({ changed: false, reason: null });
    expect(() => checkChargedAmount({ total: 16000 }, 15000, '')).toThrow('REASON_REQUIRED');
    expect(() => checkChargedAmount({ total: 16000 }, 15000, '  a ')).toThrow('REASON_REQUIRED');
    expect(checkChargedAmount({ total: 16000 }, 15000, 'Mteja wa kudumu')).toEqual({ changed: true, reason: 'Mteja wa kudumu' });
    expect(() => checkChargedAmount({ total: 16000 }, NaN, 'x')).toThrow('INVALID_AMOUNT');
    const lines = breakdownReceiptLines({ ...quoteOfficePrice({ rule: tenPercent, kgRate: null, declaredValue: 100000 }), charged: 9000, changed: true, changeReason: 'Mteja wa kudumu' });
    expect(lines.slice(-2)).toEqual([{ label: 'Imelipwa (charged)', value: 'TZS 9,000' }, { label: 'Sababu (reason)', value: 'Mteja wa kudumu' }]);
  });

  it('recognises Dar es Salaam however it is written', () => {
    for (const c of ['Dar es Salaam', 'dar es salaam', 'Dar-es-Salaam', 'DAR ES SALAAM', 'Dar es Salam']) expect(isDarEsSalaam(c)).toBe(true);
    for (const c of ['Mwanza', 'Arusha', 'Dodoma', '', null]) expect(isDarEsSalaam(c as any)).toBe(false);
  });
});

// ── The service, with in-memory repositories ─────────────────────────────────
const isOp = (v: any, t: string) => v && typeof v === 'object' && v._type === t;
const matches = (row: any, where: any): boolean => Object.entries(where || {}).every(([k, v]: [string, any]) => {
  if (isOp(v, 'ilike')) return String(row[k] ?? '').toLowerCase() === String(v._value).toLowerCase();
  if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) return matches(row[k] || {}, v);
  return row[k] === v;
});
const repo = (rows: any[]) => ({
  rows,
  findOne: jest.fn(async ({ where }: any) => rows.find((r) => matches(r, where)) ?? null),
  create: jest.fn((d: any) => ({ ...d })),
  save: jest.fn(async (d: any) => { if (!rows.includes(d)) rows.push(d); return d; }),
});

function setup(opts: { city?: string; status?: SuperAgentStatus } = {}) {
  const office = { id: 10, userId: 1, status: opts.status ?? SuperAgentStatus.ACTIVE, city: opts.city ?? 'Dar es Salaam', address: 'Kariakoo, Ilala', workspaceId: null };
  const rules = repo([]);
  const rates = repo([{ id: 1, superAgent: { id: 10 }, destinationCity: 'Mwanza', ratePerKg: 3000, minimumCharge: 4000, isActive: true }]);
  const offices = repo([office]);
  const boda = { feeBetween: jest.fn(async () => 6000) };
  const service = new OfficePriceService(rules as any, rates as any, offices as any, boda as any);
  return { service, office, rules, boda };
}
const ctx = { roleType: AccountRoleType.SUPER_AGENT, userId: 1, profileId: 10, workspaceId: null } as any;
const me = { id: 1 } as any;

describe('OfficePriceService', () => {
  it('no rule saved: quotes with 10% / 5,000 and says it is the default', async () => {
    const { service } = setup({ city: 'Mwanza' });
    const q = await service.previewMine(me, ctx, { destinationCity: 'Arusha', declaredValue: 40000, servicePath: 'intercity' });
    expect(q).toEqual(expect.objectContaining({ ruleSource: 'default', total: 5000 }));
    expect((await service.getMyRule(me, ctx))).toEqual(expect.objectContaining({ chargeMode: 'value', valuePercent: 10, valueMinimum: 5000, source: 'default' }));
  });

  it('saves the office rule; by kg finds the destination rate (any case); no rate falls back to value', async () => {
    const { service, rules } = setup({ city: 'Arusha' });
    await service.setMyRule(me, ctx, { chargeMode: 'kg', valuePercent: 10, valueMinimum: 5000 });
    expect(rules.rows[0]).toEqual(expect.objectContaining({ superAgentId: 10, chargeMode: 'kg', currency: 'TZS', country: 'TZ', updatedByUserId: 1 }));
    const byKg = await service.previewMine(me, ctx, { destinationCity: 'mwanza', declaredValue: 900000, weightKg: 2, servicePath: 'intercity' });
    expect(byKg.transport).toEqual(expect.objectContaining({ mode: 'kg', amount: 6000 }));
    const noRate = await service.previewMine(me, ctx, { destinationCity: 'Mbeya', declaredValue: 90000, weightKg: 2, servicePath: 'intercity' });
    expect(noRate).toEqual(expect.objectContaining({ fallback: 'no_destination_rate', total: 9000 }));
  });

  it('Dar office, agent delivery: the delivery line is the boda fee (office → recipient); van / intercity are not included', async () => {
    const { service, boda } = setup();
    const agent = await service.previewMine(me, ctx, { declaredValue: 100000, servicePath: 'local_agent', deliveryAddress: 'Sinza, Kinondoni' });
    expect(boda.feeBetween).toHaveBeenCalledWith('Kariakoo, Ilala', 'Sinza, Kinondoni');
    expect(agent.delivery).toEqual({ status: 'charged', amount: 6000, source: 'boda' });
    expect(agent.pickup.status).toBe('not_included'); // the sender brought it to the counter
    // Same-city in Dar: only the boda fee, no 10% and no 5,000 minimum.
    expect(agent.transport).toEqual(expect.objectContaining({ mode: 'same_city', amount: 0 }));
    expect(agent.total).toBe(6000);
    // Intercity from the same Dar office: the office rule applies (10% of 100,000).
    const intercity = await service.previewMine(me, ctx, { declaredValue: 100000, servicePath: 'intercity', destinationCity: 'Mwanza' });
    expect(intercity.transport).toEqual(expect.objectContaining({ mode: 'value', amount: 10000 }));
    expect(intercity.total).toBe(10000);
    boda.feeBetween.mockResolvedValueOnce(0);
    expect((await service.previewMine(me, ctx, { declaredValue: 100000, servicePath: 'local_agent', deliveryAddress: 'Kariakoo' })).delivery.status).toBe('free');
    boda.feeBetween.mockClear();
    expect((await service.previewMine(me, ctx, { declaredValue: 100000, servicePath: 'van', deliveryAddress: 'Sinza' })).delivery.status).toBe('not_included');
    expect(boda.feeBetween).not.toHaveBeenCalled();
  });

  it('outside Dar: no boda fee, pickup and delivery not included', async () => {
    const { service, boda } = setup({ city: 'Mwanza' });
    const q = await service.previewMine(me, ctx, { declaredValue: 100000, servicePath: 'local_agent', deliveryAddress: 'Ilemela' });
    expect(q.delivery.status).toBe('not_included');
    expect(boda.feeBetween).not.toHaveBeenCalled();
  });

  it('rule checks, and only an active office', async () => {
    const { service } = setup();
    await expect(service.setMyRule(me, ctx, { chargeMode: 'weight', valuePercent: 10, valueMinimum: 0 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.setMyRule(me, ctx, { chargeMode: 'value', valuePercent: 0, valueMinimum: 0 })).rejects.toThrow('Asilimia');
    await expect(service.setMyRule(me, ctx, { chargeMode: 'value', valuePercent: 101, valueMinimum: 0 })).rejects.toThrow('Asilimia');
    await expect(service.setMyRule(me, ctx, { chargeMode: 'value', valuePercent: 10, valueMinimum: -1 })).rejects.toThrow('Kiwango');
    await expect(service.previewMine(me, ctx, { declaredValue: 0 })).rejects.toBeInstanceOf(BadRequestException);
    const pending = setup({ status: SuperAgentStatus.PENDING });
    await expect(pending.service.getMyRule(me, ctx)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.getMyRule(me, { ...ctx, roleType: AccountRoleType.BUYER })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('walk-in: a fee different from the office price needs a reason', () => {
  const office = { id: 10, city: 'Mwanza', user: { id: 1 } };
  const make = () => {
    const svc: any = Object.create(SuperAgentsService.prototype);
    svc.superAgentRepo = { findOne: jest.fn(async () => office) };
    svc.officePrices = { quoteFor: jest.fn(async () => quoteOfficePrice({ rule: null, kgRate: null, declaredValue: 100000 })) }; // total 10,000
    svc.dataSource = { transaction: jest.fn(async () => { throw new Error('REACHED_SAVE'); }) };
    return svc;
  };
  const dto = (over: any = {}) => ({
    senderName: 'Asha', senderPhone: '0712000000', recipientName: 'Juma', recipientPhone: '0713000000',
    destinationCity: 'Arusha', deliveryAddress: 'Arusha mjini', description: 'nguo', declaredValue: 100000,
    shippingFeeCollected: 10000, paymentMethod: 'cash', requestKey: '3f1c2a4e-1b2c-4d3e-8f90-123456789abc', ...over,
  });

  it('equal to the calculated total: saves without a reason', async () => {
    const svc = make();
    await expect(svc.createOfflineIntercityOrder({ id: 1 }, dto(), ctx)).rejects.toThrow('REACHED_SAVE');
  });

  it('different without a reason: refused before anything is saved', async () => {
    const svc = make();
    await expect(svc.createOfflineIntercityOrder({ id: 1 }, dto({ shippingFeeCollected: 8000 }), ctx)).rejects.toThrow('Andika sababu');
    expect(svc.dataSource.transaction).not.toHaveBeenCalled();
  });

  it('different with a reason: saves', async () => {
    const svc = make();
    await expect(svc.createOfflineIntercityOrder({ id: 1 }, dto({ shippingFeeCollected: 8000, priceChangeReason: 'Punguzo la mteja wa kudumu' }), ctx))
      .rejects.toThrow('REACHED_SAVE');
  });
});

describe('OfficeBodaFeeService: Dar boda fee from boda_rate_card only', () => {
  it('zone-to-zone default matrix, unknown Dar address = inner zone', () => {
    expect(darBodaFee(DEFAULT_DAR_BODA_MATRIX, 'Kariakoo, Ilala', 'Sinza, Kinondoni')).toBe(6000);
    expect(darBodaFee(DEFAULT_DAR_BODA_MATRIX, 'Bunju B', 'Kariakoo')).toBe(14000);
    expect(darBodaFee(DEFAULT_DAR_BODA_MATRIX, 'Somewhere', 'Sinza')).toBe(4000);
  });

  it('active admin overrides replace the default for that pair only', async () => {
    const find = jest.fn(async () => [{ rateKey: 'matrix_1_2', fee: 7500 }]);
    const svc = new OfficeBodaFeeService({ find } as any);
    expect(await svc.feeBetween('Kariakoo', 'Sinza')).toBe(7500);
    expect(await svc.feeBetween('Sinza', 'Kariakoo')).toBe(5000);
    expect(find).toHaveBeenCalledWith({ where: { category: 'matrix', isActive: true } });
  });

  it('a failed read falls back to the default matrix', async () => {
    const svc = new OfficeBodaFeeService({ find: jest.fn(() => Promise.reject(new Error('down'))) } as any);
    expect(await svc.feeBetween('Kariakoo', 'Sinza')).toBe(6000);
  });
});
