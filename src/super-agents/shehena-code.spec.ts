import { SHEHENA_CODE_MESSAGES, ShehenaCodeService, newShehenaCode, sameShehenaCode } from './shehena-code.service';

// Owner approved 2026-11-02 (sketch "Hand-over Codes"): one code per dispatched shehena
// closes office -> transport and transport -> receiving office.
function make(bulk: any, extra: { carrier?: any; parcels?: string[] } = {}) {
  const calls: { sql: string; params: any[] }[] = [];
  const db = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (sql.includes('information_schema.columns')) return [{ ok: 1 }];
      if (sql.includes('FROM public.bulk_shipment WHERE id = $1')) return bulk ? [{ ...bulk }] : [];
      if (sql.includes('"codeAttempts" = "codeAttempts" + 1')) { bulk.codeAttempts += 1; return []; }
      if (sql.includes('FROM public.transport_provider')) return extra.carrier ? [extra.carrier] : [];
      if (sql.includes('SET "transportConfirmedAt"')) return [{ transportConfirmedAt: '2026-11-02T18:00:00Z' }];
      if (sql.includes('FROM public.parcel')) return (extra.parcels || []).map((t) => ({ trackingNumber: t }));
      if (sql.includes('RETURNING "handoverCode"')) return [{ handoverCode: bulk?.handoverCode ?? params[1] }];
      return [];
    }),
  };
  return { svc: new ShehenaCodeService(db as any), calls, bulk };
}

const base = { id: 9, status: 'dispatched', superAgentId: 1, lastMileSuperAgentId: 2, transportProviderId: 5, handoverCode: '482913', codeAttempts: 0, transportConfirmedAt: null };

describe('shehena hand-over code', () => {
  it('a 6-digit code; spaces typed are ignored; anything else does not match', () => {
    for (let i = 0; i < 20; i++) expect(newShehenaCode()).toMatch(/^\d{6}$/);
    expect(sameShehenaCode('482913', '482 913')).toBe(true);
    expect(sameShehenaCode('482913', '482914')).toBe(false);
    expect(sameShehenaCode(null, '482913')).toBe(false);
    expect(sameShehenaCode('482913', 482913 as any)).toBe(false);
  });

  it('dispatch keeps an existing code (never a second one)', async () => {
    const { svc } = make({ ...base });
    expect(await svc.issue(9)).toBe('482913');
  });

  it('receiving office: the right code receives every parcel still on the way', async () => {
    const { svc } = make({ ...base }, { parcels: ['KTX-1', 'KTX-2'] });
    expect(await svc.checkReceive(2, 9, { code: '482913' })).toEqual({ withCode: true, reason: null, trackingNumbers: ['KTX-1', 'KTX-2'] });
  });

  it('a wrong code counts; the fifth stops code entry but a reason still works', async () => {
    const h = make({ ...base, codeAttempts: 3 }, { parcels: ['KTX-1'] });
    await expect(h.svc.checkReceive(2, 9, { code: '111111' })).rejects.toThrow(SHEHENA_CODE_MESSAGES.wrong);
    await expect(h.svc.checkReceive(2, 9, { code: '111111' })).rejects.toThrow(SHEHENA_CODE_MESSAGES.locked);
    await expect(h.svc.checkReceive(2, 9, { code: '482913' })).rejects.toThrow(SHEHENA_CODE_MESSAGES.locked);
    await expect(h.svc.checkReceive(2, 9, { reason: 'ok' })).rejects.toThrow(SHEHENA_CODE_MESSAGES.reasonShort);
    expect(await h.svc.checkReceive(2, 9, { reason: 'Lebo imepotea njiani' }))
      .toEqual({ withCode: false, reason: 'Lebo imepotea njiani', trackingNumbers: ['KTX-1'] });
  });

  it('only the office it was sent to, only while on the way, and a code or a reason is needed', async () => {
    await expect(make({ ...base }).svc.checkReceive(3, 9, { code: '482913' })).rejects.toThrow(SHEHENA_CODE_MESSAGES.notYours);
    await expect(make({ ...base, status: 'arrived' }).svc.checkReceive(2, 9, { code: '482913' })).rejects.toThrow(SHEHENA_CODE_MESSAGES.notOnTheWay);
    await expect(make({ ...base }).svc.checkReceive(2, 9, {})).rejects.toThrow(SHEHENA_CODE_MESSAGES.needCodeOrReason);
    await expect(make(null).svc.checkReceive(2, 9, { code: '482913' })).rejects.toThrow(SHEHENA_CODE_MESSAGES.missing);
  });

  it('transporter: only the one it was loaded onto confirms, with the code, once', async () => {
    await expect(make({ ...base }).svc.transporterConfirm(70, 9, '482913')).rejects.toThrow(SHEHENA_CODE_MESSAGES.notCarrier);
    const ok = make({ ...base }, { carrier: { id: 5, name: 'Kilimanjaro Cargo' } });
    await expect(ok.svc.transporterConfirm(70, 9, '000000')).rejects.toThrow(SHEHENA_CODE_MESSAGES.wrong);
    expect(await ok.svc.transporterConfirm(70, 9, '482913'))
      .toEqual({ id: 9, confirmedAt: '2026-11-02T18:00:00Z', carrierName: 'Kilimanjaro Cargo', replay: false });
    const again = make({ ...base, transportConfirmedAt: '2026-11-02T17:00:00Z' }, { carrier: { id: 5, name: 'Kilimanjaro Cargo' } });
    expect((await again.svc.transporterConfirm(70, 9, 'anything')).replay).toBe(true);
  });
});
