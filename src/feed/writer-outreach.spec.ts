import { readFileSync } from 'fs';
import { join } from 'path';
import { inviteHtml, leftToday, normEmail, outreachEnabled, startOfEatDay, validEmail, cleanUrl, unsubscribePage } from './writer-outreach-rules';
import { WriterOutreachService } from './writer-outreach.service';

const make = (rows: Record<string, any[]> = {}, mailOk = true) => {
  const calls: Array<{ sql: string; params: any[] }> = [];
  const db = { query: jest.fn(async (sql: string, params: any[] = []) => {
    calls.push({ sql, params });
    if (sql.includes('to_regclass')) return [{ ok: true }];
    for (const k of Object.keys(rows)) if (sql.includes(k)) return rows[k];
    return [];
  }) };
  const mail = { sendWriterInvite: jest.fn(async () => mailOk) };
  return { svc: new WriterOutreachService(db as any, mail as any, { record: jest.fn() } as any), calls, mail };
};

describe('Writers programme (#417 B): rules', () => {
  const env = process.env.WRITER_OUTREACH_ENABLED;
  afterEach(() => { process.env.WRITER_OUTREACH_ENABLED = env; });

  it('the switch is off unless set to true', () => {
    expect(outreachEnabled({} as any)).toBe(false);
    expect(outreachEnabled({ WRITER_OUTREACH_ENABLED: 'yes' } as any)).toBe(false);
    expect(outreachEnabled({ WRITER_OUTREACH_ENABLED: 'TRUE' } as any)).toBe(true);
  });

  it('emails and links are checked', () => {
    expect(normEmail('  Asha@Mail.COM ')).toBe('asha@mail.com');
    expect(validEmail('asha@mail.com')).toBe(true);
    expect(validEmail('asha@mail')).toBe(false);
    expect(validEmail('a <b>@x.com')).toBe(false);
    expect(cleanUrl('javascript:alert(1)')).toBe('');
    expect(cleanUrl('https://blog.example/post')).toBe('https://blog.example/post');
  });

  it('at most 50 a day, counted from midnight in Dar es Salaam', () => {
    expect(leftToday(0)).toBe(50);
    expect(leftToday(49)).toBe(1);
    expect(leftToday(80)).toBe(0);
    expect(startOfEatDay(new Date('2026-11-18T22:30:00Z')).toISOString()).toBe('2026-11-18T21:00:00.000Z');
    expect(startOfEatDay(new Date('2026-11-18T20:59:00Z')).toISOString()).toBe('2026-11-17T21:00:00.000Z');
  });

  it('the invitation is personal, honest and has unsubscribe and contact', () => {
    const html = inviteHtml({ name: 'Asha <script>', topic: 'fedha binafsi' }, { frontend: 'https://kentexa.com', joinUrl: 'https://kentexa.com/waandishi/?ref=ab', unsubscribeUrl: 'https://api/u?t=ab', contactEmail: 'info@kentexa.com' });
    expect(html).toContain('Habari Asha');
    expect(html).not.toContain('<script>');
    expect(html).toContain('fedha binafsi');
    expect(html).toContain('hatulipi');
    expect(html).toContain('https://api/u?t=ab');
    expect(html).toContain('info@kentexa.com');
    expect(html).not.toMatch(/verified|imethibitishwa/i);
    expect(unsubscribePage('ask', 'x')).toContain('method="post"');
  });
});

describe('Writers programme (#417 B): sending', () => {
  const env = process.env.WRITER_OUTREACH_ENABLED;
  afterEach(() => { process.env.WRITER_OUTREACH_ENABLED = env; });

  it('nothing is sent while the switch is off', async () => {
    delete process.env.WRITER_OUTREACH_ENABLED;
    const { svc, mail } = make();
    await expect(svc.send(1, [1])).rejects.toThrow('WRITER_OUTREACH_ENABLED');
    expect(mail.sendWriterInvite).not.toHaveBeenCalled();
  });

  it('only approved, not yet sent rows are claimed and sent; the daily cap holds', async () => {
    process.env.WRITER_OUTREACH_ENABLED = 'true';
    const { svc, mail, calls } = make({
      'COUNT(*)::int AS n FROM public.writer_prospect WHERE "sentAt"': [{ n: 49 }],
      "SET status = 'sent'": [{ id: 7, name: 'Asha', email: 'a@x.com', topic: null, token: 'ab'.repeat(10) }],
    });
    const out = await svc.send(1, [7, 8]);
    expect(out.sent).toBe(1);
    expect(out.skipped).toBe(1);
    expect(mail.sendWriterInvite).toHaveBeenCalledTimes(1);
    const claim = calls.find((c) => c.sql.includes("SET status = 'sent'"))!.sql;
    expect(claim).toContain(`status = 'approved' AND "sentAt" IS NULL`);
  });

  it('an address that asked to stop is never sent to', async () => {
    process.env.WRITER_OUTREACH_ENABLED = 'true';
    const { svc, mail } = make({
      "SET status = 'sent'": [{ id: 7, name: 'Asha', email: 'a@x.com', topic: null, token: 'ab'.repeat(10) }],
      'FROM public.email_suppression': [{ '?column?': 1 }],
    });
    const out = await svc.send(1, [7]);
    expect(out.sent).toBe(0);
    expect(mail.sendWriterInvite).not.toHaveBeenCalled();
  });

  it('adding refuses suppressed, duplicate and existing users', async () => {
    await expect(make({ 'FROM public.email_suppression': [{ x: 1 }] }).svc.add(1, { name: 'A', email: 'a@x.com' })).rejects.toThrow('aliomba');
    await expect(make({ 'FROM public.writer_prospect WHERE email': [{ id: 1 }] }).svc.add(1, { name: 'A', email: 'a@x.com' })).rejects.toThrow('tayari');
    await expect(make({ 'FROM public."user" WHERE lower(email)': [{ id: 3 }] }).svc.add(1, { name: 'A', email: 'a@x.com' })).rejects.toThrow('akaunti');
    await expect(make().svc.add(1, { name: 'A', email: 'bad' })).rejects.toThrow('si sahihi');
  });

  it('unsubscribe adds the address to the stop list; a bad token reveals nothing', async () => {
    const { svc, calls } = make({ 'WHERE token = $1': [{ id: 7, email: 'a@x.com' }] });
    expect(await svc.unsubscribe('nope')).toEqual({ ok: true });
    await svc.unsubscribe('ab'.repeat(10));
    expect(calls.some((c) => c.sql.includes('INSERT INTO public.email_suppression'))).toBe(true);
  });
});

describe('Writers programme (#417 B): routes and migration', () => {
  it('invitation and label routes are admin only', () => {
    const ctl = readFileSync(join(__dirname, 'writer-outreach.controller.ts'), 'utf8');
    for (const route of ["@Get('admin/summary')", "@Post('admin')", "@Post('admin/send')", "@Post('admin/founding')", "@Get('admin/:id/preview')"]) {
      const line = ctl.split('\n').find((l) => l.includes(route))!;
      expect(line).toContain('@Roles(UserRole.ADMIN)');
    }
  });

  it('the migration is additive', () => {
    const mig = readFileSync(join(__dirname, '../database/migrations/1797500000000-AddWriterOutreach.ts'), 'utf8');
    expect(mig.slice(0, mig.indexOf('public async down'))).not.toMatch(/\bDROP\b|DELETE FROM|\bUPDATE\b/);
    const pin = Number((readFileSync(join(__dirname, '../../package.json'), 'utf8').match(/MIGRATION_RUN_UPTO=(\d+)/) || [])[1]);
    expect(pin).toBeGreaterThanOrEqual(1797500000000);
  });

  it('before the migration nothing breaks', async () => {
    const svc = new WriterOutreachService({ query: async () => [{ ok: false }] } as any);
    expect(await svc.list()).toEqual([]);
    expect(await svc.founding(3)).toEqual({ founding: false });
    expect((await svc.summary()).ready).toBe(false);
  });
});
