import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  UseGuards,
  Request,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { SellerService } from './seller.service';
import { CreateSellerProfileDto } from './dto/create-seller-profile.dto';
import { JwtAuthGuard } from '../auth/auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('seller')
export class SellerController {
  constructor(private sellerService: SellerService) {}

  // Public: Get all approved sellers (for Home/Stores cards)
  @UseGuards(OptionalJwtAuthGuard)
  @Get('public/all')
  getAllPublicSellers(@Request() req) {
    return this.sellerService.findPublicSellers(req.user?.id);
  }

  // Public: Get seller by user ID
  @Get('public/:userId')
  getPublicSeller(@Param('userId', ParseIntPipe) userId: number) {
    return this.sellerService.findByUserId(userId);
  }

  // Apply to become seller
  @UseGuards(JwtAuthGuard)
  @Post('apply')
  apply(@Body() dto: CreateSellerProfileDto, @Request() req) {
    return this.sellerService.apply(dto, req.user);
  }

  // Get my seller profile
  @UseGuards(JwtAuthGuard)
  @Get('my-profile')
  getMyProfile(@Request() req) {
    return this.sellerService.getMyProfile(req.user.id);
  }

  // Update my seller profile
  @UseGuards(JwtAuthGuard)
  @Patch('my-profile')
  updateProfile(@Body() dto: Partial<CreateSellerProfileDto>, @Request() req) {
    return this.sellerService.updateProfile(req.user.id, dto);
  }

  // Get seller dashboard
  @UseGuards(JwtAuthGuard)
  @Get('dashboard')
  getDashboard(@Request() req) {
    return this.sellerService.getDashboardStats(req.user);
  }

  @Get('my-payouts')
  @UseGuards(JwtAuthGuard)
  getMyPayouts(@Request() req) {
    return this.sellerService.getMyPayouts(req.user.id);
  }

  // Admin routes
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('all')
  findAll() {
    return this.sellerService.findAll();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number) {
    return this.sellerService.approve(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/reject')
  reject(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
  ) {
    return this.sellerService.reject(id, reason);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/suspend')
  suspend(
    @Param('id', ParseIntPipe) id: number,
    @Body('reason') reason: string,
  ) {
    return this.sellerService.suspend(id, reason);
  }
  // ── Team Management ───────────────────────────────────────────────────────
  @Get('team')
  @UseGuards(JwtAuthGuard)
  getTeam(@Request() req) {
    return this.sellerService.getTeamMembers(req.user.id);
  }

  @Post('team/invite')
  @UseGuards(JwtAuthGuard)
  inviteMember(@Request() req, @Body() dto: any) {
    return this.sellerService.inviteTeamMember(req.user.id, dto);
  }

  @Patch('team/:id')
  @UseGuards(JwtAuthGuard)
  updateMember(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
  ) {
    return this.sellerService.updateTeamMember(req.user.id, id, dto);
  }

  @Delete('team/:id')
  @UseGuards(JwtAuthGuard)
  removeMember(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.sellerService.removeTeamMember(req.user.id, id);
  }
}
