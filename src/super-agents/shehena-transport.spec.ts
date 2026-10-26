import { ForbiddenException } from '@nestjs/common';
import { ShehenaTransportService, SHEHENA_TRANSPORT_MESSAGES } from './shehena-transport.service';

// Offices and the transport they use (owner 2026-10-26): the office's own vehicles
// and its partners', worked out from what already exists - no partner table.
describe('ShehenaTransportService', () => {
  const make = (opts: { column?: boolean; rows?: any[] } = {}) => {
    const sql: string[] = [];
    const db: any = {
      query: jest.fn(async (q: string, params: any[] = []) => {
        sql.push(q.replace(/\s+/g, ' '));
        if (q.includes('information_schema.columns')) return opts.column === false ? [] : [{ ok: 1 }];
        if (q.includes('WITH links')) return opts.rows ?? [
          { id: 3, name: 'Abood Bus', type: 'bus', phone: '255700000003', relation: 'own' },
          { id: 9, name: 'Lori la Juma', type: 'truck', phone: null, relation: 'partner' },
        ];
        if (q.includes('FROM public.transport_provider tp WHERE tp."userId"')) return [{ id: 9, userId: params[0] }];
        if (q.includes('FROM public.bulk_shipment b')) return [{ id: 40, code: 'BULK-DAR-MBY-1', parcels: '6', weightKg: '42.5', fare: '60000', fromOffice: 'Kariakoo Cargo' }];
        return [];
      }),
    };
    return { svc: new ShehenaTransportService(db), sql, db };
  };

  it('own vehicles first, then partners (joined through the invitation, or carried for this office before)', async () => {
    const { svc, sql } = make();
    expect(await svc.listFor(5)).toEqual([
      { id: 3, name: 'Abood Bus', type: 'bus', phone: '255700000003', relation: 'own' },
      { id: 9, name: 'Lori la Juma', type: 'truck', phone: null, relation: 'partner' },
    ]);
    const links = sql.find((q) => q.includes('WITH links'))!;
    expect(links).toMatch(/tp\."businessId" = w\."businessId"/);              // same business: own
    expect(links).toMatch(/partner_invitation .*'joined', 'confirmed'/);       // joined through the invitation
    expect(links).toMatch(/transport_assignment/);                             // carried a parcel before
    expect(links).toMatch(/b\."transportProviderId" IS NOT NULL/);             // carried a shehena before
    expect(links).toMatch(/tp\.status::text IN \('verified', 'active'\)/);
  });

  it('before the migration: no shehena history is read and nothing is written', async () => {
    const { svc, sql, db } = make({ column: false });
    await svc.listFor(5);
    expect(sql.find((q) => q.includes('WITH links'))).not.toMatch(/bulk_shipment/);
    await svc.link(40, 9);
    expect(db.query.mock.calls.some((c: any[]) => String(c[0]).includes('UPDATE public.bulk_shipment'))).toBe(false);
    expect(await svc.forTransporter(7)).toEqual({ providers: [9], shehena: [] });
  });

  it('a transporter that is neither own nor partner is refused', async () => {
    const { svc } = make();
    await expect(svc.assertUsable(5, 99)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.assertUsable(5, 99)).rejects.toThrow(SHEHENA_TRANSPORT_MESSAGES.notYours);
    await expect(svc.assertUsable(5, 9)).resolves.toMatchObject({ name: 'Lori la Juma' });
  });

  it('the transporter sees the shehena it carries, with the fare it agreed with the office', async () => {
    const { svc } = make();
    const r = await svc.forTransporter(7);
    expect(r.shehena[0]).toMatchObject({ id: 40, code: 'BULK-DAR-MBY-1', parcels: 6, weightKg: 42.5, fare: 60000, fromOffice: 'Kariakoo Cargo' });
  });
});
