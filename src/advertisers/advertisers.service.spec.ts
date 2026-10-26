import { AdvertisersService, ADVERTISER_MESSAGES } from './advertisers.service';

// Advertisers (owner 2026-10-26): a link per advertiser; commission per event, each once,
// at the admin's rate, read from the real records.
describe('AdvertisersService', () => {
  const make = (impl: (sql: string, p: any[]) => any) => {
    const db: any = { query: jest.fn(async (sql: string, p: any[] = []) => {
      if (sql.includes('to_regclass')) return [{ ok: true }];
      return impl(sql.replace(/\s+/g, ' '), p);
    }) };
    return { svc: new AdvertisersService(db), db };
  };

  it('a registration through an active advertiser link is recorded once; unknown codes and self-links are ignored', async () => {
    const { svc, db } = make((sql, p) => {
      if (sql.includes('FROM public.advertiser WHERE code')) return p[0] === 'KAB12CD' ? [{ id: 4, userId: 99 }] : [];
      return [];
    });
    expect(await svc.recordSignup(' kab12cd ', 50)).toBe(true);
    expect(db.query.mock.calls.some((c: any[]) => /INSERT INTO public.advertiser_referral .* ON CONFLICT \("userId"\) DO NOTHING/.test(String(c[0]).replace(/\s+/g, ' ')))).toBe(true);
    expect(await svc.recordSignup('KZZZZZZ', 50)).toBe(false);
    expect(await svc.recordSignup('KAB12CD', 99)).toBe(false);
  });

  it('earns each event once, at the rate of that moment, only when the record shows it happened', async () => {
    const inserted: any[] = [];
    const { svc } = make((sql, p) => {
      if (sql.includes('FROM public.advertiser_referral r WHERE')) return [{ userId: 50 }];
      if (sql.includes('FROM public.advertiser_rate')) return [{ event: 'first_listing', amount: 1000 }, { event: 'seller', amount: 5000 }, { event: 'office', amount: 20000 }, { event: 'business', amount: 3000 }];
      if (sql.includes('SELECT "userId", event FROM public.advertiser_commission')) return [{ userId: 50, event: 'first_listing' }];
      if (sql.includes('FROM public.business')) return [];
      if (sql.includes('FROM public.super_agent')) return [];
      if (sql.includes('FROM public.seller_profile')) return [{ '?column?': 1 }];
      if (sql.includes('INSERT INTO public.advertiser_commission')) { inserted.push(p); return [{ id: 1 }]; }
      return [];
    });
    expect(await svc.refresh(4)).toBe(1);
    expect(inserted).toEqual([[4, 50, 'seller', 5000]]); // listing already earned; no business, no office
  });

  it('admin: add with a valid phone, refuse a bad one; rates must be whole and not negative', async () => {
    const { svc } = make((sql) => {
      if (sql.includes('SELECT id FROM public.advertiser WHERE phone')) return [];
      if (sql.includes('FROM public."user" WHERE phone')) return [{ id: 77 }];
      if (sql.includes('INSERT INTO public.advertiser (')) return [{ id: 9, code: 'K1A2B3C' }];
      return [];
    });
    process.env.FRONTEND_URL = 'https://kentexa.com';
    await expect(svc.create({ name: 'Neema', phone: '0712 345 678' })).resolves.toMatchObject({
      id: 9, code: 'K1A2B3C', link: 'https://kentexa.com/?ref=K1A2B3C', userLinked: true,
    });
    await expect(svc.create({ name: 'Neema', phone: '123' })).rejects.toThrow(ADVERTISER_MESSAGES.badPhone);
    await expect(svc.setRates({ seller: -5 })).rejects.toThrow(ADVERTISER_MESSAGES.badRate);
    await expect(svc.setRates({ seller: 2.5 })).rejects.toThrow(ADVERTISER_MESSAGES.badRate);
  });

  it('before the migration nothing is recorded and the advertiser page says not an advertiser', async () => {
    const db: any = { query: jest.fn(async (sql: string) => (sql.includes('to_regclass') ? [{ ok: false }] : [])) };
    const svc = new AdvertisersService(db);
    expect(await svc.recordSignup('KAB12CD', 50)).toBe(false);
    await expect(svc.mine(50, '255712345678')).rejects.toThrow(ADVERTISER_MESSAGES.notAdvertiser);
    expect(await svc.list()).toEqual({ ready: false, advertisers: [], rates: null });
  });
});

describe('AdvertisersService.inviter', () => {
  const make = (rows: Record<string, any[]>) => {
    const db: any = { query: jest.fn(async (sql: string) => {
      if (sql.includes('to_regclass')) return [{ ok: true }];
      for (const [k, v] of Object.entries(rows)) if (sql.includes(k)) return v;
      return [];
    }) };
    return { db, service: new AdvertisersService(db) };
  };
  it("names the advertiser behind a link, case-insensitive", async () => {
    const { service, db } = make({ 'FROM public.advertiser WHERE code': [{ name: 'Juma Matangazo' }] });
    await expect(service.inviter('k3f9a1')).resolves.toEqual({ kind: 'advertiser', name: 'Juma Matangazo' });
    expect(db.query.mock.calls.find(([sql]: any[]) => sql.includes('FROM public.advertiser WHERE code'))[1]).toEqual(['K3F9A1']);
  });
  it('names an office behind its referral link', async () => {
    const { service } = make({ 'FROM public.super_agent': [{ businessName: 'Samatta Transportation' }] });
    await expect(service.inviter('KTX-SA-12')).resolves.toEqual({ kind: 'office', name: 'Samatta Transportation' });
  });
  it('unknown or malformed codes answer nothing', async () => {
    const { service } = make({});
    await expect(service.inviter('NOPE99')).resolves.toBeNull();
    await expect(service.inviter("x'; drop")).resolves.toBeNull();
  });
});

describe('AdvertisersService applications', () => {
  const make = (impl: (sql: string, p: any[]) => any) => {
    const db: any = { query: jest.fn(async (sql: string, p: any[] = []) => {
      if (sql.includes('to_regclass')) return [{ ok: true }];
      return impl(sql.replace(/\s+/g, ' '), p);
    }) };
    return { svc: new AdvertisersService(db), db };
  };

  describe('applications (self-service)', () => {
    it('a user applies once; the phone falls back to their account phone; advertisers and duplicates are refused', async () => {
      let pending = false;
      const { svc, db } = make((sql) => {
        if (sql.includes('SELECT id FROM public.advertiser WHERE "userId"')) return [];
        if (sql.includes('SELECT id FROM public.advertiser WHERE phone')) return [];
        if (sql.includes('INSERT INTO public.advertiser_application')) {
          if (pending) return [];
          pending = true;
          return [{ id: 3, name: 'Asha', phone: '255713000000', area: 'Mwanza', plan: null, status: 'pending' }];
        }
        return [];
      });
      await expect(svc.apply(50, '0713 000 000', { name: 'Asha', area: 'Mwanza' })).resolves.toMatchObject({ id: 3, status: 'pending' });
      const insert = db.query.mock.calls.find((c: any[]) => String(c[0]).includes('INSERT INTO public.advertiser_application'));
      expect(insert[1]).toEqual([50, 'Asha', '255713000000', 'Mwanza', null]);
      await expect(svc.apply(50, '0713 000 000', { name: 'Asha' })).rejects.toThrow(ADVERTISER_MESSAGES.alreadyApplied);
      await expect(svc.apply(50, null, { name: 'A' })).rejects.toThrow(ADVERTISER_MESSAGES.badName);
    });

    it('an existing advertiser cannot apply', async () => {
      const { svc } = make((sql) => (sql.includes('SELECT id FROM public.advertiser WHERE "userId"') ? [{ id: 4 }] : []));
      await expect(svc.apply(50, '0713000000', { name: 'Asha' })).rejects.toThrow(ADVERTISER_MESSAGES.alreadyAdvertiser);
    });

    it('accept creates the advertiser for THAT user and gives the link; a decided application cannot be accepted again', async () => {
      process.env.FRONTEND_URL = 'https://kentexa.com';
      let decided = false;
      const { svc, db } = make((sql) => {
        if (sql.includes("SET status = 'accepted'")) { if (decided) return []; decided = true; return [{ id: 3, userId: 50, name: 'Asha', phone: '255713000000' }]; }
        if (sql.includes('SELECT id FROM public.advertiser WHERE phone')) return [];
        if (sql.includes('INSERT INTO public.advertiser (')) return [{ id: 11, code: 'KABC123' }];
        return [];
      });
      await expect(svc.accept(3)).resolves.toMatchObject({ id: 11, link: 'https://kentexa.com/?ref=KABC123', userLinked: true });
      const insert = db.query.mock.calls.find((c: any[]) => String(c[0]).includes('INSERT INTO public.advertiser ('));
      expect(insert[1][0]).toBe(50);
      expect(db.query.mock.calls.some((c: any[]) => String(c[0]).includes('SET "advertiserId" = $2'))).toBe(true);
      await expect(svc.accept(3)).rejects.toThrow(ADVERTISER_MESSAGES.appNotFound);
    });

    it('if creating the advertiser fails, the application goes back to pending', async () => {
      const { svc, db } = make((sql) => {
        if (sql.includes("SET status = 'accepted'")) return [{ id: 3, userId: 50, name: 'Asha', phone: '255713000000' }];
        if (sql.includes('SELECT id FROM public.advertiser WHERE phone')) return [{ id: 2 }];
        return [];
      });
      await expect(svc.accept(3)).rejects.toThrow(ADVERTISER_MESSAGES.taken);
      expect(db.query.mock.calls.some((c: any[]) => String(c[0]).includes("SET status = 'pending'"))).toBe(true);
    });

    it('reject needs a reason', async () => {
      const { svc } = make((sql) => (sql.includes("SET status = 'rejected'") ? [{ id: 3, status: 'rejected', reason: 'Hakuna eneo' }] : []));
      await expect(svc.reject(3, '')).rejects.toThrow(ADVERTISER_MESSAGES.badReason);
      await expect(svc.reject(3, 'Hakuna eneo')).resolves.toMatchObject({ status: 'rejected', reason: 'Hakuna eneo' });
    });
  });
});
