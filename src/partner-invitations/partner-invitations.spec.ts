import 'reflect-metadata';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { ForbiddenException, GoneException, ConflictException, NotFoundException } from '@nestjs/common';
import { PartnerInvitationsService } from './partner-invitations.service';
import { PartnerInvitationsModule } from './partner-invitations.module';
import {
  PartnerInvitationRole, PartnerInvitationStatus,
} from './partner-invitation.entity';
import { checkPartnerInviteToken, PARTNER_INVITE_LIFETIME_DAYS } from './partner-invitation-link';
import { SmsService } from '../sms/sms.service';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { SuperAgentStatus } from '../super-agents/entities/super-agent.entity';
import { ProviderStatus } from '../transport/entities/transport-provider.entity';
import { TransportController } from '../transport/transport.controller';
import { SuperAgentsController } from '../super-agents/super-agents.controller';

const SECRET = 'test-secret-partner-invite';
const DAY = 24 * 60 * 60 * 1000;

// ── A tiny in-memory repository (enough of TypeORM's surface for this service) ──
const isIn = (v: any) => v && typeof v === 'object' && v._type === 'in';
const matches = (row: any, where: any) => Object.entries(where || {}).every(([k, v]) =>
  isIn(v) ? (v as any)._value.includes(row[k]) : row[k] === v);

function fakeRepo<T extends { id?: number }>(rows: T[], relations: Record<string, (row: any) => any> = {}) {
  let nextId = rows.reduce((m, r: any) => Math.max(m, r.id || 0), 0) + 1;
  const withRelations = (row: any, rel?: any) => {
    if (!row) return null;
    const out = { ...row };
    Object.keys(rel || {}).forEach((k) => { if (relations[k]) out[k] = relations[k](row); });
    return out;
  };
  return {
    rows,
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn(async (data: any) => {
      if (!data.id) { data.id = nextId++; data.createdAt = data.createdAt || new Date(); rows.push({ ...data }); }
      else Object.assign(rows.find((r: any) => r.id === data.id)!, data);
      return data;
    }),
    update: jest.fn(async (where: any, patch: any) => {
      rows.filter((r) => matches(r, where)).forEach((r) => Object.assign(r, patch));
      return { affected: 1 };
    }),
    findOne: jest.fn(async ({ where, relations: rel }: any) => withRelations(rows.find((r) => matches(r, where)), rel)),
    find: jest.fn(async ({ where }: any) => rows.filter((r) => matches(r, where)).map((r) => ({ ...r }))),
  };
}

function setup() {
  const offices = [
    { id: 10, userId: 1, status: SuperAgentStatus.ACTIVE, businessName: 'Ofisi ya Ubungo', city: 'Dar es Salaam', workspaceId: null },
    { id: 11, userId: 2, status: SuperAgentStatus.PENDING, businessName: 'Ofisi Mpya', city: 'Mwanza', workspaceId: null },
    { id: 12, userId: 3, status: SuperAgentStatus.ACTIVE, businessName: 'Ofisi ya Arusha', city: 'Arusha', workspaceId: null },
  ];
  const parcels = [
    { id: 100, waybillNumber: 'KTX4829103755', originCity: 'Dar es Salaam', destinationCity: 'Mwanza', weightKg: 12,
      buyerPhone: '255700000999', recipientName: 'Siri', superAgentId: 10, destinationSuperAgentId: 12, status: 'pending' },
    { id: 101, waybillNumber: 'KTX1111111116', originCity: 'Arusha', destinationCity: 'Moshi', weightKg: 3,
      superAgentId: 12, destinationSuperAgentId: null, status: 'pending' },
    { id: 102, waybillNumber: null, originCity: 'Dar es Salaam', destinationCity: 'Dodoma', superAgentId: 10, destinationSuperAgentId: null },
  ];
  const providers: any[] = [];
  const invitations: any[] = [];
  const officeRepo = fakeRepo(offices as any[]);
  const byId = (id: number | null) => offices.find((o) => o.id === id) || null;
  const parcelRepo = fakeRepo(parcels as any[], {
    superAgent: (p) => byId(p.superAgentId), destinationSuperAgent: (p) => byId(p.destinationSuperAgentId),
  });
  const providerRepo = fakeRepo(providers);
  const invitationRepo = fakeRepo(invitations, {
    invitedBySuperAgent: (r) => byId(r.invitedBySuperAgentId),
    parcel: (r) => parcels.find((p) => p.id === r.parcelId),
  });
  const service = new PartnerInvitationsService(invitationRepo as any, officeRepo as any, parcelRepo as any, providerRepo as any);
  return { service, offices, parcels, providers, invitations, officeRepo, parcelRepo, providerRepo, invitationRepo };
}

const saCtx = (userId: number, profileId: number) => ({ roleType: AccountRoleType.SUPER_AGENT, userId, profileId, workspaceId: null } as any);
const dto = (over: any = {}) => ({ parcelId: 100, phone: '0712 345 678', name: 'Juma', role: 'transport_provider', channel: 'whatsapp', ...over });
const tokenOf = (link: string) => new URL(link).searchParams.get('partnerInvite')!;

describe('Partner invitations', () => {
  const saved = process.env.JWT_SECRET;
  let smsSpy: jest.SpyInstance;
  beforeAll(() => { process.env.JWT_SECRET = SECRET; });
  afterAll(() => { if (saved !== undefined) process.env.JWT_SECRET = saved; else delete process.env.JWT_SECRET; });
  beforeEach(() => { smsSpy = jest.spyOn(SmsService.prototype as any, 'sendSms').mockResolvedValue(true as any); });
  afterEach(() => { smsSpy.mockRestore(); jest.useRealTimers(); });

  describe('creation: an active Super Agent only', () => {
    it('an active office creates it; the row and the links carry the waybill and the phone', async () => {
      const { service, invitations } = setup();
      const res = await service.create({ id: 1 } as any, saCtx(1, 10), dto());
      expect(invitations).toHaveLength(1);
      expect(invitations[0]).toEqual(expect.objectContaining({
        invitedBySuperAgentId: 10, invitedByUserId: 1, parcelId: 100, waybillNumber: 'KTX4829103755',
        invitedPhone: '255712345678', roleOffered: 'transport_provider', channel: 'whatsapp', status: 'sent',
      }));
      expect(invitations[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(invitations[0])).not.toContain(tokenOf(res.link)); // the link is never stored
      expect(res.whatsappUrl).toMatch(/^https:\/\/wa\.me\/255712345678\?text=/);
      expect(res.smsUrl).toMatch(/^sms:\+255712345678\?body=/);
      expect(res.message).toContain('Ofisi ya Ubungo');
      expect(res.message).toContain('KTX4829103755');
    });

    it('refuses a pending office, another role, or a role context that is not the caller', async () => {
      const { service, invitations } = setup();
      await expect(service.create({ id: 2 } as any, saCtx(2, 11), dto())).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.create({ id: 1 } as any, { ...saCtx(1, 10), roleType: AccountRoleType.TRANSPORT_PROVIDER }, dto()))
        .rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.create({ id: 1 } as any, undefined, dto())).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.create({ id: 9 } as any, saCtx(1, 10), dto())).rejects.toBeInstanceOf(ForbiddenException);
      expect(invitations).toHaveLength(0);
    });

    it('transport and hubs only (no street agents yet), and a valid phone', async () => {
      const { service } = setup();
      await expect(service.create({ id: 1 } as any, saCtx(1, 10), dto({ role: 'agent' }))).rejects.toThrow('Chagua msafirishaji au ofisi');
      await expect(service.create({ id: 1 } as any, saCtx(1, 10), dto({ phone: '123' }))).rejects.toThrow('namba sahihi');
      await expect(service.create({ id: 1 } as any, saCtx(1, 10), dto({ channel: 'kentexa_sms' }))).rejects.toThrow('WhatsApp au SMS');
      await expect(service.create({ id: 1 } as any, saCtx(1, 10), dto({ role: 'super_agent' }))).resolves.toBeTruthy();
    });
  });

  describe('only the invited number can accept', () => {
    it('another phone number is refused and does not claim the invitation', async () => {
      const { service, invitations } = setup();
      const { link } = await service.create({ id: 1 } as any, saCtx(1, 10), dto());
      await expect(service.accept({ id: 77, phone: '255799999999' } as any, tokenOf(link))).rejects.toThrow('namba nyingine');
      await expect(service.accept({ id: 78 } as any, tokenOf(link))).rejects.toBeInstanceOf(ForbiddenException); // no phone
      expect(invitations[0].joinedUserId ?? null).toBeNull();
      // the invited number, typed any way, still works afterwards
      await expect(service.accept({ id: 50, phone: '0712 345 678' } as any, tokenOf(link))).resolves.toEqual(expect.objectContaining({ next: 'apply' }));
    });
  });

  describe('training offices practise on test numbers only', () => {
    const training = (s: ReturnType<typeof setup>) => Object.assign(s.offices[0], { isTrainingOffice: true, phone: '0711000010' });
    const savedList = process.env.PARTNER_INVITE_TEST_PHONES;
    afterEach(() => { if (savedList !== undefined) process.env.PARTNER_INVITE_TEST_PHONES = savedList; else delete process.env.PARTNER_INVITE_TEST_PHONES; });

    it('a real partner\'s number is refused', async () => {
      delete process.env.PARTNER_INVITE_TEST_PHONES;
      const s = setup(); training(s);
      await expect(s.service.create({ id: 1, phone: '255744000001' } as any, saCtx(1, 10), dto())).rejects.toThrow('namba za majaribio');
      expect(s.invitations).toHaveLength(0);
    });

    it('the office phone, the sender\'s own phone, and listed test numbers are allowed', async () => {
      process.env.PARTNER_INVITE_TEST_PHONES = '0755 000 111, 255755000222';
      const s = setup(); training(s);
      const me = { id: 1, phone: '255744000001' } as any;
      for (const phone of ['0711000010', '0744000001', '0755000111', '255755000222']) {
        await expect(s.service.create(me, saCtx(1, 10), dto({ phone }))).resolves.toBeTruthy();
      }
      expect(s.invitations).toHaveLength(4);
    });

    it('a normal office may invite any valid number', async () => {
      delete process.env.PARTNER_INVITE_TEST_PHONES;
      const s = setup();
      await expect(s.service.create({ id: 1 } as any, saCtx(1, 10), dto({ phone: '0788123456' }))).resolves.toBeTruthy();
    });
  });

  describe('the parcel must belong to that office', () => {
    it('another office\'s parcel is refused', async () => {
      const { service, invitations } = setup();
      await expect(service.create({ id: 1 } as any, saCtx(1, 10), dto({ parcelId: 101 }))).rejects.toThrow('si wa ofisi yako');
      expect(invitations).toHaveLength(0);
    });

    it('the destination hub may invite for that parcel too; lookup by typed waybill works', async () => {
      const { service } = setup();
      const res = await service.create({ id: 3 } as any, saCtx(3, 12), dto({ parcelId: undefined, waybill: 'ktx 4829 1037 55' }));
      expect(res.invitation.parcelId).toBe(100);
    });

    it('a parcel without a waybill, or an unknown one, is refused', async () => {
      const { service } = setup();
      await expect(service.create({ id: 1 } as any, saCtx(1, 10), dto({ parcelId: 102 }))).rejects.toBeInstanceOf(ConflictException);
      await expect(service.create({ id: 1 } as any, saCtx(1, 10), dto({ parcelId: 999 }))).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('the invite code never calls the KenteXa SMS service', () => {
    it('no SMS through the whole flow: create, view, accept, apply, confirm', async () => {
      const { service, providers } = setup();
      const { link, invitation } = await service.create({ id: 1 } as any, saCtx(1, 10), dto());
      await service.publicView(tokenOf(link));
      await service.accept({ id: 50, phone: '255712345678' } as any, tokenOf(link));
      providers.push({ id: 7, userId: 50, status: ProviderStatus.PENDING });
      await service.onApplicationSubmitted(50, PartnerInvitationRole.TRANSPORT_PROVIDER, 7);
      await service.confirm({ id: 1 } as any, saCtx(1, 10), invitation.id);
      expect(smsSpy).not.toHaveBeenCalled();
    });

    it('the service cannot reach it: no SmsService dependency, no sms import anywhere in the module', () => {
      const params: any[] = Reflect.getMetadata('design:paramtypes', PartnerInvitationsService) || [];
      expect(params).not.toContain(SmsService);
      const providers: any[] = Reflect.getMetadata('providers', PartnerInvitationsModule) || [];
      const imports: any[] = Reflect.getMetadata('imports', PartnerInvitationsModule) || [];
      expect(providers).not.toContain(SmsService);
      expect(imports.map((m) => m?.name)).not.toContain('SmsModule');
      for (const f of readdirSync(__dirname).filter((n) => n.endsWith('.ts') && !n.endsWith('.spec.ts'))) {
        expect(readFileSync(join(__dirname, f), 'utf8')).not.toMatch(/from '\.\.\/sms\//);
      }
    });
  });

  describe('the link expires after 7 days', () => {
    it('expiresAt is exactly 7 days after creation, and the signed token says the same', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-21T08:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
      const { service, invitations } = setup();
      const { link } = await service.create({ id: 1 } as any, saCtx(1, 10), dto());
      expect(PARTNER_INVITE_LIFETIME_DAYS).toBe(7);
      expect(new Date(invitations[0].expiresAt).toISOString()).toBe('2026-10-28T08:00:00.000Z');
      const at = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
      expect(checkPartnerInviteToken(tokenOf(link), SECRET, at('2026-10-28T07:59:59Z'))).toBe('valid');
      expect(checkPartnerInviteToken(tokenOf(link), SECRET, at('2026-10-28T08:00:00Z'))).toBe('expired');
      expect(checkPartnerInviteToken(tokenOf(link), 'another-secret')).toBe('invalid');
      expect(checkPartnerInviteToken(tokenOf(link) + 'x', SECRET)).toBe('invalid');
    });

    it('opening it on day 6 works; on day 7 it is refused (410) and the invitation becomes expired', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-21T08:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
      const { service, invitations } = setup();
      const { link } = await service.create({ id: 1 } as any, saCtx(1, 10), dto());
      jest.setSystemTime(new Date(Date.now() + 6 * DAY));
      expect((await service.publicView(tokenOf(link))).status).toBe('opened');
      jest.setSystemTime(new Date(new Date('2026-10-21T08:00:00Z').getTime() + 7 * DAY));
      await expect(service.publicView(tokenOf(link))).rejects.toBeInstanceOf(GoneException);
      await expect(service.accept({ id: 50, phone: '255712345678' } as any, tokenOf(link))).rejects.toBeInstanceOf(GoneException);
      expect(invitations[0].status).toBe(PartnerInvitationStatus.EXPIRED);
    });

    it('the office list shows an unanswered invitation as expired after 7 days', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-21T08:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
      const { service } = setup();
      await service.create({ id: 1 } as any, saCtx(1, 10), dto());
      jest.setSystemTime(new Date(Date.now() + 7 * DAY + 1000));
      const [row] = await service.listMine({ id: 1 } as any, saCtx(1, 10));
      expect(row.status).toBe('expired');
    });

    it('an expired invitee cannot join through a later application', async () => {
      jest.useFakeTimers({ now: new Date('2026-10-21T08:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] });
      const { service, invitations } = setup();
      const { link } = await service.create({ id: 1 } as any, saCtx(1, 10), dto());
      await service.accept({ id: 50, phone: '255712345678' } as any, tokenOf(link));
      jest.setSystemTime(new Date(Date.now() + 8 * DAY));
      expect(await service.onApplicationSubmitted(50, PartnerInvitationRole.TRANSPORT_PROVIDER, 7)).toBe(0);
      expect(invitations[0].status).toBe('expired');
    });
  });

  describe('joining does not give approval or assign a waybill', () => {
    it('accept → apply → joined → confirmed changes only the invitation', async () => {
      const { service, invitations, providers, parcels, offices, providerRepo, parcelRepo, officeRepo } = setup();
      const parcelsBefore = JSON.parse(JSON.stringify(parcels));
      const officesBefore = JSON.parse(JSON.stringify(offices));
      const { link, invitation } = await service.create({ id: 1 } as any, saCtx(1, 10), dto());

      // The public page shows the waybill summary only, never the recipient.
      const view = await service.publicView(tokenOf(link));
      expect(view.waybill).toEqual({ waybillNumber: 'KTX4829103755', originCity: 'Dar es Salaam', destinationCity: 'Mwanza', weightKg: 12 });
      expect(JSON.stringify(view)).not.toMatch(/255700000999|Siri/);

      expect(await service.accept({ id: 50, phone: '255712345678' } as any, tokenOf(link))).toEqual(expect.objectContaining({ next: 'apply' }));
      expect(invitations[0].status).toBe('opened');

      // The normal application is saved elsewhere (TransportService.register), pending.
      providers.push({ id: 7, userId: 50, status: ProviderStatus.PENDING });
      expect(await service.onApplicationSubmitted(50, PartnerInvitationRole.TRANSPORT_PROVIDER, 7)).toBe(1);
      expect(invitations[0]).toEqual(expect.objectContaining({ status: 'joined', joinedUserId: 50, joinedApplicationId: 7 }));
      expect(invitations[0].joinedAt).toBeInstanceOf(Date);

      await service.confirm({ id: 1 } as any, saCtx(1, 10), invitation.id);
      expect(invitations[0].status).toBe('confirmed');

      // Nothing else moved: the application is still pending, the parcel untouched.
      expect(providers[0].status).toBe(ProviderStatus.PENDING);
      expect(parcels).toEqual(parcelsBefore);
      expect(offices).toEqual(officesBefore);
      for (const repo of [providerRepo, parcelRepo, officeRepo]) {
        expect(repo.save).not.toHaveBeenCalled();
        expect(repo.update).not.toHaveBeenCalled();
      }
    });

    it('someone who already applied counts as joined on accept, still unapproved', async () => {
      const { service, invitations, offices } = setup();
      const { link } = await service.create({ id: 1 } as any, saCtx(1, 10), dto({ role: 'super_agent' }));
      offices.push({ id: 13, userId: 60, status: SuperAgentStatus.PENDING, businessName: 'Ofisi ya Juma', city: 'Mwanza', workspaceId: null });
      expect(await service.accept({ id: 60, phone: '+255 712 345 678' } as any, tokenOf(link))).toEqual(expect.objectContaining({ status: 'joined', next: 'done' }));
      expect(invitations[0].joinedApplicationId).toBe(13);
      expect(offices.find((o) => o.id === 13)!.status).toBe(SuperAgentStatus.PENDING);
    });

    it('confirm needs joined first; a link accepted by one account cannot be taken by another', async () => {
      const { service } = setup();
      const { link, invitation } = await service.create({ id: 1 } as any, saCtx(1, 10), dto());
      await expect(service.confirm({ id: 1 } as any, saCtx(1, 10), invitation.id)).rejects.toThrow('bado hajatuma ombi');
      await service.accept({ id: 50, phone: '255712345678' } as any, tokenOf(link));
      await expect(service.accept({ id: 51, phone: '0712345678' } as any, tokenOf(link))).rejects.toThrow('akaunti nyingine');
      // another office cannot confirm it
      await expect(service.confirm({ id: 3 } as any, saCtx(3, 12), invitation.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('applying for the other role does not mark the invitation joined', async () => {
      const { service, invitations } = setup();
      const { link } = await service.create({ id: 1 } as any, saCtx(1, 10), dto());
      await service.accept({ id: 50, phone: '255712345678' } as any, tokenOf(link));
      expect(await service.onApplicationSubmitted(50, PartnerInvitationRole.SUPER_AGENT, 99)).toBe(0);
      expect(invitations[0].status).toBe('opened');
    });
  });

  describe('the application endpoints record "joined" without changing the application', () => {
    const invites = () => ({ onApplicationSubmitted: jest.fn(async () => 1) });

    it('POST /transport/register: joined after the application is saved; a failure never blocks it', async () => {
      const svc = { register: jest.fn(async () => ({ id: 7, status: ProviderStatus.PENDING })) };
      const verification = { getIdentityProfile: jest.fn(async () => ({ status: 'pending' })) };
      const pi = invites();
      const ctrl = new TransportController(svc as any, verification as any, {} as any, {} as any, {} as any, {} as any, pi as any);
      expect(await ctrl.register({ user: { id: 50 } }, { name: 'Basi' })).toEqual({ id: 7, status: ProviderStatus.PENDING });
      expect(pi.onApplicationSubmitted).toHaveBeenCalledWith(50, PartnerInvitationRole.TRANSPORT_PROVIDER, 7);

      pi.onApplicationSubmitted.mockRejectedValueOnce(new Error('db down'));
      await expect(ctrl.register({ user: { id: 50 } }, { name: 'Basi' })).resolves.toEqual(expect.objectContaining({ id: 7 }));
    });

    it('POST /super-agents/apply: joined after the application is saved', async () => {
      const service = { apply: jest.fn(async () => ({ id: 13, status: SuperAgentStatus.PENDING })) };
      const pi = invites();
      const ctrl = new SuperAgentsController(service as any, {} as any, {} as any, {} as any, pi as any);
      expect(await ctrl.apply({ user: { id: 60 } }, {})).toEqual({ id: 13, status: SuperAgentStatus.PENDING });
      expect(pi.onApplicationSubmitted).toHaveBeenCalledWith(60, PartnerInvitationRole.SUPER_AGENT, 13);
    });
  });
});

