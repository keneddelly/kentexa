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
import { User, UserRole } from '../users/entities/user.entity';
import { SellerScopeService } from '../business/seller-scope.service';

@Controller('seller')
export class SellerController {
  constructor(
    private sellerService: SellerService,
    private sellerScope: SellerScopeService,
  ) {}

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

  // Get my seller profile — "my" here means the effective business: own, or
  // an employer's if I'm an active team member with the right permission.
  @UseGuards(JwtAuthGuard)
  @Get('my-profile')
  async getMyProfile(@Request() req) {
    const sellerId = await this.sellerScope.resolve(
      req.user,
      'canManageProducts',
    );
    return this.sellerService.getMyProfile(sellerId);
  }

  // Update my seller profile
  @UseGuards(JwtAuthGuard)
  @Patch('my-profile')
  async updateProfile(
    @Body() dto: Partial<CreateSellerProfileDto>,
    @Request() req,
  ) {
    const sellerId = await this.sellerScope.resolve(
      req.user,
      'canManageProducts',
    );
    return this.sellerService.updateProfile(sellerId, dto);
  }

  // Get seller dashboard
  @UseGuards(JwtAuthGuard)
  @Get('dashboard')
  async getDashboard(@Request() req) {
    const sellerId = await this.sellerScope.resolve(
      req.user,
      'canViewOrders',
    );
    return this.sellerService.getDashboardStats({ id: sellerId } as User);
  }

  @Get('my-payouts')
  @UseGuards(JwtAuthGuard)
  async getMyPayouts(@Request() req) {
    const sellerId = await this.sellerScope.resolve(
      req.user,
      'canViewRevenue',
    );
    return this.sellerService.getMyPayouts(sellerId);
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
  async getTeam(@Request() req) {
    const sellerId = await this.sellerScope.resolve(req.user, 'canManageTeam');
    return this.sellerService.getTeamMembers(sellerId);
  }

  @Post('team/invite')
  @UseGuards(JwtAuthGuard)
  async inviteMember(@Request() req, @Body() dto: any) {
    const sellerId = await this.sellerScope.resolve(req.user, 'canManageTeam');
    return this.sellerService.inviteTeamMember(sellerId, dto);
  }

  @Patch('team/:id')
  @UseGuards(JwtAuthGuard)
  async updateMember(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
  ) {
    const sellerId = await this.sellerScope.resolve(req.user, 'canManageTeam');
    return this.sellerService.updateTeamMember(sellerId, id, dto);
  }

  @Delete('team/:id')
  @UseGuards(JwtAuthGuard)
  async removeMember(@Request() req, @Param('id', ParseIntPipe) id: number) {
    const sellerId = await this.sellerScope.resolve(req.user, 'canManageTeam');
    return this.sellerService.removeTeamMember(sellerId, id);
  }
}
