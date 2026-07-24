import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ContactMessage, ContactMessageStatus } from './entities/contact-message.entity';
import { MailService } from '../mail/mail.service';

interface SubmitContactDto {
  name:    string;
  email:   string;
  phone?:  string;
  subject: string;
  message: string;
}

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    @InjectRepository(ContactMessage) private repo: Repository<ContactMessage>,
    private mailService: MailService,
  ) {}

  // ── Submit — saves to DB first (source of truth), then attempts email ──
  async submit(dto: SubmitContactDto) {
    if (!dto.name?.trim())    throw new BadRequestException('Name is required');
    if (!dto.email?.trim())   throw new BadRequestException('Email is required');
    if (!dto.subject?.trim()) throw new BadRequestException('Subject is required');
    if (!dto.message?.trim()) throw new BadRequestException('Message is required');

    // ✅ Save to database FIRST — this is the permanent record.
    // Even if the email fails to send, the message is never lost.
    const saved = await this.repo.save(
      this.repo.create({
        name:    dto.name.trim(),
        email:   dto.email.trim(),
        phone:   dto.phone?.trim() || null,
        subject: dto.subject.trim(),
        message: dto.message.trim(),
        status:  ContactMessageStatus.OPEN,
        emailSent: false,
      })
    );

    // Then try to email the support inbox — best effort, never blocks the response
    try {
      await this.mailService.sendContactFormMessage({
        name: saved.name, email: saved.email, phone: saved.phone || undefined,
        subject: saved.subject, message: saved.message,
      });
      saved.emailSent = true;
      await this.repo.save(saved);
    } catch (err) {
      this.logger.warn(`Contact form #${saved.id} saved but email failed: ${err.message}`);
      // Don't throw — the message is safely in the database regardless
    }

    return { success: true, id: saved.id, message: 'Your message has been received. We will get back to you within 24 hours.' };
  }

  // ── Admin: list all messages ─────────────────────────────────────────
  async findAll(status?: ContactMessageStatus) {
    return this.repo.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number) {
    const msg = await this.repo.findOne({ where: { id } });
    if (!msg) throw new NotFoundException('Message not found');
    return msg;
  }

  // ── Admin: update status / add note ──────────────────────────────────
  async updateStatus(id: number, status: ContactMessageStatus, adminNote?: string) {
    const msg = await this.findOne(id);
    msg.status = status;
    if (adminNote !== undefined) msg.adminNote = adminNote;
    return this.repo.save(msg);
  }

  // ── Admin dashboard stats ────────────────────────────────────────────
  async getStats() {
    const [total, open, replied, resolved] = await Promise.all([
      this.repo.count(),
      this.repo.count({ where: { status: ContactMessageStatus.OPEN } }),
      this.repo.count({ where: { status: ContactMessageStatus.REPLIED } }),
      this.repo.count({ where: { status: ContactMessageStatus.RESOLVED } }),
    ]);
    return { total, open, replied, resolved };
  }
}