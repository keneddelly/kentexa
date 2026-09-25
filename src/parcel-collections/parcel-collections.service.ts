import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  ParcelCollection,
  CollectionStatus,
} from './entities/parcel-collection.entity';
import { Order } from '../orders/entities/order.entity';
import { Parcel, ParcelStatus, ParcelTracking } from '../super-agents/entities/parcel.entity';
import { ParcelCustodyEvent } from '../super-agents/entities/parcel-custody-event.entity';
import { User } from '../users/entities/user.entity';
import { Agent, AgentStatus } from '../agents/entities/agent.entity';
import { SuperAgent, SuperAgentStatus } from '../super-agents/entities/super-agent.entity';
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
        status: In([CollectionStatus.CLAIMED, CollectionStatus.COLLECTED]),
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

    await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT id FROM public.parcel_collection WHERE id = $1 FOR UPDATE', [collectionId]);
      const current = await manager.getRepository(ParcelCollection).findOne({ where: { id: collectionId }, relations: { agent: true, parcel: true } });
      if (!current || current.agent?.id !== agent.id || current.status !== CollectionStatus.COLLECTED || !current.parcel) {
        throw new BadRequestException('Collection is no longer ready for handover');
      }
      const parcel = await manager.getRepository(Parcel).findOne({ where: { id: current.parcel.id } });
      if (!parcel || parcel.status !== ParcelStatus.COLLECTED_BY_AGENT) {
        throw new BadRequestException('Parcel is no longer held by the collecting agent');
      }
      if (!current.handedOverAt) await manager.getRepository(ParcelCollection).update(collectionId, { handedOverAt: new Date() });
    });
    return { message: 'Handover requested. Awaiting receiving hub confirmation.' };
  }

  private async receivingHub(user: User, roleContext: RoleContext): Promise<SuperAgent> {
    if (!roleContext || roleContext.userId !== user.id || roleContext.roleType !== AccountRoleType.SUPER_AGENT) {
      throw new ForbiddenException('An active Super Agent role is required');
    }
    const hub = await this.dataSource.getRepository(SuperAgent).findOne({ where: { id: roleContext.profileId, userId: user.id } });
    if (!hub || hub.status !== SuperAgentStatus.ACTIVE ||
        (hub.workspaceId != null && hub.workspaceId !== roleContext.workspaceId)) {
      throw new ForbiddenException('An active receiving hub is required');
    }
    return hub;
  }

  async getHubHandoverRequests(user: User, roleContext: RoleContext): Promise<ParcelCollection[]> {
    const hub = await this.receivingHub(user, roleContext);
    return this.collectionRepo.createQueryBuilder('job')
      .leftJoinAndSelect('job.agent', 'agent')
      .leftJoinAndSelect('job.parcel', 'parcel')
      .leftJoinAndSelect('job.order', 'order')
      .where('job.status = :status', { status: CollectionStatus.COLLECTED })
      .andWhere('job."handedOverAt" IS NOT NULL')
      .andWhere('LOWER(TRIM(job.city)) = LOWER(TRIM(:city))', { city: hub.city })
      .andWhere('(parcel."superAgentId" IS NULL OR parcel."superAgentId" = :hubId)', { hubId: hub.id })
      .orderBy('job.handedOverAt', 'ASC').take(100).getMany();
  }

  async acceptHubHandover(collectionId: number, user: User, roleContext: RoleContext): Promise<any> {
    const hub = await this.receivingHub(user, roleContext);
    const job = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT id FROM public.parcel_collection WHERE id = $1 FOR UPDATE', [collectionId]);
      const current = await manager.getRepository(ParcelCollection).findOne({
        where: { id: collectionId }, relations: { agent: true, parcel: true, order: { buyer: true, seller: true } },
      });
      if (!current) throw new NotFoundException('Collection job not found');
      if (current.status !== CollectionStatus.COLLECTED || !current.handedOverAt || !current.agent || !current.parcel) {
        throw new BadRequestException('No pending handover for this collection');
      }
      if (current.city.trim().toLowerCase() !== hub.city.trim().toLowerCase()) {
        throw new ForbiddenException('Collection belongs to a different city');
      }
      await manager.query('SELECT id FROM public.parcel WHERE id = $1 FOR UPDATE', [current.parcel.id]);
      const parcel = await manager.getRepository(Parcel).findOne({ where: { id: current.parcel.id }, relations: { superAgent: true, order: true } });
      if (!parcel || parcel.status !== ParcelStatus.COLLECTED_BY_AGENT || parcel.order?.id !== current.order.id ||
          (parcel.superAgent && parcel.superAgent.id !== hub.id)) {
        throw new BadRequestException('Parcel cannot be received by this hub');
      }
      const pickup = await manager.getRepository(ParcelCustodyEvent).findOne({
        where: { parcelId: parcel.id, operationKey: `collection-collected:${collectionId}` },
      });
      const agentProfile = await manager.getRepository(Agent).findOne({ where: { user: { id: current.agent.id } } });
      if (!pickup || !agentProfile || pickup.toCustodianType !== 'local_agent' || pickup.toCustodianId !== agentProfile.id) {
        throw new BadRequestException('Agent pickup custody is missing');
      }
      await manager.getRepository(ParcelCustodyEvent).insert({
        parcelId: parcel.id, eventKind: 'collection_received_at_origin_hub',
        operationKey: `collection-hub-accepted:${collectionId}`,
        fromCustodianType: 'local_agent', fromCustodianId: agentProfile.id,
        toCustodianType: 'super_agent', toCustodianId: hub.id,
        actorSource: 'account_role', actorUserId: user.id,
        actorAccountRoleId: roleContext.accountRoleId, actorRoleType: roleContext.roleType,
        actorWorkspaceId: roleContext.workspaceId ?? null, actorProviderId: null,
        hubId: hub.id, assignmentId: null, evidenceRef: `collection:${collectionId}`,
      });
      await manager.getRepository(Parcel).update(parcel.id, { status: ParcelStatus.RECEIVED_AT_HUB, superAgent: hub });
      await manager.getRepository(ParcelCollection).update(collectionId, { status: CollectionStatus.HANDED_OVER });
      await manager.getRepository(Agent).increment({ id: agentProfile.id }, 'totalCollectionsCompleted', 1);
      for (const field of ['totalEarningsCollections', 'pendingEarnings', 'totalEarnings'] as const) {
        await manager.getRepository(Agent).increment({ id: agentProfile.id }, field, Number(current.collectionFee));
      }
      await manager.getRepository(ParcelTracking).insert({
        parcel, status: ParcelStatus.RECEIVED_AT_HUB, city: hub.city,
        note: 'Imepokelewa kutoka kwa wakala kwenye hub', updatedBy: hub.businessName,
        handlerPhone: hub.phone || user.phone || null, handlerLocation: hub.address || hub.city,
        handlerType: 'super_agent',
      });
      return current;
    });

    if ((job.order.seller as any)?.phone) {
      await this.smsService.sendSms(
        (job.order.seller as any).phone,
        `KenteXa: Kifurushi chako cha Agizo #${job.order.id} kimefika kituo cha ` +
          `Super Agent. Kinaandaliwa kutumwa. Asante! 🎉`,
      ).catch(() => {});
    }

    // Notify buyer
    if (job.order.buyer?.phone) {
      await this.smsService.sendSms(
        job.order.buyer.phone,
        `KenteXa: Bidhaa yako ya Agizo #${job.order.id} iko kituo cha KenteXa ` +
          `na inaandaliwa kutumwa kwako.`,
      ).catch(() => {});
    }

    return {
      message: 'Receiving hub confirmed collection. 🎉',
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

    const result = await this.collectionRepo.createQueryBuilder().update()
      .set({ agent: { id: agentUserId } as any,
        status: CollectionStatus.CLAIMED, claimedAt: new Date() })
      .where('id = :id', { id: collectionId })
      .andWhere('status = :status', { status: CollectionStatus.REQUESTED })
      .andWhere('"agentId" IS NULL').execute();
    if (!result.affected) throw new BadRequestException('Collection is no longer available for assignment');

    return { message: `Assigned to agent ${(agent as any).fullName}` };
  }

  // Admin cancel (no agent available, seller must bring themselves)
  async adminCancel(collectionId: number, reason: string): Promise<any> {
    const job = await this.collectionRepo.findOne({
      where: { id: collectionId },
      relations: { order: { seller: true }, parcel: true },
    });
    if (!job) throw new NotFoundException('Collection not found');

    await this.dataSource.transaction(async manager => {
      await manager.query('SELECT id FROM public.parcel_collection WHERE id = $1 FOR UPDATE', [collectionId]);
      const current = await manager.getRepository(ParcelCollection).findOne({
        where: { id: collectionId }, relations: { agent: true, parcel: true },
      });
      if (!current || current.status !== CollectionStatus.REQUESTED || current.agent) {
        throw new BadRequestException('Only an unclaimed collection can be cancelled');
      }
      if (current.parcel) {
        await manager.query('SELECT id FROM public.parcel WHERE id = $1 FOR UPDATE', [current.parcel.id]);
        const parcel = await manager.getRepository(Parcel).findOne({ where: { id: current.parcel.id } });
        if (!parcel || parcel.status !== ParcelStatus.COLLECTION_REQUESTED) {
          throw new BadRequestException('Parcel has moved beyond collection request');
        }
        await manager.getRepository(Parcel).update(parcel.id, { status: ParcelStatus.PENDING });
      }
      await manager.getRepository(ParcelCollection).update(collectionId, {
        status: CollectionStatus.CANCELLED, cancellationReason: reason,
      });
    });

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
