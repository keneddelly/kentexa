import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog) private repo: Repository<AuditLog>,
  ) {}

  // Append-only write. Callers should pass only the fields that actually
  // changed in previousValue/newValue (e.g. { status: 'approved' }), never
  // a full entity dump — and never passwords, payment secrets, API keys,
  // or document contents. This never throws in a way that should block the
  // caller's own operation — callers that can't tolerate any failure path
  // should `.catch(() => {})`, same convention used for notifications
  // elsewhere in this codebase.
  async record(params: {
    actorId: number | null;
    actorRole?: string | null;
    action: string;
    entityType: string;
    entityId: number;
    previousValue?: Record<string, any> | null;
    newValue?: Record<string, any> | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    await this.repo.save(
      this.repo.create({
        actorId: params.actorId,
        actorRole: params.actorRole ?? null,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        previousValue: params.previousValue ?? null,
        newValue: params.newValue ?? null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
      }),
    );
  }

  async findForEntity(entityType: string, entityId: number, limit = 50) {
    return this.repo.find({
      where: { entityType, entityId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
