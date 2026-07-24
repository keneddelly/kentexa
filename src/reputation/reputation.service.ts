/**
 * ReputationService — Commerce Identity reputation engine
 * Place at: src/reputation/reputation.service.ts
 *
 * Called by any module when a reputation-affecting event happens.
 * Also has a bootstrap method to compute scores from existing data.
 */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository }   from '@nestjs/typeorm';
import { Repository }         from 'typeorm';
import {
  ReputationEvent,
  ReputationEventType,
  REPUTATION_POINTS,
  getTier,
} from './entities/reputation-event.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class ReputationService {
  private readonly logger = new Logger(ReputationService.name);

  constructor(
    @InjectRepository(ReputationEvent)
    private eventRepo: Repository<ReputationEvent>,
    @InjectRepository(User)
    private userRepo:  Repository<User>,
  ) {}

  // ── Add a reputation event ────────────────────────────────────────────────

  async award(userId: number, eventType: ReputationEventType, opts?: {
    sourceEntityType?: string;
    sourceEntityId?:   number;
    note?:             string;
  }): Promise<{ score: number; tier: ReturnType<typeof getTier> }> {
    const points = REPUTATION_POINTS[eventType];

    // Get current score
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return { score: 0, tier: getTier(0) };

    const currentScore: number = (user as any).reputationScore || 0;

    // Floor: score can't go below 10% of peak (resilience principle)
    const newScore = Math.max(
      Math.round(currentScore * 0.1),
      currentScore + points
    );
    const clampedScore = Math.min(1000, Math.max(0, newScore));

    // Save event
    await this.eventRepo.save(this.eventRepo.create({
      userId,
      eventType,
      points,
      scoreAfter:      clampedScore,
      sourceEntityType: opts?.sourceEntityType || null,
      sourceEntityId:   opts?.sourceEntityId   || null,
      note:             opts?.note             || null,
    }));

    // Update user score
    await this.userRepo.update(userId, { reputationScore: clampedScore } as any);

    const tier = getTier(clampedScore);
    this.logger.log(`User ${userId} | ${eventType} | ${points > 0 ? '+' : ''}${points} → ${clampedScore} (${tier.name})`);

    return { score: clampedScore, tier };
  }

  // ── Get reputation profile for a user ────────────────────────────────────

  async getProfile(userId: number): Promise<{
    score:       number;
    tier:        ReturnType<typeof getTier>;
    history:     ReputationEvent[];
    breakdown:   Record<string, number>;
    rank?:       number;
  }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    const score: number = (user as any)?.reputationScore || 0;
    const tier  = getTier(score);

    const history = await this.eventRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take:  20,
    });

    // Breakdown by category
    const breakdown: Record<string, number> = {
      orders:    0,
      deliveries: 0,
      ratings:   0,
      trust:     0,
      other:     0,
    };
    const allEvents = await this.eventRepo.find({ where: { userId } });
    for (const e of allEvents) {
      if (e.eventType.includes('order')) breakdown.orders += e.points;
      else if (e.eventType.includes('delivery') || e.eventType.includes('transport')) breakdown.deliveries += e.points;
      else if (e.eventType.includes('rating') || e.eventType.includes('star')) breakdown.ratings += e.points;
      else if (e.eventType.includes('verified') || e.eventType.includes('year')) breakdown.trust += e.points;
      else breakdown.other += e.points;
    }

    // Rough rank (how many users have higher score)
    const higher = await this.userRepo
      .createQueryBuilder('u')
      .where('CAST(u."reputationScore" AS int) > :score', { score })
      .getCount();

    return { score, tier, history, breakdown, rank: higher + 1 };
  }

  // ── Bootstrap: compute scores from existing data ──────────────────────────

  async bootstrap(): Promise<{ processed: number }> {
    this.logger.log('Starting reputation bootstrap...');
    let processed = 0;

    // Award VERIFIED_PHONE to all verified users who don't have it yet
    const verifiedUsers = await this.userRepo.find({ where: { isVerified: true } });
    for (const u of verifiedUsers) {
      const existing = await this.eventRepo.findOne({
        where: { userId: u.id, eventType: ReputationEventType.VERIFIED_PHONE }
      });
      if (!existing) {
        await this.award(u.id, ReputationEventType.VERIFIED_PHONE, {
          note: 'Bootstrap: phone verified'
        });
        processed++;
      }
    }

    // Award VERIFIED_ID to sellers with KYC approved
    const sellers = await this.userRepo
      .createQueryBuilder('u')
      .where("u.role = 'seller'")
      .getMany();
    for (const u of sellers) {
      const existing = await this.eventRepo.findOne({
        where: { userId: u.id, eventType: ReputationEventType.VERIFIED_BUSINESS }
      });
      if (!existing) {
        await this.award(u.id, ReputationEventType.VERIFIED_BUSINESS, {
          note: 'Bootstrap: seller account'
        });
        processed++;
      }
    }

    this.logger.log(`Reputation bootstrap complete. Processed ${processed} events.`);
    return { processed };
  }

  // ── Admin: get leaderboard ────────────────────────────────────────────────

  async getLeaderboard(limit = 20): Promise<User[]> {
    return this.userRepo
      .createQueryBuilder('u')
      .where('u."reputationScore" > 0')
      .orderBy('CAST(u."reputationScore" AS int)', 'DESC')
      .take(limit)
      .getMany();
  }
}