import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { StaffService } from './staff.service';

/** Wafanyakazi wa KenteXa (owner 2026-11-09). Admin only: no staff role may give staff roles. */
@Controller('admin/staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  list() {
    return this.staff.list();
  }

  @Post()
  grant(@Body() body: { phone?: string; userId?: number; roleType?: string }, @Request() req: any) {
    return this.staff.grant(body || {}, req.user.id);
  }

  @Patch(':id')
  setStatus(@Param('id', ParseIntPipe) id: number, @Body() body: { status?: string }, @Request() req: any) {
    return this.staff.setStatus(id, String(body?.status || ''), req.user.id);
  }
}
