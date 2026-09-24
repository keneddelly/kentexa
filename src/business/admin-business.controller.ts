import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Query, Request, UseGuards } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { ActiveRoleGuard } from '../role-context/active-role.guard';
import { RequireActiveRole } from '../role-context/require-active-role.decorator';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { AuditLog } from '../audit-log/entities/audit-log.entity';
import { Business, BusinessStatus } from './entities/business.entity';

@Controller('admin/businesses')
@UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
@RequireActiveRole(AccountRoleType.ADMIN)
export class AdminBusinessController {
  constructor(private readonly dataSource: DataSource) {}

  @Get()
  async list(@Query('search') search?: string, @Query('status') status?: string) {
    if (status && !Object.values(BusinessStatus).includes(status as BusinessStatus)) {
      throw new BadRequestException('Invalid business status');
    }
    const query = (search ?? '').trim();
    if (query.length > 100) throw new BadRequestException('Search is too long');
    const rows = this.dataSource.getRepository(Business).createQueryBuilder('business')
      .select('business.id', 'id')
      .addSelect('business.legalName', 'legalName')
      .addSelect('business.status', 'status')
      .orderBy('business.id', 'DESC').limit(100);
    if (status) rows.andWhere('business.status = :status', { status });
    if (query) rows.andWhere('business.legalName ILIKE :query', { query: `%${query.replace(/[\\%_]/g, '\\$&')}%` });
    return rows.getRawMany();
  }

  @Post(':id/restore')
  async restore(@Param('id', ParseIntPipe) id: number, @Request() req, @Body() dto: { reason?: string }) {
    return this.transition(id, req.user.id, BusinessStatus.ACTIVE, dto?.reason);
  }

  @Post(':id/suspend')
  async suspend(@Param('id', ParseIntPipe) id: number, @Request() req, @Body() dto: { reason?: string }) {
    return this.transition(id, req.user.id, BusinessStatus.SUSPENDED, dto?.reason);
  }

  private async transition(id: number, actorId: number, next: BusinessStatus, reason?: string) {
    const note = reason?.trim() ?? '';
    if (note.length < 3 || note.length > 1000) throw new BadRequestException('A reason of 3 to 1000 characters is required');
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(Business);
      const business = await repo.findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!business) throw new BadRequestException('Business not found');
      if (business.status === next) return { id, status: business.status, changed: false };
      const previousStatus = business.status;
      business.status = next;
      await repo.save(business);
      await manager.getRepository(AuditLog).save({
        actorId, actorRole: AccountRoleType.ADMIN, action: `business.${next === BusinessStatus.ACTIVE ? 'restore' : 'suspend'}`,
        entityType: 'Business', entityId: id,
        previousValue: { status: previousStatus }, newValue: { status: next, reason: note },
      });
      return { id, status: next, changed: true };
    });
  }
}
