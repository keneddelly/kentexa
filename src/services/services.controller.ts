/**
 * ServicesController
 * Place at: src/services/services.controller.ts
 */
import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, Request,
  UseGuards, ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard }    from '../auth/auth.guard';
import { ServicesService } from './services.service';
import { JobStatus }       from './entities/job-request.entity';

@Controller('services')
export class ServicesController {
  constructor(private readonly svc: ServicesService) {}

  @Get('search')
  search(@Query('q') q: string) {
    if (!q) return [];
    return this.svc.search(q);
  }

  // ── Public browse ─────────────────────────────────────────────────────────
  @Get()
  browse(
    @Query('category')  category?:  string,
    @Query('city')      city?:      string,
    @Query('q')         q?:         string,
    @Query('available') available?: string,
    @Query('limit')     limit?:     string,
    @Query('offset')    offset?:    string,
  ) {
    return this.svc.browse({
      category, city, q,
      available: available === 'true',
      limit:     limit  ? Number(limit)  : 20,
      offset:    offset ? Number(offset) : 0,
    });
  }

  @Get('featured')
  getFeatured(@Query('limit') limit?: string) {
    return this.svc.getFeatured(limit ? Number(limit) : 8);
  }

  @Get('category/:category')
  getByCategory(
    @Param('category') category: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.getByCategory(category, limit ? Number(limit) : 12);
  }

  @Get(':id')
  getById(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getById(id);
  }

  // ── Provider: manage own ads ──────────────────────────────────────────────
  @Post()
  @UseGuards(JwtAuthGuard)
  createAd(@Request() req, @Body() dto: any) {
    return this.svc.createAd(req.user, dto);
  }

  @Get('my/ads')
  @UseGuards(JwtAuthGuard)
  getMyAds(@Request() req) {
    return this.svc.getMyAds(req.user.id);
  }

  @Patch('my/ads/:id')
  @UseGuards(JwtAuthGuard)
  updateAd(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
  ) {
    return this.svc.updateAd(req.user.id, id, dto);
  }

  @Delete('my/ads/:id')
  @UseGuards(JwtAuthGuard)
  deleteAd(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteAd(req.user.id, id);
  }

  // ── Job Requests ──────────────────────────────────────────────────────────
  @Post('jobs/request')
  @UseGuards(JwtAuthGuard)
  requestJob(@Request() req, @Body() dto: any) {
    return this.svc.createJobRequest(req.user, dto);
  }

  @Get('my/jobs')
  @UseGuards(JwtAuthGuard)
  getMyJobs(@Request() req, @Query('status') status?: string) {
    return this.svc.getMyJobs(req.user.id, status);
  }

  @Get('my/requests')
  @UseGuards(JwtAuthGuard)
  getMyRequests(@Request() req) {
    return this.svc.getMyRequests(req.user.id);
  }

  @Patch('jobs/:id/respond')
  @UseGuards(JwtAuthGuard)
  respondToJob(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { accept: boolean; agreedPrice?: number; providerNote?: string },
  ) {
    return this.svc.respondToJob(req.user.id, id, dto);
  }

  @Patch('jobs/:id/status')
  @UseGuards(JwtAuthGuard)
  updateStatus(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { status: JobStatus; note?: string },
  ) {
    return this.svc.updateJobStatus(req.user.id, id, dto.status, dto.note);
  }

  @Post('jobs/:id/review')
  @UseGuards(JwtAuthGuard)
  reviewJob(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { rating: number; review: string },
  ) {
    return this.svc.reviewJob(req.user.id, id, dto.rating, dto.review);
  }
}