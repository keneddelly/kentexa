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
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BusinessCustomerService } from './business-customer.service';
import { ConversationService, WorkspaceHint } from './conversation.service';
import { SellerScopeService, SellerPermission } from './seller-scope.service';
import { BusinessService } from './business.service';
import { BusinessBackfillService } from './business-backfill.service';
import { BusinessCapabilityApplicationService } from './business-capability-application.service';
import { User, UserRole } from '../users/entities/user.entity';
import { RoleContextGuard } from '../role-context/role-context.guard';
import { ActiveRoleGuard } from '../role-context/active-role.guard';
import { RequireActiveRole } from '../role-context/require-active-role.decorator';
import { AccountRoleType } from '../role-context/entities/account-role.entity';
import { CommunicationFeatureFlagsService } from '../communication/communication-feature-flags.service';
import { CurrentRoleContext } from '../role-context/current-role-context.decorator';
import type { RoleContext } from '../role-context/role-context.types';

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
    private flags: CommunicationFeatureFlagsService,
    private capabilityApplications: BusinessCapabilityApplicationService,
  ) {}

  // ── Multi-role architecture: Business as its own entity ─────────────────
  // Separate from Seller entirely -- a Business created here has no
  // SellerProfile unless/until it explicitly activates Seller below.

  @Get('mine')
  getMine(@Request() req) {
    return this.businessService.findMine(req.user.id);
  }

  // Multi-Business Authority Stage 1: additive list endpoint -- GET
  // business/mine deliberately keeps its existing single-object shape for
  // every already-shipped client; this is the new surface a future "My
  // Businesses" frontend stage reads from instead.
  @Get('mine/all')
  getMineAll(@Request() req) {
    return this.businessService.findAllMine(req.user.id);
  }

  @Post('create')
  create(@Request() req, @Body() dto: any) {
    return this.businessService.create(req.user, dto);
  }

  // Multi-Business Authority Stage 1: read-only. My Businesses -> Workspaces
  // -> active BusinessCapabilities -> my own corresponding AccountRole
  // (where one exists) -- the smallest API the next frontend stage needs.
  // businessId is ownership-checked server-side (listWorkspaces); no
  // workspaceId/accountRoleId is ever accepted from the client.
  @Get(':id/workspaces')
  getWorkspaces(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.businessService.listWorkspaces(id, req.user);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Request() req, @Body() dto: any) {
    return this.businessService.update(id, req.user, dto);
  }

  @Post(':id/activate-seller')
  activateSeller(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.businessService.activateSeller(id, req.user);
  }

  // Business Capability Activation Stage B2. Ownership/membership/workspace
  // authority is entirely server-resolved inside
  // BusinessCapabilityApplicationService (BusinessMembership -> OWNER ->
  // WorkspaceAssignment) -- JwtAuthGuard (class-level) only establishes WHO
  // is calling, never THAT they may act on this Business. The body accepts
  // only applicationData; no client-supplied businessId/workspaceId/
  // workspaceAssignmentId/accountRoleId/userId/profileId is ever read.
  @Post(':businessId/capabilities/:code/apply')
  applyForCapability(
    @Param('businessId', ParseIntPipe) businessId: number,
    @Param('code') code: string,
    @Request() req,
    @Body() dto: { applicationData?: Record<string, unknown> },
  ) {
    return this.capabilityApplications.applyForCapability(businessId, code, req.user, dto);
  }

  @Get(':id/dashboard')
  getDashboard(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.businessService.getDashboard(id, req.user);
  }

  @Get(':id/today')
  getTodayIntelligence(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.businessService.getTodayIntelligence(id, req.user);
  }

  // Layer 4 — separate, non-blocking call the frontend makes after
  // GET :id/today already rendered. `today` is that same response, passed
  // back rather than refetched. getTodayInsight() itself fails open around
  // the AI call only (never a 500 from an AI outage) while still letting a
  // real ownership failure 404 normally — no outer catch here that would
  // otherwise mask a legitimate "not your business" as a fake 200.
  @Post(':id/today/insight')
  getTodayInsight(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body() body: { today: Record<string, any>; language?: string },
  ) {
    return this.businessService.getTodayInsight(
      id,
      req.user,
      body?.today || {},
      body?.language || 'en',
    );
  }

  @Post('admin/backfill')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  runBackfill() {
    return this.businessBackfill.run();
  }

  // Stage 2 communication isolation fix: this previously caught ANY
  // failure from sellerScope.resolve() -- including the Stage 1 active-
  // role-context denial for an account that is a real approved seller but
  // is NOT currently active as seller/admin/manager -- and silently fell
  // back to `user.id` regardless. Because every Conversation/BusinessCustomer
  // row is keyed on sellerId === the seller's own User.id (never a separate
  // namespace), that fallback reproduced the exact same result
  // sellerScope.resolve()'s "owns own business" branch would have, just
  // without requiring active seller context at all -- i.e. it silently
  // undid Stage 1's fix for every endpoint below: SellerInbox stayed fully
  // reachable while the account was active as buyer/agent/transport/
  // whatever else, exactly the "operational roles can observe communication
  // belonging to another active context" problem this pass exists to close.
  //
  // Now fails closed: sellerScope.resolve()'s ForbiddenException (no active
  // seller/admin/manager context AND no team membership) propagates as a
  // real 403, same as every other Stage 1/2 operational gate. None of the
  // 16 call sites below are a "pending status" self-check (that's
  // seller.controller.ts's own my-profile/dashboard, which deliberately
  // keep their own softer fallback) -- these are all genuinely operational
  // seller actions (CRM, inbox read/write/pin/mute).
  private async resolveSellerActorId(
    user: User,
    permission?: SellerPermission,
  ): Promise<number> {
    return this.sellerScope.resolve(user, permission);
  }

  // Multi-Business Authority Stage 1. sellerId alone (User.id) no longer
  // disambiguates WHICH of the caller's possibly-several Seller
  // AccountRoles a Communication read/write concerns, once a user can hold
  // one Seller AccountRole per Business. resolveScope() already resolves
  // the caller's own authoritative RoleContext (server-side, from their
  // session) -- reused here purely for its profileType/profileId, which
  // mirror the SAME vocabulary Conversation.ownerWorkspaceType/
  // ownerWorkspaceId already stores. Returns null (never guesses) whenever
  // the caller isn't currently, genuinely operating as Seller themselves
  // (e.g. a delegated team member acting under their own active role) --
  // exactly the cases where no safe disambiguator exists yet.
  private async resolveSellerWorkspaceHint(user: User): Promise<WorkspaceHint> {
    try {
      const scope = await this.sellerScope.resolveScope(user.id, user);
      if (scope.profileType === 'seller_profile' && scope.profileId != null) {
        return { workspaceType: scope.profileType, workspaceId: scope.profileId };
      }
      return null;
    } catch {
      return null;
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

  // Single source of truth for every unread-inbox badge in the app (bottom
  // nav, header icon) — combines seller-side and buyer-side unread
  // conversation counts. Deliberately NOT the generic
  // /notifications/unread-count (a different, never-reconciled number —
  // see ConversationService.getUnreadConversationCount's own comment).
  // Stage 2B: when SCOPED_CONVERSATION_READ is off (default during rollout),
  // this stays exactly the legacy combined seller+buyer count. When on, the
  // seller half comes from ConversationParticipantState via
  // ConversationService.getScopedSellerInbox's own unread field --
  // getUnreadConversationCount's buyer half is untouched here since this
  // route is seller-scoped (buyer unread is read via the buyer's own
  // my-conversations call, not merged in here).
  @Get('inbox/unread-count')
  async getInboxUnreadCount(@Request() req) {
    const sellerId = await this.resolveSellerActorId(
      req.user,
      'canSendMessages',
    );
    if (this.flags.isEnabled('SCOPED_UNREAD_READ')) {
      const hint = await this.resolveSellerWorkspaceHint(req.user);
      const unread = await this.conversationService.getScopedUnreadCountForSeller(sellerId, hint);
      return { unread };
    }
    const unread = await this.conversationService.getUnreadConversationCount(
      sellerId,
      req.user.id,
    );
    return { unread };
  }

  @Get('inbox')
  async getInbox(
    @Request() req,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    // "mine" always resolves to the CALLER's own id, never an arbitrary
    // user — a team member filtering to their own assigned conversations
    // must never be able to ask for someone else's by passing their id.
    @Query('mine') mine?: string,
  ) {
    const sellerId = await this.resolveSellerActorId(
      req.user,
      'canSendMessages',
    );
    const scopedParams = {
      status,
      search,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : undefined,
      assignedToId: mine === 'true' ? req.user.id : undefined,
    };
    // Authorization for WHICH business (sellerId) already happened above via
    // resolveSellerActorId, fail-closed since Stage 2A. This flag only
    // decides HOW that business's conversations are found: the new
    // participant-graph query (server-side entitlement, item 1) vs the
    // legacy raw seller_id scan.
    if (this.flags.isEnabled('SCOPED_CONVERSATION_READ')) {
      const hint = await this.resolveSellerWorkspaceHint(req.user);
      return this.conversationService.getScopedSellerInbox(sellerId, scopedParams, hint);
    }
    return this.conversationService.getSellerInbox(sellerId, scopedParams);
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
    const hint = await this.resolveSellerWorkspaceHint(req.user);
    return this.conversationService.getOrCreateConversation(
      sellerId,
      body.customerId,
      undefined,
      undefined,
      hint,
    );
  }

  @Get('inbox/:id/messages')
  async getMessages(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Query('before') before?: string,
  ) {
    const sellerId = await this.resolveSellerActorId(
      req.user,
      'canSendMessages',
    );
    const hint = await this.resolveSellerWorkspaceHint(req.user);
    return this.conversationService.getMessages(
      sellerId,
      id,
      before ? Number(before) : undefined,
      hint,
    );
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
    const hint = await this.resolveSellerWorkspaceHint(req.user);
    // Scope is the business being messaged from; `req.user` stays the real
    // sender so the message attributes to the actual staff member, not the
    // business owner.
    return this.conversationService.sendMessage(sellerId, id, dto, req.user, hint);
  }

  @Post('inbox/:id/share-product')
  async shareProduct(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body()
    product: {
      id: number;
      name: string;
      price: number;
      image?: string;
      itemType?: 'product' | 'classified';
    },
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

  @Patch('inbox/:id/pin')
  async togglePin(@Request() req, @Param('id', ParseIntPipe) id: number) {
    const sellerId = await this.resolveSellerActorId(req.user, 'canSendMessages');
    return this.conversationService.togglePin(sellerId, id);
  }

  @Patch('inbox/:id/mute')
  async toggleMute(@Request() req, @Param('id', ParseIntPipe) id: number) {
    const sellerId = await this.resolveSellerActorId(req.user, 'canSendMessages');
    return this.conversationService.toggleMute(sellerId, id);
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
  // Stage 2 item 12: buyer private conversations belong to Buyer/transaction
  // context. Previously reachable via nothing but req.user.id with zero
  // active-role gate at all -- a user currently operating as Seller/Agent/
  // Transport/SuperAgent could still freely read/send on their own buyer
  // conversations without switching back to Buyer mode. Every handler below
  // now requires @RequireActiveRole(BUYER); no ADMIN override -- there's no
  // legitimate admin need to act as a private buyer.
  // ═══════════════════════════════════════════════════════════════════════════

  @UseGuards(RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.BUYER)
  @Get('my-conversations')
  getMyConversations(
    @Request() req,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentRoleContext() roleContext?: RoleContext,
  ) {
    const params = {
      search,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : undefined,
    };
    if (this.flags.isEnabled('SCOPED_CONVERSATION_READ') && roleContext) {
      return this.conversationService.getScopedBuyerConversations(req.user.id, roleContext, params);
    }
    return this.conversationService.getMyConversations(req.user.id, params);
  }

  // Communication canonicality fix, Phase B: the smallest safe Super Agent/
  // Transport Provider/Agent communication surface, reusing the existing
  // scoped participant-graph architecture (getScopedConversationsForActiveRole)
  // rather than a parallel inbox system. Authority is entirely
  // roleContext-driven (RoleContextGuard + ActiveRoleGuard) -- never a
  // client-supplied sellerId/accountRoleId. There is deliberately no legacy
  // fallback path here (unlike Seller/Buyer): these roles have no pre-
  // Stage-2 history to fall back to.
  @UseGuards(RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.SUPER_AGENT, AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.AGENT)
  @Get('operational-inbox')
  getOperationalInbox(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @CurrentRoleContext() roleContext?: RoleContext,
  ) {
    const params = {
      status,
      search,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : undefined,
    };
    return this.conversationService.getScopedConversationsForActiveRole(roleContext as RoleContext, params);
  }

  @UseGuards(RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.SUPER_AGENT, AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.AGENT)
  @Get('operational-inbox/:id/messages')
  getOperationalInboxMessages(
    @Param('id', ParseIntPipe) id: number,
    @Query('before') before?: string,
    @CurrentRoleContext() roleContext?: RoleContext,
  ) {
    return this.conversationService.getMessagesAsOperationalRole(
      roleContext as RoleContext,
      id,
      before ? Number(before) : undefined,
    );
  }

  @UseGuards(RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.SUPER_AGENT, AccountRoleType.TRANSPORT_PROVIDER, AccountRoleType.AGENT)
  @Post('operational-inbox/:id/messages')
  sendOperationalInboxMessage(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { content?: string; imageUrl?: string; isNote?: boolean },
    @CurrentRoleContext() roleContext?: RoleContext,
  ) {
    return this.conversationService.sendMessageAsOperationalRole(
      roleContext as RoleContext,
      id,
      { content: dto.content, imageUrl: dto.imageUrl, isNote: dto.isNote },
      req.user,
    );
  }

  // Communication canonicality fix: `targetType`/`targetId` let the caller
  // reference a SPECIFIC operational identity (Super Agent / Transport
  // Provider / Agent) instead of always landing on the target person's
  // Seller conversation. `targetId` is a CommerceProfile.id -- the same id
  // the frontend already has as activeProfile.id from GET /profiles/:id,
  // no new id needs to be plumbed to the client. It is never trusted as
  // authority itself: getOrCreateOperationalConversationAsBuyer looks up
  // that CommerceProfile server-side, cross-checks its own `type` against
  // the claimed targetType, reads the linked superAgentId/
  // transportProviderId/agentId from that trusted row, and only then
  // resolves an AccountRole via its (profileType, profileId) unique
  // constraint -- any mismatch or missing active AccountRole fails closed
  // (404), never silently falls back to a different conversation.
  // `sellerId` (legacy, still accepted with no targetType, or with
  // targetType:'seller') is untouched -- existing "Message Seller" links
  // keep working exactly as before.
  @UseGuards(RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.BUYER)
  @Post('my-conversations/start')
  startConversationAsBuyer(
    @Request() req,
    @Body() body: {
      sellerId?: number;
      targetType?: 'seller' | 'super_agent' | 'transport_provider' | 'agent';
      targetId?: number;
      commerceProfileId?: number;
      contextType?: 'product' | 'classified' | 'service';
      contextId?: number;
    },
  ) {
    const context =
      body.contextType && body.contextId
        ? { type: body.contextType, id: body.contextId }
        : null;

    if (body.targetType && body.targetType !== 'seller') {
      if (!body.targetId) {
        throw new BadRequestException('targetId is required when targetType is not "seller"');
      }
      return this.conversationService.getOrCreateOperationalConversationAsBuyer(
        req.user,
        body.targetType,
        body.targetId,
        context,
      );
    }

    const sellerId = body.targetType === 'seller' ? body.targetId : body.sellerId;
    if (!sellerId) {
      throw new BadRequestException('sellerId (or targetType:"seller" + targetId) is required');
    }
    return this.conversationService.getOrCreateConversationAsBuyer(
      req.user,
      sellerId,
      body.commerceProfileId,
      context,
    );
  }

  @UseGuards(RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.BUYER)
  @Get('my-conversations/:id/messages')
  getMyConversationMessages(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Query('before') before?: string,
  ) {
    return this.conversationService.getMessagesAsBuyer(
      req.user.id,
      id,
      before ? Number(before) : undefined,
    );
  }

  @UseGuards(RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.BUYER)
  @Post('my-conversations/:id/messages')
  sendMyConversationMessage(
    @Request() req,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { content?: string; imageUrl?: string },
  ) {
    // sendMessageAsBuyer's service signature also accepts type/metadata now
    // (used internally by getOrCreateConversationAsBuyer to post a
    // server-computed product/listing card) — explicitly whitelisted here
    // to content/imageUrl only, since this inline @Body() type has no
    // class-validator whitelist stripping unlisted JSON fields, and a
    // buyer must never be able to forge an arbitrary product card
    // (fake name/price/image) in their own outgoing message.
    return this.conversationService.sendMessageAsBuyer(
      req.user.id,
      id,
      { content: dto.content, imageUrl: dto.imageUrl },
      req.user,
    );
  }

  @UseGuards(RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.BUYER)
  @Patch('my-conversations/:id/pin')
  togglePinAsBuyer(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.conversationService.togglePinAsBuyer(req.user.id, id);
  }

  @UseGuards(RoleContextGuard, ActiveRoleGuard)
  @RequireActiveRole(AccountRoleType.BUYER)
  @Patch('my-conversations/:id/mute')
  toggleMuteAsBuyer(@Request() req, @Param('id', ParseIntPipe) id: number) {
    return this.conversationService.toggleMuteAsBuyer(req.user.id, id);
  }
}
