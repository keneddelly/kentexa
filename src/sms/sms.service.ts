import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/no-require-imports -- no type declarations published for this package
const AfricasTalking = require('africastalking');

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly sms: any;
  // Undefined unless AT_SHORTCODE is explicitly set to a Sender ID actually
  // registered/approved on the Africa's Talking account — an unapproved
  // sender ID makes AT silently reject every message ("InvalidSenderId"),
  // so we only pass `from` when we have a real, configured value.
  private readonly shortCode: string | undefined;
  private readonly isDev: boolean;
  private readonly outboundDisabled: boolean;
  private readonly rehearsalPhone: string | null;

  constructor(private config: ConfigService) {
    const apiKey = config.get<string>('AT_API_KEY') || '';
    const username = config.get<string>('AT_USERNAME') || 'sandbox';
    this.shortCode = config.get<string>('AT_SHORTCODE') || undefined;
    this.isDev = config.get<string>('NODE_ENV') !== 'production';
    const disabled = config.get<string>('STAGE3KR_DISABLE_OUTBOUND_SMS') === 'true';
    const rehearsal = config.get<string>('STAGE3KR_SMS_REHEARSAL') === 'true';
    const testPhone = config.get<string>('STAGE3KR_SMS_TEST_PHONE') || '';
    const isolated = config.get<string>('DB_NAME') === 'kentexa_stage3kr' &&
      config.get<string>('DB_USERNAME') === 'kentexa_stage3kr';
    this.rehearsalPhone = !disabled && rehearsal && isolated && apiKey &&
      username !== 'sandbox' && /^\+255\d{9}$/.test(testPhone) ? testPhone : null;
    this.outboundDisabled = disabled || (isolated && !this.rehearsalPhone) ||
      (rehearsal && !this.rehearsalPhone);

    if (this.outboundDisabled) {
      this.sms = null;
      return;
    }

    const at = AfricasTalking({ apiKey, username });
    this.sms = at.SMS;
  }

  // ── Format phone to +255XXXXXXXXX ────────────────────────────────────
  formatPhone(phone: string): string {
    const cleaned = phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '');
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.startsWith('255')) return `+${cleaned}`;
    if (cleaned.startsWith('0')) return `+255${cleaned.slice(1)}`;
    return `+255${cleaned}`;
  }

  // ── Generate 6-digit OTP ──────────────────────────────────────────────
  generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // ── Send SMS ──────────────────────────────────────────────────────────
  async sendSms(phone: string, message: string, sensitive = false): Promise<boolean> {
    if (this.outboundDisabled) return false;
    const formatted = this.formatPhone(phone);
    if (this.rehearsalPhone && formatted !== this.rehearsalPhone) return false;

    // Keep credentials out of application logs in every environment.
    this.logger.log(`[SMS] To: ${formatted} | ${sensitive ? '[sensitive message omitted]' : message}`);

    try {
      const result = await this.sms.send({
        to: [formatted],
        message,
        ...(this.shortCode ? { from: this.shortCode } : {}),
      });

      const recipient = result?.SMSMessageData?.Recipients?.[0];
      const status = recipient?.status;

      if (status === 'Success') {
        // "Success" here is Africa's Talking's ACCEPTANCE status — the
        // message was queued for delivery to the carrier, not proof the
        // handset received it. AT's own final delivery outcome (delivered/
        // failed, with a carrier-level reason) only ever arrives later, via
        // an asynchronous delivery-report webhook this integration does not
        // yet receive (no callback URL is registered, and the installed
        // `africastalking` SDK exposes no polling endpoint for outbound
        // status either — fetchMessages() is inbound-only). Logging AT's own
        // statusCode/messageId/cost here (never the message body) is the
        // only forensic trail available today for a "provider said yes, but
        // did the phone get it?" question — deliberately named "accepted",
        // never "delivered", so this line is never read as delivery proof.
        this.logger.log(
          `✅ SMS accepted by provider for ${formatted} ` +
            `(messageId=${recipient?.messageId ?? 'n/a'}, statusCode=${recipient?.statusCode ?? 'n/a'}, cost=${recipient?.cost ?? 'n/a'})`,
        );
        return true;
      }

      // status alone doesn't say why AT rejected it (InvalidSenderId,
      // UserInBlackList, InsufficientBalance, ...) — log the full recipient
      // object (and the raw result if Recipients itself is missing/empty)
      // so a failure is actually diagnosable instead of just "undefined".
      this.logger.warn(
        `⚠️ SMS not sent to ${formatted} — recipient: ${JSON.stringify(recipient)}` +
          (recipient || sensitive ? '' : ` — full result: ${JSON.stringify(result)}`),
      );
      return false;
    } catch (err) {
      this.logger.error(sensitive
        ? `❌ Sensitive SMS send failed for ${formatted}`
        : `❌ SMS error: ${err.message}`);
      // In dev mode don't fail the whole request if SMS fails
      if (this.isDev && !sensitive) return true;
      return false;
    }
  }

  // ── Send OTP ──────────────────────────────────────────────────────────
  async sendOtp(phone: string, otp: string): Promise<boolean> {
    const message = `Your KenteXa verification code is: ${otp}. Valid for 10 minutes. Do not share this code with anyone.`;
    return this.sendSms(phone, message, true);
  }

  // ── Send welcome SMS ──────────────────────────────────────────────────
  async sendWelcome(phone: string, name: string): Promise<void> {
    const message = `Welcome to KenteXa, ${name}! 🎉 Tanzania's #1 marketplace. Buy, sell and pay securely. Start shopping now!`;
    await this.sendSms(phone, message);
  }

  // ── Payment notification ──────────────────────────────────────────────
  async sendPaymentNotification(
    phone: string,
    amount: number,
    invoiceNumber: string,
  ): Promise<void> {
    const message = `KenteXa: Payment of TZS ${Number(amount).toLocaleString()} received for invoice ${invoiceNumber}. Thank you!`;
    await this.sendSms(phone, message);
  }

  // ── Order notification ────────────────────────────────────────────────
  async sendOrderNotification(
    phone: string,
    orderId: number,
    status: string,
  ): Promise<void> {
    const message = `KenteXa: Your order #${orderId} status updated to: ${status}. Open the app to track your order.`;
    await this.sendSms(phone, message);
  }
}
