import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.MAIL_PORT || '587', 10),
      secure: process.env.MAIL_SECURE === 'true', // true for 465, false for 587
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });
  }

  private get from() {
    return `"KenteXa Marketplace" <${process.env.MAIL_USER}>`;
  }

  // ── Send OTP for registration / verification ──────────────────────────
  async sendOtp(email: string, otp: string, name?: string): Promise<boolean> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: `${otp} is your KenteXa verification code`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:16px;">
            <div style="text-align:center;margin-bottom:24px;">
              <h1 style="font-size:28px;font-weight:900;color:#1d4ed8;margin:0;">Kente<span style="color:#0f172a;">Xa</span></h1>
              <p style="color:#64748b;font-size:13px;margin:4px 0 0;">Tanzania's #1 Marketplace</p>
            </div>
            <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0;">
              <p style="color:#1e293b;font-size:15px;margin:0 0 16px;">Hello ${name || 'there'} 👋</p>
              <p style="color:#475569;font-size:14px;margin:0 0 20px;">Your KenteXa verification code is:</p>
              <div style="background:linear-gradient(135deg,#1d4ed8,#2563eb);border-radius:12px;padding:20px;text-align:center;margin:0 0 20px;">
                <span style="font-size:36px;font-weight:900;color:#fff;letter-spacing:10px;">${otp}</span>
              </div>
              <p style="color:#64748b;font-size:13px;margin:0;">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
            </div>
            <p style="color:#94a3b8;font-size:11px;text-align:center;margin:16px 0 0;">
              If you didn't create a KenteXa account, ignore this email.<br/>
              KenteXa © 2026 · Tanzania
            </p>
          </div>
        `,
      });
      this.logger.log(`OTP email sent to ${email}`);
      return true;
    } catch (err) {
      this.logger.error(`Failed to send OTP email to ${email}: ${err.message}`);
      return false;
    }
  }

  // ── Welcome email after verification ─────────────────────────────────
  async sendWelcome(email: string, name: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: `Welcome to KenteXa, ${name}! 🎉`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:16px;">
            <div style="text-align:center;margin-bottom:24px;">
              <h1 style="font-size:28px;font-weight:900;color:#1d4ed8;margin:0;">Kente<span style="color:#0f172a;">Xa</span></h1>
            </div>
            <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0;">
              <h2 style="color:#1e293b;font-size:20px;margin:0 0 12px;">Welcome, ${name}! 🎉</h2>
              <p style="color:#475569;font-size:14px;line-height:1.7;margin:0 0 20px;">
                Your KenteXa account is now verified and ready to use. You can now:
              </p>
              <ul style="color:#475569;font-size:14px;line-height:2;padding-left:20px;margin:0 0 20px;">
                <li>🛒 Shop from verified sellers across Tanzania</li>
                <li>📋 Post classified ads for free</li>
                <li>🏪 Open your own store and start selling</li>
                <li>🤝 Apply to become a KenteXa agent</li>
              </ul>
              <a href="${process.env.APP_URL || 'https://kentexa.com'}" style="display:block;background:linear-gradient(135deg,#1d4ed8,#2563eb);color:#fff;text-decoration:none;padding:14px;border-radius:10px;text-align:center;font-size:15px;font-weight:700;">
                Start Shopping →
              </a>
            </div>
            <p style="color:#94a3b8;font-size:11px;text-align:center;margin:16px 0 0;">
              KenteXa © 2026 · Tanzania's #1 Marketplace
            </p>
          </div>
        `,
      });
      this.logger.log(`Welcome email sent to ${email}`);
    } catch (err) {
      this.logger.error(
        `Failed to send welcome email to ${email}: ${err.message}`,
      );
    }
  }

  // ── Password reset OTP ────────────────────────────────────────────────
  async sendPasswordReset(email: string, otp: string): Promise<boolean> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: `Reset your KenteXa password`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:16px;">
            <div style="text-align:center;margin-bottom:24px;">
              <h1 style="font-size:28px;font-weight:900;color:#1d4ed8;margin:0;">Kente<span style="color:#0f172a;">Xa</span></h1>
            </div>
            <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0;">
              <h2 style="color:#1e293b;font-size:18px;margin:0 0 12px;">🔒 Password Reset</h2>
              <p style="color:#475569;font-size:14px;margin:0 0 20px;">Your password reset code is:</p>
              <div style="background:#0f172a;border-radius:12px;padding:20px;text-align:center;margin:0 0 20px;">
                <span style="font-size:36px;font-weight:900;color:#ffd200;letter-spacing:10px;">${otp}</span>
              </div>
              <p style="color:#64748b;font-size:13px;margin:0;">This code expires in <strong>10 minutes</strong>. If you didn't request a password reset, ignore this email.</p>
            </div>
            <p style="color:#94a3b8;font-size:11px;text-align:center;margin:16px 0 0;">
              KenteXa © 2026 · Tanzania
            </p>
          </div>
        `,
      });
      this.logger.log(`Password reset email sent to ${email}`);
      return true;
    } catch (err) {
      this.logger.error(
        `Failed to send password reset email to ${email}: ${err.message}`,
      );
      return false;
    }
  }

  // ── Order confirmation ────────────────────────────────────────────────
  async sendOrderConfirmation(
    email: string,
    name: string,
    orderId: number,
    amount: number,
    productName: string,
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: `Order Confirmed #${orderId} — KenteXa`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:16px;">
            <div style="text-align:center;margin-bottom:24px;">
              <h1 style="font-size:28px;font-weight:900;color:#1d4ed8;margin:0;">Kente<span style="color:#0f172a;">Xa</span></h1>
            </div>
            <div style="background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0;">
              <div style="text-align:center;margin-bottom:20px;">
                <div style="font-size:48px;">✅</div>
                <h2 style="color:#1e293b;font-size:20px;margin:8px 0 0;">Order Placed!</h2>
              </div>
              <p style="color:#475569;font-size:14px;margin:0 0 16px;">Hi ${name}, your order has been placed successfully.</p>
              <div style="background:#f8fafc;border-radius:10px;padding:16px;margin:0 0 20px;border:1px solid #e2e8f0;">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                  <span style="color:#64748b;font-size:13px;">Order #</span>
                  <span style="color:#1e293b;font-size:13px;font-weight:700;">${orderId}</span>
                </div>
                <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                  <span style="color:#64748b;font-size:13px;">Product</span>
                  <span style="color:#1e293b;font-size:13px;font-weight:700;">${productName}</span>
                </div>
                <div style="display:flex;justify-content:space-between;">
                  <span style="color:#64748b;font-size:13px;">Total</span>
                  <span style="color:#1d4ed8;font-size:15px;font-weight:900;">TZS ${amount.toLocaleString()}</span>
                </div>
              </div>
              <p style="color:#64748b;font-size:13px;margin:0;">Track your order anytime on KenteXa.</p>
            </div>
            <p style="color:#94a3b8;font-size:11px;text-align:center;margin:16px 0 0;">
              KenteXa © 2026 · Tanzania's #1 Marketplace
            </p>
          </div>
        `,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send order confirmation to ${email}: ${err.message}`,
      );
    }
  }

  // ── Contact form submission — sent to support inbox ──────────────────
  async sendContactFormMessage(data: {
    name: string;
    email: string;
    phone?: string;
    subject: string;
    message: string;
  }) {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: 'support@kentexa.com',
        replyTo: data.email,
        subject: `📩 Contact Form: ${data.subject}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
            <div style="text-align:center;margin-bottom:20px;">
              <span style="font-size:24px;font-weight:900;color:#0f172a;">Kente</span><span style="font-size:24px;font-weight:900;color:#1d4ed8;">Xa</span>
            </div>
            <div style="background:#fff;border-radius:16px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
              <h2 style="color:#1e293b;font-size:18px;margin:0 0 16px;">New Contact Form Message</h2>
              <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
                <tr><td style="padding:6px 0;color:#64748b;font-size:13px;width:90px;">Name</td><td style="padding:6px 0;color:#1e293b;font-size:13px;font-weight:700;">${data.name}</td></tr>
                <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Email</td><td style="padding:6px 0;color:#1e293b;font-size:13px;font-weight:700;">${data.email}</td></tr>
                ${data.phone ? `<tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Phone</td><td style="padding:6px 0;color:#1e293b;font-size:13px;font-weight:700;">${data.phone}</td></tr>` : ''}
                <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Subject</td><td style="padding:6px 0;color:#1e293b;font-size:13px;font-weight:700;">${data.subject}</td></tr>
              </table>
              <div style="background:#f8fafc;border-radius:10px;padding:16px;border:1px solid #e2e8f0;">
                <div style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;margin-bottom:8px;">Message</div>
                <div style="color:#1e293b;font-size:14px;line-height:1.6;white-space:pre-line;">${data.message}</div>
              </div>
              <p style="color:#94a3b8;font-size:12px;margin:16px 0 0;">Reply directly to this email to respond to ${data.name}.</p>
            </div>
          </div>
        `,
      });
      this.logger.log(`Contact form message sent from ${data.email}`);
    } catch (err) {
      this.logger.error(`Failed to send contact form message: ${err.message}`);
      throw err;
    }
  }

  // ── Generic update email — used by NotificationsService for all
  // shipping/tracking/delivery/payout events. One flexible template
  // instead of writing a new method for every single event. ──────────────
  async sendGenericUpdate(
    email: string,
    name: string,
    title: string,
    message: string,
  ) {
    try {
      await this.transporter.sendMail({
        from: `"KenteXa" <${process.env.MAIL_USER}>`,
        to: email,
        subject: `KenteXa — ${title}`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
            <div style="text-align:center;margin-bottom:20px;">
              <span style="font-size:24px;font-weight:900;color:#0f172a;">Kente</span><span style="font-size:24px;font-weight:900;color:#1d4ed8;">Xa</span>
            </div>
            <div style="background:#fff;border-radius:16px;padding:24px;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
              <h2 style="color:#1e293b;font-size:18px;margin:0 0 12px;">${title}</h2>
              <p style="color:#475569;font-size:14px;line-height:1.6;white-space:pre-line;margin:0 0 16px;">Habari ${name},

${message}</p>
              <p style="color:#94a3b8;font-size:12px;margin:0;">Visit kentexa.com to view full details.</p>
            </div>
            <p style="color:#94a3b8;font-size:11px;text-align:center;margin:16px 0 0;">
              KenteXa © 2026 · Tanzania's #1 Marketplace
            </p>
          </div>
        `,
      });
    } catch (err) {
      this.logger.error(
        `Failed to send update email to ${email}: ${err.message}`,
      );
    }
  }
}
