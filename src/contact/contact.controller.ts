import {
  Controller, Get, Post, Patch,
  Param, Body, Query, UseGuards, ParseIntPipe,
} from '@nestjs/common';
import { ContactService } from './contact.service';
import { ContactMessageStatus } from './entities/contact-message.entity';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

interface ContactFormDto {
  name:    string;
  email:   string;
  phone?:  string;
  subject: string;
  message: string;
}

@Controller('contact')
export class ContactController {
  constructor(private contactService: ContactService) {}

  // Public — submit contact form
  @Post()
  submit(@Body() dto: ContactFormDto) {
    return this.contactService.submit(dto);
  }

  // Admin — list all messages, optional ?status=open filter
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  findAll(@Query('status') status?: ContactMessageStatus) {
    return this.contactService.findAll(status);
  }

  // Admin — dashboard stats
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('stats')
  getStats() {
    return this.contactService.getStats();
  }

  // Admin — view one message
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.contactService.findOne(id);
  }

  // Admin — update status / add note
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: ContactMessageStatus; adminNote?: string },
  ) {
    return this.contactService.updateStatus(id, body.status, body.adminNote);
  }
}