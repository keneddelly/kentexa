import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { SmsInviteLog } from './entities/sms-invite-log.entity';
import { normalizeTzPhone } from '../common/utils/phone.util';
import { FRONTEND_URL } from '../config/urls.config';

// Which real transaction moment is offering the nudge — drives which one
// sentence gets appended, per the product spec's "different invitation for
// different context" rule (a buyer's first order isn't the same moment as
// a shipment update, isn't the same moment as a seller's own sale).
export enum InviteContext {
  BUYER_ORDER = 'buyer_order',
  BUYER_SHIPMENT = 'buyer_shipment',
  SELLER_TRANSACTION = 'seller_transaction',
  MANUAL_SALE_CUSTOMER = 'manual_sale_customer',
  CLASSIFIED_BUYER = 'classified_buyer',
}

const INVITE_COPY: Record<InviteContext, string> = {
  [InviteContext.BUYER_ORDER]: `Jiunge na Kentexa kufuatilia oda zako: ${FRONTEND_URL}`,
  [InviteContext.BUYER_SHIPMENT]: `Jiunge na Kentexa kufuatilia mzigo na oda zijazo: ${FRONTEND_URL}`,
  [InviteContext.SELLER_TRANSACTION]: `Anza kutumia Kentexa kusimamia mauzo na risiti: ${FRONTEND_URL}`,
  [InviteContext.MANUAL_SALE_CUSTOMER]: `Jiunge na Kentexa kuhifadhi risiti zako: ${FRONTEND_URL}`,
  [InviteContext.CLASSIFIED_BUYER]: `Jiunge na Kentexa kufuatilia miamala yako: ${FRONTEND_URL}`,
};

// A single SMS segment is 160 chars (GSM-7) or 70 (any message containing
// an emoji/non-Latin character, which forces UCS-2 encoding) — several
// existing transaction templates already use emoji, so this app has no
// reliable way to know which bucket a given message falls in without a
// real segmenter (none exists today — see the audit). Rather than build
// one, this uses one conservative ceiling: never let an appended invite
// push the TOTAL message past 140 chars. That leaves headroom inside a
// single GSM-7 segment for every existing template, and simply drops the
// invite (never the transaction content) on the messages already near
// that ceiling — the transaction information always wins.
const MAX_COMBINED_LENGTH = 140;

// How long to wait before re-inviting the SAME unregistered phone number,
// regardless of which transaction event triggers it. 72 hours means a
// buyer who gets order-paid → shipped → delivered SMS within a couple of
// days (the normal case) sees the invite exactly once, on whichever of
// those fires first — not three times for one purchase — while a genuinely
// new interaction days or weeks later still gets a fresh nudge. Not
// per-context: seeing "join Kentexa" from an order SMS and then again from
// a shipment SMS an hour later is still the same repeated pitch to the
// recipient, even though the code path differs.
const COOLDOWN_HOURS = 72;

// Appends a short, contextual "join Kentexa" nudge to an already-composed
// transaction SMS — but only when it's actually appropriate:
//   - never for a phone that's already a registered Kentexa user
//   - never twice within the cooldown window
//   - never if it would push the message past one SMS segment
// The transaction message itself is never modified or shortened; the
// invite is purely additive and is silently dropped whenever any of the
// above would be violated. This is the ONE place that decision is made —
// every SMS-sending call site that wants a growth nudge calls this instead
// of deciding invite copy/frequency itself.
@Injectable()
export class GrowthInviteService {
  private readonly logger = new Logger(GrowthInviteService.name);

  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(SmsInviteLog) private inviteLogRepo: Repository<SmsInviteLog>,
  ) {}

  async appendInvite(
    message: string,
    phone: string | null | undefined,
    context: InviteContext,
  ): Promise<string> {
    try {
      const suffix = await this.getInviteSuffix(phone, context);
      if (!suffix) return message;
      const candidate = `${message}\n\n${suffix}`;
      if (candidate.length > MAX_COMBINED_LENGTH) return message;
      return candidate;
    } catch (e) {
      // A growth nudge is never allowed to break a real transaction SMS —
      // any failure here just means the plain message goes out instead.
      this.logger.warn(`appendInvite failed, sending without invite: ${e.message}`);
      return message;
    }
  }

  private async getInviteSuffix(
    phone: string | null | undefined,
    context: InviteContext,
  ): Promise<string> {
    if (!phone) return '';
    const normalized = normalizeTzPhone(phone);
    if (!normalized) return '';

    const existingUser = await this.userRepo.findOne({ where: { phone: normalized } });
    if (existingUser) return ''; // already a Kentexa user — never re-pitch signup

    const log = await this.inviteLogRepo.findOne({ where: { phone: normalized } });
    if (log) {
      const hoursSinceLastInvite = (Date.now() - log.lastInvitedAt.getTime()) / 3_600_000;
      if (hoursSinceLastInvite < COOLDOWN_HOURS) return '';
      await this.inviteLogRepo.update(log.id, {
        lastInvitedAt: new Date(),
        inviteCount: log.inviteCount + 1,
        lastEventType: context,
      });
    } else {
      await this.inviteLogRepo.save(
        this.inviteLogRepo.create({
          phone: normalized,
          lastInvitedAt: new Date(),
          inviteCount: 1,
          lastEventType: context,
        }),
      );
    }

    return INVITE_COPY[context] || '';
  }
}
