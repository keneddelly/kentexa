import { readFileSync } from 'fs';
import { join } from 'path';
import { neighbours, numberVisible, seriesIdFromRef, seriesPath, validOrder, cleanTitle } from './series-rules';
import { SeriesService } from './series.service';

// Mfululizo (Topic Series, issue #410, owner approved 2026-11-17).
describe('Mfululizo: rules', () => {
  it('addresses: /series/<id>-<slug>; the number is what counts', () => {
    expect(seriesPath(12, 'Business Conversations')).toBe('/series/12-business-conversations');
    expect(seriesIdFromRef('12-business-conversations')).toBe(12);
    expect(seriesIdFromRef('12')).toBe(12);
    expect(seriesIdFromRef('abc')).toBeNull();
    expect(seriesIdFromRef('12;drop')).toBeNull();
  });

  it('a reorder must name exactly the current episodes, each once', () => {
    expect(validOrder([4, 7, 9], [9, 4, 7])).toEqual([9, 4, 7]);
    expect(validOrder([4, 7, 9], [9, 4])).toBeNull();          // one missing
    expect(validOrder([4, 7, 9], [9, 4, 4])).toBeNull();       // repeated
    expect(validOrder([4, 7, 9], [9, 4, 7, 11])).toBeNull();   // extra
    expect(validOrder([4, 7, 9], [9, 4, 8])).toBeNull();       // not in the series
    expect(validOrder([4], 'x')).toBeNull();
  });

  it('only shown episodes are numbered, 1..n in order; a hidden post closes the gap', () => {
    const rows = [
      { postId: 1, position: 1, visible: true },
      { postId: 2, position: 2, visible: false },
      { postId: 3, position: 3, visible: true },
    ];
    const shown = numberVisible(rows);
    expect(shown.map((r) => [r.postId, r.number])).toEqual([[1, 1], [3, 2]]);
    expect(neighbours(shown, 3)).toMatchObject({ index: 1, prev: { postId: 1 }, next: null });
    expect(neighbours(shown, 1)).toMatchObject({ prev: null, next: { postId: 3 } });
    expect(neighbours(shown, 2)).toBeNull();
  });

  it('titles and post links', () => {
    expect(cleanTitle('  Business   Conversations ')).toBe('Business Conversations');
    expect(cleanTitle('ab')).toBeNull();
    expect(SeriesService.postIdFrom('https://kentexa.com/post/42-je-biashara-yako')).toBe(42);
    expect(SeriesService.postIdFrom('42')).toBe(42);
    expect(SeriesService.postIdFrom('kentexa.com/product/42')).toBeNull();
  });
});

describe('Mfululizo: safety', () => {
  const src = readFileSync(join(__dirname, 'series.service.ts'), 'utf8');

  it('casts every query parameter (inconsistent-type errors stopped a live deploy before)', () => {
    const params = src.match(/\$\d+(::[a-z\[\]]+)?/g) || [];
    expect(params.length).toBeGreaterThan(20);
    expect(params.filter((p) => !p.includes('::'))).toEqual([]);
  });

  it('public reads use the guest visibility rule; changes lock the series row', () => {
    expect((src.match(/PUBLIC_TO_GUESTS\('x'\)/g) || []).length).toBeGreaterThanOrEqual(4);
    expect((src.match(/FOR UPDATE/g) || []).length).toBeGreaterThanOrEqual(3);
    expect(src).toContain('SET CONSTRAINTS "UQ_content_series_episode_position" DEFERRED');
  });

  it('management routes are admin only; follow needs sign-in', () => {
    const ctl = readFileSync(join(__dirname, 'series.controller.ts'), 'utf8');
    for (const route of ["@Post()", "@Patch(':id')", "@Post(':id/episodes')", "@Put(':id/episodes/order')", "@Delete(':id/episodes/:postId')", "@Get('admin/all')"]) {
      const at = ctl.indexOf(route);
      expect(at).toBeGreaterThan(0);
      expect(ctl.slice(Math.max(0, at - 140), at)).toContain('@Roles(UserRole.ADMIN)');
    }
    const follow = ctl.indexOf("@Post(':id/follow')");
    expect(ctl.slice(follow - 60, follow)).toContain('JwtAuthGuard');
  });

  it('the migration is additive with unique post and deferrable unique place per series', () => {
    const mig = readFileSync(join(__dirname, '../database/migrations/1797400000000-AddContentSeries.ts'), 'utf8');
    expect(mig).toContain('UQ_content_series_episode_post');
    expect(mig).toContain('DEFERRABLE INITIALLY IMMEDIATE');
    expect(mig.slice(0, mig.indexOf('public async down'))).not.toMatch(/\bDROP\b|DELETE FROM|\bUPDATE\b/);
  });
});

describe('Mfululizo: before the migration', () => {
  it('reads are empty and nothing breaks', async () => {
    const svc = new SeriesService({ query: async () => [{ ok: false }] } as any);
    expect(await svc.list()).toEqual([]);
    expect(await svc.forPost(5)).toEqual([]);
    await expect(svc.get(1)).rejects.toThrow();
  });
});

describe('Mada: admin topic list (#410 phase 3)', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { TopicsService } = require('./topics.service');
  const make = (rows: Record<string, any[]> = {}) => {
    const calls: string[] = [];
    const db = { query: jest.fn(async (sql: string) => { calls.push(sql); for (const k of Object.keys(rows)) if (sql.includes(k)) return rows[k]; return []; }) };
    return { svc: new TopicsService(db as any, { record: jest.fn() } as any), calls };
  };

  it('a new topic needs a key of a-z and _ and a name; a key already used is refused', async () => {
    const { svc } = make({ 'WHERE key = $1::varchar': [{ key: 'biashara' }] });
    await expect(svc.adminCreate(1, { key: 'Elimu 1', label: 'Elimu' })).rejects.toThrow('Ufunguo');
    await expect(svc.adminCreate(1, { key: 'elimu', label: 'E' })).rejects.toThrow('jina');
    await expect(svc.adminCreate(1, { key: 'biashara', label: 'Biashara' })).rejects.toThrow('tayari');
  });

  it('only admin reaches the topic routes', () => {
    const ctl = readFileSync(join(__dirname, 'topics-admin.controller.ts'), 'utf8');
    expect(ctl).toContain('@UseGuards(JwtAuthGuard, RolesGuard)');
    expect(ctl).toContain('@Roles(UserRole.ADMIN)');
  });
});
