import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Announcement } from './announcement.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { SellerProfile } from '../seller/entities/seller-profile.entity';
import { SuperAgent } from '../super-agents/entities/super-agent.entity';
import { SmsService } from '../sms/sms.service';
import { Logger } from '@nestjs/common';

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);

  constructor(
    @InjectRepository(Announcement) private repo: Repository<Announcement>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(SellerProfile) private sellerProfileRepo: Repository<SellerProfile>,
    @InjectRepository(SuperAgent) private superAgentRepo: Repository<SuperAgent>,
    private smsService: SmsService,
  ) {}

  // ── Admin: create announcement ───────────────────────────────────────────
  async create(
    admin: User,
    dto: {
      title: string;
      message: string;
      audience: string;
      priority: string;
      linkUrl?: string;
      linkLabel?: string;
      sendSms?: boolean;
      expiresAt?: string;
      targetUserId?: number;
      targetUserName?: string;
      thresholdEntity?: 'seller' | 'super_agent';
      thresholdOperator?: 'gte' | 'lte';
      thresholdAmount?: number;
    },
  ) {
    const announcement = new Announcement();
    announcement.title = dto.title;
    announcement.message = dto.message;
    announcement.audience = dto.audience || 'all';
    announcement.priority = dto.priority || 'info';
    announcement.linkUrl = dto.linkUrl || null;
    announcement.linkLabel = dto.linkLabel || null;
    announcement.sendSms = dto.sendSms || false;
    announcement.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    announcement.createdBy = admin;
    announcement.isActive = true;
    announcement.readByUserIds = [];
    announcement.targetUserId = dto.targetUserId || null;
    announcement.targetUserName = dto.targetUserName || null;
    // Threshold targeting is ignored entirely when a single user is
    // targeted -- the two modes are mutually exclusive.
    if (!dto.targetUserId && dto.thresholdEntity && dto.thresholdOperator && dto.thresholdAmount != null) {
      announcement.thresholdEntity = dto.thresholdEntity;
      announcement.thresholdOperator = dto.thresholdOperator;
      announcement.thresholdAmount = dto.thresholdAmount;
    } else {
      announcement.thresholdEntity = null;
      announcement.thresholdOperator = null;
      announcement.thresholdAmount = null;
    }

    const saved = await this.repo.save(announcement);

    // Send SMS if requested
    if (dto.sendSms) {
      this.sendSmsBlast(saved).catch((e) =>
        this.logger.error('SMS blast failed: ' + e.message),
      );
    }

    return saved;
  }

  // Resolves which User rows currently match a threshold-targeted
  // announcement's condition -- e.g. every SellerProfile/SuperAgent whose
  // outstandingBalance is >= or <= the configured amount, mapped to their
  // linked User. Shared by sendSmsBlast() (at send time) and getForUser()
  // (evaluated live per recipient, so it never freezes a stale snapshot).
  private async resolveThresholdUsers(
    announcement: Announcement,
  ): Promise<{ id: number; phone: string | null; name: string | null }[]> {
    if (!announcement.thresholdEntity || !announcement.thresholdOperator || announcement.thresholdAmount == null) {
      return [];
    }
    const op = announcement.thresholdOperator === 'gte' ? '>=' : '<=';
    const amount = Number(announcement.thresholdAmount);

    if (announcement.thresholdEntity === 'seller') {
      const profiles = await this.sellerProfileRepo
        .createQueryBuilder('sp')
        .leftJoinAndSelect('sp.user', 'u')
        .where(`sp.outstandingBalance ${op} :amount`, { amount })
        .getMany();
      return profiles.filter((p) => p.user).map((p) => ({
        id: p.user.id,
        phone: p.user.phone,
        name: p.user.name,
      }));
    }

    const agents = await this.superAgentRepo
      .createQueryBuilder('sa')
      .leftJoinAndSelect('sa.user', 'u')
      .where(`sa.outstandingBalance ${op} :amount`, { amount })
      .getMany();
    return agents.filter((a) => a.user).map((a) => ({
      id: a.user.id,
      phone: a.user.phone,
      name: a.user.name,
    }));
  }

  // ── Send SMS to targeted users ───────────────────────────────────────────
  private async sendSmsBlast(announcement: Announcement) {
    let users: { id: number; phone: string | null; name: string | null }[];

    if (announcement.targetUserId) {
      // Single-user announcement -- audience/threshold are ignored entirely.
      const target = await this.userRepo.findOne({
        where: { id: announcement.targetUserId },
        select: { id: true, phone: true, name: true },
      });
      users = target ? [target] : [];
    } else if (announcement.thresholdEntity) {
      users = await this.resolveThresholdUsers(announcement);
    } else {
      // Build user query based on audience
      const roleMap: Record<string, UserRole[]> = {
        all: ['user', 'seller', 'agent', 'super_agent'] as any[],
        sellers: ['seller'] as any[],
        agents: ['agent'] as any[],
        super_agents: ['super_agent'] as any[],
        buyers: ['user'] as any[],
      };

      const roles = roleMap[announcement.audience] || roleMap.all;

      // Get all users with phones in target audience
      users = await this.userRepo
        .createQueryBuilder('u')
        .select(['u.id', 'u.phone', 'u.name'])
        .where('u.role IN (:...roles)', { roles })
        .andWhere('u.phone IS NOT NULL')
        .getMany();
    }

    let sent = 0;
    const msg = `KenteXa: ${announcement.title}\n${announcement.message}${announcement.linkUrl ? '\n' + announcement.linkUrl : ''}`;

    for (const user of users) {
      try {
        if (user.phone) await this.smsService.sendSms(user.phone, msg);
        sent++;
        // Small delay to avoid rate limiting
        await new Promise((r) => setTimeout(r, 100));
      } catch (e) {
        this.logger.warn(`SMS to ${user.phone} failed: ${e.message}`);
      }
    }

    await this.repo.update(announcement.id, { smsSent: true });
    this.logger.log(`SMS blast sent to ${sent}/${users.length} users`);
    return { sent, total: users.length };
  }

  // ── Get announcements for a user ─────────────────────────────────────────
  async getForUser(user: User) {
    const now = new Date();

    // Audience filter
    const audienceMap: Record<string, string[]> = {
      user: ['all', 'buyers'],
      seller: ['all', 'sellers'],
      agent: ['all', 'agents'],
      super_agent: ['all', 'super_agents'],
      admin: ['all'],
      manager: ['all'],
      customer_care: ['all'],
    };
    const audiences = audienceMap[user.role as string] || ['all'];

    const candidates = await this.repo
      .createQueryBuilder('a')
      .where('a.isActive = true')
      .andWhere(
        `(a.targetUserId = :userId
          OR (a.targetUserId IS NULL AND a.thresholdEntity IS NULL AND a.audience IN (:...audiences))
          OR a.thresholdEntity IS NOT NULL)`,
        { userId: user.id, audiences },
      )
      .andWhere('(a.expiresAt IS NULL OR a.expiresAt > :now)', { now })
      .orderBy('a.createdAt', 'DESC')
      .limit(20)
      .getMany();

    // Threshold-targeted candidates need a live per-recipient check --
    // evaluated fresh every read (never a frozen snapshot), so a seller
    // who pays down their balance naturally stops seeing the reminder.
    const [sellerProfile, superAgent] = await Promise.all([
      this.sellerProfileRepo.findOne({ where: { user: { id: user.id } } }),
      this.superAgentRepo.findOne({ where: { user: { id: user.id } } }),
    ]);
    const matchesThreshold = (a: Announcement): boolean => {
      if (!a.thresholdEntity) return true;
      const balance =
        a.thresholdEntity === 'seller'
          ? sellerProfile?.outstandingBalance
          : superAgent?.outstandingBalance;
      if (balance == null) return false;
      const amount = Number(a.thresholdAmount);
      return a.thresholdOperator === 'gte'
        ? Number(balance) >= amount
        : Number(balance) <= amount;
    };

    const announcements = candidates.filter(matchesThreshold);

    // Filter out ones user already read
    return announcements
      .filter((a) => !a.readByUserIds?.includes(user.id))
      .map((a) => ({
        id: a.id,
        title: a.title,
        message: a.message,
        priority: a.priority,
        linkUrl: a.linkUrl,
        linkLabel: a.linkLabel,
        createdAt: a.createdAt,
      }));
  }

  // ── Mark as read ─────────────────────────────────────────────────────────
  async markRead(announcementId: number, userId: number) {
    const a = await this.repo.findOne({ where: { id: announcementId } });
    if (!a) throw new NotFoundException('Announcement not found');

    const readBy = a.readByUserIds || [];
    if (!readBy.includes(userId)) {
      await this.repo.update(announcementId, {
        readByUserIds: [...readBy, userId],
      });
    }
    return { ok: true };
  }

  // ── Admin: get all announcements ──────────────────────────────────────────
  async findAll() {
    return this.repo.find({
      relations: { createdBy: true },
      order: { createdAt: 'DESC' },
    });
  }

  // ── Admin: update ─────────────────────────────────────────────────────────
  async update(
    id: number,
    dto: Partial<{
      title: string;
      message: string;
      isActive: boolean;
      priority: string;
      audience: string;
      expiresAt: string;
    }>,
  ) {
    await this.repo.update(id, dto);
    return this.repo.findOne({ where: { id } });
  }

  // ── Admin: delete ─────────────────────────────────────────────────────────
  async remove(id: number) {
    await this.repo.delete(id);
    return { ok: true };
  }

  // ── Get unread count for user ─────────────────────────────────────────────
  async getUnreadCount(user: User) {
    const announcements = await this.getForUser(user);
    return { count: announcements.length };
  }
}
