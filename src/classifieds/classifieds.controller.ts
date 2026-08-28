import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ClassifiedsService } from './classifieds.service';
import { PriceSuggestionService } from './price-suggestion.service';
import { CreateClassifiedDto } from './dto/create-classified.dto';
import { updateClassifiedDto } from './dto/update-classified.dto';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { AiSearchParserService } from '../ai/ai-search-parser.service';
import { AiListingDescriptionService } from '../ai/ai-listing-description.service';
import { GenerateDescriptionDto } from '../ai/dto/generate-description.dto';
import { AiCategorySuggestionService } from '../ai/ai-category-suggestion.service';
import { SuggestCategoryDto } from '../ai/dto/suggest-category.dto';
import { SellerScopeService } from '../business/seller-scope.service';
import { resolveCategoryKey } from '../categories/categories.data';
import { VerificationService } from '../identity/verification.service';
import { Feature } from '../identity/verification.constants';

@Controller('classifieds')
export class ClassifiedsController {
  constructor(
    private readonly service: ClassifiedsService,
    private readonly priceSvc: PriceSuggestionService,
    private readonly aiSearchParser: AiSearchParserService,
    private readonly aiDescription: AiListingDescriptionService,
    private readonly aiCategorySuggestion: AiCategorySuggestionService,
    private readonly sellerScope: SellerScopeService,
    private readonly verification: VerificationService,
  ) {}

  // Reads the seller's already-uploaded photo(s) + typed title and writes
  // a grounded description — same shared service SellerProducts.js's form
  // uses. Suggestion-only: never creates/updates a listing.
  @UseGuards(JwtAuthGuard)
  @Post('ai/generate-description')
  generateDescription(@Body() dto: GenerateDescriptionDto) {
    return this.aiDescription.generate(dto);
  }

  // Auto-suggests a category/subcategory from just the title, fired as the
  // seller types (see SellerClassifieds.js) rather than making them scan
  // all 36 top-level categories manually. Suggestion-only — the seller's
  // own dropdown stays the actual source of truth and fully editable.
  @UseGuards(JwtAuthGuard)
  @Post('ai/suggest-category')
  suggestCategory(@Body() dto: SuggestCategoryDto) {
    return this.aiCategorySuggestion.suggest(dto);
  }

  // Classifieds are peer-to-peer listings (a "side hustle" item, not a
  // shop's product) — unlike products, posting/managing one never required
  // seller approval. Sellers/team members still resolve through the normal
  // business-delegation path (so e.g. a team member managing the business's
  // own classifieds keeps working exactly as before); a plain, unverified
  // user who isn't part of any business simply manages their own listings
  // under their own account id instead of being blocked entirely.
  private async resolveClassifiedActorId(user: User): Promise<number> {
    try {
      return await this.sellerScope.resolve(user, 'canManageProducts');
    } catch {
      return user.id;
    }
  }

  // ─── Static GET routes — MUST be before :id ──────────────────────────────

  @Get('search')
  async search(
    @Query('q') q: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('location') location?: string,
    @Query('sort') sort?: string,
    @Query('category') category?: string,
    @Query('ai') ai?: string,
  ) {
    if (!q) return [];
    // `category` was previously only ever read inside the ai=true branch
    // below — the frontend's plain search call already sends the AI-
    // resolved category as an ordinary query param (from GET
    // /search/intent, resolved once before this endpoint is even hit), so
    // it was being silently dropped on every real call.
    const opts = {
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      location,
      sort,
      category: category || undefined,
    };
    // NEW — Kentexa AI: opt-in query understanding, backward-compatible.
    if (ai === 'true') {
      try {
        const parsed = await this.aiSearchParser.parse(q);
        // Resolve the AI's free-text category guess to a canonical key —
        // an unresolved guess is dropped rather than applied as an
        // over-strict filter that silently zeroes out results.
        const aiCategory = resolveCategoryKey(parsed.category);
        return this.service.search(parsed.keywords || q, {
          ...opts,
          minPrice: opts.minPrice ?? parsed.minPrice ?? undefined,
          maxPrice: opts.maxPrice ?? parsed.maxPrice ?? undefined,
          category: aiCategory || opts.category,
        });
      } catch {
        // AI parsing failed — fall through to the plain keyword search.
      }
    }
    return this.service.search(q, opts);
  }

  @Get('seller/:sellerId')
  findBySeller(@Param('sellerId', ParseIntPipe) sellerId: number) {
    return this.service.findBySeller(sellerId);
  }

  // Scoped to one commerce profile — use this instead of seller/:sellerId
  // when rendering a specific profile's own classifieds tab (a personal
  // and a business profile on the same account must not show each other's
  // listings).
  @Get('profile/:commerceProfileId')
  findByCommerceProfile(
    @Param('commerceProfileId', ParseIntPipe) commerceProfileId: number,
  ) {
    return this.service.findByCommerceProfile(commerceProfileId);
  }

  // Requires login — returns buyer name/phone/email/amount, and invoice
  // numbers are sequential so this was scrapeable end-to-end when public.
  // Matches the same fix already applied to payments.controller.ts's
  // equivalent lookup route.
  @UseGuards(JwtAuthGuard)
  @Get('invoice/:invoiceNumber')
  getInvoiceByNumber(@Param('invoiceNumber') invoiceNumber: string) {
    return this.service.getInvoiceByNumber(invoiceNumber);
  }

  @UseGuards(JwtAuthGuard)
  @Get('invoices/my-requests')
  getMyInvoiceRequests(@Request() req) {
    return this.service.getMyInvoiceRequests(req.user);
  }

  // Creates a real Order (escrow, tracking, payout) once shipping starts —
  // an operational logistics action, gated the same as any other shipment.
  @UseGuards(JwtAuthGuard)
  @Patch('invoices/:requestId/shipping')
  async setShipping(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() body: { shippingMethod: string; notes?: string },
    @Request() req,
  ) {
    const sellerId = await this.resolveClassifiedActorId(req.user);
    await this.verification.requireFeature(sellerId, Feature.CREATE_SHIPMENT);
    return this.service.setShippingMethod(requestId, { id: sellerId } as User, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('invoices/seller-requests')
  async getSellerInvoiceRequests(@Request() req) {
    const sellerId = await this.resolveClassifiedActorId(req.user);
    return this.service.getSellerInvoiceRequests({ id: sellerId } as User);
  }

  @UseGuards(JwtAuthGuard)
  @Get('user/mine')
  async findMine(
    @Request() req,
    @Query('commerceProfileId') commerceProfileId?: string,
  ) {
    const sellerId = await this.resolveClassifiedActorId(req.user);
    return this.service.findMine(
      { id: sellerId } as User,
      commerceProfileId ? Number(commerceProfileId) : undefined,
    );
  }

  // ─── Admin endpoints ──────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin')
  findAllAdmin(@Query('status') status?: string) {
    return this.service.findAllAdmin(status);
  }

  // Manual classified invoices (seller-sent, not the online-order Invoice
  // entity) — was completely invisible to admin, no endpoint returned them
  // at all outside each party's own scoped view.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/invoices')
  findAllInvoiceRequestsAdmin(@Query('status') status?: string) {
    return this.service.findAllInvoiceRequestsAdmin(status);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/status')
  adminUpdateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { status: string },
    @Request() req,
  ) {
    // Admin can change status — pass admin user so permission check passes
    return this.service.update(id, { status: body.status } as any, req.user);
  }

  // ─── Static POST routes — MUST be before :id ─────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('invoices/manual')
  async createManualInvoice(
    @Request() req,
    @Body()
    body: {
      buyerName: string;
      buyerPhone: string;
      deliveryAddress?: string;
      productName: string;
      classifiedId?: number;
      amount: number;
      notes?: string;
      dueDays?: number;
      regionId?: number;
      regionName?: string;
      districtId?: number;
      districtName?: string;
      wardId?: number;
      wardName?: string;
    },
  ) {
    const sellerId = await this.resolveClassifiedActorId(req.user);
    await this.verification.requireFeature(sellerId, Feature.CREATE_INVOICE);
    return this.service.createManualInvoice({ id: sellerId } as User, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('invoices/:requestId/create')
  async createInvoiceForRequest(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Request() req,
    @Body()
    body: {
      amount: number;
      invoiceDescription: string;
      sellerNotes?: string;
      dueDays?: number;
    },
  ) {
    const sellerId = await this.resolveClassifiedActorId(req.user);
    await this.verification.requireFeature(sellerId, Feature.CREATE_INVOICE);
    return this.service.createInvoiceForRequest(
      requestId,
      { id: sellerId } as User,
      body,
    );
  }

  // ─── General list & CRUD ──────────────────────────────────────────────────

  @Get()
  findAll(
    @Query('category') category?: string,
    @Query('location') location?: string,
  ) {
    return this.service.findAll(category, location);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() dto: CreateClassifiedDto, @Request() req) {
    // Posting a classified is the spec's first real identity-verification
    // trigger — everything before this point (browsing, search, saving)
    // stays open at Level 0. See VerificationService for what "Level 1"
    // actually requires.
    await this.verification.requireFeature(req.user.id, Feature.POST_CLASSIFIED);
    const sellerId = await this.resolveClassifiedActorId(req.user);
    return this.service.create(dto, { id: sellerId } as User);
  }

  // ─── :id routes LAST ─────────────────────────────────────────────────────

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/contact')
  getContactInfo(@Param('id', ParseIntPipe) id: number) {
    return this.service.getContactInfo(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/request-invoice')
  requestInvoice(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
    @Body()
    body: {
      buyerName: string;
      buyerPhone: string;
      deliveryAddress: string;
      message?: string;
      regionId?: number;
      regionName?: string;
      districtId?: number;
      districtName?: string;
      wardId?: number;
      wardName?: string;
    },
  ) {
    return this.service.requestInvoice(id, req.user, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: updateClassifiedDto,
    @Request() req,
  ) {
    // service.update() short-circuits its ownership check for role===ADMIN —
    // carry the real role through the shim so that bypass still works.
    const sellerId = await this.resolveClassifiedActorId(req.user);
    return this.service.update(id, dto, {
      id: sellerId,
      role: req.user.role,
    } as User);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/sold')
  async markAsSold(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const sellerId = await this.resolveClassifiedActorId(req.user);
    return this.service.markAsSold(id, { id: sellerId } as User);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const sellerId = await this.resolveClassifiedActorId(req.user);
    return this.service.remove(id, {
      id: sellerId,
      role: req.user.role,
    } as User);
  }

  // ── Price suggestion ──────────────────────────────────────────────────────
  @Get('price-suggestion')
  getPriceSuggestion(
    @Query('category') category: string,
    @Query('title') title?: string,
    @Query('condition') condition?: string,
    @Query('subcategory') subcategory?: string,
  ) {
    return this.priceSvc.suggest({ category, title, condition, subcategory });
  }

  @Get(':id/price-check')
  checkPrice(@Param('id', ParseIntPipe) id: number) {
    return this.priceSvc.checkPrice(id);
  }
}
