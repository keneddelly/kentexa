/**
 * ReputationController
 * Place at: src/reputation/reputation.controller.ts
 */
import {
  Controller,
  Get,
  Post,
  Param,
  Request,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { ReputationService } from './reputation.service';

@Controller('reputation')
export class ReputationController {
  constructor(private readonly svc: ReputationService) {}

  @Get('my')
  @UseGuards(JwtAuthGuard)
  getMyReputation(@Request() req) {
    return this.svc.getProfile(req.user.id);
  }

  @Get('user/:id')
  getPublicReputation(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getProfile(id);
  }

  @Get('leaderboard')
  getLeaderboard() {
    return this.svc.getLeaderboard(20);
  }

  @Post('admin/bootstrap')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  bootstrap() {
    return this.svc.bootstrap();
  }
}
