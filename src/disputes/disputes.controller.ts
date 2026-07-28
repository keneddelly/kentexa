import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { DisputesService } from './disputes.service';
import { DisputeReason, DisputeResolution } from './entities/dispute.entity';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('disputes')
@UseGuards(JwtAuthGuard)
export class DisputesController {
  constructor(private service: DisputesService) {}

  // ── Buyer/Seller: raise dispute ──────────────────────────────────────────
  @Post()
  raise(
    @Request() req,
    @Body()
    body: {
      orderId: number;
      reason: DisputeReason;
      description: string;
      evidencePhotos?: string[];
    },
  ) {
    return this.service.raise(req.user, body);
  }

  // ── Seller: respond to dispute ───────────────────────────────────────────
  @Patch(':id/respond')
  sellerRespond(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() body: { response: string },
  ) {
    return this.service.sellerRespond(req.user, id, body.response);
  }

  // ── Buyer/Seller: my disputes ────────────────────────────────────────────
  @Get('my')
  getMyDisputes(@Request() req) {
    return this.service.getMyDisputes(req.user);
  }

  // ── Admin: all disputes ──────────────────────────────────────────────────
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Get('admin/all')
  getAll(@Query('status') status?: string) {
    return this.service.getAll({ status });
  }

  // ── Admin: dispute detail ────────────────────────────────────────────────
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ARBITRATOR)
  @Get(':id')
  getDetail(@Param('id', ParseIntPipe) id: number) {
    return this.service.getDetail(id);
  }

  // ── Admin: assign arbitrator ─────────────────────────────────────────────
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @Patch(':id/assign-arbitrator')
  assignArbitrator(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { arbitratorId: number },
  ) {
    return this.service.assignArbitrator(id, body.arbitratorId);
  }

  // ── Admin/Arbitrator: resolve ────────────────────────────────────────────
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER, UserRole.ARBITRATOR)
  @Patch(':id/resolve')
  resolve(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body()
    body: {
      resolution: DisputeResolution;
      resolutionNote: string;
      refundAmount?: number;
    },
  ) {
    return this.service.resolve(req.user, id, body);
  }
}
