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
import { BusinessCustomerService } from './business-customer.service';
import { ConversationService } from './conversation.service';
import { SellerScopeService, SellerPermission } from './seller-scope.service';
import { BusinessService } from './business.service';
import { BusinessBackfillService } from './business-backfill.service';
import { User, UserRole } from '../users/entities/user.entity';

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
    private sellerScope: SellerScopeService,
    private businessService: BusinessService,
    private businessBackfill: BusinessBackfillService,
  ) {}

  // ── Multi-role architecture: Business as its own entity ─────────────────
  // Separate from Seller entirely -- a Business created here has no
  // SellerProfile unless/until it explicitly activates Seller below.

  @Get('mine')
  getMine(@Request() req) {
    return this.businessService.findMine(req.user.id);
  }

  @Post('create')
  create(@Request() req, @Body() dto: any) {
    return this.businessService.create(req.user, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Request() req, @Body() dto: any) {
    return this.businessService.update(id, req.user, dto);
  }

  @Post(':id/activate-seller')
  activateSeller(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.businessService.activateSeller(id, req.user);
  }

  @Get(':id/dashboard')
  getDashboard(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.businessService.getDashboard(id, req.user);
  }

  @Get(':id/today')
  getTodayIntelligence(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.businessService.getTodayIntelligence(id, req.user);
  }

  @Post('admin/backfill')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  runBackfill() {
    return this.businessBackfill.run();
  }

  // Customers/inbox are "communicate with buyers about my own listings" —
  // the same category as classifieds, not a formal business capability.
  // Mirrors classifieds.controller.ts's resolveClassifiedActorId(): try the
  // normal business-delegation path first (so a seller or an active team
  // member with the right permission keeps working exactly as before), and
  // a plain, unverified user who owns no business simply falls back to
  // managing their own customers/conversations under their own account id
  // instead of being blocked entirely. Team-management actions (assigning
  // a conversation to a teammate) deliberately do NOT use this — that's a
  // genuinely multi-person business feature.
  private async resolveSellerActorId(
    user: User,
    permission?: SellerPermission,
  ): Promise<number> {
    try {
      return await this.sellerScope.resolve(user, permission);
    } catch {
      return user.id;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CUSTOMERS (CRM) — was JwtAuthGuard + a hard SELLER/ADMIN/MANAGER role
  // check, which correctly blocked plain buyers but also blocked legitimate
  // team members (role stays 'user' even once invited onto a seller's
  // team). Replaced with sellerScope.resolve(), which covers both: the
  // caller's own business if they're a seller themselves, or an employer's
  // if they're an active team member with canViewCustomers.
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('customers')
  async getCustomers(
    @Request() req,
    @Query('search') search?: string,
    @Query('segment') segment?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const sellerId = await this.resolveSellerActorId(
      req.user,
      'canViewCustomers',
    );
    return this.customerService.getMyCustomers(sellerId, {
      search,
      segment,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Get('customers/stats')
  async getCustomerStats(@Request() req) {
    const sellerId = await this.resolveSellerActorId(
      req.user,
      'canViewCustomers',
    );
    return this.customerService.getDashboardStats(sellerId);
  }

  @Get('customers/:id')
  async getCustomer(@Request() req, @Param('id', ParseIntPipe) id: number) {
    const sellerId = await this.resolveSellerActorId(
      req.user,
      'canViewCustomers',
    );
    return this.customerService.getCustomerDetail(sellerId, id);
  }

  @Post('customers/migrate')
  async migrateExistingOrders(@Request() req) {
    const sellerId = await this.resolveSellerActorId(
      req.user,
      'canViewCustomers',
    );
    return this.customerService.migrateFromExistingOrders(sellerId);
  }

  @Post('customers')
  async addCustomer(
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
    const sellerId = await this.resolveSellerActorId(
      req.user,
      'canViewCustomers',
    );
    return this.customerService.addCustomer(sellerId, dto);
  }

  @Patch('customers/:id')
  async updateCustomer(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: any,
  ) {
    const sellerId = await this.resolveSellerActorId(
      req.user,
      'canViewCustomers',
    );
    return this.customerService.updateCustomer(sellerId, id, dto);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INBOX (Conversations)
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('inbox')
  async getInbox(
    @Request() req,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
  ) {
    const sellerId = await this.resolveSellerActorId(
      req.user,
      'canSendMessages',
    );
    return this.conversationService.getSellerInbox(sellerId, {
      status,
      search,
      page: page ? Number(page) : 1,
    });
  }

  @Post('inbox/start')
  async startConversation(
    @Request() req,
    @Body() body: { customerId: number },
  ) {
    const sellerId = await this.resolveSellerActorId(
      req.user,
      'canSendMessages',
    );
    return this.conversationService.getOrCreateConversation(
      sellerId,
      body.customerId,
    );
  }

  @Get('inbox/:id/messages')
  async getMessages(@Request() req, @Param('id', ParseIntPipe) id: number) {
    const sellerId = await this.resolveSellerActorId(
      req.user,
      'canSendMessages',
    );
    return this.conversationService.getMessages(sellerId, id);
  }

  @Post('inbox/:id/messages')
  async sendMessage(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    dto: {
      content?: string;
      imageUrl?: string;
      isNote?: boolean;
    },
  ) {
    const sellerId = await this.resolveSellerActorId(
      req.user,
      'canSendMessages',
    );
    // Scope is the business being messaged from; `req.user` stays the real
    // sender so the message attributes to the actual staff member, not the
    // business owner.
    return this.conversationService.sendMessage(sellerId, id, dto, req.user);
  }

  @Post('inbox/:id/share-product')
  async shareProduct(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    product: { id: number; name: string; price: number; image?: string },
  ) {
    const sellerId = await this.resolveSellerActorId(
      req.user,
      'canSendMessages',
    );
    return this.conversationService.shareProduct(
      sellerId,
      id,
      product,
      req.user,
    );
  }

  @Patch('inbox/:id/status')
  async updateConversationStatus(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: string },
  ) {
    const sellerId = await this.resolveSellerActorId(
      req.user,
      'canSendMessages',
    );
    return this.conversationService.updateStatus(sellerId, id, body.status);
  }

  @Patch('inbox/:id/assign')
  async assignConversation(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { assignedToId: number },
  ) {
    const sellerId = await this.sellerScope.resolve(
      req.user,
      'canManageTeam',
    );
    return this.conversationService.assignTo(
      sellerId,
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
  startConversationAsBuyer(
    @Request() req,
    @Body() body: { sellerId: number; commerceProfileId?: number },
  ) {
    return this.conversationService.getOrCreateConversationAsBuyer(
      req.user,
      body.sellerId,
      body.commerceProfileId,
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
