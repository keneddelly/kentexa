import { StaffService } from './staff.service';

/** Owner 2026-11-09: the admin gives KenteXa staff roles by phone, and can pause them. */
describe('StaffService', () => {
  it('finds the person by the last 9 digits of the phone and gives the role on their own user profile', async () => {
    const calls: Array<[string, any[]]> = [];
    const db = { query: jest.fn(async (sql: string, params: any[]) => {
      calls.push([sql, params]);
      if (sql.includes('FROM public."user"')) return [{ id: 40, name: 'Neema' }];
      if (sql.startsWith('SELECT id, status')) return [];
      if (sql.startsWith('INSERT')) return [{ id: 77 }];
      return [];
    }) };
    const r = await new StaffService(db as any).grant({ phone: '+255 712 345 678', roleType: 'finance' }, 1);
    expect(r).toEqual({ id: 77, userId: 40, roleType: 'finance', status: 'active' });
    expect(calls[0][1]).toEqual(['712345678']);
    expect(calls.find(([s]) => s.startsWith('INSERT'))![1]).toEqual([40, 'finance', 1]);
  });

  it('refuses an unknown role, an unknown phone, and a role the person already has', async () => {
    await expect(new StaffService({ query: jest.fn() } as any).grant({ phone: '0712345678', roleType: 'admin' }, 1)).rejects.toThrow('Chagua kazi');
    await expect(new StaffService({ query: jest.fn(async () => []) } as any).grant({ phone: '0712345678', roleType: 'moderator' }, 1)).rejects.toThrow('Hakuna akaunti');
    const db = { query: jest.fn(async (sql: string) => (sql.includes('FROM public."user"') ? [{ id: 40, name: 'Neema' }] : [{ id: 5, status: 'active' }])) };
    await expect(new StaffService(db as any).grant({ phone: '0712345678', roleType: 'moderator' }, 1)).rejects.toThrow('tayari ana kazi hii');
  });

  it('pause and re-open only staff roles', async () => {
    const db = { query: jest.fn(async (sql: string) => (sql.startsWith('SELECT') ? [{ id: 5, roleType: 'admin' }] : [])) };
    await expect(new StaffService(db as any).setStatus(5, 'suspended', 1)).rejects.toThrow('haipo');
    const ok = { query: jest.fn(async (sql: string) => (sql.startsWith('SELECT') ? [{ id: 6, roleType: 'customer_care' }] : [])) };
    await expect(new StaffService(ok as any).setStatus(6, 'suspended', 1)).resolves.toEqual({ id: 6, status: 'suspended' });
  });
});
