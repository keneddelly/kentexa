import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { ServiceProvidersService } from './service-providers.service';
import { CreateServiceProviderDto } from './dto/create-service-provider.dto';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { ActiveRoleGuard } from '../role-context/active-role.guard';
import { RequireActiveRole } from '../role-context/require-active-role.decorator';
import { AccountRoleType } from '../role-context/entities/account-role.entity';

@Controller('service-providers')
export class ServiceProvidersController {
  constructor(private service: ServiceProvidersService) {}

  // Public: Get service provider by user ID (approved only)
  @Get('public/:userId')
  getPublicProvider(@Param('userId', ParseIntPipe) userId: number) {
    return this.service.findByUserId(userId);
  }

  // Apply to become a service provider -- no ServiceProvider AccountRole
  // exists yet, so this can't require one.
  @UseGuards(JwtAuthGuard)
  @Post('apply')
  apply(@Body() dto: CreateServiceProviderDto, @Request() req) {
    return this.service.apply(dto, req.user);
  }

  // Self-status-check (pending/approved/rejected) -- a pending applicant is
  // still active as buyer, same precedent as Seller/Agent/Transport.
  @UseGuards(JwtAuthGuard)
  @Get('my-profile')
  getMyProfile(@Request() req) {
    return this.service.getMyProfile(req.user.id);
  }

  // Update my service provider profile
  @UseGuards(JwtAuthGuard, RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.SERVICE_PROVIDER, AccountRoleType.ADMIN)
  updateProfile(
    @Body() dto: Partial<CreateServiceProviderDto>,
    @Request() req,
  ) {
    return this.service.updateProfile(req.user.id, dto);
  }

  // Admin: all service providers
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Get('all')
  findAll(@Query('status') status?: string) {
    return this.service.findAll(status);
  }

  // Admin: approve
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Patch(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number) {
    return this.service.approve(id);
  }

  // Admin: reject
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Patch(':id/reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
  ) {
    return this.service.reject(id, reason);
  }
}
