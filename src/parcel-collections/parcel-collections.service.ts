import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  ParcelCollection,
  CollectionStatus,
} from './entities/parcel-collection.entity';
import { Order } from '../orders/entities/order.entity';
import { Parcel, ParcelStatus, ParcelTracking } from '../super-agents/entities/parcel.entity';
import { ParcelCustodyEvent } from '../super-agents/entities/parcel-custody-event.entity';
import { User } from '../users/entities/user.entity';
import { Agent, AgentStatus } from '../agents/entities/agent.entity';
import { SmsService } from '../sms/sms.service';
import { RoleContext } from '../role-context/role-context.types';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

@Injectable()
export class ParcelCollectionsService {
  constructor(
    @InjectRepository(ParcelCollection)
    private collectionRepo: Repository<ParcelCollection>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Parcel) private parcelRepo: Repository<Parcel>,
    @InjectRepository(Agent) private agentRepo: Repository<Agent>,
    private smsService: SmsService,
    private dataSource: DataSource,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // CREATE — called from orders.service when needsCollection = true
  // ══════════════════════════════════════════════════════════════════════════

  async createCollectionRequest(
    order: Order,
    pickupAddress: string,
    city: string,
    isRural: boolean,
    collectionFee: number,
  ): Promise<ParcelCollection> {
    const saved = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT id FROM public."order" WHERE id = $1 FOR UPDATE', [order.id]);
      const linked: { id: number }[] = await manager.query(
        'SELECT id FROM public.parcel WHERE "orderId" = $1 FOR UPDATE', [order.id],
      );
      if (linked.length > 1) throw new BadRequestException('Order has multiple parcels; collection cannot be assigned');
      let parcel = linked.length
        ? await manager.getRepository(Parcel).findOne({ where: { id: linked[0].id } })
        : null;
      if (!parcel) {
        // Checkout has not reached hub intake; this is a pending physical
        // parcel, without an invented hub custodian or route decision.
        const destinationLabel = order.deliveryAddress?.split(',')[0]?.trim() || 'Tanzania';
        parcel = await manager.getRepository(Parcel).save(
          manager.getRepository(Parcel).create({
            order, seller: order.seller, buyer: order.buyer,
            trackingNumber: order.trackingNumber || `KTX-ORD-${order.id}`,
            originCity: city, destinationCity: destinationLabel,
            deliveryAddress: order.deliveryAddress,
            buyerPhone: order.phone || order.buyer?.phone || null,
            recipientName: order.recipientName || order.buyer?.name || null,
            description: order.manualProductName || order.product?.name || null,
            source: 'online_order', status: ParcelStatus.COLLECTION_REQUESTED,
          } as any),
        ) as unknown as Parcel;
      } else if (parcel.status === ParcelStatus.PENDING) {
        await manager.getRepository(Parcel).update(parcel.id, { status: ParcelStatus.COLLECTION_REQUESTED });
      } else if (parcel.status !== ParcelStatus.COLLECTION_REQUESTED) {
        throw new BadRequestException('Parcel has already moved beyond collection request');
      }
      return manager.getRepository(ParcelCollection).save(
        manager.getRepository(ParcelCollection).create({
          order, seller: order.seller, agent: null, parcel,
          pickupAddress, city, isRural, collectionFee,
          status: CollectionStatus.REQUESTED,
        } as any),
      ) as unknown as Promise<ParcelCollection>;
    });

    // Notify seller confirmation
    if ((order.seller as any)?.phone) {
      await this.smsService.sendSms(
        (order.seller as any).phone,
        `KenteXa: Ombi lako la kukusanyiwa limepokewa kwa Agizo #${order.id}. ` +
          `Wakala atakuja kukuchukua hivi karibuni kwenye: ${pickupAddress}`,
      ).catch(() => {});
    }
    return saved;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AGENT — get available collection jobs in their city
  // ══════════════════════════════════════════════════════════════════════════

  async getAvailableCollections(agent: User): Promise<ParcelCollection[]> {
    const agentProfile = await this.agentRepo.findOne({
      where: { user: { id: agent.id } },
    });
    if (!agentProfile) throw new BadRequestException('Agent profile not found');

    const city =
      agentProfile.city || agentProfile.district || agentProfile.region;
    if (!city) return [];

    return this.collectionRepo.find({
      where: {
        city,
        status: CollectionStatus.REQUESTED,
        agent: null as any,
      },
      relations: { order: { product: true, seller: true }, seller: true },
      order: { createdAt: 'ASC' },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AGENT — get my active collection jobs
  // ══════════════════════════════════════════════════════════════════════════

  async getMyCollections(agent: User): Promise<ParcelCollection[]> {
    return this.collectionRepo.find({
      where: {
        agent: { id: agent.id },
        status: CollectionStatus.CLAIMED,
      },
      relations: {
        order: { product: true, seller: true },
        seller: true,
        parcel: true,
      },
      order: { claimedAt: 'DESC' },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AGENT — claim a collection job
  // ══════════════════════════════════════════════════════════════════════════

  async claimCollection(
    collectionId: number,
    agent: User,
  ): Promise<ParcelCollection> {
    const job = await this.collectionRepo.findOne({
      where: { id: collectionId },
      relations: { order: true, seller: true },
    });
    if (!job) throw new NotFoundException('Collection job not found');
    if (job.status !== CollectionStatus.REQUESTED) {
      throw new BadRequestException(
        'This collection job is no longer available',
      );
    }
    if ((job as any).agent?.id) {
      throw new BadRequestException('Already claimed by another agent');
    }

    // Atomic conditional update — the checks above are only for the
    // friendly error messages. This WHERE clause is what actually prevents
    // two agents claiming the same job in the same race window.
    const result = await this.collectionRepo
      .createQueryBuilder()
      .update()
      .set({
        agent: { id: agent.id } as any,
        status: CollectionStatus.CLAIMED,
        claimedAt: new Date(),
      })
      .where('id = :id', { id: collectionId })
      .andWhere('"agentId" IS NULL')
      .andWhere('status = :status', { status: CollectionStatus.REQUESTED })
      .execute();
    if (!result.affected) {
      throw new BadRequestException(
        'Already claimed by another agent, or no longer available.',
      );
    }

    // Notify seller that an agent is coming
    if ((job.seller as any)?.phone) {
      await this.smsService.sendSms(
        (job.seller as any).phone,
        `KenteXa: Wakala ${agent.name || 'wa KenteXa'} atakuja kukuchukua ` +
          `kifurushi chako cha Agizo #${job.order.id} hivi karibuni. ` +
          `Namba yake: ${agent.phone || '—'}`,
      );
    }

    return this.collectionRepo.findOne({
      where: { id: collectionId },
      relations: { order: { product: true, seller: true }, seller: true },
    }) as Promise<ParcelCollection>;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AGENT — confirm parcel collected from seller
  // ══════════════════════════════════════════════════════════════════════════

  async confirmCollected(
    collectionId: number,
    agent: User,
    notes?: string,
    roleContext?: RoleContext,
  ): Promise<any> {
    const job = await this.collectionRepo.findOne({
      where: { id: collectionId },
      relations: { order: { buyer: true, seller: true }, parcel: true },
    });
    if (!job) throw new NotFoundException('Collection job not found');
    if ((job as any).agent?.id !== agent.id)
      throw new ForbiddenException('Not your job');
    if (job.status !== CollectionStatus.CLAIMED) {
      throw new BadRequestException(`Cannot confirm — status is ${job.status}`);
    }
    const agentProfile = roleContext?.roleType === AccountRoleType.AGENT
      ? await this.agentRepo.findOne({ where: { id: roleContext.profileId, user: { id: agent.id } } })
      : null;
    if (!roleContext || roleContext.userId !== agent.id || !agentProfile ||
        agentProfile.id !== roleContext.profileId || agentProfile.status !== AgentStatus.APPROVED) {
      throw new ForbiddenException('An active local agent must confirm this pickup');
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT id FROM public.parcel_collection WHERE id = $1 FOR UPDATE', [collectionId]);
      const current = await manager.getRepository(ParcelCollection).findOne({
        where: { id: collectionId }, relations: { agent: true, parcel: true, order: true },
      });
      if (!current || current.status !== CollectionStatus.CLAIMED || current.agent?.id !== agent.id) {
        throw new BadRequestException('This collection job was already picked up or reassigned');
      }
      // Older jobs may lack the parcel relation. Resolve by the linked order
      // only when exactly one parcel exists; never record a phantom pickup.
      const rows: { id: number; orderId: number }[] = current.parcel
        ? await manager.query('SELECT id,"orderId" FROM public.parcel WHERE id = $1 FOR UPDATE', [current.parcel.id])
        : await manager.query('SELECT id,"orderId" FROM public.parcel WHERE "orderId" = $1 FOR UPDATE', [current.order.id]);
      if (rows.length !== 1 || Number(rows[0].orderId) !== current.order.id) {
        throw new BadRequestException('Collection needs exactly one linked parcel for its order');
      }
      const parcel = await manager.getRepository(Parcel).findOne({ where: { id: rows[0].id } });
      if (!parcel || ![ParcelStatus.PENDING, ParcelStatus.COLLECTION_REQUESTED].includes(parcel.status)) {
        throw new BadRequestException('Parcel is no longer available for seller pickup');
      }
      await manager.getRepository(ParcelCollection).update(collectionId, {
        status: CollectionStatus.COLLECTED, collectedAt: new Date(), notes: notes || null,
        parcel: { id: parcel.id } as Parcel,
      });
      await manager.getRepository(Parcel).update(parcel.id, { status: ParcelStatus.COLLECTED_BY_AGENT });
      await manager.getRepository(ParcelCustodyEvent).insert({
        parcelId: parcel.id,
        eventKind: 'seller_collected_by_agent',
        operationKey: `collection-collected:${collectionId}`,
        fromCustodianType: null,
        fromCustodianId: null,
        toCustodianType: 'local_agent',
        toCustodianId: agentProfile.id,
        actorSource: 'account_role',
        actorUserId: agent.id,
        actorAccountRoleId: roleContext.accountRoleId,
        actorRoleType: roleContext.roleType,
        actorWorkspaceId: roleContext.workspaceId ?? null,
        actorProviderId: null,
        hubId: null,
        assignmentId: null,
        evidenceRef: `collection:${collectionId}`,
      });
      await manager.getRepository(ParcelTracking).insert({
        parcel, status: ParcelStatus.COLLECTED_BY_AGENT,
        city: current.city,
        note: notes || 'Imekusanywa na wakala kutoka kwa muuzaji',
        updatedBy: agentProfile.fullName || agent.name,
        handlerPhone: agent.phone || null,
        handlerLocation: current.pickupAddress,
        handlerType: 'local_agent',
      });
    });

    // Notify buyer — their order is being collected
    if (job.order.buyer?.phone) {
      await this.smsService.sendSms(
        job.order.buyer.phone,
        `KenteXa: Bidhaa yako ya Agizo #${job.order.id} imekusanywa na wakala ` +
          `na inakwenda kwenye kituo cha usafirishaji. Utapata ujumbe wakati itakapofika.`,
      ).catch(() => {});
    }

    return { message: 'Umekusanya kifurushi. Peleka kwenye Super Agent hub.' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AGENT — confirm handover at Super Agent hub
  // ══════════════════════════════════════════════════════════════════════════

  async confirmHandedOver(collectionId: number, agent: User): Promise<any> {
    const job = await this.collectionRepo.findOne({
      where: { id: collectionId },
      relations: { order: { buyer: true, seller: true }, parcel: true },
    });
    if (!job) throw new NotFoundException('Collection job not found');
    if ((job as any).agent?.id !== agent.id)
      throw new ForbiddenException('Not your job');
    if (job.status !== CollectionStatus.COLLECTED) {
      throw new BadRequestException(
        `Cannot hand over — must be in collected status`,
      );
    }

    await this.collectionRepo.update(collectionId, {
      status: CollectionStatus.HANDED_OVER,
      handedOverAt: new Date(),
    });

    // Parcel status becomes received_at_hub — normal intercity flow resumes
    if (job.parcel) {
      await this.parcelRepo.update(job.parcel.id, {
        status: ParcelStatus.RECEIVED_AT_HUB,
      });
    }

    // Credit agent's collection earnings and count
    const agentProfile = await this.agentRepo.findOne({
      where: { user: { id: agent.id } },
    });
    if (agentProfile) {
      await this.agentRepo.update(agentProfile.id, {
        totalCollectionsCompleted: agentProfile.totalCollectionsCompleted + 1,
        totalEarningsCollections:
          Number(agentProfile.totalEarningsCollections) +
          Number(job.collectionFee),
        pendingEarnings:
          Number(agentProfile.pendingEarnings) + Number(job.collectionFee),
        // Was never added to totalEarnings here — the "Mapato" headline
        // stat on the admin Agents page permanently understated real
        // earnings by however much an agent earned from collection jobs.
        totalEarnings:
          Number(agentProfile.totalEarnings) + Number(job.collectionFee),
      });
    }

    // Notify seller — parcel is at hub, on its way
    if ((job.order.seller as any)?.phone) {
      await this.smsService.sendSms(
        (job.order.seller as any).phone,
        `KenteXa: Kifurushi chako cha Agizo #${job.order.id} kimefika kituo cha ` +
          `Super Agent. Kinaandaliwa kutumwa. Asante! 🎉`,
      );
    }

    // Notify buyer
    if (job.order.buyer?.phone) {
      await this.smsService.sendSms(
        job.order.buyer.phone,
        `KenteXa: Bidhaa yako ya Agizo #${job.order.id} iko kituo cha KenteXa ` +
          `na inaandaliwa kutumwa kwako.`,
      );
    }

    return {
      message: 'Umekabidhi kwa Super Agent. Kazi imekamilika! 🎉',
      collectionFee: Number(job.collectionFee),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN — all collections
  // ══════════════════════════════════════════════════════════════════════════

  async getAllCollections(filters?: { status?: string; city?: string }) {
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.city) where.city = filters.city;

    return this.collectionRepo.find({
      where,
      relations: {
        order: { product: true },
        seller: true,
        agent: true,
        parcel: true,
      },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  // Admin manually assigns an agent (for unclaimed jobs)
  async adminAssignAgent(
    collectionId: number,
    agentUserId: number,
  ): Promise<any> {
    const job = await this.collectionRepo.findOne({
      where: { id: collectionId },
      relations: { order: true, seller: true },
    });
    const agent = await this.agentRepo.findOne({
      where: { user: { id: agentUserId } },
    });
    if (!job) throw new NotFoundException('Collection not found');
    if (!agent) throw new NotFoundException('Agent not found');

    await this.collectionRepo.update(collectionId, {
      agent: { id: agentUserId },
      status: CollectionStatus.CLAIMED,
      claimedAt: new Date(),
    });

    return { message: `Assigned to agent ${(agent as any).fullName}` };
  }

  // Admin cancel (no agent available, seller must bring themselves)
  async adminCancel(collectionId: number, reason: string): Promise<any> {
    const job = await this.collectionRepo.findOne({
      where: { id: collectionId },
      relations: { order: { seller: true }, parcel: true },
    });
    if (!job) throw new NotFoundException('Collection not found');

    await this.collectionRepo.update(collectionId, {
      status: CollectionStatus.CANCELLED,
      cancellationReason: reason,
    });

    // Reset parcel status to pending — seller brings themselves
    if (job.parcel) {
      await this.parcelRepo.update(job.parcel.id, {
        status: ParcelStatus.PENDING,
      });
    }

    // Notify seller
    const sellerPhone = (job.order as any)?.seller?.phone;
    if (sellerPhone) {
      await this.smsService.sendSms(
        sellerPhone,
        `KenteXa: Hakuna wakala anayepatikana kukusanyia Agizo #${job.order.id}. ` +
          `Tafadhali peleka mwenyewe kwenye kituo cha Super Agent karibu nawe.`,
      );
    }

    return { message: 'Collection cancelled. Seller notified.' };
  }
}
