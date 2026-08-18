import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { SmsService } from '../sms/sms.service';
import { FRONTEND_URL } from '../config/urls.config';

/**
 * Central notification dispatcher.
 *
 * RULES:
 * - SMS costs money — ONLY 3 events trigger SMS:
 *     1. registrationOtp        (handled directly in auth flow, not here)
 *     2. orderPaid               (buyer + seller)
 *     3. delivered/readyForPickup (buyer — mandatory, they may not check email)
 * - Email is free — sent for every event, but ONLY if the user has an email on file.
 * - Every method here is "fire and forget" — failures are logged, never thrown,
 *   so a notification failure never breaks the main business flow (payment, shipping, etc).
 */

interface NotifyTarget {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private mailService: MailService,
    private smsService: SmsService,
  ) {}

  // ── Safe wrappers — never throw, always log ───────────────────────────────
  private async safeEmail(fn: () => Promise<any>, label: string) {
    this.logger.log(`📧 Attempting email [${label}]...`);
    try {
      await fn();
      this.logger.log(`✅ Email sent [${label}]`);
    } catch (e) {
      this.logger.warn(`❌ Email failed [${label}]: ${e.message}`);
    }
  }

  private async safeSms(fn: () => Promise<any>, label: string) {
    this.logger.log(`📱 Attempting SMS [${label}]...`);
    try {
      await fn();
      this.logger.log(`✅ SMS sent [${label}]`);
    } catch (e) {
      this.logger.warn(`❌ SMS failed [${label}]: ${e.message}`);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 1. ORDER PLACED (buyer just checked out, before payment confirms)
  // Email only — no SMS (not in the 3 allowed events)
  // ════════════════════════════════════════════════════════════════════════
  async orderPlaced(
    buyer: NotifyTarget,
    orderId: number,
    productName: string,
    amount: number,
  ) {
    if (buyer.email) {
      await this.safeEmail(
        () =>
          this.mailService.sendOrderConfirmation(
            buyer.email!,
            buyer.name || 'Customer',
            orderId,
            amount,
            productName,
          ),
        'orderPlaced-email',
      );
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 2. ORDER PAID — ✅ SMS ALLOWED (1 of 3) + Email
  // Sent to BOTH buyer and seller
  // ════════════════════════════════════════════════════════════════════════
  async orderPaid(
    buyer: NotifyTarget,
    seller: NotifyTarget,
    orderId: number,
    productName: string,
    amount: number,
  ) {
    this.logger.log(
      `🔔 orderPaid() called for order #${orderId} — buyer.email=${buyer.email}, buyer.phone=${buyer.phone}, seller.email=${seller.email}, seller.phone=${seller.phone}`,
    );
    // Buyer: SMS (allowed) + Email (if available)
    if (buyer.phone) {
      await this.safeSms(
        () =>
          this.smsService.sendSms(
            buyer.phone!,
            `KenteXa: Malipo yako ya Order #${orderId} (TZS ${amount.toLocaleString()}) yamethibitishwa. Muuzaji ataandaa bidhaa yako hivi karibuni.`,
          ),
        'orderPaid-buyer-sms',
      );
    }
    if (buyer.email) {
      await this.safeEmail(
        () =>
          this.mailService.sendOrderConfirmation(
            buyer.email!,
            buyer.name || 'Customer',
            orderId,
            amount,
            productName,
          ),
        'orderPaid-buyer-email',
      );
    }

    // Seller: SMS (allowed, same event) + Email (if available)
    if (seller.phone) {
      await this.safeSms(
        () =>
          this.smsService.sendSms(
            seller.phone!,
            `KenteXa: Umepokea agizo jipya #${orderId} - ${productName} (TZS ${amount.toLocaleString()}). Tafadhali andaa usafirishaji.`,
          ),
        'orderPaid-seller-sms',
      );
    }
    if (seller.email) {
      await this.safeEmail(
        () =>
          this.mailService.sendOrderConfirmation(
            seller.email!,
            seller.name || 'Seller',
            orderId,
            amount,
            productName,
          ),
        'orderPaid-seller-email',
      );
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 3. SHIPPING PROOF UPLOADED — Email only
  // ════════════════════════════════════════════════════════════════════════
  async shippingProofUploaded(
    buyer: NotifyTarget,
    orderId: number,
    trackingNumber: string,
    courierName: string,
  ) {
    if (buyer.email) {
      await this.safeEmail(
        () =>
          this.mailService.sendGenericUpdate(
            buyer.email!,
            buyer.name || 'Customer',
            `Your order #${orderId} is being prepared`,
            `Your order is being packed and will ship via ${courierName}. Tracking number: ${trackingNumber}`,
          ),
        'shippingProof-email',
      );
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 4. PARCEL DISPATCHED / TRACKING GENERATED — Email only
  // ════════════════════════════════════════════════════════════════════════
  async parcelDispatched(
    buyer: NotifyTarget,
    trackingNumber: string,
    originCity: string,
    destinationCity: string,
  ) {
    if (buyer.email) {
      await this.safeEmail(
        () =>
          this.mailService.sendGenericUpdate(
            buyer.email!,
            buyer.name || 'Customer',
            `Your parcel is on its way! 📦`,
            `Tracking number: ${trackingNumber}\nRoute: ${originCity} → ${destinationCity}\nTrack it anytime at ${FRONTEND_URL}/?track=${trackingNumber}`,
          ),
        'parcelDispatched-email',
      );
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 5. OUT FOR DELIVERY — Email only
  // ════════════════════════════════════════════════════════════════════════
  async outForDelivery(buyer: NotifyTarget, trackingNumber: string) {
    if (buyer.email) {
      await this.safeEmail(
        () =>
          this.mailService.sendGenericUpdate(
            buyer.email!,
            buyer.name || 'Customer',
            `Your parcel is out for delivery 🚚`,
            `Tracking number: ${trackingNumber} is on its way to you today.`,
          ),
        'outForDelivery-email',
      );
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 6. GOODS ARRIVED / READY FOR PICKUP — ✅ SMS ALLOWED (3 of 3) + Email
  // This is the moment the buyer needs to know NOW — they might not check
  // email, so SMS here is mandatory regardless of email availability.
  // ════════════════════════════════════════════════════════════════════════
  async delivered(
    buyer: NotifyTarget,
    orderId: number,
    trackingNumber: string,
  ) {
    if (buyer.phone) {
      await this.safeSms(
        () =>
          this.smsService.sendSms(
            buyer.phone!,
            `KenteXa: Bidhaa yako Order #${orderId} (${trackingNumber}) imefika. Tafadhali ithibitishe kwenye app au tovuti ili tutoe malipo kwa muuzaji.`,
          ),
        'delivered-buyer-sms',
      );
    }
    if (buyer.email) {
      await this.safeEmail(
        () =>
          this.mailService.sendGenericUpdate(
            buyer.email!,
            buyer.name || 'Customer',
            `Your parcel has arrived 📬`,
            `Order #${orderId} (${trackingNumber}) has been delivered. Please confirm receipt on ${FRONTEND_URL} so we can release payment to the seller.`,
          ),
        'delivered-email',
      );
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 7. BUYER CONFIRMED RECEIPT — Email only (third SMS slot is used by
  //    "goods arrived" above, which already alerted the buyer — seller's
  //    payout release is communicated via email to stay within SMS budget)
  // ════════════════════════════════════════════════════════════════════════
  async orderCompleted(
    seller: NotifyTarget,
    buyer: NotifyTarget,
    orderId: number,
    sellerAmount: number,
  ) {
    if (seller.email) {
      await this.safeEmail(
        () =>
          this.mailService.sendGenericUpdate(
            seller.email!,
            seller.name || 'Seller',
            `Payment released! 💰`,
            `Buyer confirmed receipt of Order #${orderId}. TZS ${sellerAmount.toLocaleString()} has been released to your account.`,
          ),
        'orderCompleted-seller-email',
      );
    }

    // Buyer: Email only (thank you, no SMS needed — third SMS is reserved for this same event but seller side)
    if (buyer.email) {
      await this.safeEmail(
        () =>
          this.mailService.sendGenericUpdate(
            buyer.email!,
            buyer.name || 'Customer',
            `Thank you for your order! ✅`,
            `Order #${orderId} is complete. We hope you enjoy your purchase. Rate your experience on ${FRONTEND_URL}`,
          ),
        'orderCompleted-buyer-email',
      );
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 9. COLLECTION CLAIMED — Agent is on their way to collect from seller
  // ════════════════════════════════════════════════════════════════════════
  async collectionClaimed(
    seller: NotifyTarget,
    orderId: number,
    agentName: string,
    agentPhone: string,
  ) {
    if (seller.phone) {
      await this.safeSms(
        () =>
          this.smsService.sendSms(
            seller.phone!,
            `KenteXa: Wakala ${agentName} atakuja kukuchukua Agizo #${orderId}. ` +
              `Namba yake: ${agentPhone}. Andaa kifurushi chako. Asante!`,
          ),
        'collection-claimed-seller-sms',
      );
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 10. PARCEL COLLECTED — Agent picked up from seller, heading to hub
  // ════════════════════════════════════════════════════════════════════════
  async parcelCollected(
    seller: NotifyTarget,
    buyer: NotifyTarget,
    orderId: number,
    trackingNumber: string,
  ) {
    if (seller.phone) {
      await this.safeSms(
        () =>
          this.smsService.sendSms(
            seller.phone!,
            `KenteXa: Kifurushi chako cha Agizo #${orderId} kimekusanywa na wakala. ` +
              `Kinaelekea kwenye hub. Track: ${FRONTEND_URL}/?track=${trackingNumber}`,
          ),
        'collected-seller-sms',
      );
    }
    if (buyer.phone) {
      await this.safeSms(
        () =>
          this.smsService.sendSms(
            buyer.phone!,
            `KenteXa: Bidhaa yako (Agizo #${orderId}) imekusanywa na wakala na ipo njiani. ` +
              `Fuatilia: ${FRONTEND_URL}/?track=${trackingNumber}`,
          ),
        'collected-buyer-sms',
      );
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // 11. COLLECTION AT HUB — Parcel handed over to Super Agent
  // ════════════════════════════════════════════════════════════════════════
  async collectionAtHub(
    seller: NotifyTarget,
    buyer: NotifyTarget,
    orderId: number,
    city: string,
  ) {
    if (seller.phone) {
      await this.safeSms(
        () =>
          this.smsService.sendSms(
            seller.phone!,
            `KenteXa: Kifurushi chako cha Agizo #${orderId} kipo hub ya ${city} ` +
              `na kinaandaliwa kutumwa. Utapata ujumbe ufuatapo hivi karibuni.`,
          ),
        'at-hub-seller-sms',
      );
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  async classifiedInvoicePaid(
    buyer: NotifyTarget,
    seller: NotifyTarget,
    invoiceNumber: string,
    amount: number,
  ) {
    if (buyer.phone) {
      await this.safeSms(
        () =>
          this.smsService.sendSms(
            buyer.phone!,
            `KenteXa: Malipo ya ankara ${invoiceNumber} (TZS ${amount.toLocaleString()}) yamethibitishwa.`,
          ),
        'classifiedPaid-buyer-sms',
      );
    }
    if (seller.phone) {
      await this.safeSms(
        () =>
          this.smsService.sendSms(
            seller.phone!,
            `KenteXa: Ankara ${invoiceNumber} imelipwa - TZS ${amount.toLocaleString()}. Chagua njia ya usafirishaji kwenye dashibodi yako.`,
          ),
        'classifiedPaid-seller-sms',
      );
    }
    if (buyer.email) {
      await this.safeEmail(
        () =>
          this.mailService.sendGenericUpdate(
            buyer.email!,
            buyer.name || 'Customer',
            'Payment confirmed',
            `Invoice ${invoiceNumber} (TZS ${amount.toLocaleString()}) has been paid.`,
          ),
        'classifiedPaid-buyer-email',
      );
    }
    if (seller.email) {
      await this.safeEmail(
        () =>
          this.mailService.sendGenericUpdate(
            seller.email!,
            seller.name || 'Seller',
            'Invoice paid!',
            `Invoice ${invoiceNumber} (TZS ${amount.toLocaleString()}) has been paid. Set a shipping method on your dashboard.`,
          ),
        'classifiedPaid-seller-email',
      );
    }
  }
}
