import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  ParseIntPipe,
  Res,
  Header,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { BadRequestException } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import { EarlyAccessService } from './early-access.service';
import { EarlyAccessUploadService } from './early-access-upload.service';
import { EarlyAccessOtpService } from './early-access-otp.service';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { CreateQuickRegistrationDto } from './dto/create-quick-registration.dto';
import { QueryRegistrationsDto } from './dto/query-registrations.dto';
import { RejectRegistrationDto } from './dto/reject-registration.dto';
import { SendPhoneOtpDto } from './dto/send-phone-otp.dto';
import { VerifyPhoneOtpDto } from './dto/verify-phone-otp.dto';
import {
  AccountType,
  BusinessCategory,
} from './entities/early-access-registration.entity';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiTags('early-access')
@Controller('early-access')
export class EarlyAccessController {
  constructor(
    private service: EarlyAccessService,
    private uploadService: EarlyAccessUploadService,
    private otpService: EarlyAccessOtpService,
  ) {}

  // ── Public ─────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Send an SMS verification code to a phone number' })
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 3600000 } })
  @Post('phone/send-otp')
  sendPhoneOtp(@Body() dto: SendPhoneOtpDto) {
    return this.otpService.sendOtp(dto.phone);
  }

  @ApiOperation({ summary: 'Verify a phone number with its SMS code' })
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @Post('phone/verify-otp')
  verifyPhoneOtp(@Body() dto: VerifyPhoneOtpDto) {
    return this.otpService.verifyOtp(dto.phone, dto.otp);
  }

  @ApiOperation({ summary: 'Submit an early-access registration' })
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post('register')
  register(@Body() dto: CreateRegistrationDto) {
    return this.service.create(dto);
  }

  @ApiOperation({
    summary: 'Submit a short early-access registration (accountType, name, WhatsApp only)',
  })
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 3600000 } })
  @Post('quick-register')
  quickRegister(@Body() dto: CreateQuickRegistrationDto) {
    return this.service.createQuick(dto);
  }

  @ApiOperation({ summary: 'Upload registration images (logo/cover/photos)' })
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 3600000 } })
  @Post('upload')
  @UseInterceptors(
    FilesInterceptor('files', 8, {
      storage: memoryStorage(),
      fileFilter: (req, file, cb) => {
        const allowed = /jpeg|jpg|png|webp/;
        const valid = allowed.test(extname(file.originalname).toLowerCase());
        if (valid) cb(null, true);
        else cb(new BadRequestException('Only images allowed'), false);
      },
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async upload(@UploadedFiles() files: Express.Multer.File[]) {
    const urls = await this.uploadService.uploadFiles(files);
    return { urls };
  }

  @ApiOperation({ summary: 'List account types and business categories' })
  @Get('categories')
  categories() {
    return {
      accountTypes: Object.values(AccountType),
      businessCategories: Object.values(BusinessCategory),
    };
  }

  @ApiOperation({ summary: 'Public registration counters for the landing page' })
  @Get('stats/public')
  publicStats() {
    return this.service.getPublicStats();
  }

  // ── Admin ──────────────────────────────────────────────────────────────

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'List registrations (admin)' })
  @Get('admin')
  findAll(@Query() query: QueryRegistrationsDto) {
    return this.service.findAll(query);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Registration analytics/stats (admin)' })
  @Get('admin/stats')
  stats() {
    return this.service.getStats();
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Export registrations as CSV (admin)' })
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="early-access-registrations.csv"')
  @Get('admin/export/csv')
  async exportCsv(@Query() query: QueryRegistrationsDto, @Res() res: Response) {
    const csv = await this.service.exportCsv(query);
    res.send(csv);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Export registrations as Excel (admin)' })
  @Header(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @Header('Content-Disposition', 'attachment; filename="early-access-registrations.xlsx"')
  @Get('admin/export/excel')
  async exportExcel(@Query() query: QueryRegistrationsDto, @Res() res: Response) {
    const buffer = await this.service.exportExcel(query);
    res.send(buffer);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Get one registration (admin)' })
  @Get('admin/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Approve a registration (admin)' })
  @Patch('admin/:id/approve')
  approve(@Param('id', ParseIntPipe) id: number) {
    return this.service.approve(id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Reject a registration (admin)' })
  @Patch('admin/:id/reject')
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectRegistrationDto) {
    return this.service.reject(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Soft-delete a registration (admin)' })
  @Delete('admin/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.softDelete(id);
  }
}
