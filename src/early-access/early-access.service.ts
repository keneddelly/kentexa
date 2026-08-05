import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as ExcelJS from 'exceljs';
import {
  AccountType,
  EarlyAccessRegistration,
  RegistrationStatus,
} from './entities/early-access-registration.entity';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { QueryRegistrationsDto } from './dto/query-registrations.dto';
import { RejectRegistrationDto } from './dto/reject-registration.dto';

const EXPORT_COLUMNS: { key: keyof EarlyAccessRegistration; header: string }[] = [
  { key: 'id', header: 'ID' },
  { key: 'accountType', header: 'Account Type' },
  { key: 'ownerName', header: 'Owner Name' },
  { key: 'businessName', header: 'Business Name' },
  { key: 'phone', header: 'Phone' },
  { key: 'whatsapp', header: 'WhatsApp' },
  { key: 'email', header: 'Email' },
  { key: 'region', header: 'Region' },
  { key: 'district', header: 'District' },
  { key: 'ward', header: 'Ward' },
  { key: 'businessCategory', header: 'Category' },
  { key: 'yearsInBusiness', header: 'Years In Business' },
  { key: 'status', header: 'Status' },
  { key: 'createdAt', header: 'Registered At' },
];

@Injectable()
export class EarlyAccessService {
  constructor(
    @InjectRepository(EarlyAccessRegistration)
    private repo: Repository<EarlyAccessRegistration>,
  ) {}

  async create(dto: CreateRegistrationDto) {
    const registration = await this.repo.save(this.repo.create(dto));
    return {
      ...registration,
      earlyAccessId: registration.earlyAccessId,
    };
  }

  private baseQuery() {
    return this.repo
      .createQueryBuilder('r')
      .where('r.isDeleted = :isDeleted', { isDeleted: false });
  }

  async findAll(query: QueryRegistrationsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const qb = this.baseQuery();

    if (query.accountType)
      qb.andWhere('r.accountType = :accountType', {
        accountType: query.accountType,
      });
    if (query.region)
      qb.andWhere('LOWER(r.region) = LOWER(:region)', { region: query.region });
    if (query.businessCategory)
      qb.andWhere('r.businessCategory = :businessCategory', {
        businessCategory: query.businessCategory,
      });
    if (query.status)
      qb.andWhere('r.status = :status', { status: query.status });
    if (query.search)
      qb.andWhere(
        '(LOWER(r.ownerName) LIKE :search OR LOWER(r.businessName) LIKE :search OR r.phone LIKE :search)',
        { search: `%${query.search.toLowerCase()}%` },
      );

    qb.orderBy(`r.${query.sortBy || 'createdAt'}`, query.sortOrder || 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [data, total] = await qb.getManyAndCount();
    return {
      data: data.map((r) => ({ ...r, earlyAccessId: r.earlyAccessId })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: number) {
    const registration = await this.repo.findOne({
      where: { id, isDeleted: false },
    });
    if (!registration) throw new NotFoundException('Registration not found');
    return { ...registration, earlyAccessId: registration.earlyAccessId };
  }

  private async findEntityOrThrow(id: number): Promise<EarlyAccessRegistration> {
    const registration = await this.repo.findOne({
      where: { id, isDeleted: false },
    });
    if (!registration) throw new NotFoundException('Registration not found');
    return registration;
  }

  async approve(id: number) {
    const registration = await this.findEntityOrThrow(id);
    registration.status = RegistrationStatus.APPROVED;
    registration.rejectionReason = null;
    await this.repo.save(registration);
    return { ...registration, earlyAccessId: registration.earlyAccessId };
  }

  async reject(id: number, dto: RejectRegistrationDto) {
    const registration = await this.findEntityOrThrow(id);
    registration.status = RegistrationStatus.REJECTED;
    registration.rejectionReason = dto.rejectionReason;
    await this.repo.save(registration);
    return { ...registration, earlyAccessId: registration.earlyAccessId };
  }

  async softDelete(id: number) {
    const registration = await this.findEntityOrThrow(id);
    registration.isDeleted = true;
    await this.repo.save(registration);
    return { message: 'Registration deleted' };
  }

  async getStats() {
    const base = this.baseQuery();
    const [total, pending, approved, rejected] = await Promise.all([
      this.baseQuery().getCount(),
      this.baseQuery()
        .andWhere('r.status = :s', { s: RegistrationStatus.PENDING })
        .getCount(),
      this.baseQuery()
        .andWhere('r.status = :s', { s: RegistrationStatus.APPROVED })
        .getCount(),
      this.baseQuery()
        .andWhere('r.status = :s', { s: RegistrationStatus.REJECTED })
        .getCount(),
    ]);

    const byAccountType = await this.baseQuery()
      .select('r.accountType', 'accountType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('r.accountType')
      .getRawMany();

    const byRegion = await this.baseQuery()
      .select('r.region', 'region')
      .addSelect('COUNT(*)', 'count')
      .groupBy('r.region')
      .orderBy('count', 'DESC')
      .getRawMany();

    const byCategory = await this.baseQuery()
      .select('r.businessCategory', 'category')
      .addSelect('COUNT(*)', 'count')
      .groupBy('r.businessCategory')
      .orderBy('count', 'DESC')
      .getRawMany();

    const perDay = await this.baseQuery()
      .select('DATE(r.createdAt)', 'date')
      .addSelect('COUNT(*)', 'count')
      .andWhere("r.createdAt >= NOW() - INTERVAL '30 days'")
      .groupBy('DATE(r.createdAt)')
      .orderBy('date', 'ASC')
      .getRawMany();

    return {
      total,
      pending,
      approved,
      rejected,
      byAccountType,
      byRegion,
      byCategory,
      registrationsPerDay: perDay,
    };
  }

  // Public counts only — no PII — backs the landing page stat counters.
  async getPublicStats() {
    const [businesses, serviceProviders, transporters, regions] =
      await Promise.all([
        this.baseQuery()
          .andWhere('r.accountType IN (:...types)', {
            types: [AccountType.BUSINESS, AccountType.SELLER],
          })
          .getCount(),
        this.baseQuery()
          .andWhere('r.accountType = :type', {
            type: AccountType.SERVICE_PROVIDER,
          })
          .getCount(),
        this.baseQuery()
          .andWhere('r.accountType = :type', {
            type: AccountType.TRANSPORTER,
          })
          .getCount(),
        this.baseQuery()
          .select('COUNT(DISTINCT r.region)', 'count')
          .getRawOne(),
      ]);
    return {
      businessesRegistered: businesses,
      serviceProviders,
      transporters,
      regionsCovered: Number(regions?.count) || 0,
    };
  }

  async exportCsv(query: QueryRegistrationsDto): Promise<string> {
    const rows = await this.baseQuery().getMany();
    const header = EXPORT_COLUMNS.map((c) => c.header).join(',');
    const lines = rows.map((row) =>
      EXPORT_COLUMNS.map((c) => csvEscape(row[c.key])).join(','),
    );
    return [header, ...lines].join('\n');
  }

  async exportExcel(query: QueryRegistrationsDto): Promise<Buffer> {
    const rows = await this.baseQuery().getMany();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Registrations');
    sheet.columns = EXPORT_COLUMNS.map((c) => ({
      header: c.header,
      key: c.key as string,
      width: 20,
    }));
    rows.forEach((row) => sheet.addRow(row));
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const str = value instanceof Date ? value.toISOString() : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
