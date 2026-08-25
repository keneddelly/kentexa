import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, In } from 'typeorm';
import { AnalyticsSession } from './analytics-session.entity';
import { AnalyticsEvent } from './analytics-event.entity';
import { UAParser } from 'ua-parser-js';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectRepository(AnalyticsSession)
    private sessionRepo: Repository<AnalyticsSession>,
    @InjectRepository(AnalyticsEvent)
    private eventRepo: Repository<AnalyticsEvent>,
  ) {}

  // ── Track event (called on every user action) ───────────────────────────
  async trackEvent(dto: {
    sessionId: string;
    userId?: number | null;
    eventType: string;
    eventCategory?: string;
    eventLabel?: string;
    page?: string;
    pageUrl?: string;
    targetId?: string;
    targetType?: string;
    targetName?: string;
    metadata?: Record<string, any>;
    scrollDepth?: number;
    timeOnPage?: number;
    clickX?: number;
    clickY?: number;
    // Session info (sent on first event or session init)
    sessionInfo?: {
      browser?: string;
      browserVersion?: string;
      os?: string;
      device?: string;
      screenWidth?: number;
      screenHeight?: number;
      language?: string;
      timezone?: string;
      referrer?: string;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
      utmContent?: string;
    };
    userAgent?: string;
    ipAddress?: string;
  }) {
    try {
      // Get or create session
      let session = await this.sessionRepo.findOne({
        where: { sessionId: dto.sessionId },
      });

      if (!session) {
        // Parse user agent
        const parser = new UAParser(dto.userAgent || '');
        const ua = parser.getResult();
        const sessionInfo = dto.sessionInfo || {};

        try {
          session = this.sessionRepo.create({
            sessionId: dto.sessionId,
            userId: dto.userId || null,
            browser: sessionInfo.browser || ua.browser?.name,
            browserVersion: sessionInfo.browserVersion || ua.browser?.version,
            os: sessionInfo.os || ua.os?.name,
            device: sessionInfo.device || ua.device?.type || 'desktop',
            screenWidth: sessionInfo.screenWidth,
            screenHeight: sessionInfo.screenHeight,
            language: sessionInfo.language,
            timezone: sessionInfo.timezone,
            referrer: sessionInfo.referrer,
            utmSource: sessionInfo.utmSource,
            utmMedium: sessionInfo.utmMedium,
            utmCampaign: sessionInfo.utmCampaign,
            utmContent: sessionInfo.utmContent,
            ipAddress: dto.ipAddress,
            pageViews: 0,
            events: 0,
          });
          session = await this.sessionRepo.save(session);
        } catch (dupErr: any) {
          // Race condition: another request created the session first
          // Just fetch the existing one and continue
          if (dupErr.code === '23505') {
            session = await this.sessionRepo.findOne({
              where: { sessionId: dto.sessionId },
            });
            if (!session) throw dupErr; // unexpected — re-throw
          } else {
            throw dupErr;
          }
        }
      } else if (dto.userId && !session.userId) {
        // User logged in mid-session — link them
        await this.sessionRepo.update(session.id, { userId: dto.userId });
      }

      // Update session stats
      const updates: Partial<AnalyticsSession> = {
        lastSeenAt: new Date(),
        events: (session.events || 0) + 1,
      };
      if (dto.eventType === 'page_view') {
        updates.pageViews = (session.pageViews || 0) + 1;
        updates.exitPage = dto.page;
      }
      if (dto.eventType === 'order_placed') {
        updates.converted = true;
      }
      await this.sessionRepo.update(session.id, updates);

      // Save the event
      const event = this.eventRepo.create({
        sessionId: dto.sessionId,
        session: session,
        userId: dto.userId || session.userId || null,
        eventType: dto.eventType,
        eventCategory: dto.eventCategory,
        eventLabel: dto.eventLabel,
        page: dto.page,
        pageUrl: dto.pageUrl,
        targetId: dto.targetId,
        targetType: dto.targetType,
        targetName: dto.targetName,
        metadata: dto.metadata,
        scrollDepth: dto.scrollDepth,
        timeOnPage: dto.timeOnPage,
        clickX: dto.clickX,
        clickY: dto.clickY,
      });
      await this.eventRepo.save(event);
    } catch (err) {
      // Never fail silently — analytics should never break the app
      this.logger.error('Analytics track failed: ' + err.message);
    }
  }

  // ── Admin dashboard stats ────────────────────────────────────────────────
  async getDashboardStats(days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const [
      totalSessions,
      totalEvents,
      totalPageViews,
      conversions,
      activeSessions,
    ] = await Promise.all([
      this.sessionRepo.count({ where: { createdAt: MoreThanOrEqual(since) } }),
      this.eventRepo.count({ where: { createdAt: MoreThanOrEqual(since) } }),
      this.eventRepo.count({
        where: { eventType: 'page_view', createdAt: MoreThanOrEqual(since) },
      }),
      this.sessionRepo.count({
        where: { converted: true, createdAt: MoreThanOrEqual(since) },
      }),
      // Sessions active in last 5 minutes
      this.sessionRepo.count({
        where: {
          lastSeenAt: MoreThanOrEqual(new Date(Date.now() - 5 * 60 * 1000)),
        },
      }),
    ]);

    // Top pages
    const topPages = await this.eventRepo
      .createQueryBuilder('e')
      .select('e.page', 'page')
      .addSelect('COUNT(*)', 'views')
      .where('e.eventType = :type AND e.createdAt >= :since', {
        type: 'page_view',
        since,
      })
      .groupBy('e.page')
      .orderBy('views', 'DESC')
      .limit(10)
      .getRawMany();

    // Top products viewed
    const topProducts = await this.eventRepo
      .createQueryBuilder('e')
      .select('e.targetName', 'name')
      .addSelect('e.targetId', 'id')
      .addSelect('COUNT(*)', 'views')
      .where('e.eventType = :type AND e.createdAt >= :since', {
        type: 'product_view',
        since,
      })
      .groupBy('e.targetName, e.targetId')
      .orderBy('views', 'DESC')
      .limit(10)
      .getRawMany();

    // Top search terms
    const topSearches = await this.eventRepo
      .createQueryBuilder('e')
      .select('e.targetName', 'term')
      .addSelect('COUNT(*)', 'count')
      .where('e.eventType = :type AND e.createdAt >= :since', {
        type: 'search',
        since,
      })
      .groupBy('e.targetName')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    // Device breakdown
    const devices = await this.sessionRepo
      .createQueryBuilder('s')
      .select('s.device', 'device')
      .addSelect('COUNT(*)', 'count')
      .where('s.createdAt >= :since', { since })
      .groupBy('s.device')
      .orderBy('count', 'DESC')
      .getRawMany();

    // Browser breakdown
    const browsers = await this.sessionRepo
      .createQueryBuilder('s')
      .select('s.browser', 'browser')
      .addSelect('COUNT(*)', 'count')
      .where('s.createdAt >= :since', { since })
      .groupBy('s.browser')
      .orderBy('count', 'DESC')
      .limit(8)
      .getRawMany();

    // Traffic sources (referrers)
    const sources = await this.sessionRepo
      .createQueryBuilder('s')
      .select(
        "COALESCE(s.utmSource, CASE WHEN s.referrer IS NULL THEN 'Direct' WHEN s.referrer LIKE '%google%' THEN 'Google' WHEN s.referrer LIKE '%whatsapp%' THEN 'WhatsApp' WHEN s.referrer LIKE '%facebook%' THEN 'Facebook' ELSE 'Other' END)",
        'source',
      )
      .addSelect('COUNT(*)', 'count')
      .where('s.createdAt >= :since', { since })
      .groupBy('1')
      .orderBy('count', 'DESC')
      .getRawMany();

    // Sessions by day
    const byDay = await this.sessionRepo
      .createQueryBuilder('s')
      .select('DATE(s.createdAt)', 'date')
      .addSelect('COUNT(*)', 'sessions')
      .where('s.createdAt >= :since', { since })
      .groupBy('DATE(s.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany();

    // Events by type
    const eventTypes = await this.eventRepo
      .createQueryBuilder('e')
      .select('e.eventType', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('e.createdAt >= :since', { since })
      .groupBy('e.eventType')
      .orderBy('count', 'DESC')
      .limit(15)
      .getRawMany();

    // City breakdown
    const cities = await this.sessionRepo
      .createQueryBuilder('s')
      .select('s.city', 'city')
      .addSelect('COUNT(*)', 'count')
      .where('s.createdAt >= :since AND s.city IS NOT NULL', { since })
      .groupBy('s.city')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    // Recent sessions (live feed)
    const recentSessions = await this.sessionRepo.find({
      order: { lastSeenAt: 'DESC' },
      take: 20,
    });

    return {
      summary: {
        totalSessions,
        totalEvents,
        totalPageViews,
        conversions,
        activeSessions,
        conversionRate:
          totalSessions > 0
            ? ((conversions / totalSessions) * 100).toFixed(1)
            : '0',
        avgEventsPerSession:
          totalSessions > 0 ? (totalEvents / totalSessions).toFixed(1) : '0',
      },
      topPages,
      topProducts,
      topSearches,
      devices,
      browsers,
      sources,
      byDay,
      eventTypes,
      cities,
      recentSessions,
    };
  }

  // ── Get recent events for live feed ─────────────────────────────────────
  async getRecentEvents(limit = 50) {
    return this.eventRepo.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  // ── Get full session detail ──────────────────────────────────────────────
  async getSessionDetail(sessionId: string) {
    const session = await this.sessionRepo.findOne({ where: { sessionId } });
    const events = await this.eventRepo.find({
      where: { sessionId },
      order: { createdAt: 'ASC' },
    });
    return { session, events };
  }

  // Layer 2 building block for the business intelligence report
  // (BusinessService.getTodayIntelligence()) — deterministic count of a
  // specific frontend event type since a given time, optionally scoped to
  // one target (a single profile view count) or a set of targets (view
  // counts across every product a seller owns). Kept here rather than
  // exposing the raw AnalyticsEvent repo to other modules.
  async countEventsSince(params: {
    eventType: string;
    since: Date;
    targetType?: string;
    targetId?: string;
    targetIdIn?: string[];
  }): Promise<number> {
    if (params.targetIdIn && params.targetIdIn.length === 0) return 0;
    return this.eventRepo.count({
      where: {
        eventType: params.eventType,
        createdAt: MoreThanOrEqual(params.since),
        ...(params.targetType ? { targetType: params.targetType } : {}),
        ...(params.targetId ? { targetId: params.targetId } : {}),
        ...(params.targetIdIn ? { targetId: In(params.targetIdIn) } : {}),
      },
    });
  }
}
