import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { BusinessCustomerService } from './business-customer.service';
import { ConversationService } from './conversation.service';

/**
 * BusinessController — Seller Business Platform API
 *
 * /business/customers/*     → CRM
 * /business/inbox/*         → Conversations
 */
@Controller('business')
@UseGuards(JwtAuthGuard)
export class BusinessController {
  constructor(
    private customerService: BusinessCustomerService,
    private conversationService: ConversationService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // CUSTOMERS (CRM) — was JwtAuthGuard-only, so any logged-in account (a
  // plain buyer included) could add/list "their customers". Restricted to
  // roles that actually run a store.
  // ═══════════════════════════════════════════════════════════════════════════

  @UseGuards(RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN, UserRole.MANAGER)
  @Get('customers')
  getCustomers(
    @Request() req,
    @Query('search') search?: string,
    @Query('segment') segment?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.customerService.getMyCustomers(req.user.id, {
      search,
      segment,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN, UserRole.MANAGER)
  @Get('customers/stats')
  getCustomerStats(@Request() req) {
    return this.customerService.getDashboardStats(req.user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN, UserRole.MANAGER)
  @Get('customers/:id')
  getCustomer(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.customerService.getCustomerDetail(req.user.id, id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN, UserRole.MANAGER)
  @Post('customers/migrate')
  migrateExistingOrders(@Request() req) {
    return this.customerService.migrateFromExistingOrders(req.user.id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN, UserRole.MANAGER)
  @Post('customers')
  addCustomer(
    @Request() req,
    @Body()
    dto: {
      name: string;
      phone?: string;
      email?: string;
      address?: string;
      regionId?: number;
      region?: string;
      districtId?: number;
      district?: string;
      wardId?: number;
      ward?: string;
      tags?: string[];
      notes?: string;
    },
  ) {
    return this.customerService.addCustomer(req.user.id, dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.SELLER, UserRole.ADMIN, UserRole.MANAGER)
  @Patch('customers/:id')
  updateCustomer(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
  ) {
    return this.customerService.updateCustomer(req.user.id, id, dto);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INBOX (Conversations)
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('inbox')
  getInbox(
    @Request() req,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
  ) {
    return this.conversationService.getSellerInbox(req.user.id, {
      status,
      search,
      page: page ? Number(page) : 1,
    });
  }

  @Post('inbox/start')
  startConversation(@Request() req, @Body() body: { customerId: number }) {
    return this.conversationService.getOrCreateConversation(
      req.user.id,
      body.customerId,
    );
  }

  @Get('inbox/:id/messages')
  getMessages(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.conversationService.getMessages(req.user.id, id);
  }

  @Post('inbox/:id/messages')
  sendMessage(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    dto: {
      content?: string;
      imageUrl?: string;
      isNote?: boolean;
    },
  ) {
    return this.conversationService.sendMessage(req.user.id, id, dto, req.user);
  }

  @Post('inbox/:id/share-product')
  shareProduct(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    product: { id: number; name: string; price: number; image?: string },
  ) {
    return this.conversationService.shareProduct(
      req.user.id,
      id,
      product,
      req.user,
    );
  }

  @Patch('inbox/:id/status')
  updateConversationStatus(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: string },
  ) {
    return this.conversationService.updateStatus(req.user.id, id, body.status);
  }

  @Patch('inbox/:id/assign')
  assignConversation(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { assignedToId: number },
  ) {
    return this.conversationService.assignTo(
      req.user.id,
      id,
      body.assignedToId,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MY CONVERSATIONS (as the buyer — same inbox, other side of the table)
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('my-conversations')
  getMyConversations(@Request() req, @Query('page') page?: string) {
    return this.conversationService.getMyConversations(req.user.id, {
      page: page ? Number(page) : 1,
    });
  }

  @Post('my-conversations/start')
  startConversationAsBuyer(@Request() req, @Body() body: { sellerId: number }) {
    return this.conversationService.getOrCreateConversationAsBuyer(
      req.user,
      body.sellerId,
    );
  }

  @Get('my-conversations/:id/messages')
  getMyConversationMessages(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.conversationService.getMessagesAsBuyer(req.user.id, id);
  }

  @Post('my-conversations/:id/messages')
  sendMyConversationMessage(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { content?: string; imageUrl?: string },
  ) {
    return this.conversationService.sendMessageAsBuyer(
      req.user.id,
      id,
      dto,
      req.user,
    );
  }
}
