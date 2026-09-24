import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  HUB_DECISION_CONFLICT,
  HUB_SELECTION_REQUIRED,
  HubCandidate,
  NO_HUB_INPUT,
  ShipmentHubSource,
  SHIPMENT_HUB_SOURCES,
  anyHubRequested,
  assertNoDecisionConflict,
  conflictsWithStoredDecision,
  decideHubForSide,
  hubMatchKeys,
  parseHubSelectionInput,
  parseHubSide,
  storedSideHubKeys,
} from './shipment-hub-selection';
import { SHIPMENT_HUB_DECISION_SOURCES_FROZEN } from '../database/migrations/1788274800000-AddShipmentHubDecision';

const cand = (id: number, city = 'Dar es Salaam'): HubCandidate => ({ hubId: id, name: `Hub ${id}`, city, address: `Addr ${id}` });
const KEYS = ['dar es salaam'];

describe('ShipmentHubSource — one canonical vocabulary', () => {
  it('is exactly the four write-once sources, and the migration keeps a frozen identical copy', () => {
    expect([...SHIPMENT_HUB_SOURCES].sort()).toEqual(['auto_single_candidate', 'none_available', 'not_required', 'sender_selected']);
    expect([...SHIPMENT_HUB_DECISION_SOURCES_FROZEN].sort()).toEqual([...SHIPMENT_HUB_SOURCES].sort());
  });
});

describe('parseHubSelectionInput — explicit, strictly typed', () => {
  it('nothing supplied => not requested (this is what keeps existing behaviour hub-free)', () => {
    expect(parseHubSelectionInput('origin', undefined, undefined)).toEqual({ hubId: undefined, requested: false });
    expect(parseHubSelectionInput('origin', null, null)).toEqual({ hubId: undefined, requested: false });
    expect(parseHubSelectionInput('destination', undefined, false)).toEqual({ hubId: undefined, requested: false });
  });
  it('an id or an explicit true flag requests hub mediation', () => {
    expect(parseHubSelectionInput('origin', 7, undefined)).toEqual({ hubId: 7, requested: true });
    expect(parseHubSelectionInput('destination', undefined, true)).toEqual({ hubId: undefined, requested: true });
  });
  it.each([['7'], [0], [-1], [1.5], [NaN], [Infinity], [{}], [[7]], [true], [2 ** 60]])('rejects hub id %p with a 400', (bad) => {
    expect(() => parseHubSelectionInput('origin', bad, undefined)).toThrow(BadRequestException);
  });
  it.each([['true'], [1], [{}], ['']])('rejects request flag %p with a 400 (never coerced)', (bad) => {
    expect(() => parseHubSelectionInput('destination', undefined, bad)).toThrow(BadRequestException);
  });
  it('side must be origin|destination', () => {
    expect(parseHubSide('origin')).toBe('origin');
    for (const bad of [undefined, '', 'Origin', 'both', 1, ['origin']]) expect(() => parseHubSide(bad)).toThrow(BadRequestException);
  });
});

describe('hub match keys — server-derived region + the shared capital alias only', () => {
  it('region and (when different) its capital, trimmed, lower-cased, de-duplicated', () => {
    expect(hubMatchKeys('Dar es Salaam')).toEqual(['dar es salaam']);
    expect(hubMatchKeys('  Kilimanjaro ')).toEqual(['kilimanjaro', 'moshi']);
    expect(hubMatchKeys('Mara')).toEqual(['mara', 'musoma']);
  });
  it('unknown/blank regions never invent an alias', () => {
    expect(hubMatchKeys('Atlantis')).toEqual(['atlantis']);
    for (const bad of [undefined, null, '', '   ']) expect(hubMatchKeys(bad as any)).toEqual([]);
  });
  it('free text, legacy rows and rows without a region have NO hub authority', () => {
    expect(storedSideHubKeys({ regionName: null, providerKey: 'user', resolutionMethod: 'user_typed' })).toBeNull();
    expect(storedSideHubKeys({ regionName: 'Dar es Salaam', providerKey: 'user', resolutionMethod: 'user_typed' })).toBeNull();
    expect(storedSideHubKeys({ regionName: 'Dar es Salaam', providerKey: null, resolutionMethod: null })).toBeNull();
    expect(storedSideHubKeys({ regionName: 'Dar es Salaam', providerKey: 'tz_seed', resolutionMethod: 'user_typed' })).toBeNull();
    expect(storedSideHubKeys({ regionName: '  ', providerKey: 'tz_seed', resolutionMethod: 'admin_seed' })).toBeNull();
    expect(storedSideHubKeys({})).toBeNull();
  });
  it('a server-resolved side gets its keys', () => {
    expect(storedSideHubKeys({ regionName: 'Kilimanjaro', providerKey: 'tz_seed', resolutionMethod: 'admin_seed' })).toEqual(['kilimanjaro', 'moshi']);
  });
});

describe('decideHubForSide — the 0 / 1 / many table', () => {
  const none = { requested: false } as const;
  it('not requested => not_required, no hub, whatever hubs exist (agent/door/station are irrelevant)', () => {
    expect(decideHubForSide('origin', none, KEYS, [cand(1)])).toEqual({ source: ShipmentHubSource.NOT_REQUIRED, hubId: null });
    expect(decideHubForSide('destination', none, null, [])).toEqual({ source: ShipmentHubSource.NOT_REQUIRED, hubId: null });
  });
  it('requested, 0 eligible => none_available (only when hub mediation was actually requested)', () => {
    expect(decideHubForSide('origin', { requested: true }, KEYS, [])).toEqual({ source: ShipmentHubSource.NONE_AVAILABLE, hubId: null });
    // free text has zero eligible hubs by definition
    expect(decideHubForSide('origin', { requested: true }, null, [])).toEqual({ source: ShipmentHubSource.NONE_AVAILABLE, hubId: null });
  });
  it('requested, exactly 1 eligible => auto_single_candidate', () => {
    expect(decideHubForSide('origin', { requested: true }, KEYS, [cand(4)])).toEqual({ source: ShipmentHubSource.AUTO_SINGLE_CANDIDATE, hubId: 4 });
  });
  it('requested, many eligible and no id => 409 HUB_SELECTION_REQUIRED carrying the candidates; never a pick', () => {
    try {
      decideHubForSide('destination', { requested: true }, KEYS, [cand(1), cand(2), cand(3)]);
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      expect(e.getResponse()).toMatchObject({ code: HUB_SELECTION_REQUIRED, side: 'destination' });
      expect(e.getResponse().candidates.map((c: HubCandidate) => c.hubId)).toEqual([1, 2, 3]);
    }
  });
  it('explicit id in the candidate set => sender_selected (also when it is the only candidate, and among many)', () => {
    expect(decideHubForSide('origin', { hubId: 2, requested: true }, KEYS, [cand(1), cand(2)])).toEqual({ source: ShipmentHubSource.SENDER_SELECTED, hubId: 2 });
    expect(decideHubForSide('origin', { hubId: 9, requested: true }, KEYS, [cand(9)])).toEqual({ source: ShipmentHubSource.SENDER_SELECTED, hubId: 9 });
  });
  it('explicit id NOT in the candidate set (other city, suspended, nonexistent) => 400', () => {
    expect(() => decideHubForSide('origin', { hubId: 5, requested: true }, KEYS, [cand(1), cand(2)])).toThrow(BadRequestException);
    expect(() => decideHubForSide('origin', { hubId: 5, requested: true }, KEYS, [])).toThrow(BadRequestException);
  });
  it('explicit id on an unresolved (free-text) side => 400, whatever else is true', () => {
    expect(() => decideHubForSide('origin', { hubId: 1, requested: true }, null, [cand(1)])).toThrow(BadRequestException);
  });
});

describe('stored decision always wins on retry', () => {
  it('omitting hub input is always compatible', () => {
    for (const src of [ShipmentHubSource.SENDER_SELECTED, ShipmentHubSource.NOT_REQUIRED, ShipmentHubSource.NONE_AVAILABLE, null, undefined]) {
      expect(conflictsWithStoredDecision({ requested: false }, src as any, 3)).toBe(false);
    }
  });
  it('same id is compatible, a different (or unnamed) id conflicts', () => {
    expect(conflictsWithStoredDecision({ hubId: 3, requested: true }, ShipmentHubSource.SENDER_SELECTED, 3)).toBe(false);
    expect(conflictsWithStoredDecision({ hubId: 4, requested: true }, ShipmentHubSource.SENDER_SELECTED, 3)).toBe(true);
    expect(conflictsWithStoredDecision({ hubId: 4, requested: true }, ShipmentHubSource.NOT_REQUIRED, null)).toBe(true);
    expect(conflictsWithStoredDecision({ hubId: 4, requested: true }, ShipmentHubSource.NONE_AVAILABLE, null)).toBe(true);
  });
  it('a bare request conflicts only with a stored not_required', () => {
    expect(conflictsWithStoredDecision({ requested: true }, ShipmentHubSource.NOT_REQUIRED, null)).toBe(true);
    expect(conflictsWithStoredDecision({ requested: true }, ShipmentHubSource.AUTO_SINGLE_CANDIDATE, 3)).toBe(false);
    expect(conflictsWithStoredDecision({ requested: true }, ShipmentHubSource.NONE_AVAILABLE, null)).toBe(false);
  });
  it('assertNoDecisionConflict raises a typed 409 naming the side', () => {
    const stored = { originHubSource: ShipmentHubSource.SENDER_SELECTED, originHubId: 3, destinationHubSource: ShipmentHubSource.NOT_REQUIRED, destinationHubId: null };
    expect(() => assertNoDecisionConflict(stored, NO_HUB_INPUT)).not.toThrow();
    try {
      assertNoDecisionConflict(stored, { origin: { requested: false }, destination: { hubId: 8, requested: true } });
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.getResponse()).toMatchObject({ code: HUB_DECISION_CONFLICT, side: 'destination' });
    }
    expect(anyHubRequested(NO_HUB_INPUT)).toBe(false);
    expect(anyHubRequested({ origin: { requested: false }, destination: { requested: true } })).toBe(true);
  });
});

describe('structural guards', () => {
  const root = join(__dirname, '..');
  const walk = (dir: string, out: string[] = []) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.ts$/.test(name) && !/\.spec\.ts$|\.integration\.ts$/.test(name)) out.push(full);
    }
    return out;
  };
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('hub selection is INDEPENDENT of pickupOption/deliveryOption: the policy files never reference the handoff enum', () => {
    for (const f of ['shipment-hub-selection.ts', 'shipment-hub-source.ts']) {
      const src = strip(readFileSync(join(__dirname, f), 'utf8'));
      expect(src).not.toMatch(/pickupOption|deliveryOption|ShipmentHandoffOption/);
    }
    // ...and the service never feeds them into any hub function.
    const svc = strip(readFileSync(join(__dirname, 'shipments.service.ts'), 'utf8'));
    const hubBlock = svc.slice(svc.indexOf('private hasHubDecision'), svc.indexOf('private async ensureParcelForShipment'));
    expect(hubBlock.length).toBeGreaterThan(500);
    expect(hubBlock).not.toMatch(/pickupOption|deliveryOption|ShipmentHandoffOption/);
    // the enum keeps its original meaning: unchanged documented values
    const ent = readFileSync(join(__dirname, 'entities', 'shipment.entity.ts'), 'utf8');
    expect(ent).toMatch(/AGENT = 'agent', \/\/ via a Kentexa agent/);
  });

  it('ensureParcelForShipment never searches hubs: no hub repo call, no city match, no fallback', () => {
    const svc = strip(readFileSync(join(__dirname, 'shipments.service.ts'), 'utf8'));
    const body = svc.slice(svc.indexOf('private async ensureParcelForShipment'), svc.indexOf('private isParcelShipmentUniqueViolation'));
    expect(body.length).toBeGreaterThan(300);
    expect(body).not.toMatch(/superAgentRepo|SuperAgentStatus|findOne\(\{\s*where:\s*\{\s*city/);
    expect(body).toMatch(/originHubId/);
    expect(body).toMatch(/destinationHubId/);
    expect(svc).not.toMatch(/city:\s*shipment\.(origin|destination)City/);
  });

  it('the decision columns are written ONLY by writeHubDecision, and only as a compare-and-set on NULL sources', () => {
    const offenders: string[] = [];
    for (const f of walk(root)) {
      const src = strip(readFileSync(f, 'utf8'));
      if (/(origin|destination)HubSource|hubDecidedAt/.test(src)) {
        const rel = f.slice(root.length + 1).replace(/\\/g, '/');
        if (!['shipments/shipments.service.ts', 'shipments/entities/shipment.entity.ts', 'shipments/shipment-hub-selection.ts',
          'database/migrations/1788274800000-AddShipmentHubDecision.ts'].includes(rel)) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
    const svc = strip(readFileSync(join(__dirname, 'shipments.service.ts'), 'utf8'));
    // exactly one statement assigns hubDecidedAt / hub sources, inside writeHubDecision
    expect((svc.match(/hubDecidedAt:/g) || []).length).toBe(1);
    const writer = svc.slice(svc.indexOf('private async writeHubDecision'), svc.indexOf('private async recordLateHubDecision'));
    expect(writer).toMatch(/originHubSource: IsNull\(\), destinationHubSource: IsNull\(\)/);
    expect(writer).toMatch(/hubDecidedAt: new Date\(\)/);
  });

  it('source strings are spelled only in the enum file (never scattered through controller/service)', () => {
    for (const f of walk(root)) {
      const rel = f.slice(root.length + 1).replace(/\\/g, '/');
      if (rel === 'shipments/shipment-hub-source.ts' || rel.startsWith('database/migrations/')) continue;
      const src = strip(readFileSync(f, 'utf8'));
      if (rel.startsWith('shipments/')) {
        for (const lit of ['sender_selected', 'auto_single_candidate', 'none_available']) {
          expect(`${rel}:${src.includes(`'${lit}'`)}`).toBe(`${rel}:false`);
        }
      }
    }
  });

  it('discovery is read-only and locks nothing; the decision path always locks (FOR SHARE)', () => {
    const svc = strip(readFileSync(join(__dirname, 'shipments.service.ts'), 'utf8'));
    const disc = svc.slice(svc.indexOf('async discoverHubsForShipment'), svc.indexOf('async cancelShipment'));
    expect(disc).toMatch(/discoverHubCandidates\(this\.superAgentRepo, keys, false\)/);
    expect(disc).not.toMatch(/\.update\(|\.save\(|\.insert\(|\.delete\(|transaction/);
    expect(svc).toMatch(/discoverHubCandidates\(hubRepoOf\(em\), keys, true\)/);
    const pol = strip(readFileSync(join(__dirname, 'shipment-hub-selection.ts'), 'utf8'));
    expect(pol).toMatch(/setLock\('pessimistic_read'\)/);
    expect(pol).toMatch(/orderBy\('hub\.id', 'ASC'\)/);
    expect(pol).not.toMatch(/ILike|LIKE|rating|totalParcelsDelivered/i);
  });

  it('sender-facing projection is the four allow-listed fields and nothing sensitive is selected', () => {
    const pol = strip(readFileSync(join(__dirname, 'shipment-hub-selection.ts'), 'utf8'));
    expect(pol).toMatch(/select\(\['hub\.id', 'hub\.businessName', 'hub\.city', 'hub\.address'\]\)/);
    expect(pol).not.toMatch(/hub\.(phone|governmentId|userId|user\b|workspaceId|shippingRates|earnings|codCashHeld)/i);
  });
});
