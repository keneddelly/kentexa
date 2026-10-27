import { AGENT_BASE_MESSAGES, readAgentBasePoint } from '../shipments/pickup-pin';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { VerificationService } from '../identity/verification.service';
import { IdentityVerificationStatus } from '../identity/entities/identity-profile.entity';
import { LocationIntelligenceService } from '../location-intelligence/location-intelligence.service';
import { AgentPickupReofferService } from './agent-pickup-reoffer.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Agent, AgentStatus } from './entities/agent.entity';
import {
  AgentTransaction,
  AgentTransactionStatus,
} from './entities/agent-transaction.entity';
import { User } from '../users/entities/user.entity';
import { SmsService } from '../sms/sms.service';
import { mergeActiveRole } from '../users/utils/merge-active-role.util';
import { CommerceProfilesService } from '../commerce-profiles/commerce-profiles.service';
import {
  CommerceProfileType,
  CommerceProfileStatus,
} from '../commerce-profiles/entities/commerce-profile.entity';
import { FRONTEND_URL } from '../config/urls.config';
import { ActivityEventService } from '../activity/activity-event.service';
import { ActivityCategory } from '../activity/entities/activity-event.entity';
import { RoleContextService } from '../role-context/role-context.service';
import {
  AccountRoleStatus,
  AccountRoleType,
  RoleProfileType,
} from '../role-context/entities/account-role.entity';
import { agentOnlineRequired } from './agent-online';

/** Vehicle types an agent can choose (step 3 of sign-up). */
// Any of these is a last-mile agent and may collect pay-on-delivery cash (owner 2026-10-27:
// "not only boda boda"). Kirikuu/van is 'van'.
export const AGENT_VEHICLE_TYPES = ['boda', 'bajaji', 'bicycle', 'car', 'van', 'truck', 'foot'] as const;

export const AGENT_SIGNUP_MESSAGES = {
  identityFirst: 'Thibitisha kitambulisho chako kwanza (Hatua 1).',
  identityRejected: 'Kitambulisho chako kilikataliwa. Kituma tena kwanza (Hatua 1).',
  noPhone: 'Akaunti yako haina namba ya simu. Weka namba kwenye akaunti kwanza.',
  noName: 'Akaunti yako haina jina. Weka jina kwenye akaunti kwanza.',
  placeRequired: 'Chagua mji unaofanyia kazi kutoka kwenye orodha (Hatua 2).',
  baseRequired: 'Weka kituo chako: bonyeza "📍 Weka kituo changu" ukiwa mahali unapoanzia kazi (Hatua 2).',
  vehicle: 'Chagua aina ya usafiri (Hatua 3).',
  weight: 'Andika uzito wa juu unaoweza kubeba, kilo 1 hadi 5000 (Hatua 3).',
  submitted: 'Ombi limewasilishwa. Tutawasiliana nawe haraka.',
  approveNeedsVerified: 'Kitambulisho cha wakala huyu bado hakijathibitishwa. Thibitisha kitambulisho kwanza.',
} as const;

@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(Agent) private agentRepo: Repository<Agent>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(AgentTransaction)
    private agentTransactionRepo: Repository<AgentTransaction>,
    private smsService: SmsService,
    private commerceProfiles: CommerceProfilesService,
    private activityEvents: ActivityEventService,
    private roleContextService: RoleContextService,
    // Agent sign-up reuses the account's identity and the place list.
    @Optional() private readonly verification?: VerificationService,
    @Optional() private readonly locations?: LocationIntelligenceService,
    // D5: waiting pickups near the base are offered when the agent goes online.
    @Optional() private readonly pickupReoffer?: AgentPickupReofferService,
  ) {}

  // ── Agent: register ────────────────────────────────────────────────────────

  /**
   * Agent sign-up, 3 short steps (owner 2026-10-13: "verify a person once,
   * reuse it everywhere"):
   *  1. who: name and phone come from the ACCOUNT; the identity comes from the
   *     account's identity record (sent in = may apply; approval needs verified).
   *     No ID number is typed again here.
   *  2. where: a city picked from the place list + the base point (GPS).
   *  3. what: vehicle type + maximum weight. No fees here (they come with pricing).
   */
  async register(
    user: User,
    dto: {
      place?: { providerKey?: string; providerPlaceId?: string };
      base?: { latitude?: unknown; longitude?: unknown; accuracyM?: unknown };
      agentType?: string;
      maxWeightKg?: number | string;
    },
  ) {
    const identity = this.verification ? await this.verification.getIdentityProfile(user.id) : null;
    if (identity?.status === IdentityVerificationStatus.REJECTED) throw new BadRequestException(AGENT_SIGNUP_MESSAGES.identityRejected);
    if (identity?.status !== IdentityVerificationStatus.PENDING && identity?.status !== IdentityVerificationStatus.VERIFIED) {
      throw new BadRequestException(AGENT_SIGNUP_MESSAGES.identityFirst);
    }
    const account = await this.userRepo.findOne({ where: { id: user.id } });
    const phone = String(account?.phone || '').trim();
    if (!phone) throw new BadRequestException(AGENT_SIGNUP_MESSAGES.noPhone);
    const fullName = String(identity.legalName || account?.name || '').trim().slice(0, 160);
    if (!fullName) throw new BadRequestException(AGENT_SIGNUP_MESSAGES.noName);

    const ref = dto?.place;
    const place = this.locations && typeof ref?.providerKey === 'string' && typeof ref?.providerPlaceId === 'string'
      ? await this.locations.resolve({ providerKey: ref.providerKey, providerPlaceId: ref.providerPlaceId }).catch(() => null)
      : null;
    const regionName = String(place?.regionName || '').trim();
    if (!regionName) throw new BadRequestException(AGENT_SIGNUP_MESSAGES.placeRequired);
    if (!dto?.base) throw new BadRequestException(AGENT_SIGNUP_MESSAGES.baseRequired);
    const base = readAgentBasePoint(dto.base);
    const agentType = String(dto?.agentType || '');
    if (!AGENT_VEHICLE_TYPES.includes(agentType as any)) throw new BadRequestException(AGENT_SIGNUP_MESSAGES.vehicle);
    const maxWeightKg = Number(dto?.maxWeightKg);
    if (!Number.isFinite(maxWeightKg) || maxWeightKg < 1 || maxWeightKg > 5000) throw new BadRequestException(AGENT_SIGNUP_MESSAGES.weight);

    const fields = {
      fullName, phone,
      city: regionName, region: regionName,
      district: place?.districtName || null,
      address: place?.displayLabel || null,
      agentType, maxWeightKg: Math.round(maxWeightKg),
      baseLatitude: base.latitude, baseLongitude: base.longitude, baseSetAt: new Date(),
    };

    const existing = await this.agentRepo.findOne({ where: { user: { id: user.id } } });
    if (existing) {
      if (existing.status === AgentStatus.PENDING) throw new BadRequestException('Ombi lako lipo tayari chini ya mapitio.');
      if (existing.status === AgentStatus.APPROVED) throw new BadRequestException('Wewe ni wakala tayari.');
      await this.agentRepo.update(existing.id, { ...fields, status: AgentStatus.PENDING, rejectionReason: null } as any);
      await this.commerceProfiles
        .syncStatusByLink('agentId', existing.id, CommerceProfileStatus.PENDING)
        .catch(() => {});
      return { message: AGENT_SIGNUP_MESSAGES.submitted };
    }
    const saved = (await this.agentRepo.save(
      this.agentRepo.create({ user, ...fields, status: AgentStatus.PENDING } as any),
    )) as unknown as Agent;

    try {
      await this.commerceProfiles.createProfile({
        ownerId: user.id,
        type: CommerceProfileType.AGENT,
        displayName: saved.fullName,
        usernameSeed: saved.fullName,
        photoUrl: user.avatarUrl,
        location: saved.city,
        status: CommerceProfileStatus.PENDING,
        agentId: saved.id,
      });
    } catch {}

    return { message: AGENT_SIGNUP_MESSAGES.submitted };
  }
  /**
   * What anyone may see about an approved agent: name, area, vehicle and their record.
   * Never the phone, ID, address, earnings or commission (owner rule: identity is public,
   * private data is not). Not approved: nothing.
   */
  async findPublicByUserId(userId: number) {
    const agent = await this.agentRepo.findOne({ where: { user: { id: userId } } });
    if (!agent || agent.status !== AgentStatus.APPROVED) return null;
    return {
      fullName: agent.fullName,
      agentCode: agent.agentCode,
      city: agent.city,
      district: agent.district,
      region: agent.region,
      coverageAreas: agent.coverageAreas || [],
      agentType: agent.agentType,
      totalDeliveriesCompleted: Number(agent.totalDeliveriesCompleted || 0),
      rating: Number(agent.rating || 0),
      totalRatings: Number(agent.totalRatings || 0),
    };
  }


  // ── Agent: my profile ─────────────────────────────────────────────────────

  async getMyProfile(user: User) {
    const agent = await this.agentRepo.findOne({
      where: { user: { id: user.id } },
    });
    if (!agent) return null;
    return {
      id: agent.id,
      status: agent.status,
      fullName: agent.fullName,
      phone: agent.phone,
      city: agent.city,
      // Section 18 (b): whether the fixed base point is set (required to go online).
      hasBasePoint: agent.baseLatitude != null && agent.baseLongitude != null,
      baseSetAt: agent.baseSetAt ?? null,
      // The agent's own base point, for their own map card only (never in any list).
      baseLatitude: agent.baseLatitude != null ? Number(agent.baseLatitude) : null,
      baseLongitude: agent.baseLongitude != null ? Number(agent.baseLongitude) : null,
      district: agent.district,
      region: agent.region,
      agentCode: agent.agentCode,
      tier: agent.tier,
      commissionRate: Number(agent.commissionRate),
      deliveryCommission: Number(agent.deliveryCommission),
      collectionFeeUrban: Number(agent.collectionFeeUrban),
      collectionFeeRural: Number(agent.collectionFeeRural),
      rating: Number(agent.rating),
      totalRatings: agent.totalRatings,
      totalDeliveriesCompleted: agent.totalDeliveriesCompleted,
      totalCollectionsCompleted: agent.totalCollectionsCompleted,
      agentType: agent.agentType ?? null,
      maxWeightKg: agent.maxWeightKg != null ? Number(agent.maxWeightKg) : null,
      vehicleDescription: agent.vehicleDescription ?? null,
      totalEarnings: Number(agent.totalEarnings),
      pendingEarnings: Number(agent.pendingEarnings),
      rejectionReason: agent.rejectionReason,
      // D1: the dashboard's online state (it read isOnline here, which was never
      // returned, so it always showed "Offline" after a reload).
      isOnline: agent.isOnline === true,
      lastOnlineAt: agent.lastOnlineAt ?? null,
    };
  }

  // ── Agents by city — for Super Agent dispatch and buyer delivery choice ────
  // Returns delivery fee so buyer can compare agents before choosing

  findByCity(city: string) {
    return this.agentRepo
      .find({
        where: { status: AgentStatus.APPROVED },
        relations: { user: true },
        order: {
          rating: 'DESC' as any,
          totalDeliveriesCompleted: 'DESC' as any,
        },
      })
      .then((agents) =>
        agents
          .filter(
            (a) =>
              a.city?.toLowerCase() === city.toLowerCase() ||
              a.district?.toLowerCase() === city.toLowerCase() ||
              a.region?.toLowerCase() === city.toLowerCase(),
          )
          .map((a) => ({
            id: a.id,
            fullName: a.fullName,
            phone: a.phone || a.user?.phone,
            city: a.city,
            agentCode: a.agentCode,
            tier: a.tier,
            rating: Number(a.rating || 0),
            totalRatings: Number(a.totalRatings || 0),
            totalDeliveriesCompleted: a.totalDeliveriesCompleted,
            agentType: (a as any).agentType ?? null,
            maxWeightKg: (a as any).maxWeightKg != null ? Number((a as any).maxWeightKg) : null,
            vehicleDescription: (a as any).vehicleDescription || null,
            isOnline: (a as any).isOnline || false,
            // Delivery rate — what buyer sees and agrees to before requesting delivery
            deliveryFee: Number(a.deliveryCommission || 1000),
            collectionFeeUrban: Number(a.collectionFeeUrban || 1500),
            collectionFeeRural: Number(a.collectionFeeRural || 3000),
          })),
      );
  }

  // ── Admin: list all agents ────────────────────────────────────────────────

  async findAll(filters?: { status?: string; city?: string }) {
    const agents = await this.agentRepo.find({
      relations: { user: true },
      order: { createdAt: 'DESC' },
    });
    // The account's identity status (one identity per person, reused everywhere).
    const identityStatus = new Map<number, string>();
    if (this.verification) {
      await Promise.all(agents.filter((a) => a.user?.id).map(async (a) => {
        const p = await this.verification!.getIdentityProfile(a.user.id).catch(() => null);
        identityStatus.set(a.user.id, p?.status || IdentityVerificationStatus.NOT_SUBMITTED);
      }));
    }
    return agents
      .filter((a) => !filters?.status || a.status === filters.status)
      .filter((a) => !filters?.city || a.city === filters.city)
      .map((a) => ({
        id: a.id,
        userId: a.user?.id,
        identityStatus: (a.user?.id && identityStatus.get(a.user.id)) || null,
        agentType: a.agentType,
        maxWeightKg: a.maxWeightKg == null ? null : Number(a.maxWeightKg),
        hasBasePoint: a.baseLatitude != null && a.baseLongitude != null,
        fullName: a.fullName,
        phone: a.phone,
        city: a.city,
        district: a.district,
        region: a.region,
        agentCode: a.agentCode,
        status: a.status,
        tier: a.tier,
        idNumber: a.idNumber,
        idType: a.idType,
        idPhotoUrl: a.idPhotoUrl,
        address: a.address,
        commissionRate: Number(a.commissionRate),
        deliveryCommission: Number(a.deliveryCommission),
        collectionFeeUrban: Number(a.collectionFeeUrban),
        collectionFeeRural: Number(a.collectionFeeRural),
        rating: Number(a.rating),
        totalDeliveriesCompleted: a.totalDeliveriesCompleted,
        totalCollectionsCompleted: a.totalCollectionsCompleted,
        totalEarnings: Number(a.totalEarnings),
        pendingEarnings: Number(a.pendingEarnings),
        // Admin's earnings-breakdown UI reads these three explicitly —
        // they were correctly written (deliveries/collections) or waiting
        // to be (payments, fixed alongside this) but never returned here,
        // so they always rendered as TZS 0 regardless of real data.
        totalEarningsPayments: Number(a.totalEarningsPayments),
        totalEarningsDeliveries: Number(a.totalEarningsDeliveries),
        totalEarningsCollections: Number(a.totalEarningsCollections),
        rejectionReason: a.rejectionReason,
        createdAt: a.createdAt,
      }));
  }

  // ── Admin: approve ────────────────────────────────────────────────────────

  async approve(agentId: number) {
    const agent = await this.agentRepo.findOne({
      where: { id: agentId },
      relations: { user: true },
    });
    if (!agent) throw new NotFoundException('Wakala hapatikani');
    // Approval needs the account's identity VERIFIED (sign-up only needs it sent in).
    if (this.verification && agent.user) {
      const identity = await this.verification.getIdentityProfile(agent.user.id);
      if (identity?.status !== IdentityVerificationStatus.VERIFIED) {
        throw new BadRequestException(AGENT_SIGNUP_MESSAGES.approveNeedsVerified);
      }
    }
    const cityCode = (agent.city || agent.district || 'KTX')
      .slice(0, 3)
      .toUpperCase()
      .replace(/\s/g, '');
    const agentCode = `KTX-${cityCode}-${String(agentId).padStart(3, '0')}`;
    await this.agentRepo.update(agentId, {
      status: AgentStatus.APPROVED,
      agentCode,
      rejectionReason: null,
    });
    if (agent.user) {
      await this.userRepo.update(agent.user.id, {
        role: 'agent' as any,
        activeRoles: mergeActiveRole(agent.user.activeRoles, 'agent'),
      });
      // Not best-effort: without an AccountRole, this agent has nothing to
      // ever resolve/switch into and stays locked out of the role they were
      // just approved for. See RoleContextService.syncOperationalRole.
      await this.roleContextService.syncOperationalRole({
        userId: agent.user.id,
        roleType: AccountRoleType.AGENT,
        status: AccountRoleStatus.ACTIVE,
        profileType: RoleProfileType.AGENT,
        profileId: agent.id,
      });
    }
    await this.commerceProfiles
      .syncStatusByLink('agentId', agentId, CommerceProfileStatus.ACTIVE)
      .catch(() => {});
    const phone = agent.phone || agent.user?.phone;
    if (phone) {
      await this.smsService
        .sendSms(
          phone,
          `KenteXa: Hongera ${agent.fullName}! Ombi lako la kuwa wakala limeidhinishwa. ` +
            `Msimbo wako: ${agentCode}. Ingia kwenye akaunti yako uanze kupata kazi. ${FRONTEND_URL}`,
        )
        .catch(() => {});
    }
    return { message: 'Wakala ameidhinishwa', agentCode };
  }

  // ── Admin: reject ─────────────────────────────────────────────────────────

  async reject(agentId: number, reason: string) {
    const agent = await this.agentRepo.findOne({
      where: { id: agentId },
      relations: { user: true },
    });
    if (!agent) throw new NotFoundException('Wakala hapatikani');
    await this.agentRepo.update(agentId, {
      status: AgentStatus.REJECTED,
      rejectionReason: reason,
    });
    if (agent.user) {
      await this.roleContextService.syncOperationalRole({
        userId: agent.user.id,
        roleType: AccountRoleType.AGENT,
        status: AccountRoleStatus.REJECTED,
        profileType: RoleProfileType.AGENT,
        profileId: agent.id,
      }).catch(() => {});
    }
    await this.commerceProfiles
      .syncStatusByLink('agentId', agentId, CommerceProfileStatus.REJECTED)
      .catch(() => {});
    const phone = agent.phone || agent.user?.phone;
    if (phone) {
      await this.smsService
        .sendSms(
          phone,
          `KenteXa: Habari ${agent.fullName}, ombi lako la kuwa wakala halikukubaliwa. ` +
            `Sababu: ${reason}. Unaweza kuomba tena ukisahihisha tatizo. ${FRONTEND_URL}`,
        )
        .catch(() => {});
    }
    return { message: 'Ombi limekataliwa' };
  }

  // ── Admin: suspend ────────────────────────────────────────────────────────

  async suspend(agentId: number) {
    const agent = await this.agentRepo.findOne({
      where: { id: agentId },
      relations: { user: true },
    });
    if (!agent) throw new NotFoundException('Wakala hapatikani');
    await this.agentRepo.update(agentId, {
      status: AgentStatus.SUSPENDED,
    });
    if (agent.user) {
      await this.roleContextService.syncOperationalRole({
        userId: agent.user.id,
        roleType: AccountRoleType.AGENT,
        status: AccountRoleStatus.SUSPENDED,
        profileType: RoleProfileType.AGENT,
        profileId: agent.id,
      }).catch(() => {});
    }
    const phone = agent.phone || agent.user?.phone;
    if (phone) {
      await this.smsService
        .sendSms(
          phone,
          `KenteXa: Akaunti yako ya wakala imesimamishwa kwa muda. ` +
            `Wasiliana na usaidizi kwa maelezo zaidi.`,
        )
        .catch(() => {});
    }
    return { message: 'Wakala amesimamishwa' };
  }

  // ── Admin: update settings ────────────────────────────────────────────────

  async updateSettings(
    agentId: number,
    dto: {
      commissionRate?: number;
      deliveryCommission?: number;
      collectionFeeUrban?: number;
      collectionFeeRural?: number;
      tier?: string;
      city?: string;
    },
  ) {
    const agent = await this.agentRepo.findOne({ where: { id: agentId } });
    if (!agent) throw new NotFoundException('Wakala hapatikani');
    const updates: any = {};
    if (dto.commissionRate != null) updates.commissionRate = dto.commissionRate;
    if (dto.deliveryCommission != null)
      updates.deliveryCommission = dto.deliveryCommission;
    if (dto.collectionFeeUrban != null)
      updates.collectionFeeUrban = dto.collectionFeeUrban;
    if (dto.collectionFeeRural != null)
      updates.collectionFeeRural = dto.collectionFeeRural;
    if (dto.tier) updates.tier = dto.tier;
    if (dto.city) updates.city = dto.city;
    await this.agentRepo.update(agentId, updates);
    return { message: 'Mipangilio imehifadhiwa' };
  }

  // ── Admin: get agents with pending earnings (payment collection only) ─────

  async getAgentsPendingEarnings() {
    const agents = await this.agentRepo.find({
      where: { status: AgentStatus.APPROVED },
      relations: { user: true },
      order: { pendingEarnings: 'DESC' } as any,
    });
    return agents
      .filter((a) => Number(a.pendingEarnings) > 0)
      .map((a) => ({
        id: a.id,
        fullName: a.fullName,
        phone: a.phone || a.user?.phone,
        city: a.city || a.district,
        agentCode: a.agentCode,
        tier: a.tier,
        pendingEarnings: Number(a.pendingEarnings),
        totalEarnings: Number(a.totalEarnings),
        totalEarningsPayments: Number(a.totalEarningsPayments),
        totalEarningsDeliveries: Number(a.totalEarningsDeliveries),
        totalEarningsCollections: Number(a.totalEarningsCollections),
        totalDeliveriesCompleted: a.totalDeliveriesCompleted,
        totalCollectionsCompleted: a.totalCollectionsCompleted,
        totalPaymentsProcessed: a.totalPaymentsProcessed,
        payoutMethod: (a.user as any)?.payoutMethod || null,
        payoutAccountName: (a.user as any)?.payoutAccountName || null,
        payoutAccountNumber: (a.user as any)?.payoutAccountNumber || null,
        payoutBankName: (a.user as any)?.payoutBankName || null,
      }));
  }

  // ── Admin: release agent earnings (payment collection commission only) ────

  async releaseEarnings(
    agentId: number,
    amount: number,
    admin: User,
    note?: string,
  ) {
    const agent = await this.agentRepo.findOne({
      where: { id: agentId },
      relations: { user: true },
    });
    if (!agent) throw new NotFoundException('Wakala hapatikani');
    const pending = Number(agent.pendingEarnings);
    const release = Math.min(amount, pending);
    await this.agentRepo.update(agentId, {
      pendingEarnings: pending - release,
    });

    // Ledger entry for the release itself — previously only the running
    // pendingEarnings balance was decremented, with no record of who
    // released how much and when. commissionAmount is negative here since
    // this is a debit against the balance, not a commission being earned
    // (unlike every other write site for this table).
    await this.agentTransactionRepo.save(
      this.agentTransactionRepo.create({
        agent,
        releasedBy: admin,
        invoiceAmount: release,
        commissionRate: 0,
        commissionAmount: -release,
        transactionReference: note || null,
        paymentMethod: 'earnings_release',
        status: AgentTransactionStatus.CONFIRMED,
      }),
    );
    const releaseAgentProfile = await this.commerceProfiles
      .findForUserByType(agent.user.id, CommerceProfileType.AGENT)
      .catch(() => null);
    this.activityEvents.record({
      eventType: 'EARNINGS_RELEASED',
      category: ActivityCategory.PAYMENT,
      actorId: admin.id,
      actorType: 'admin',
      businessId: releaseAgentProfile?.id ?? null,
      relatedUserId: agent.user.id,
      targetType: 'agent_transaction',
      metadata: { amount: release, note: note || null },
    });

    const phone = agent.phone || agent.user?.phone;
    if (phone) {
      await this.smsService
        .sendSms(
          phone,
          `KenteXa: Habari ${agent.fullName}! Malipo ya TZS ${release.toLocaleString()} ` +
            `yametumwa kwako${note ? ` — ${note}` : ''}. Asante kwa kazi nzuri! 🎉`,
        )
        .catch(() => {});
    }
    return {
      message: 'Malipo yametolewa',
      agentId,
      released: release,
      remaining: pending - release,
    };
  }
  // ── Agent: toggle online/offline ─────────────────────────────────────────

  /** "Weka kituo changu": the agent's fixed base point from the phone's GPS (section 18 b). */
  async setBasePoint(user: User, body: { latitude?: unknown; longitude?: unknown; accuracyM?: unknown }) {
    const agent = await this.agentRepo.findOne({ where: { user: { id: user.id } } });
    if (!agent) throw new NotFoundException('Wakala hapatikani');
    const point = readAgentBasePoint(body);
    const baseSetAt = new Date();
    await this.agentRepo.update(agent.id, { baseLatitude: point.latitude, baseLongitude: point.longitude, baseSetAt });
    return { hasBasePoint: true, baseSetAt, message: AGENT_BASE_MESSAGES.saved };
  }

  async toggleOnline(user: User) {
    const agent = await this.agentRepo.findOne({
      where: { user: { id: user.id } },
    });
    if (!agent) throw new NotFoundException('Wakala hapatikani');
    if ((agent as any).status !== 'approved')
      throw new BadRequestException('Akaunti haijaidhinishwa bado');

    const nowOnline = !(agent as any).isOnline;
    // Section 18 (b): a base point is required before going online.
    if (nowOnline && (agent.baseLatitude == null || agent.baseLongitude == null)) {
      throw new BadRequestException(AGENT_BASE_MESSAGES.required);
    }
    await this.agentRepo.update((agent as any).id, {
      isOnline: nowOnline,
      lastOnlineAt: nowOnline ? new Date() : (agent as any).lastOnlineAt,
    });
    // D5: offer him the pickups already waiting near his base (never blocks going online).
    if (nowOnline && this.pickupReoffer) await this.pickupReoffer.offerTo((agent as any).id);

    return {
      isOnline: nowOnline,
      message: nowOnline
        ? 'Uko mtandaoni — utaona kazi zinazopatikana'
        : 'Umejisajili nje ya mtandao',
    };
  }

  // ── Get available agents by city and weight ────────────────────────────────

  async getAvailableAgents(city: string, weightKg?: number) {
    const agents = await this.agentRepo.find({
      where: { status: 'approved' as any },
      relations: { user: true },
      order: { rating: 'DESC' },
    });

    return agents
      .filter((a) => {
        const agentCity =
          a.city?.toLowerCase() || a.district?.toLowerCase() || '';
        const matchCity = agentCity === city.toLowerCase();
        const maxKg = Number((a as any).maxWeightKg || 20);
        const matchWeight = !weightKg || weightKg <= maxKg;
        // Online is not required by default (agent-online.ts, owner 2026-10-25).
        const online = (a as any).isOnline === true || !agentOnlineRequired();
        return matchCity && matchWeight && online;
      })
      // Online agents first, then the rest (each group keeps the rating order).
      .sort((x, y) => Number((y as any).isOnline === true) - Number((x as any).isOnline === true))
      .map((a) => ({
        id: a.id,
        userId: a.user?.id,
        fullName: a.fullName,
        phone: a.phone || a.user?.phone,
        agentCode: a.agentCode,
        // Only what the agent's record says (owner rule: never invent fees, times or ratings).
        agentType: (a as any).agentType ?? null,
        maxWeightKg: (a as any).maxWeightKg != null ? Number((a as any).maxWeightKg) : null,
        vehicleDescription: (a as any).vehicleDescription || null,
        deliveryFee: a.deliveryCommission != null ? Number(a.deliveryCommission) : null,
        collectionFeeUrban: a.collectionFeeUrban != null ? Number(a.collectionFeeUrban) : null,
        collectionFeeRural: a.collectionFeeRural != null ? Number(a.collectionFeeRural) : null,
        rating: Number(a.rating || 0),
        totalRatings: Number(a.totalRatings || 0),
        totalDeliveries: a.totalDeliveriesCompleted || 0,
        // Yes/no only: the base point itself never leaves the server.
        hasBasePoint: a.baseLatitude != null && a.baseLongitude != null,
        isOnline: (a as any).isOnline === true,
      }));
  }

  /**
   * The agent's own day, from the records only (owner 2026-10-27, "Mapato"):
   * deliveries finished and the delivery fees for them (the fee the customer pays the
   * agent), the pay-on-delivery cash taken at the door, and what is still owed to
   * KenteXa from it. Days are Tanzania days.
   */
  async getMySummary(user: User) {
    const agent = await this.agentRepo.findOne({ where: { user: { id: user.id } } });
    if (!agent) throw new NotFoundException('Wakala hapatikani');
    const day = `(now() AT TIME ZONE 'Africa/Dar_es_Salaam')::date`;
    const local = (col: string) => `((${col}) AT TIME ZONE 'UTC' AT TIME ZONE 'Africa/Dar_es_Salaam')::date`;
    const [jobs] = await this.agentRepo.manager.query(`
      WITH done AS (
        SELECT t."deliveredAt" AS at, p."agreedDeliveryFee" AS fee
          FROM public.parcel_pickup_task t JOIN public.parcel p ON p.id = t."parcelId"
         WHERE t."agentProfileId" = $1 AND t.status = 'delivered' AND t."deliveredAt" IS NOT NULL
        UNION ALL
        SELECT p."deliveredTime" AS at, p."agreedDeliveryFee" AS fee
          FROM public.parcel p
         WHERE p."localAgentId" = $2::text AND p.status::text = 'delivered' AND p."deliveredTime" IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM public.parcel_pickup_task t2 WHERE t2."parcelId" = p.id AND t2."agentProfileId" = $1)
      )
      SELECT COUNT(*) FILTER (WHERE ${local('at')} = ${day})::int AS "todayCount",
             COALESCE(SUM(fee) FILTER (WHERE ${local('at')} = ${day}), 0) AS "todayFees",
             COUNT(*) FILTER (WHERE ${local('at')} > ${day} - 7)::int AS "weekCount",
             COALESCE(SUM(fee) FILTER (WHERE ${local('at')} > ${day} - 7), 0) AS "weekFees",
             COUNT(*)::int AS "allCount"
        FROM done`, [agent.id, String(user.id)]).catch(() => [null]);
    const [cash] = await this.agentRepo.manager.query(`
      SELECT COALESCE(SUM(c."collectedAmount") FILTER (WHERE ${local('c."recordedAt"')} = ${day}), 0) AS "codToday",
             COALESCE(SUM(c."cashLiability" - COALESCE(r.remitted, 0)), 0) AS "owedToKentexa"
        FROM public.agent_cod_collection c
        LEFT JOIN (SELECT "collectionId", SUM(amount) AS remitted FROM public.agent_cod_remittance GROUP BY "collectionId") r
          ON r."collectionId" = c.id
       WHERE c."agentId" = $1`, [agent.id]).catch(() => [null]);
    const n = (v: any) => Math.round(Number(v || 0) * 100) / 100;
    return {
      today: { deliveries: n(jobs?.todayCount), fees: n(jobs?.todayFees), codCollected: n(cash?.codToday) },
      week: { deliveries: n(jobs?.weekCount), fees: n(jobs?.weekFees) },
      totalDeliveries: Math.max(n(jobs?.allCount), Number(agent.totalDeliveriesCompleted || 0)),
      owedToKentexa: Math.max(0, n(cash?.owedToKentexa)),
      rating: Number(agent.totalRatings) > 0 ? Number(agent.rating) : null,
      totalRatings: Number(agent.totalRatings || 0),
    };
  }

  // ── Update agent profile (type, vehicle, rates) ────────────────────────────

  async updateProfile(
    user: User,
    dto: {
      agentType?: string;
      maxWeightKg?: number;
      vehicleDescription?: string;
      deliveryCommission?: number;
      collectionFeeUrban?: number;
      collectionFeeRural?: number;
      phone?: string;
      address?: string;
    },
  ) {
    const agent = await this.agentRepo.findOne({
      where: { user: { id: user.id } },
    });
    if (!agent) throw new NotFoundException('Wakala hapatikani');
    const updates: any = {};
    if (dto.agentType != null) {
      if (!AGENT_VEHICLE_TYPES.includes(dto.agentType as any)) throw new BadRequestException('Chagua aina ya usafiri kwenye orodha.');
      updates.agentType = dto.agentType;
    }
    if (dto.maxWeightKg != null) {
      const kg = Number(dto.maxWeightKg);
      if (!Number.isFinite(kg) || kg < 1 || kg > 5000) throw new BadRequestException('Uzito wa juu uwe kati ya kg 1 na 5,000.');
      updates.maxWeightKg = Math.round(kg);
    }
    if (dto.vehicleDescription)
      updates.vehicleDescription = dto.vehicleDescription;
    if (dto.deliveryCommission)
      updates.deliveryCommission = dto.deliveryCommission;
    if (dto.collectionFeeUrban)
      updates.collectionFeeUrban = dto.collectionFeeUrban;
    if (dto.collectionFeeRural)
      updates.collectionFeeRural = dto.collectionFeeRural;
    if (dto.phone) updates.phone = dto.phone;
    if (dto.address) updates.address = dto.address;
    await this.agentRepo.update((agent as any).id, updates);
    // Keep the single source of truth in sync — Agent.phone previously
    // drifted from User.phone the moment someone edited it here, since
    // this only ever wrote to the Agent row.
    if (dto.phone) await this.userRepo.update(user.id, { phone: dto.phone });
    return { message: 'Wasifu umesasishwa' };
  }
}
