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

  constructor(private config: ConfigService) {
    const apiKey = config.get<string>('AT_API_KEY') || '';
    const username = config.get<string>('AT_USERNAME') || 'sandbox';
    this.shortCode = config.get<string>('AT_SHORTCODE') || undefined;
    this.isDev = config.get<string>('NODE_ENV') !== 'production';

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
  async sendSms(phone: string, message: string): Promise<boolean> {
    const formatted = this.formatPhone(phone);

    // DEV mode — log OTP to terminal, still try to send via sandbox
    this.logger.log(`[SMS] To: ${formatted} | ${message}`);

    try {
      const result = await this.sms.send({
        to: [formatted],
        message,
        ...(this.shortCode ? { from: this.shortCode } : {}),
      });

      const recipient = result?.SMSMessageData?.Recipients?.[0];
      const status = recipient?.status;

      if (status === 'Success') {
        this.logger.log(`✅ SMS sent to ${formatted}`);
        return true;
      }

      // status alone doesn't say why AT rejected it (InvalidSenderId,
      // UserInBlackList, InsufficientBalance, ...) — log the full recipient
      // object (and the raw result if Recipients itself is missing/empty)
      // so a failure is actually diagnosable instead of just "undefined".
      this.logger.warn(
        `⚠️ SMS not sent to ${formatted} — recipient: ${JSON.stringify(recipient)}` +
          (recipient ? '' : ` — full result: ${JSON.stringify(result)}`),
      );
      return false;
    } catch (err) {
      this.logger.error(`❌ SMS error: ${err.message}`);
      // In dev mode don't fail the whole request if SMS fails
      if (this.isDev) return true;
      return false;
    }
  }

  // ── Send OTP ──────────────────────────────────────────────────────────
  async sendOtp(phone: string, otp: string): Promise<boolean> {
    const message = `Your KenteXa verification code is: ${otp}. Valid for 10 minutes. Do not share this code with anyone.`;
    return this.sendSms(phone, message);
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
