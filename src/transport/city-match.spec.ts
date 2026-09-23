import { BadRequestException } from '@nestjs/common';
import { TransportService } from './transport.service';
import {
  DISCOVERY_CITY_MAX,
  cityMatchParams,
  cityMatchSql,
  escapeLikeLiteral,
  normalizeDiscoveryCity,
} from './city-match';

describe('escapeLikeLiteral', () => {
  it.each([
    ['Dar es Salaam', 'Dar es Salaam'],
    ['100%', '100!%'],
    ['a_b', 'a!_b'],
    ['wow!', 'wow!!'],
    ['%_!', '!%!_!!'],
    ['%%', '!%!%'],
  ])('%p -> %p', (input, expected) => expect(escapeLikeLiteral(input)).toBe(expected));
});

describe('normalizeDiscoveryCity — public input hardening', () => {
  it('trims and returns 2..80 character strings, preserving case and inner spacing', () => {
    expect(normalizeDiscoveryCity('  Dar es Salaam ')).toBe('Dar es Salaam');
    expect(normalizeDiscoveryCity('Dar')).toBe('Dar');
    expect(normalizeDiscoveryCity('ab')).toBe('ab');
    expect(normalizeDiscoveryCity('x'.repeat(DISCOVERY_CITY_MAX))).toHaveLength(DISCOVERY_CITY_MAX);
  });

  it.each([[''], [' '], ['   '], ['\t\n'], ['a'], [' a '], ['%'], ['_'], [' _ '], ['x'.repeat(DISCOVERY_CITY_MAX + 1)], [undefined], [null], [42], [{}], [['Dar']]])(
    'rejects %p with 400 (one-character, whitespace-only, oversize or non-string input can never broaden discovery)',
    (raw) => expect(() => normalizeDiscoveryCity(raw as any)).toThrow(BadRequestException),
  );

  it('two wildcard characters are allowed as INPUT only because they are literal text ("%%" matches nothing)', () => {
    expect(normalizeDiscoveryCity('%%')).toBe('%%');
    expect(cityMatchParams('from', '%%').from).toBe('%!%!%%');
  });

  describe('allowUnconstrainedSide (GET /transport/available only)', () => {
    it('an ABSENT or EXACTLY-empty value means "no constraint on this side"', () => {
      expect(normalizeDiscoveryCity(undefined, true)).toBeNull();
      expect(normalizeDiscoveryCity('', true)).toBeNull();
    });
    it('whitespace-only, one-character and wildcard-only text are still rejected there', () => {
      for (const raw of [' ', '   ', 'a', '%', '_']) expect(() => normalizeDiscoveryCity(raw, true)).toThrow(BadRequestException);
    });
    it('valid text still normalises', () => expect(normalizeDiscoveryCity(' Dar ', true)).toBe('Dar'));
  });
});

describe('cityMatchSql / cityMatchParams', () => {
  it('declares ESCAPE, escapes the stored column used as a pattern, and never lets a <2-char stored value match by containment', () => {
    const sql = cityMatchSql('r.originCity', 'from');
    expect(sql).toContain(`LOWER(r.originCity) LIKE LOWER(:from) ESCAPE '!'`);
    expect(sql).toContain(`LENGTH(TRIM(r.originCity)) >= 2`);
    expect(sql).toContain(`REPLACE(REPLACE(REPLACE(LOWER(r.originCity), '!', '!!'), '%', '!%'), '_', '!_')`);
    expect(sql).toContain(`LOWER(:fromRaw) LIKE ('%' || `);
    expect((sql.match(/ESCAPE '!'/g) || []).length).toBe(2);
  });

  it('params: the pattern is escaped, the raw text is left as the subject of the reverse comparison', () => {
    expect(cityMatchParams('to', 'Dar_es%')).toEqual({ to: '%Dar!_es!%%', toRaw: 'Dar_es%' });
  });
});

describe('TransportService.findAvailableForRoute — hardened shared public path (query construction)', () => {
  const build = () => {
    const wheres: Array<[string, any]> = [];
    const chain: any = {};
    for (const m of ['leftJoinAndSelect', 'where', 'orderBy', 'addOrderBy', 'innerJoin', 'leftJoin']) chain[m] = jest.fn(() => chain);
    chain.andWhere = jest.fn((sql: string, params?: any) => { wheres.push([sql, params]); return chain; });
    chain.getMany = jest.fn(async () => []);
    const args: any[] = new Array(14).fill({});
    args[0] = { createQueryBuilder: () => chain };
    args[2] = { createQueryBuilder: () => chain };
    const svc = new (TransportService as any)(...args) as TransportService;
    return { svc, wheres, chain };
  };
  const cityWheres = (wheres: Array<[string, any]>) => wheres.filter(([sql]) => sql.includes('ESCAPE'));

  it.each([['%', 'Mwanza'], ['Dar', '_'], ['a', 'a'], ['  ', 'Mwanza'], ['Dar', '   '], ['', 'Mwanza'], [undefined, 'Mwanza']])(
    'rejects (%p -> %p) with 400 before building any query',
    async (from, to) => {
      const { svc, chain } = build();
      await expect(svc.findAvailableForRoute(from as any, to as any)).rejects.toThrow(BadRequestException);
      expect(chain.getMany).not.toHaveBeenCalled();
    },
  );

  it('a legitimate search escapes wildcard characters and uses the trimmed text (both queries, both sides)', async () => {
    const { svc, wheres } = build();
    await svc.findAvailableForRoute('  Dar_es 100% ', 'Mwanza');
    const cw = cityWheres(wheres);
    expect(cw).toHaveLength(4); // published: from+to, providers: from+to
    expect(cw.every(([, p]) => Object.keys(p).length === 2)).toBe(true);
    expect(cw.filter(([, p]) => p.from).every(([, p]) => p.from === '%Dar!_es 100!%%' && p.fromRaw === 'Dar_es 100%')).toBe(true);
    expect(cw.filter(([, p]) => p.to).every(([, p]) => p.to === '%Mwanza%')).toBe(true);
  });

  it('legitimate legacy strings are unchanged: case variants and trailing spaces reach the same escaped patterns', async () => {
    for (const from of ['Dar', 'dar es salaam', 'DAR ES SALAAM ', 'Dar es salaam ']) {
      const { svc, wheres } = build();
      await svc.findAvailableForRoute(from, 'Iringa');
      const patterns = cityWheres(wheres).filter(([, p]) => p.from).map(([, p]) => p.from);
      expect(patterns.every((p) => p === `%${from.trim()}%`)).toBe(true);
    }
  });

  it('the unconstrained side is only reachable via the explicit option, and then adds NO predicate for that side', async () => {
    const { svc, wheres } = build();
    await svc.findAvailableForRoute('Dar es Salaam', '', 0, { allowUnconstrainedSide: true });
    const cw = cityWheres(wheres);
    expect(cw).toHaveLength(2); // origin only, in the published and providers queries
    expect(cw.every(([, p]) => 'from' in p && !('to' in p))).toBe(true);
    await expect(build().svc.findAvailableForRoute('Dar es Salaam', '')).rejects.toThrow(BadRequestException);
    await expect(build().svc.findAvailableForRoute('', '', 0, { allowUnconstrainedSide: true })).rejects.toThrow(BadRequestException);
  });

  it('GET /transport/available keeps its documented "to= (empty) = anywhere", but not for whitespace-only text', async () => {
    const { svc, wheres } = build();
    await expect(svc.findPublicAvailabilityForRoute('Dar es Salaam', '')).resolves.toBeDefined();
    expect(cityWheres(wheres).every(([, p]) => !('to' in p))).toBe(true);
    await expect(build().svc.findPublicAvailabilityForRoute('Dar es Salaam', '   ')).rejects.toThrow(BadRequestException);
    await expect(build().svc.findPublicAvailabilityForRoute('%', 'Mwanza')).rejects.toThrow(BadRequestException);
  });

  it('the Stage 2C published-provider filter is still applied', async () => {
    const { svc, wheres } = build();
    await svc.findAvailableForRoute('Dar', 'Mwanza');
    expect(wheres.some(([sql]) => sql.includes('p.status IN (:...publishedProviderStatuses)'))).toBe(true);
  });
});
