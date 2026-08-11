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
import { UserRole } from '../users/entities/user.entity';
import { AiListingService } from './ai-listing.service';
import { GenerateListingDto } from './dto/generate-listing.dto';
import { AiSearchParserService } from '../ai/ai-search-parser.service';

@Controller('products')
export class ProductsController {
  constructor(
    private service: ProductsService,
    private aiListing: AiListingService,
    private aiSearchParser: AiSearchParserService,
  ) {}

  // ── Public ─────────────────────────────────────────────────────────────

  @Get('search')
  async search(@Query('q') q: string, @Query('ai') ai?: string) {
    if (!q) return [];
    // NEW — Kentexa AI: opt-in query understanding, backward-compatible.
    if (ai === 'true') {
      try {
        const parsed = await this.aiSearchParser.parse(q);
        return this.service.search(parsed.keywords || q, parsed);
      } catch {
        // AI parsing failed — fall through to the plain keyword search.
      }
    }
    return this.service.search(q);
  }

  @Get()
  findAll(@Query('category') category?: string) {
    return this.service.findAll(category);
  }

  // ── Authenticated — MUST be before :id ─────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('my/products')
  getMyProducts(@Request() req) {
    return this.service.findMyProducts(req.user);
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
  create(@Body() dto: CreateProductDto, @Request() req) {
    return this.service.create(dto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @Request() req,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.service.remove(id, req.user);
  }
}
