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
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { AiListingService } from './ai-listing.service';
import { GenerateListingDto } from './dto/generate-listing.dto';
import { AiListingDescriptionService } from '../ai/ai-listing-description.service';
import { GenerateDescriptionDto } from '../ai/dto/generate-description.dto';
import { AiCategorySuggestionService } from '../ai/ai-category-suggestion.service';
import { SuggestCategoryDto } from '../ai/dto/suggest-category.dto';
import { AiSearchParserService } from '../ai/ai-search-parser.service';
import { resolveCategoryKey } from '../categories/categories.data';
import { SellerScopeService } from '../business/seller-scope.service';
import { VerificationService } from '../identity/verification.service';
import { Feature } from '../identity/verification.constants';

@Controller('products')
export class ProductsController {
  constructor(
    private service: ProductsService,
    private aiListing: AiListingService,
    private aiDescription: AiListingDescriptionService,
    private aiCategorySuggestion: AiCategorySuggestionService,
    private aiSearchParser: AiSearchParserService,
    private sellerScope: SellerScopeService,
    private verification: VerificationService,
  ) {}

  // ── Public ─────────────────────────────────────────────────────────────

  @Get('search')
  async search(
    @Query('q') q: string,
    @Query('ai') ai?: string,
    @Query('category') category?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('location') location?: string,
  ) {
    if (!q) return [];
    // NEW — Kentexa AI: opt-in query understanding, backward-compatible.
    if (ai === 'true') {
      try {
        const parsed = await this.aiSearchParser.parse(q);
        // The AI's category guess is free text ("phones") that won't
        // strict-equal-match a canonical key ("electronics") — resolving it
        // here means a near-miss still narrows the search instead of
        // silently zeroing out results, and an unresolvable guess is
        // dropped rather than applied as a wrong, over-strict filter.
        const aiCategory = resolveCategoryKey(parsed.category);
        return this.service.search(parsed.keywords || q, {
          ...parsed,
          category: aiCategory || undefined,
        });
      } catch {
        // AI parsing failed — fall through to the plain keyword search.
      }
    }
    // Plain path — these are the exact category/minPrice/maxPrice/location
    // values the frontend already resolved once via GET /search/intent and
    // sends as ordinary query params; this was previously silently
    // ignoring all of them (only `q` was read), so a correctly AI-parsed
    // price/category never actually narrowed the results.
    return this.service.search(q, {
      category: category || undefined,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      location: location || undefined,
    });
  }

  @Get()
  findAll(@Query('category') category?: string) {
    return this.service.findAll(category);
  }

  // ── Authenticated — MUST be before :id ─────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('my/products')
  async getMyProducts(
    @Request() req,
    @Query('commerceProfileId') commerceProfileId?: string,
  ) {
    const sellerId = await this.sellerScope.resolve(
      req.user,
      'canManageProducts',
    );
    return this.service.findMyProducts(
      { id: sellerId } as User,
      commerceProfileId ? Number(commerceProfileId) : undefined,
    );
  }

  // Fast lookup for the POS/product-management screens — scoped to the
  // caller's own seller, since sku/barcode are seller-defined and not
  // unique across sellers (two BIS-like businesses may reuse the same
  // manufacturer barcode for the same physical item).
  @UseGuards(JwtAuthGuard)
  @Get('my/lookup')
  async lookupMyProduct(
    @Request() req,
    @Query('barcode') barcode?: string,
    @Query('sku') sku?: string,
  ) {
    const sellerId = await this.sellerScope.resolve(
      req.user,
      'canManageProducts',
    );
    return this.service.findBySkuOrBarcode(sellerId, { sku, barcode });
  }

  // ── Kentexa AI: suggestion-only listing generation ───────────────────────
  // Never creates a product — the seller reviews/edits, then calls POST /products.
  @UseGuards(JwtAuthGuard)
  @Post('ai/generate-listing')
  generateListing(@Body() dto: GenerateListingDto, @Request() req) {
    return this.aiListing.generateListing(dto, req.user.id);
  }

  // Narrower than the above — the seller has already chosen a title and
  // uploaded photo(s); this reads the actual photo(s) and writes just the
  // description, grounded in what's visible. Suggestion-only, same as
  // above: never creates/updates a product.
  @UseGuards(JwtAuthGuard)
  @Post('ai/generate-description')
  generateDescription(@Body() dto: GenerateDescriptionDto) {
    return this.aiDescription.generate(dto);
  }

  // Auto-suggests a category/subcategory from just the title, fired as the
  // seller types (see SellerProducts.js) rather than making them scan all
  // 36 top-level categories manually. Suggestion-only — never sets the
  // form field itself, the seller's own dropdown is always the actual
  // source of truth and stays fully editable.
  @UseGuards(JwtAuthGuard)
  @Post('ai/suggest-category')
  suggestCategory(@Body() dto: SuggestCategoryDto) {
    return this.aiCategorySuggestion.suggest(dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin/all')
  findAllAdmin() {
    return this.service.findAllAdmin();
  }

  // Curatorial merchandising badges — admin-only, separate from the normal
  // seller-facing update() below (isFeatured/isRecommended aren't in
  // CreateProductDto/UpdateProductDto on purpose).
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Patch(':id/badges')
  setBadges(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { isFeatured?: boolean; isRecommended?: boolean },
  ) {
    return this.service.setBadges(id, dto);
  }

  @Get('seller/:sellerId')
  findBySeller(@Param('sellerId', ParseIntPipe) sellerId: number) {
    return this.service.findBySeller(sellerId);
  }

  // Scoped to one commerce profile — use this instead of seller/:sellerId
  // when rendering a specific profile's own products tab (a personal and
  // a business profile on the same account must not show each other's
  // products). Mirrors ClassifiedsController's equivalent route.
  @Get('profile/:commerceProfileId')
  findByCommerceProfile(
    @Param('commerceProfileId', ParseIntPipe) commerceProfileId: number,
  ) {
    return this.service.findByCommerceProfile(commerceProfileId);
  }

  // ── Social proof: track daily views — public, fire-and-forget ─────────
  @Post(':id/view')
  trackView(@Param('id', ParseIntPipe) id: number) {
    return this.service.trackView(id);
  }

  // ── Reviews (public GET, auth POST) ────────────────────────────────────

  @Get(':id/reviews')
  getReviews(@Param('id', ParseIntPipe) id: number) {
    return this.service.getReviews(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/reviews')
  addReview(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateReviewDto,
    @Request() req,
  ) {
    return this.service.addReview(id, dto, req.user);
  }

  // Layer 1 seller verification — digital products. Purchase-gated: the
  // service verifies a real completed Order before ever generating a URL.
  @UseGuards(JwtAuthGuard)
  @Get(':id/download')
  getDownloadUrl(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.service.getDownloadUrl(id, req.user);
  }

  // ── :id routes LAST ─────────────────────────────────────────────────────

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  // Layer 1/2 seller verification gate — CREATE_PRODUCT was declared at
  // Level 2 in verification.constants.ts (identity verified + seller
  // application approved) since that table was first built, but never
  // actually checked here. sellerScope.resolve() only answers "is this
  // caller authorized to act for THIS business" (owner or a permissioned
  // team member) — it says nothing about whether that business has cleared
  // identity verification, so a brand-new unverified account could create
  // products the moment it somehow acquired role='seller'/'admin'/'manager'
  // or team membership. The check runs against `sellerId` (the resolved
  // business owner), not the caller, so a staff member submitting on an
  // employer's behalf is gated on the EMPLOYER's verification, not their own.
  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() dto: CreateProductDto, @Request() req) {
    const sellerId = await this.sellerScope.resolve(
      req.user,
      'canManageProducts',
    );
    await this.verification.requireFeature(sellerId, Feature.CREATE_PRODUCT);
    return this.service.create(dto, { id: sellerId } as User);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @Request() req,
  ) {
    // service.update() short-circuits its ownership check for role===ADMIN —
    // carry the real role through the shim so that bypass still works,
    // since sellerScope.resolve() gives an admin back their own id, not a
    // license to edit anyone's product.
    const sellerId = await this.sellerScope.resolve(
      req.user,
      'canManageProducts',
    );
    return this.service.update(id, dto, {
      id: sellerId,
      role: req.user.role,
    } as User);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const sellerId = await this.sellerScope.resolve(
      req.user,
      'canManageProducts',
    );
    return this.service.remove(id, {
      id: sellerId,
      role: req.user.role,
    } as User);
  }
}
