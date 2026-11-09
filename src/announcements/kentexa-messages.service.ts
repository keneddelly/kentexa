import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { In, LessThanOrEqual, Repository } from 'typeorm';
import { Announcement } from './announcement.entity';
import { AnnouncementsService } from './announcements.service';
import { User } from '../users/entities/user.entity';
import { AccountRole, AccountRoleStatus, AccountRoleType } from '../role-context/entities/account-role.entity';
import { Business } from '../business/entities/business.entity';
import { Notification } from '../notifications/entities/notification.entity';
import { InAppNotificationService } from '../notifications/in-app-notification.service';
import { PushService } from '../notifications/push.service';
import { SmsService } from '../sms/sms.service';

/**
 * "Tuma taarifa": KenteXa's own messages to its users (owner 2026-11-09: "admin or staff need to
 * send notifications to user, these maybe app notifications or SMS ... admin can write a message
 * to user about a new feature with its link"). Each message lands in the person's Taarifa list
 * (bell) and as a push on their phone, and opens the page it links to; SMS is optional.
 *
 * Who sends (owner's choice): admin and manager write messages; a manager's message to more than
 * 100 people, or any SMS from a manager, waits for an admin's approval; customer care may message
 * one person. Admin's own messages go straight out.
 */
export const MESSAGE_SOURCE = 'kentexa_message';
export const MESSAGE_TYPE = 'kentexa_message';
export const APPROVAL_OVER = 100;
export const SMS_PART_TZS = 22; // owner 2026-11-03: Africa's Talking bill, TZS 22 per SMS part

export const AUDIENCES: Record<string, { label: string; roles?: AccountRoleType[]; business?: boolean }> = {
  all: { label: 'Wote' },
  sellers: { label: 'Wauzaji', roles: [AccountRoleType.SELLER] },
  businesses: { label: 'Wenye biashara', business: true },
  super_agents: { label: 'Ofisi', roles: [AccountRoleType.SUPER_AGENT] },
  agents: { label: 'Agents', roles: [AccountRoleType.AGENT] },
  transport: { label: 'Usafiri', roles: [AccountRoleType.TRANSPORT_PROVIDER] },
  services: { label: 'Watoa huduma', roles: [AccountRoleType.SERVICE_PROVIDER] },
};

const WRITERS = new Set<string>([AccountRoleType.ADMIN, AccountRoleType.MANAGER]);
const ONE_PERSON = new Set<string>([AccountRoleType.ADMIN, AccountRoleType.MANAGER, AccountRoleType.CUSTOMER_CARE]);
const PAGE = /^[A-Z][A-Za-z]{1,40}$/;
const PARAM = /^[A-Za-z0-9_-]{1,60}$/;

export interface MessageDraft {
  title?: string;
  message?: string;
  audience?: string;
  targetUserId?: number | null;
  thresholdEntity?: 'seller' | 'super_agent';
  thresholdOperator?: 'gte' | 'lte';
  thresholdAmount?: number;
  actionPage?: string | null;
  actionParam?: string | null;
  linkUrl?: string | null;
  linkLabel?: string | null;
  sendSms?: boolean;
  scheduledAt?: string | null;
  priority?: string;
}

type Recipient = { id: number; phone: string | null };

export function smsText(a: Pick<Announcement, 'title' | 'message' | 'linkUrl' | 'actionPage'>): string {
  const link = a.linkUrl || (a.actionPage ? process.env.FRONTEND_URL || 'https://kentexa.com' : '');
  return `KenteXa: ${a.title}\n${a.message}${link ? `\n${link}` : ''}`;
}

/** SMS parts for plain text: one part up to 160 characters, then 153 per part. */
export function smsParts(text: string): number {
  const n = [...text].length;
  return n <= 160 ? 1 : Math.ceil(n / 153);
}

@Injectable()
export class KentexaMessagesService {
  private readonly logger = new Logger(KentexaMessagesService.name);

  constructor(
    @InjectRepository(Announcement) private readonly repo: Repository<Announcement>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AccountRole) private readonly roles: Repository<AccountRole>,
    @InjectRepository(Business) private readonly businesses: Repository<Business>,
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    private readonly announcements: AnnouncementsService,
    private readonly inApp: InAppNotificationService,
    private readonly push: PushService,
    private readonly sms: SmsService,
  ) {}

  // ── Who gets it ─────────────────────────────────────────────────────────────
  async recipients(d: Pick<MessageDraft, 'audience' | 'targetUserId' | 'thresholdEntity' | 'thresholdOperator' | 'thresholdAmount'>): Promise<Recipient[]> {
    if (d.targetUserId) {
      const u = await this.users.findOne({ where: { id: Number(d.targetUserId) }, select: { id: true, phone: true } });
      return u ? [{ id: u.id, phone: u.phone || null }] : [];
    }
    if (d.thresholdEntity && d.thresholdOperator && d.thresholdAmount != null) {
      const list = await this.announcements.resolveThresholdUsers({
        thresholdEntity: d.thresholdEntity, thresholdOperator: d.thresholdOperator, thresholdAmount: d.thresholdAmount,
      } as Announcement);
      return dedupe(list.map((u) => ({ id: u.id, phone: u.phone })));
    }
    const aud = AUDIENCES[d.audience || 'all'] || AUDIENCES.all;
    if (aud.roles) {
      const rows = await this.roles.createQueryBuilder('r')
        .innerJoin('r.user', 'u')
        .select(['r.userId AS id', 'u.phone AS phone'])
        .where('r.roleType IN (:...types)', { types: aud.roles })
        .andWhere('r.status = :active', { active: AccountRoleStatus.ACTIVE })
        .getRawMany<{ id: number; phone: string | null }>();
      return dedupe(rows.map((r) => ({ id: Number(r.id), phone: r.phone || null })));
    }
    if (aud.business) {
      const rows = await this.businesses.createQueryBuilder('b')
        .innerJoin('b.user', 'u')
        .select(['u.id AS id', 'u.phone AS phone'])
        .getRawMany<{ id: number; phone: string | null }>();
      return dedupe(rows.map((r) => ({ id: Number(r.id), phone: r.phone || null })));
    }
    const all = await this.users.find({ select: { id: true, phone: true } });
    return all.map((u) => ({ id: u.id, phone: u.phone || null }));
  }

  // ── Check before sending: how many, what SMS costs, whether admin must approve ──
  async preview(d: MessageDraft, roleType: string) {
    const clean = this.validate(d, roleType);
    const list = await this.recipients(clean);
    const withPhone = list.filter((r) => r.phone).length;
    const parts = smsParts(smsText({ title: clean.title!, message: clean.message!, linkUrl: clean.linkUrl ?? null, actionPage: clean.actionPage ?? null }));
    return {
      recipients: list.length,
      withPhone,
      smsParts: parts,
      smsCostTzs: clean.sendSms ? withPhone * parts * SMS_PART_TZS : 0,
      needsApproval: this.needsApproval(roleType, list.length, !!clean.sendSms),
    };
  }

  needsApproval(roleType: string, count: number, sendSms: boolean): boolean {
    return roleType !== AccountRoleType.ADMIN && (count > APPROVAL_OVER || sendSms);
  }

  // ── Write a message: goes out now, at its time, or waits for admin ──────────
  async create(sender: User, roleType: string, d: MessageDraft) {
    const clean = this.validate(d, roleType);
    const list = await this.recipients(clean);
    if (!list.length) throw new BadRequestException('Hakuna mtu wa kupokea taarifa hii.');
    const target = clean.targetUserId ? await this.users.findOne({ where: { id: Number(clean.targetUserId) }, select: { id: true, name: true } }) : null;

    const a = this.repo.create({
      title: clean.title!, message: clean.message!,
      audience: clean.targetUserId ? 'one' : clean.audience || 'all',
      priority: clean.priority || 'info',
      targetUserId: clean.targetUserId ? Number(clean.targetUserId) : null,
      targetUserName: target?.name || null,
      thresholdEntity: clean.targetUserId ? null : clean.thresholdEntity || null,
      thresholdOperator: clean.targetUserId ? null : clean.thresholdOperator || null,
      thresholdAmount: clean.targetUserId ? null : clean.thresholdAmount ?? null,
      actionPage: clean.actionPage || null, actionParam: clean.actionParam || null,
      linkUrl: clean.linkUrl || null, linkLabel: clean.linkLabel || null,
      sendSms: !!clean.sendSms, smsSent: false,
      scheduledAt: clean.scheduledAt ? new Date(clean.scheduledAt) : null,
      isActive: true, readByUserIds: [], createdBy: sender, createdByRole: roleType,
      recipientCount: list.length,
      status: 'scheduled',
    });
    if (this.needsApproval(roleType, list.length, !!clean.sendSms)) {
      a.status = 'pending_approval';
      const saved = await this.repo.save(a);
      await this.tellAdmins(saved, sender);
      return saved;
    }
    const saved = await this.repo.save(a);
    if (!saved.scheduledAt || saved.scheduledAt <= new Date()) return this.sendNow(saved.id);
    return saved;
  }

  // ── Admin approves or refuses a manager's message ─────────────────────────
  async approve(id: number, admin: User, roleType: string) {
    if (roleType !== AccountRoleType.ADMIN) throw new ForbiddenException('Admin pekee ndiye anaidhinisha.');
    const a = await this.get(id);
    if (a.status !== 'pending_approval') throw new BadRequestException('Taarifa hii haisubiri idhini.');
    a.approvedById = admin.id; a.approvedAt = new Date(); a.status = 'scheduled';
    await this.repo.save(a);
    if (!a.scheduledAt || a.scheduledAt <= new Date()) return this.sendNow(a.id);
    return a;
  }

  async reject(id: number, admin: User, roleType: string, reason?: string) {
    if (roleType !== AccountRoleType.ADMIN) throw new ForbiddenException('Admin pekee ndiye anaidhinisha.');
    const a = await this.get(id);
    if (a.status !== 'pending_approval') throw new BadRequestException('Taarifa hii haisubiri idhini.');
    a.status = 'rejected'; a.approvedById = admin.id; a.approvedAt = new Date(); a.rejectReason = String(reason || '').slice(0, 500) || null;
    await this.repo.save(a);
    const writer = (a.createdBy as any)?.id;
    if (writer) {
      await this.inApp.notify({
        userId: writer, type: MESSAGE_TYPE, title: 'Taarifa yako haikuidhinishwa',
        body: `"${a.title}"${a.rejectReason ? `: ${a.rejectReason}` : ''}`, actionPage: 'Announcements',
        sourceType: 'kentexa_message_review', sourceId: a.id,
      }).catch(() => undefined);
    }
    return a;
  }

  async cancel(id: number, user: User, roleType: string) {
    const a = await this.get(id);
    if (!['pending_approval', 'scheduled'].includes(a.status)) throw new BadRequestException('Taarifa hii imeshatumwa.');
    if (roleType !== AccountRoleType.ADMIN && (a.createdBy as any)?.id !== user.id) throw new ForbiddenException('Unaweza kusitisha taarifa yako tu.');
    a.status = 'cancelled';
    return this.repo.save(a);
  }

  /** A copy to the writer only, to see how it looks on the phone. Nothing is saved as sent. */
  async test(sender: User, roleType: string, d: MessageDraft) {
    const clean = this.validate({ ...d, targetUserId: sender.id }, roleType, true);
    await this.inApp.notify({
      userId: sender.id, type: MESSAGE_TYPE, title: `[Jaribio] ${clean.title}`, body: this.body(clean as any),
      actionPage: clean.actionPage || undefined, actionParam: clean.actionParam || undefined, sourceType: 'kentexa_message_test',
    });
    return { ok: true };
  }

  // ── Sending ─────────────────────────────────────────────────────────────────
  async sendNow(id: number) {
    // Claim it once, so a second click or the clock cannot send it twice.
    const claim = await this.repo.update({ id, status: 'scheduled' }, { status: 'sending' });
    if (!claim.affected) return this.get(id);
    const a = await this.get(id);
    try {
      const list = await this.recipients(a);
      const now = new Date();
      const body = this.body(a);
      const delivered: { userId: number; notificationId: number | null }[] = [];
      for (let i = 0; i < list.length; i += 500) {
        const chunk = list.slice(i, i + 500);
        const res = await this.notifications.insert(chunk.map((r) => ({
          userId: r.id, type: MESSAGE_TYPE, title: a.title, body,
          icon: null, actionPage: a.actionPage, actionParam: a.actionParam, isRead: false,
          audienceScope: 'ACCOUNT', sourceType: MESSAGE_SOURCE, sourceId: a.id, classificationStatus: 'resolved',
        })));
        chunk.forEach((r, k) => delivered.push({ userId: r.id, notificationId: res.identifiers?.[k]?.id ?? null }));
      }
      await this.repo.update(a.id, { status: 'sent', sentAt: now, recipientCount: list.length });
      this.pushAll(a, delivered).catch((e) => this.logger.warn(`push for message ${a.id}: ${e?.message}`));
      if (a.sendSms) this.smsAll(a, list).catch((e) => this.logger.error(`SMS for message ${a.id}: ${e?.message}`));
    } catch (e) {
      await this.repo.update(a.id, { status: 'scheduled' });
      throw e;
    }
    return this.get(a.id);
  }

  @Cron('0 * * * * *')
  async sendDue() {
    const due = await this.repo.find({ where: { status: 'scheduled', scheduledAt: LessThanOrEqual(new Date()) }, take: 20 }).catch(() => []);
    for (const a of due) await this.sendNow(a.id).catch((e) => this.logger.error(`scheduled message ${a.id}: ${e?.message}`));
  }

  // ── Lists with reach ───────────────────────────────────────────────────────
  async list() {
    const rows = await this.repo.find({ relations: { createdBy: true }, order: { createdAt: 'DESC' }, take: 200 });
    const ids = rows.filter((r) => r.status === 'sent').map((r) => r.id);
    const reads = ids.length
      ? await this.notifications.createQueryBuilder('n')
        .select('n.sourceId', 'id').addSelect('COUNT(*)', 'total').addSelect('SUM(CASE WHEN n.isRead THEN 1 ELSE 0 END)', 'opened')
        .where('n.sourceType = :s', { s: MESSAGE_SOURCE }).andWhere('n.sourceId IN (:...ids)', { ids })
        .groupBy('n.sourceId').getRawMany<{ id: number; total: string; opened: string }>()
      : [];
    const byId = new Map(reads.map((r) => [Number(r.id), r]));
    const approverIds = [...new Set(rows.map((r) => r.approvedById).filter(Boolean))] as number[];
    const approvers = approverIds.length ? await this.users.find({ where: { id: In(approverIds) }, select: { id: true, name: true } }) : [];
    const nameOf = new Map(approvers.map((u) => [u.id, u.name]));
    return rows.map((r) => ({
      id: r.id, title: r.title, message: r.message, status: r.status, audience: r.audience,
      audienceLabel: r.targetUserId ? r.targetUserName || `Mtumiaji #${r.targetUserId}` : r.thresholdEntity ? 'Wenye deni' : (AUDIENCES[r.audience]?.label || 'Wote'),
      targetUserId: r.targetUserId, actionPage: r.actionPage, actionParam: r.actionParam, linkUrl: r.linkUrl,
      sendSms: r.sendSms, smsCount: r.smsCount, scheduledAt: r.scheduledAt, sentAt: r.sentAt, createdAt: r.createdAt,
      recipientCount: byId.has(r.id) ? Number(byId.get(r.id)!.total) : r.recipientCount,
      openedCount: byId.has(r.id) ? Number(byId.get(r.id)!.opened || 0) : 0,
      createdBy: r.createdBy ? { id: r.createdBy.id, name: r.createdBy.name } : null, createdByRole: r.createdByRole,
      approvedBy: r.approvedById ? nameOf.get(r.approvedById) || `#${r.approvedById}` : null, rejectReason: r.rejectReason,
    }));
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  private validate(d: MessageDraft, roleType: string, forTest = false): MessageDraft {
    const one = !!d.targetUserId;
    if (!WRITERS.has(roleType) && !(one && ONE_PERSON.has(roleType))) {
      throw new ForbiddenException(roleType === AccountRoleType.CUSTOMER_CARE ? 'Huduma kwa wateja wanatuma kwa mtu mmoja tu.' : 'Huna ruhusa ya kutuma taarifa.');
    }
    const title = String(d.title || '').trim();
    const message = String(d.message || '').trim();
    if (!title || title.length > 80) throw new BadRequestException('Andika kichwa (hadi herufi 80).');
    if (!message || message.length > 600) throw new BadRequestException('Andika ujumbe (hadi herufi 600).');
    if (!one && !forTest && d.audience && !AUDIENCES[d.audience]) throw new BadRequestException('Chagua wanaopokea.');
    const actionPage = d.actionPage ? String(d.actionPage) : null;
    const actionParam = d.actionParam ? String(d.actionParam) : null;
    if (actionPage && !PAGE.test(actionPage)) throw new BadRequestException('Kiungo cha ndani si sahihi.');
    if (actionParam && (!actionPage || !PARAM.test(actionParam))) throw new BadRequestException('Kiungo cha ndani si sahihi.');
    const linkUrl = d.linkUrl ? String(d.linkUrl).trim() : null;
    if (linkUrl && !/^https:\/\/[^\s]+$/.test(linkUrl)) throw new BadRequestException('Kiungo cha nje kianze na https://');
    let scheduledAt: string | null = null;
    if (d.scheduledAt) {
      const t = new Date(d.scheduledAt);
      if (Number.isNaN(t.getTime())) throw new BadRequestException('Muda wa kutuma si sahihi.');
      if (t.getTime() > Date.now() + 60_000) scheduledAt = t.toISOString();
    }
    return { ...d, title, message, actionPage, actionParam, linkUrl, scheduledAt, sendSms: !!d.sendSms };
  }

  private body(a: Pick<Announcement, 'message' | 'linkUrl'>): string {
    return a.linkUrl ? `${a.message}\n${a.linkUrl}` : a.message;
  }

  private async get(id: number) {
    const a = await this.repo.findOne({ where: { id }, relations: { createdBy: true } });
    if (!a) throw new NotFoundException('Taarifa haipo.');
    return a;
  }

  private async tellAdmins(a: Announcement, writer: User) {
    const admins = await this.roles.find({ where: { roleType: AccountRoleType.ADMIN, status: AccountRoleStatus.ACTIVE }, select: { userId: true } });
    for (const { userId } of admins) {
      await this.inApp.notify({
        userId, type: MESSAGE_TYPE, title: 'Taarifa inasubiri idhini yako',
        body: `${writer.name || 'Meneja'}: "${a.title}" kwa watu ${a.recipientCount}${a.sendSms ? ', pamoja na SMS' : ''}.`,
        actionPage: 'Announcements', sourceType: 'kentexa_message_review', sourceId: a.id,
      }).catch(() => undefined);
    }
  }

  private async pushAll(a: Announcement, list: { userId: number; notificationId: number | null }[]) {
    for (const r of list) {
      // Same link as every other push: opens the notification, which opens the linked page.
      const url = r.notificationId ? `/?notificationId=${r.notificationId}` : '/';
      await this.push.sendToUser(r.userId, { title: a.title, body: a.message, url, tag: `${MESSAGE_SOURCE}-${a.id}` }).catch(() => undefined);
    }
  }

  private async smsAll(a: Announcement, list: Recipient[]) {
    const text = smsText(a);
    let sent = 0;
    for (const r of list) {
      if (!r.phone) continue;
      try {
        if (await this.sms.sendSms(r.phone, text)) sent++;
      } catch { /* one failed number never stops the rest */ }
      await new Promise((res) => setTimeout(res, 100));
    }
    await this.repo.update(a.id, { smsSent: true, smsCount: sent });
  }
}

function dedupe(list: Recipient[]): Recipient[] {
  const seen = new Map<number, Recipient>();
  for (const r of list) if (!seen.has(r.id)) seen.set(r.id, r);
  return [...seen.values()];
}
