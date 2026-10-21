import {
  BadRequestException, ConflictException, ForbiddenException, GoneException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  PartnerInvitation, PartnerInvitationChannel, PartnerInvitationRole, PartnerInvitationStatus,
} from './partner-invitation.entity';
import {
  buildPartnerInviteMessage, checkPartnerInviteToken, hashPartnerInviteToken, ownSmsInviteUrl,
  partnerInviteExpiry, partnerInviteLink, signPartnerInviteToken, whatsappInviteUrl,
} from './partner-invitation-link';
import { SuperAgent, SuperAgentStatus } from '../super-agents/entities/super-agent.entity';
import { Parcel } from '../super-agents/entities/parcel.entity';
import { TransportProvider } from '../transport/entities/transport-provider.entity';
import { User } from '../users/entities/user.entity';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import type { RoleContext } from '../role-context/role-context.types';
import { normalizeTzPhone } from '../common/utils/phone.util';
import { normalizeWaybill } from '../shipments/waybill';

const OPEN = [PartnerInvitationStatus.SENT, PartnerInvitationStatus.OPENED];

export const PARTNER_INVITE_MESSAGES = {
  activeOfficeOnly: 'Ofisi hai (Super Agent) pekee inaweza kualika washirika.',
  notYourParcel: 'Mzigo huu si wa ofisi yako.',
  noWaybill: 'Mzigo huu hauna namba ya waybill bado.',
  badPhone: 'Weka namba sahihi ya simu (mf. 0712345678).',
  badRole: 'Chagua msafirishaji au ofisi.',
  badChannel: 'Chagua WhatsApp au SMS yako.',
  invalidLink: 'Kiungo hiki si sahihi.',
  expiredLink: 'Kiungo hiki kimekwisha muda (kinadumu siku 7). Muombe aliyekualika akutumie kingine.',
  usedByAnother: 'Mwaliko huu tayari umetumiwa na akaunti nyingine.',
  wrongPhone: 'Mwaliko huu ni kwa namba nyingine. Ingia kwa akaunti ya namba iliyoalikwa.',
  trainingTestOnly: 'Ofisi ya mafunzo inaweza kualika namba za majaribio tu (namba ya ofisi, yako, au iliyoorodheshwa na KenteXa).',
  notJoinedYet: 'Mshirika huyu bado hajatuma ombi.',
} as const;

const tz = (phone: unknown) => (typeof phone === 'string' && phone.trim() ? normalizeTzPhone(phone) : '');

/**
 * Numbers a training office may invite, so it can practise without adding real partners:
 * the office's own phone, the inviting staff member's phone, and any number in the
 * optional PARTNER_INVITE_TEST_PHONES setting (comma-separated). Nothing else.
 */
export function trainingTestNumbers(office: { phone?: string | null }, user: { phone?: string | null }, list = process.env.PARTNER_INVITE_TEST_PHONES): Set<string> {
  return new Set([tz(office?.phone), tz(user?.phone), ...(list || '').split(',').map(tz)].filter((p) => /^255\d{9}$/.test(p)));
}

export interface CreatePartnerInvitationDto {
  parcelId?: number;
  waybill?: string;
  phone: string;
  name?: string;
  role: string;
  channel: string;
}

/**
 * Partner invitations: see partner-invitation.entity.ts. This service never sends a
 * message (it has no SMS dependency at all), never approves anyone, and never assigns
 * a parcel: it only records the invitation and builds the links the sender uses.
 */
@Injectable()
export class PartnerInvitationsService {
  constructor(
    @InjectRepository(PartnerInvitation) private readonly invitations: Repository<PartnerInvitation>,
    @InjectRepository(SuperAgent) private readonly superAgents: Repository<SuperAgent>,
    @InjectRepository(Parcel) private readonly parcels: Repository<Parcel>,
    @InjectRepository(TransportProvider) private readonly providers: Repository<TransportProvider>,
  ) {}

  /** The caller's own ACTIVE office, from the active Super Agent role context. */
  private async activeOffice(user: User, roleContext: RoleContext | undefined): Promise<SuperAgent> {
    if (!user || !roleContext || roleContext.roleType !== AccountRoleType.SUPER_AGENT || roleContext.userId !== user.id) {
      throw new ForbiddenException(PARTNER_INVITE_MESSAGES.activeOfficeOnly);
    }
    const office = await this.superAgents.findOne({
      where: { id: roleContext.profileId, userId: user.id, status: SuperAgentStatus.ACTIVE } as any,
    });
    if (!office || (office.workspaceId != null && office.workspaceId !== roleContext.workspaceId)) {
      throw new ForbiddenException(PARTNER_INVITE_MESSAGES.activeOfficeOnly);
    }
    return office;
  }

  /** sent/opened past expiresAt become expired (no scheduled job needed). */
  private async expireIfDue(rows: PartnerInvitation[], now = new Date()): Promise<PartnerInvitation[]> {
    const due = rows.filter((r) => OPEN.includes(r.status) && new Date(r.expiresAt).getTime() <= now.getTime());
    if (due.length) {
      await this.invitations.update({ id: In(due.map((r) => r.id)) }, { status: PartnerInvitationStatus.EXPIRED });
      due.forEach((r) => { r.status = PartnerInvitationStatus.EXPIRED; });
    }
    return rows;
  }

  private view(row: PartnerInvitation) {
    return {
      id: row.id, parcelId: row.parcelId, waybillNumber: row.waybillNumber,
      invitedPhone: row.invitedPhone, invitedName: row.invitedName,
      roleOffered: row.roleOffered, channel: row.channel, status: row.status,
      expiresAt: row.expiresAt, openedAt: row.openedAt, joinedAt: row.joinedAt, createdAt: row.createdAt,
    };
  }

  async create(user: User, roleContext: RoleContext | undefined, dto: CreatePartnerInvitationDto) {
    const office = await this.activeOffice(user, roleContext);

    const role = dto?.role as PartnerInvitationRole;
    if (!Object.values(PartnerInvitationRole).includes(role)) throw new BadRequestException(PARTNER_INVITE_MESSAGES.badRole);
    const channel = dto?.channel as PartnerInvitationChannel;
    if (!Object.values(PartnerInvitationChannel).includes(channel)) throw new BadRequestException(PARTNER_INVITE_MESSAGES.badChannel);
    const phone = typeof dto?.phone === 'string' ? normalizeTzPhone(dto.phone) : '';
    if (!/^255\d{9}$/.test(phone)) throw new BadRequestException(PARTNER_INVITE_MESSAGES.badPhone);
    // A training office practises on test numbers only, never real partners.
    if (office.isTrainingOffice && !trainingTestNumbers(office, user).has(phone)) {
      throw new ForbiddenException(PARTNER_INVITE_MESSAGES.trainingTestOnly);
    }
    const invitedName = typeof dto?.name === 'string' && dto.name.trim() ? dto.name.trim().slice(0, 100) : null;

    const waybill = dto?.waybill != null ? normalizeWaybill(dto.waybill) : null;
    const where: any = waybill ? { waybillNumber: waybill } : Number.isInteger(dto?.parcelId) ? { id: dto.parcelId } : null;
    if (!where) throw new NotFoundException('Parcel not found');
    const parcel = await this.parcels.findOne({ where, relations: { superAgent: true, destinationSuperAgent: true } as any });
    if (!parcel) throw new NotFoundException('Parcel not found');
    // The parcel must belong to this office: its origin or its destination hub.
    if (parcel.superAgent?.id !== office.id && parcel.destinationSuperAgent?.id !== office.id) {
      throw new ForbiddenException(PARTNER_INVITE_MESSAGES.notYourParcel);
    }
    if (!parcel.waybillNumber) throw new ConflictException(PARTNER_INVITE_MESSAGES.noWaybill);

    const expiresAt = partnerInviteExpiry();
    const token = signPartnerInviteToken(expiresAt, process.env.JWT_SECRET);
    const row = await this.invitations.save(this.invitations.create({
      invitedBySuperAgentId: office.id, invitedByUserId: user.id,
      parcelId: parcel.id, waybillNumber: parcel.waybillNumber,
      invitedPhone: phone, invitedName, roleOffered: role, channel,
      tokenHash: hashPartnerInviteToken(token), status: PartnerInvitationStatus.SENT, expiresAt,
    }));

    const link = partnerInviteLink(token);
    const message = buildPartnerInviteMessage({
      invitedName, officeName: office.businessName, officeCity: office.city, waybillNumber: parcel.waybillNumber,
      originCity: parcel.originCity, destinationCity: parcel.destinationCity, role, link,
    });
    return {
      invitation: this.view(row), link, message,
      whatsappUrl: whatsappInviteUrl(phone, message), smsUrl: ownSmsInviteUrl(phone, message),
    };
  }

  async listMine(user: User, roleContext: RoleContext | undefined, parcelId?: number) {
    const office = await this.activeOffice(user, roleContext);
    const where: any = { invitedBySuperAgentId: office.id };
    if (Number.isInteger(parcelId)) where.parcelId = parcelId;
    const rows = await this.invitations.find({ where, order: { createdAt: 'DESC' } as any, take: 100 });
    return (await this.expireIfDue(rows)).map((r) => this.view(r));
  }

  /** The inviting office confirms the person. Approval and job assignment stay separate. */
  async confirm(user: User, roleContext: RoleContext | undefined, id: number) {
    const office = await this.activeOffice(user, roleContext);
    const row = await this.invitations.findOne({ where: { id, invitedBySuperAgentId: office.id } as any });
    if (!row) throw new NotFoundException('Invitation not found');
    if (row.status === PartnerInvitationStatus.CONFIRMED) return this.view(row);
    if (row.status !== PartnerInvitationStatus.JOINED) throw new ConflictException(PARTNER_INVITE_MESSAGES.notJoinedYet);
    await this.invitations.update({ id: row.id }, { status: PartnerInvitationStatus.CONFIRMED });
    return this.view({ ...row, status: PartnerInvitationStatus.CONFIRMED });
  }

  /** Token → row. Expired tokens and rows are refused with 410. */
  private async rowForToken(token: string): Promise<PartnerInvitation> {
    const check = checkPartnerInviteToken(token, process.env.JWT_SECRET);
    if (check === 'invalid') throw new NotFoundException(PARTNER_INVITE_MESSAGES.invalidLink);
    const row = await this.invitations.findOne({
      where: { tokenHash: hashPartnerInviteToken(token) },
      relations: { invitedBySuperAgent: true, parcel: true } as any,
    });
    if (!row) throw new NotFoundException(PARTNER_INVITE_MESSAGES.invalidLink);
    if (check === 'expired') await this.expireIfDue([row], new Date(Math.max(Date.now(), new Date(row.expiresAt).getTime())));
    else await this.expireIfDue([row]);
    if (row.status === PartnerInvitationStatus.EXPIRED) throw new GoneException(PARTNER_INVITE_MESSAGES.expiredLink);
    return row;
  }

  /** Public join page: the waybill summary only, never the recipient's details. */
  async publicView(token: string) {
    const row = await this.rowForToken(token);
    if (row.status === PartnerInvitationStatus.SENT) {
      const openedAt = new Date();
      await this.invitations.update({ id: row.id }, { status: PartnerInvitationStatus.OPENED, openedAt });
      row.status = PartnerInvitationStatus.OPENED;
      row.openedAt = openedAt;
    }
    const p: any = row.parcel || {};
    return {
      status: row.status,
      roleOffered: row.roleOffered,
      invitedName: row.invitedName,
      expiresAt: row.expiresAt,
      invitedBy: { officeName: row.invitedBySuperAgent?.businessName ?? null, city: row.invitedBySuperAgent?.city ?? null },
      waybill: {
        waybillNumber: row.waybillNumber,
        originCity: p.originCity ?? null,
        destinationCity: p.destinationCity ?? null,
        weightKg: p.weightKg != null ? Number(p.weightKg) : null,
      },
    };
  }

  /** The application this user already has for the offered role, if any (any status). */
  private async existingApplicationId(userId: number, role: PartnerInvitationRole): Promise<number | null> {
    const found = role === PartnerInvitationRole.TRANSPORT_PROVIDER
      ? await this.providers.findOne({ where: { userId } as any, order: { id: 'ASC' } as any })
      : await this.superAgents.findOne({ where: { userId } as any, order: { id: 'ASC' } as any });
    return found?.id ?? null;
  }

  /**
   * Logged-in invitee accepts the link: the account is recorded on the invitation. Only
   * the invited number can accept. If they already applied for the offered role it
   * counts as joined now; otherwise the page sends them to the normal application, and
   * joined is recorded when it is saved.
   */
  async accept(user: User, token: string) {
    const row = await this.rowForToken(token);
    if (tz(user?.phone) !== row.invitedPhone) throw new ForbiddenException(PARTNER_INVITE_MESSAGES.wrongPhone);
    if (row.joinedUserId && row.joinedUserId !== user.id) throw new ConflictException(PARTNER_INVITE_MESSAGES.usedByAnother);
    const patch: Partial<PartnerInvitation> = {};
    if (!row.joinedUserId) patch.joinedUserId = user.id;
    // Accepting a link counts as opening it.
    if (row.status === PartnerInvitationStatus.SENT) {
      Object.assign(patch, { status: PartnerInvitationStatus.OPENED, openedAt: new Date() });
      row.status = PartnerInvitationStatus.OPENED;
    }
    if (Object.keys(patch).length) await this.invitations.update({ id: row.id }, patch);
    if (OPEN.includes(row.status)) {
      const applicationId = await this.existingApplicationId(user.id, row.roleOffered);
      if (applicationId) {
        await this.markJoined(row.id, applicationId);
        return { status: PartnerInvitationStatus.JOINED, roleOffered: row.roleOffered, next: 'done' as const };
      }
      return { status: row.status, roleOffered: row.roleOffered, next: 'apply' as const };
    }
    return { status: row.status, roleOffered: row.roleOffered, next: 'done' as const };
  }

  private async markJoined(id: number, applicationId: number) {
    await this.invitations.update(
      { id, status: In(OPEN) } as any,
      { status: PartnerInvitationStatus.JOINED, joinedAt: new Date(), joinedApplicationId: applicationId },
    );
  }

  /**
   * Called right after a transport or hub application is saved: open, unexpired
   * invitations this user accepted for that role become joined. Only the invitation
   * changes; the application keeps its normal pending status.
   */
  async onApplicationSubmitted(userId: number, role: PartnerInvitationRole, applicationId: number): Promise<number> {
    if (!userId || !applicationId) return 0;
    const rows = await this.expireIfDue(await this.invitations.find({
      where: { joinedUserId: userId, roleOffered: role, status: In(OPEN) } as any,
    }));
    const open = rows.filter((r) => OPEN.includes(r.status));
    for (const r of open) await this.markJoined(r.id, applicationId);
    return open.length;
  }
}
