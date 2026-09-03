import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  ParseIntPipe,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from './entities/user.entity';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { CurrentRoleContext } from '../role-context/current-role-context.decorator';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import type { RoleContext } from '../role-context/role-context.types';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  findAll() {
    return this.usersService.findAll();
  }

  // Full user record — same owner-or-admin boundary as update() below.
  // (Anyone needing another user's public-facing info should go through a
  // dedicated public-profile endpoint, not this one.)
  // Security closure pass: the admin bypass previously read
  // requestingUser.role directly -- a legacy, last-writer-wins field that
  // tracks whatever the user was EVER last approved as, not their current
  // active session. An admin+seller account currently operating as seller
  // could still trip this bypass purely because the stale `role` column
  // happened to still say 'admin'. Now resolved from the current
  // RoleContext instead, same as every other operational gate in this pass.
  @UseGuards(RoleContextGuard)
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @CurrentRoleContext() roleContext: RoleContext,
  ) {
    const isAdmin =
      roleContext?.roleType === AccountRoleType.ADMIN ||
      roleContext?.roleType === AccountRoleType.MANAGER;
    const isOwnProfile = req.user?.id === id;

    if (!isAdmin && !isOwnProfile) {
      throw new ForbiddenException('You can only view your own profile');
    }

    return this.usersService.findOne(id);
  }

  // ✅ Users can update their own profile (name, phone)
  // Admins can update any user
  @UseGuards(RoleContextGuard)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @Request() req,
    @CurrentRoleContext() roleContext: RoleContext,
  ) {
    const isAdmin =
      roleContext?.roleType === AccountRoleType.ADMIN ||
      roleContext?.roleType === AccountRoleType.MANAGER;
    const isOwnProfile = req.user?.id === id;

    if (!isAdmin && !isOwnProfile) {
      throw new ForbiddenException('You can only update your own profile');
    }

    // Non-admins cannot change their own role
    if (!isAdmin && dto.role) {
      delete dto.role;
    }

    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.remove(id);
  }
}
