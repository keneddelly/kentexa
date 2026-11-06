import {
  Controller,
  Get,
  Delete,
  Param,
  ParseIntPipe,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { InstagramBusinessConnectionService } from './instagram-business-connection.service';

/**
 * Business-scoped Instagram connection administration.
 * Every operation is authorized against the active Business workspace chain.
 */
@Controller('business/:businessId/instagram/connections')
@UseGuards(JwtAuthGuard)
export class InstagramBusinessConnectionsController {
  constructor(private readonly connections: InstagramBusinessConnectionService) {}

  @Get()
  list(
    @Param('businessId', ParseIntPipe) businessId: number,
    @Request() req: any,
  ) {
    return this.connections.list(businessId, req.user.id);
  }

  @Delete(':connectionId')
  disconnect(
    @Param('businessId', ParseIntPipe) businessId: number,
    @Param('connectionId', ParseIntPipe) connectionId: number,
    @Request() req: any,
  ) {
    return this.connections.disconnect(businessId, connectionId, req.user.id);
  }
}
