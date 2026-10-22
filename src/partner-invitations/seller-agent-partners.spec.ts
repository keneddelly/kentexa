import 'reflect-metadata';
import { BadRequestException, ForbiddenException, GoneException } from '@nestjs/common';
import {
  partnerGateSql, partnerPickupOfferSms, sellerPartnerFirstMinutes, setSellerPartnerTableReadyForTests,
} from './seller-agent-partner-gate';
import {
  buildSellerAgentInviteMessage, SELLER_AGENT_MESSAGES, SellerAgentPartnersService, sellerAgentInviteLink,
} from './seller-agent-partners.service';
import { checkPartnerInviteToken, hashPartnerInviteToken } from './partner-invitation-link';

const SECRET = 'test-secret-seller-agent';

describe('seller partner agents: partner-first gate', () => {
  afterEach(() => setSellerPartnerTableReadyForTests(false));

  it('changes nothing until the table exists, or when switched off', () => {
    setSellerPartnerTableReadyForTests(false);
    expect(partnerGateSql('a."userId"')).toBe('TRUE');
    setSellerPartnerTableReadyForTests(true);
    expect(partnerGateSql('a."userId"', 0)).toBe('TRUE');
  });

  it('once the table exists: open after the window, or with no partner, or for the partner himself', () => {
    setSellerPartnerTableReadyForTests(true);
    const sql = partnerGateSql('$3::int', 5);
    expect(sql).toContain('make_interval(mins => 5)');
    expect(sql).toContain('public.seller_agent_partner');
    expect(sql).toContain(`sap."agentUserId" = $3::int`);
    expect(sql).toContain(`pa.status = 'approved'`);          // only an approved agent holds a job back
    expect(sql).toContain(`'PICKUP_RELEASED'`);               // a partner who released it no longer holds it
  });

  it('first minutes: default 5, never above 30, 0 switches it off', () => {
    expect(sellerPartnerFirstMinutes({})).toBe(5);
    expect(sellerPartnerFirstMinutes({ SELLER_PARTNER_FIRST_MINUTES: '99' })).toBe(30);
    expect(sellerPartnerFirstMinutes({ SELLER_PARTNER_FIRST_MINUTES: '0' })).toBe(0);
    expect(sellerPartnerFirstMinutes({ SELLER_PARTNER_FIRST_MINUTES: 'x' })).toBe(5);
  });

  it("the partner's job SMS names the seller and stays one plain SMS", () => {
    const text = partnerPickupOfferSms('BIS 🔥', 'KTX 8822 3997 65', 'Kariakoo');
    expect(text).toBe('KenteXa: BIS ana kazi ya kuchukua mzigo KTX 8822 3997 65, eneo Kariakoo. Fungua KenteXa ukubali kazi.');
    expect(partnerPickupOfferSms('x'.repeat(200), 'KTX 8822 3997 65', 'y'.repeat(200)).length).toBeLessThanOrEqual(160);
  });
});

describe('seller partner agents: invitation', () => {
  const OLD = process.env.JWT_SECRET;
  beforeAll(() => { process.env.JWT_SECRET = SECRET; setSellerPartnerTableReadyForTests(true); });
  afterAll(() => { process.env.JWT_SECRET = OLD; setSellerPartnerTableReadyForTests(false); });

  /** A fake DataSource that keeps the seller_agent_partner rows in memory. */
  const make = () => {
    const rows: any[] = [];
    const db: any = {
      query: jest.fn(async (sql: string, p: any[] = []) => {
        if (/to_regclass/.test(sql)) return [{ ok: true }];
        if (/INSERT INTO public\.seller_agent_partner/.test(sql)) {
          const row = { id: rows.length + 1, sellerUserId: p[0], invitedByUserId: p[1], invitedPhone: p[2], invitedName: p[3],
            channel: p[4], tokenHash: p[5], status: 'sent', expiresAt: p[6], agentUserId: null };
          rows.push(row);
          return [{ id: row.id }];
        }
        if (/businessName/.test(sql)) return [{ name: 'BIS' }];
        if (/SELECT \* FROM public\.seller_agent_partner WHERE "tokenHash"/.test(sql)) return rows.filter((r) => r.tokenHash === p[0]);
        if (/SET status = 'opened'/.test(sql)) { rows.filter((r) => r.id === p[0] && r.status === 'sent').forEach((r) => { r.status = 'opened'; }); return []; }
        if (/WHERE "sellerUserId" = \$1 AND "agentUserId" = \$2 AND status = 'accepted'/.test(sql)) {
          return rows.filter((r) => r.sellerUserId === p[0] && r.agentUserId === p[1] && r.status === 'accepted');
        }
        if (/SET status = 'accepted'/.test(sql)) {
          rows.filter((r) => r.id === p[0] && ['sent', 'opened'].includes(r.status)).forEach((r) => { r.status = 'accepted'; r.agentUserId = p[1]; });
          return [];
        }
        if (/FROM public\.agent WHERE "userId"/.test(sql)) return p[0] === 50 ? [{ status: 'approved' }] : [];
        return [];
      }),
    };
    return { rows, svc: new SellerAgentPartnersService(db) };
  };
  const tokenOf = (link: string) => new URL(link).searchParams.get('agentInvite')!;

  it("builds the seller's own WhatsApp/SMS message and link; KenteXa sends nothing", async () => {
    const { rows, svc } = make();
    const out = await svc.invite(7, { id: 7 } as any, { phone: '0712 345 678', name: 'Juma', channel: 'whatsapp' });
    expect(out.message).toMatch(/^Habari Juma, ni BIS kwenye KenteXa\. Ningependa uwe wakala wetu/);
    expect(out.whatsappUrl).toMatch(/^https:\/\/wa\.me\/255712345678\?text=/);
    expect(out.smsUrl).toMatch(/^sms:\+255712345678\?body=/);
    expect(checkPartnerInviteToken(tokenOf(out.link), SECRET)).toBe('valid');
    // Only the hash of the token is stored.
    expect(rows[0].tokenHash).toBe(hashPartnerInviteToken(tokenOf(out.link)));
    expect(JSON.stringify(rows[0])).not.toContain(tokenOf(out.link));
  });

  it('refuses a bad phone or channel', async () => {
    const { svc } = make();
    await expect(svc.invite(7, { id: 7 } as any, { phone: '123', channel: 'whatsapp' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.invite(7, { id: 7 } as any, { phone: '0712345678', channel: 'email' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only the invited number accepts; an approved agent is a partner at once, a new person is sent to apply', async () => {
    const { rows, svc } = make();
    const a = await svc.invite(7, { id: 7 } as any, { phone: '0712345678', channel: 'sms' });
    expect((await svc.publicView(tokenOf(a.link))).shopName).toBe('BIS');
    await expect(svc.accept({ id: 51, phone: '0799999999' } as any, tokenOf(a.link))).rejects.toBeInstanceOf(ForbiddenException);
    expect(await svc.accept({ id: 50, phone: '+255712345678' } as any, tokenOf(a.link))).toMatchObject({ status: 'accepted', next: 'done' });
    expect(rows[0]).toMatchObject({ status: 'accepted', agentUserId: 50 });

    const b = await svc.invite(7, { id: 7 } as any, { phone: '0713000000', channel: 'sms' });
    expect(await svc.accept({ id: 60, phone: '0713000000' } as any, tokenOf(b.link))).toMatchObject({ next: 'apply' });
  });

  it('an ended partnership link cannot be used again', async () => {
    const { rows, svc } = make();
    const a = await svc.invite(7, { id: 7 } as any, { phone: '0712345678', channel: 'sms' });
    rows[0].status = 'ended';
    await expect(svc.publicView(tokenOf(a.link))).rejects.toBeInstanceOf(GoneException);
  });

  it('the invite message and link', () => {
    expect(sellerAgentInviteLink('a.b', 'https://kentexa.com/')).toBe('https://kentexa.com/?agentInvite=a.b');
    expect(buildSellerAgentInviteMessage({ shopName: 'BIS', link: 'L' })).toMatch(/^Habari, ni BIS kwenye KenteXa\./);
    expect(SELLER_AGENT_MESSAGES.wrongPhone).toMatch(/namba nyingine/);
  });
});
