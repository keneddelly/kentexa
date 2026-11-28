import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { FRONTEND_URL } from '../config/urls.config';

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
  /**
   * Welcome email (rewritten 2026-11-17, owner: "the email sent to user after registration is
   * outdated"): Swahili first with a short English line, what KenteXa is today (jumuiya, Makala,
   * Mfululizo, selling with free POS, sending parcels, offices and agents), one button and the app.
   * No emoji, no claims we cannot show.
   */
  static welcomeHtml(name: string, frontend = FRONTEND_URL) {
    const safe = String(name || '').replace(/[<>&"]/g, '').trim() || 'rafiki';
    const row = (title: string, text: string, href: string) => `
      <tr><td style="padding:10px 0;border-top:1px solid #eef2f7;">
        <a href="${href}" style="text-decoration:none;color:#0f1419;">
          <div style="font-size:15px;font-weight:700;color:#0f1419;">${title}</div>
          <div style="font-size:14px;color:#536471;line-height:1.5;">${text}</div>
        </a>
      </td></tr>`;
    return `
    <div style="background:#f5f7fb;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6ecf0;">
        <div style="background:#0b1224;padding:22px 24px;">
          <div style="font-size:24px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">Kente<span style="color:#60a5fa;">Xa</span></div>
          <div style="font-size:13px;color:#cfdcff;margin-top:4px;">Mazungumzo, biashara na usafiri wa Tanzania, mahali pamoja</div>
        </div>
        <div style="padding:24px;">
          <h1 style="margin:0 0 10px;font-size:22px;color:#0f1419;">Karibu KenteXa, ${safe}</h1>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#334155;">
            Akaunti yako iko tayari. Hiki ndicho unachoweza kufanya leo:
          </p>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
            ${row('Jiunge na jumuiya', 'Uliza, jibu na jadili mada za biashara, teknolojia, kilimo na zaidi.', `${frontend}/`)}
            ${row('Andika Makala', 'Shiriki ujuzi wako; wasomaji wanaona kazi yako na unaweza kuwa Mwandishi wa Wiki.', `${frontend}/`)}
            ${row('Fuata Mfululizo', 'Mazungumzo yanayoendelea sehemu kwa sehemu, kama Business Conversations.', `${frontend}/topic/biashara`)}
            ${row('Uza na nunua', 'Fungua duka lako na POS ya bure, au nunua kutoka kwa biashara za karibu nawe.', `${frontend}/?intent=seller`)}
            ${row('Tuma mzigo', 'Linganisha bei za ofisi na mawakala, fuatilia kila hatua kwa SMS.', `${frontend}/?intent=ship`)}
          </table>
          <a href="${frontend}/" style="display:block;margin:20px 0 0;background:#0f1419;color:#ffffff;text-decoration:none;padding:14px;border-radius:999px;text-align:center;font-size:15px;font-weight:700;">
            Fungua KenteXa
          </a>
          <p style="margin:18px 0 0;font-size:14px;color:#334155;line-height:1.6;">
            Kwenye simu ya Android? <a href="https://play.google.com/store/apps/details?id=com.app.bishoo" style="color:#1d4ed8;font-weight:700;">Pakua app ya KenteXa</a> kwa arifa za haraka.
          </p>
          <p style="margin:16px 0 0;font-size:13px;color:#64748b;line-height:1.6;">
            <b>English:</b> Welcome to KenteXa. Your account is ready: join communities, write articles, follow series, sell with a free POS, and send parcels across Tanzania.
          </p>
        </div>
        <div style="padding:14px 24px;background:#f8fafc;border-top:1px solid #eef2f7;font-size:12px;color:#94a3b8;line-height:1.6;">
          Umepokea barua hii kwa sababu umefungua akaunti ya KenteXa. Kama si wewe, puuza barua hii.<br>
          KenteXa · <a href="${frontend}/privacy" style="color:#94a3b8;">Faragha</a> · <a href="${frontend}/terms" style="color:#94a3b8;">Masharti</a>
        </div>
      </div>
    </div>`;
  }

  async sendWelcome(email: string, name: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email,
        subject: `Karibu KenteXa, ${String(name || '').trim() || 'rafiki'}`,
        html: MailService.welcomeHtml(name),
        text: `Karibu KenteXa. Akaunti yako iko tayari: jiunge na jumuiya, andika Makala, fuata Mfululizo, uza kwa POS ya bure na tuma mzigo popote Tanzania. ${FRONTEND_URL}/`,
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
  /**
   * Error Watch: plain alert to the admin inbox (ALERT_EMAIL, default support@kentexa.com).
   * Never throws: an alert that cannot be sent must not affect the platform.
   */
  async sendAdminAlert(subject: string, text: string): Promise<boolean> {
    try {
      await this.transporter.sendMail({
        from: `"KenteXa" <${process.env.MAIL_USER}>`,
        to: process.env.ALERT_EMAIL || 'support@kentexa.com',
        subject: `[KenteXa alert] ${subject}`.slice(0, 200),
        text: text.slice(0, 4000),
      });
      return true;
    } catch (err) {
      console.warn('Admin alert email failed', err);
      return false;
    }
  }

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

  // ── Writers programme invitation (#417): one email, from the official address, with unsubscribe headers.
  async sendWriterInvite(email: string, subject: string, html: string, unsubscribeUrl: string): Promise<boolean> {
    try {
      await this.transporter.sendMail({
        from: `"KenteXa" <${process.env.MAIL_USER}>`,
        to: email,
        subject,
        html,
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      return true;
    } catch (err) {
      this.logger.error(`Failed to send writer invitation: ${err.message}`);
      return false;
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
