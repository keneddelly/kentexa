import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EarlyAccessOtp } from './entities/early-access-otp.entity';
import { SmsService } from '../sms/sms.service';

@Injectable()
export class EarlyAccessOtpService {
  constructor(
    @InjectRepository(EarlyAccessOtp)
    private repo: Repository<EarlyAccessOtp>,
    private smsService: SmsService,
  ) {}

  async sendOtp(rawPhone: string) {
    const phone = this.smsService.formatPhone(rawPhone);
    const otp = this.smsService.generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    // Drop any previous unverified codes for this phone before issuing a new one.
    await this.repo.delete({ phone, verified: false });
    await this.repo.save(
      this.repo.create({ phone, otp, otpExpiry, attempts: 0, verified: false }),
    );

    const sent = await this.smsService.sendOtp(phone, otp);

    return {
      message: 'Verification code sent.',
      otpSent: sent,
      ...(process.env.NODE_ENV !== 'production' ? { devOtp: otp } : {}),
    };
  }

  async verifyOtp(rawPhone: string, otp: string) {
    const phone = this.smsService.formatPhone(rawPhone);
    const record = await this.repo.findOne({
      where: { phone, verified: false },
      order: { createdAt: 'DESC' },
    });

    if (!record) throw new BadRequestException('No pending code for this phone. Request a new one.');
    if (record.attempts >= 5)
      throw new BadRequestException('Too many attempts. Request a new code.');
    if (new Date() > record.otpExpiry)
      throw new BadRequestException('Code expired. Request a new one.');
    if (record.otp !== otp) {
      await this.repo.update(record.id, { attempts: record.attempts + 1 });
      const remaining = 5 - (record.attempts + 1);
      throw new BadRequestException(`Incorrect code. ${remaining} attempts remaining.`);
    }

    await this.repo.update(record.id, { verified: true });
    return { message: 'Phone number verified.', verified: true };
  }

  async isVerified(rawPhone: string): Promise<boolean> {
    const phone = this.smsService.formatPhone(rawPhone);
    const record = await this.repo.findOne({
      where: { phone, verified: true },
    });
    return !!record;
  }
}
