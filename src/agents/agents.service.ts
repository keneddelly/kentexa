import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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

@Injectable()
export class AgentsService {
  constructor(
    @InjectRepository(Agent) private agentRepo: Repository<Agent>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(AgentTransaction)
    private agentTransactionRepo: Repository<AgentTransaction>,
    private smsService: SmsService,
  ) {}

  // ── Agent: register ────────────────────────────────────────────────────────

  async register(
    user: User,
    dto: {
      fullName: string;
      phone: string;
      city?: string;
      address?: string;
      region?: string;
      district?: string;
      idNumber?: string;
      idType?: string;
      idPhotoUrl?: string;
      agentType?: string;
      maxWeightKg?: number;
      vehicleDescription?: string;
    },
  ) {
    const existing = await this.agentRepo.findOne({
      where: { user: { id: user.id } },
    });
    if (existing) {
      if (existing.status === AgentStatus.PENDING)
        throw new BadRequestException(
          'Ombi lako lipo tayari chini ya mapitio.',
        );
      if (existing.status === AgentStatus.APPROVED)
        throw new BadRequestException('Wewe ni wakala tayari.');
      await this.agentRepo.update(existing.id, {
        ...dto,
        status: AgentStatus.PENDING,
        rejectionReason: null,
      });
      return { message: 'Ombi lako jipya limewasilishwa. Tutawasiliana nawe.' };
    }
    const agent = this.agentRepo.create({
      user,
      fullName: dto.fullName,
      phone: dto.phone,
      city: dto.city || null,
      address: dto.address || null,
      region: dto.region || null,
      district: dto.district || null,
      idNumber: dto.idNumber || null,
      idType: dto.idType || null,
      idPhotoUrl: dto.idPhotoUrl || null,
      agentType: dto.agentType || 'boda',
      maxWeightKg: dto.maxWeightKg || 20,
      vehicleDescription: dto.vehicleDescription || null,
      status: AgentStatus.PENDING,
    } as any);
    await this.agentRepo.save(agent);
    return { message: 'Ombi limewasilishwa. Tutawasiliana nawe haraka.' };
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
      totalEarnings: Number(agent.totalEarnings),
      pendingEarnings: Number(agent.pendingEarnings),
      rejectionReason: agent.rejectionReason,
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
            rating: Number(a.rating),
            totalDeliveriesCompleted: a.totalDeliveriesCompleted,
            agentType: (a as any).agentType || 'boda',
            maxWeightKg: Number((a as any).maxWeightKg || 20),
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
    return agents
      .filter((a) => !filters?.status || a.status === filters.status)
      .filter((a) => !filters?.city || a.city === filters.city)
      .map((a) => ({
        id: a.id,
        userId: a.user?.id,
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
    if (agent.user)
      await this.userRepo.update(agent.user.id, {
        role: 'agent' as any,
        activeRoles: mergeActiveRole(agent.user.activeRoles, 'agent'),
      });
    const phone = agent.phone || agent.user?.phone;
    if (phone) {
      await this.smsService
        .sendSms(
          phone,
          `KenteXa: Hongera ${agent.fullName}! Ombi lako la kuwa wakala limeidhinishwa. ` +
            `Msimbo wako: ${agentCode}. Ingia kwenye akaunti yako uanze kupata kazi. kentexa.com`,
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
    const phone = agent.phone || agent.user?.phone;
    if (phone) {
      await this.smsService
        .sendSms(
          phone,
          `KenteXa: Habari ${agent.fullName}, ombi lako la kuwa wakala halikukubaliwa. ` +
            `Sababu: ${reason}. Unaweza kuomba tena ukisahihisha tatizo. kentexa.com`,
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

  async toggleOnline(user: User) {
    const agent = await this.agentRepo.findOne({
      where: { user: { id: user.id } },
    });
    if (!agent) throw new NotFoundException('Wakala hapatikani');
    if ((agent as any).status !== 'approved')
      throw new BadRequestException('Akaunti haijaidhinishwa bado');

    const nowOnline = !(agent as any).isOnline;
    await this.agentRepo.update((agent as any).id, {
      isOnline: nowOnline,
      lastOnlineAt: nowOnline ? new Date() : (agent as any).lastOnlineAt,
    });

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

    const AGENT_TYPE_LABELS: Record<string, string> = {
      boda: '🏍️ Boda/Pikipiki',
      car: '🚗 Gari Binafsi',
      van: '🚐 Van/Bajaj',
      truck: '🚛 Lori/Truck',
      foot: '🚶 Mjumbe wa Miguu',
    };

    const DELIVERY_TIME: Record<string, string> = {
      boda: 'Masaa 1-2',
      car: 'Masaa 2-4',
      van: 'Masaa 3-6',
      truck: 'Masaa 4-8',
      foot: 'Masaa 1-3',
    };

    return agents
      .filter((a) => {
        const agentCity =
          a.city?.toLowerCase() || a.district?.toLowerCase() || '';
        const matchCity = agentCity === city.toLowerCase();
        const maxKg = Number((a as any).maxWeightKg || 20);
        const matchWeight = !weightKg || weightKg <= maxKg;
        const online = (a as any).isOnline === true;
        return matchCity && matchWeight && online;
      })
      .map((a) => ({
        id: a.id,
        userId: a.user?.id,
        fullName: a.fullName,
        phone: a.phone || a.user?.phone,
        agentCode: a.agentCode,
        agentType: (a as any).agentType || 'boda',
        agentTypeLabel:
          AGENT_TYPE_LABELS[(a as any).agentType || 'boda'] || '🏍️ Boda',
        deliveryTime:
          DELIVERY_TIME[(a as any).agentType || 'boda'] || 'Masaa 1-4',
        maxWeightKg: Number((a as any).maxWeightKg || 20),
        vehicleDescription: (a as any).vehicleDescription || null,
        deliveryFee: Number(a.deliveryCommission || 1000),
        rating: Number(a.rating || 5),
        totalDeliveries: a.totalDeliveriesCompleted || 0,
        isOnline: true,
      }));
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
    if (dto.agentType) updates.agentType = dto.agentType;
    if (dto.maxWeightKg) updates.maxWeightKg = dto.maxWeightKg;
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
