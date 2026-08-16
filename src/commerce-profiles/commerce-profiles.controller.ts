import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
  ParseIntPipe,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CommerceProfilesService } from './commerce-profiles.service';
import { CommerceProfilesBackfillService } from './commerce-profiles-backfill.service';

@Controller('profiles')
export class CommerceProfilesController {
  constructor(
    private service: CommerceProfilesService,
    private backfill: CommerceProfilesBackfillService,
  ) {}

  // Public — the future `/@username` route resolves through this.
  @Get('username/:username')
  getByUsername(@Param('username') username: string) {
    return this.service.findByUsername(username);
  }

  // Public — every profile a given account owns. Used today by
  // CommerceProfile.js to resolve the correct brand per tab (business
  // profile for the default view, transport profile for the Routes tab,
  // etc.) without guessing from role state. Also the seed for the future
  // "Also on Kentexa" cross-links between a person's profiles.
  @Get('for-user/:userId')
  getForUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.service.findForUser(userId);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  getMine(@Request() req) {
    return this.service.findForUser(req.user.id);
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  async getById(@Request() req, @Param('id', ParseIntPipe) id: number) {
    const profile = await this.service.findById(id);
    const isFollowing = await this.service.isFollowing(req.user?.id, id);
    return { ...profile, isFollowing };
  }

  // Follows/unfollows THIS SPECIFIC profile — never the owning account.
  // A buyer can follow Bishoo Intelligence Systems without following
  // Kened personally, and vice versa; each profile's followersCount is
  // its own independent number.
  @Post(':id/follow')
  @UseGuards(JwtAuthGuard)
  toggleFollow(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.service.toggleFollow(req.user.id, id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    dto: {
      displayName?: string;
      photoUrl?: string;
      coverImage?: string;
      bio?: string;
      location?: string;
    },
  ) {
    const profile = await this.service.findById(id);
    // Ownership only for now — CommerceProfileMember-based delegation
    // (staff editing a profile's public info) is a natural extension of
    // this check once that flow has a UI, same shape as
    // SellerScopeService.resolve() already used elsewhere.
    if (profile.ownerId !== req.user.id && req.user.role !== 'admin') {
      throw new ForbiddenException('You do not manage this profile');
    }
    return this.service.updatePublicFields(id, dto);
  }

  // Admin-only, one-time (idempotent — safe to re-run): creates the
  // CommerceProfile rows this system needs for every existing User and
  // every existing approved Seller/Transport/Agent/SuperAgent record that
  // predates this feature. New records create their own profile going
  // forward (wired into each module's apply/register/approve flow); this
  // endpoint only ever needs to catch up the pre-existing data once.
  @Post('admin/backfill')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  runBackfill() {
    return this.backfill.run();
  }
}
