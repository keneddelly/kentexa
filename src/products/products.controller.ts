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
import { AiSearchParserService } from '../ai/ai-search-parser.service';
import { resolveCategoryKey } from '../categories/categories.data';
import { SellerScopeService } from '../business/seller-scope.service';

@Controller('products')
export class ProductsController {
  constructor(
    private service: ProductsService,
    private aiListing: AiListingService,
    private aiSearchParser: AiSearchParserService,
    private sellerScope: SellerScopeService,
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
  async getMyProducts(@Request() req) {
    const sellerId = await this.sellerScope.resolve(
      req.user,
      'canManageProducts',
    );
    return this.service.findMyProducts({ id: sellerId } as User);
  }

  // ── Kentexa AI: suggestion-only listing generation ───────────────────────
  // Never creates a product — the seller reviews/edits, then calls POST /products.
  @UseGuards(JwtAuthGuard)
  @Post('ai/generate-listing')
  generateListing(@Body() dto: GenerateListingDto, @Request() req) {
    return this.aiListing.generateListing(dto, req.user.id);
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

  // ── :id routes LAST ─────────────────────────────────────────────────────

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() dto: CreateProductDto, @Request() req) {
    const sellerId = await this.sellerScope.resolve(
      req.user,
      'canManageProducts',
    );
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
