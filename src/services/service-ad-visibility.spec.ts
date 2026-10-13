import { readFileSync } from 'fs';
import { join } from 'path';
import { ServicesController } from './services.controller';
import {
  PUBLIC_SERVICE_AD, SERVICE_AD_RULE_START, SERVICE_POST_MESSAGES,
  assertServicePosterIdSent, publicServiceAdWhere, waitingForPosterId,
} from './service-ad-visibility';

// Decision S1 (owner 2026-10-13): posting a service ad needs the ID sent; a new
// ad stays hidden from customers until the poster's ID is verified, then shows
// by itself; ads from before the rule start stay visible. Classifieds untouched.
describe('service ads and the poster ID (S1)', () => {
  const verification = (status: string | null) => ({
    requireFeature: jest.fn(async () => undefined),
    getIdentityProfile: jest.fn(async () => (status ? { status } : null)),
  });

  it('posting: no ID or a rejected ID is refused; waiting or verified may post', async () => {
    await expect(assertServicePosterIdSent(verification(null), 6)).rejects.toThrow(SERVICE_POST_MESSAGES.identityFirst);
    await expect(assertServicePosterIdSent(verification('not_submitted'), 6)).rejects.toThrow(SERVICE_POST_MESSAGES.identityFirst);
    await expect(assertServicePosterIdSent(verification('rejected'), 6)).rejects.toThrow(SERVICE_POST_MESSAGES.identityRejected);
    await expect(assertServicePosterIdSent(verification('pending'), 6)).resolves.toBe('pending');
    await expect(assertServicePosterIdSent(verification('verified'), 6)).resolves.toBe('verified');
  });

  it('a waiting poster\'s new ad is posted without a Moment and marked waiting; a verified one gets its Moment', async () => {
    const after = new Date(new Date(SERVICE_AD_RULE_START).getTime() + 3600_000);
    for (const [status, moment, waiting] of [['pending', false, true], ['verified', true, false]] as const) {
      const svc: any = { createAd: jest.fn(async () => ({ id: 4, createdAt: after })) };
      const c = new ServicesController(svc, {} as any, verification(status) as any);
      const res: any = await c.createAd({ user: { id: 6 } }, { title: 't' } as any);
      expect(svc.createAd).toHaveBeenCalledWith({ id: 6 }, { title: 't' }, { shareAsMoment: moment });
      expect(res.waitingForId).toBe(waiting);
    }
  });

  it('nothing is created when the ID was never sent', async () => {
    const svc: any = { createAd: jest.fn() };
    const c = new ServicesController(svc, {} as any, verification(null) as any);
    await expect(c.createAd({ user: { id: 6 } }, {} as any)).rejects.toThrow(SERVICE_POST_MESSAGES.identityFirst);
    expect(svc.createAd).not.toHaveBeenCalled();
  });

  it('"waiting" only for ads from the rule start on, and only until the ID is verified', () => {
    const before = new Date(new Date(SERVICE_AD_RULE_START).getTime() - 1);
    const after = new Date(SERVICE_AD_RULE_START);
    expect(waitingForPosterId({ createdAt: before }, 'pending')).toBe(false);   // live today: stays visible
    expect(waitingForPosterId({ createdAt: after }, 'pending')).toBe(true);
    expect(waitingForPosterId({ createdAt: after }, 'verified')).toBe(false);   // verified: shows by itself
  });

  it('the public condition: before the rule start OR the poster is verified (a live check, no stored flag)', () => {
    expect(PUBLIC_SERVICE_AD('s')).toBe(`(s."createdAt" < '${SERVICE_AD_RULE_START}' OR EXISTS (SELECT 1 FROM public.identity_profile sip WHERE sip."userId" = s."providerId" AND sip.status::text = 'verified'))`);
    const [old, verifiedOnes] = publicServiceAdWhere({ status: 'active', providerId: 6 }) as any[];
    expect(old.createdAt.value).toEqual(new Date(SERVICE_AD_RULE_START));
    expect(verifiedOnes.providerId.getSql('a."providerId"')).toBe(
      `a."providerId" = 6 AND a."providerId" IN (SELECT sip."userId" FROM public.identity_profile sip WHERE sip.status::text = 'verified')`);
  });

  it('every public service-ad read uses the rule (feeds, browse, search, detail, booking)', () => {
    const src = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
    const count = (s: string, needle: string) => s.split(needle).length - 1;
    expect(count(src('services/services.service.ts'), 'publicServiceAdWhere({')).toBe(7);
    expect(count(src('services/services.service.ts'), "PUBLIC_SERVICE_AD('a')")).toBe(2);   // browse + search
    expect(count(src('feed/feed.service.ts'), "PUBLIC_SERVICE_AD('s')")).toBe(3);
    expect(count(src('feed/cvs.service.ts'), 'PUBLIC_SERVICE_AD(')).toBe(3);
    expect(count(src('search/search.controller.ts'), 'publicServiceAdWhere({')).toBe(1);
  });
});
