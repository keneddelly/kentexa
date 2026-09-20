import { ConflictException, ForbiddenException } from '@nestjs/common';
import { FeedService } from './feed.service';
import { momentActorFields } from '../commerce-profiles/moment-actor';
import { CommerceProfileType } from '../commerce-profiles/entities/commerce-profile.entity';

const profile = (id: number, type: CommerceProfileType, displayName: string) =>
  ({ id, type, displayName, photoUrl: `${displayName}.png`, followersCount: 3, isVerified: false } as any);

describe('I2B — canonical Moment actor read model', () => {
  const bobPersonal = profile(1, CommerceProfileType.PERSONAL, 'Bob');
  const washingMachine = profile(2, CommerceProfileType.BUSINESS, 'Washing Machine TZ');
  const bobElectronics = profile(3, CommerceProfileType.BUSINESS, 'Bob Electronics');

  it('A. Personal Moment → Bob, explicit PERSONAL, exact profile id', () => {
    expect(momentActorFields(bobPersonal)).toMatchObject({ actorResolved: true, actorType: 'PERSONAL', commerceProfileId: 1, name: 'Bob' });
  });

  it('B. Business Moment → Washing Machine TZ, exact BUSINESS profile id', () => {
    expect(momentActorFields(washingMachine)).toMatchObject({ actorResolved: true, actorType: 'BUSINESS', commerceProfileId: 2, name: 'Washing Machine TZ' });
  });

  it('C. same owner, three identities stay distinct (Personal ≠ Washing Machine TZ ≠ Bob Electronics)', () => {
    const ids = [bobPersonal, washingMachine, bobElectronics].map((p) => momentActorFields(p).commerceProfileId);
    expect(new Set(ids).size).toBe(3);
    expect(momentActorFields(bobElectronics).name).toBe('Bob Electronics');
  });

  it('E. unstamped / missing profile is explicitly unresolved — never Personal or another Business', () => {
    for (const none of [null, undefined]) {
      const a = momentActorFields(none as any);
      expect(a).toEqual({ commerceProfileId: null, actorResolved: false, actorType: null });
      expect(a.name).toBeUndefined();
    }
  });
});

describe('I2B — Moment publish derives the actor from the server-resolved context', () => {
  const build = (authorized = true) => {
    const saved: any[] = [];
    const svc: any = Object.create(FeedService.prototype);
    svc.feedRepo = { create: (d: any) => d, save: async (d: any) => { saved.push(d); return { id: 9, ...d }; } };
    svc.profileScope = { isAuthorizedFor: jest.fn().mockResolvedValue(authorized) };
    svc.activityEvents = { record: jest.fn() };
    svc.logger = { warn: jest.fn() };
    svc.notifyFollowers = jest.fn().mockResolvedValue(undefined);
    svc.matchNeedToSellers = jest.fn().mockResolvedValue(undefined);
    return { svc: svc as FeedService, saved, scope: svc.profileScope };
  };
  const dto = { type: 'moment', title: 'Hello' } as any;
  const bizCtx = (commerceProfileId: number | null) => ({ identityType: 'BUSINESS', commerceProfileId, businessId: 10 }) as any;

  it('B. Business context stamps the exact Business profile even if the client sends nothing', async () => {
    const { svc, saved } = build();
    await svc.publish(1, dto, bizCtx(2));
    expect(saved[0].commerceProfileId).toBe(2);
  });

  it('D. capability switch inside one Business keeps the same actor (Seller ctx and Service ctx → same profile)', async () => {
    const { svc, saved } = build();
    await svc.publish(1, dto, { ...bizCtx(2), roleType: 'seller' });
    await svc.publish(1, dto, { ...bizCtx(2), roleType: 'service_provider' });
    expect(saved.map((s) => s.commerceProfileId)).toEqual([2, 2]);
  });

  it('C. a client id for a DIFFERENT owned Business is rejected in a Business context', async () => {
    const { svc, saved } = build();
    await expect(svc.publish(1, { ...dto, commerceProfileId: 3 }, bizCtx(2))).rejects.toBeInstanceOf(ForbiddenException);
    expect(saved).toHaveLength(0);
  });

  it('E. an unresolved Business identity fails explicitly — never saved as null/Personal', async () => {
    const { svc, saved } = build();
    await expect(svc.publish(1, dto, bizCtx(null))).rejects.toBeInstanceOf(ConflictException);
    expect(saved).toHaveLength(0);
  });

  const personalCtx = (commerceProfileId: number | null) => ({ identityType: 'PERSONAL', commerceProfileId }) as any;

  it('A. Personal context stamps the exact personal profile', async () => {
    const { svc, saved } = build();
    await svc.publish(1, dto, personalCtx(1));
    expect(saved[0].commerceProfileId).toBe(1);
    await svc.publish(1, { ...dto, commerceProfileId: 1 }, personalCtx(1));
    expect(saved[1].commerceProfileId).toBe(1);
  });

  it('C. Bob Personal cannot publish as Washing Machine TZ or Bob Electronics even though the account is authorized to manage them', async () => {
    const { svc, saved, scope } = build(true); // profileScope authorizes EVERY profile Bob manages
    for (const businessProfileId of [2, 3]) {
      await expect(svc.publish(1, { ...dto, commerceProfileId: businessProfileId }, personalCtx(1)))
        .rejects.toMatchObject({ response: { code: 'ACTOR_IDENTITY_MISMATCH' } });
    }
    expect(saved).toHaveLength(0);
    expect(scope.isAuthorizedFor).not.toHaveBeenCalled();
  });

  it('E. an unresolved Personal actor fails explicitly and cannot be client-overridden', async () => {
    const { svc, saved } = build(true);
    await expect(svc.publish(1, dto, personalCtx(null)))
      .rejects.toMatchObject({ response: { code: 'ACTOR_IDENTITY_UNRESOLVED' } });
    await expect(svc.publish(1, { ...dto, commerceProfileId: 2 }, personalCtx(null)))
      .rejects.toMatchObject({ response: { code: 'ACTOR_IDENTITY_UNRESOLVED' } });
    expect(saved).toHaveLength(0);
  });

  it('a Business context still cannot be client-overridden to Personal or another Business', async () => {
    const { svc, saved } = build(true);
    for (const other of [1, 3]) {
      await expect(svc.publish(1, { ...dto, commerceProfileId: other }, bizCtx(2)))
        .rejects.toMatchObject({ response: { code: 'ACTOR_IDENTITY_MISMATCH' } });
    }
    expect(saved).toHaveLength(0);
  });
});
