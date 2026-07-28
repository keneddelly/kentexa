/**
 * PickupPointsController
 * Place at: src/pickup-points/pickup-points.controller.ts
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { PickupPointsService } from './pickup-points.service';
import { PickupPointStatus } from './entities/pickup-point.entity';

@Controller('pickup-points')
export class PickupPointsController {
  constructor(private readonly svc: PickupPointsService) {}

  @Get()
  findAll(@Query('city') city?: string) {
    return this.svc.findAll(city);
  }

  @Get('city/:city')
  findByCity(@Param('city') city: string) {
    return this.svc.findByCity(city);
  }

  @Get('mine')
  @UseGuards(JwtAuthGuard)
  findMine(@Request() req) {
    return this.svc.findMine(req.user.id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Request() req, @Body() dto: any) {
    return this.svc.create(req.user.id, dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
  ) {
    return this.svc.update(req.user.id, id, dto);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard)
  updateStatus(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: PickupPointStatus,
  ) {
    return this.svc.updateStatus(req.user.id, id, status);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(req.user.id, id);
  }
}
