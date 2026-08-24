import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { VerificationService } from './verification.service';
import { Feature } from './verification.constants';

@Controller('identity')
export class IdentityController {
  constructor(private verification: VerificationService) {}

  @UseGuards(JwtAuthGuard)
  @Post('submit')
  async submit(
    @Request() req,
    @Body()
    body: {
      nidaNumber: string;
      legalName: string;
      dateOfBirth: string;
      idDocumentImageUrl: string;
    },
  ) {
    if (!body.nidaNumber || !body.legalName || !body.dateOfBirth || !body.idDocumentImageUrl) {
      throw new BadRequestException('All identity fields are required');
    }
    return this.verification.submit(req.user, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Request() req) {
    const [profile, level] = await Promise.all([
      this.verification.getIdentityProfile(req.user.id),
      this.verification.getLevel(req.user.id),
    ]);
    return {
      status: profile?.status || 'not_submitted',
      level,
      rejectionReason: profile?.rejectionReason || null,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('requirements/:feature')
  async requirements(@Request() req, @Param('feature') feature: string) {
    const key = feature.toUpperCase() as Feature;
    if (!(key in Feature)) throw new BadRequestException('Unknown feature');
    return this.verification.getMissingRequirements(req.user.id, key);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/list')
  async list(@Query('status') status?: string) {
    return status === 'all' ? this.verification.getAll() : this.verification.getPending();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch('admin/:id/review')
  async review(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { approve: boolean; reason?: string },
  ) {
    return this.verification.review(Number(id), req.user, !!body.approve, body.reason);
  }
}
