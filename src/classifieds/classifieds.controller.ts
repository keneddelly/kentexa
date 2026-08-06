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
import { UserRole } from '../users/entities/user.entity';

@Controller('classifieds')
export class ClassifiedsController {
  constructor(
    private readonly service: ClassifiedsService,
    private readonly priceSvc: PriceSuggestionService,
  ) {}

  // ─── Static GET routes — MUST be before :id ──────────────────────────────

  @Get('search')
  search(
    @Query('q') q?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('location') location?: string,
    @Query('sort') sort?: string,
    @Query('flashSale') flashSale?: string,
    @Query('category') category?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.search(q || '', {
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      location,
      sort,
      flashSale: flashSale === 'true',
      category,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('seller/:sellerId')
  findBySeller(@Param('sellerId', ParseIntPipe) sellerId: number) {
    return this.service.findBySeller(sellerId);
  }

  @Get('invoice/:invoiceNumber')
  getInvoiceByNumber(@Param('invoiceNumber') invoiceNumber: string) {
    return this.service.getInvoiceByNumber(invoiceNumber);
  }

  @UseGuards(JwtAuthGuard)
  @Get('invoices/my-requests')
  getMyInvoiceRequests(@Request() req) {
    return this.service.getMyInvoiceRequests(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('invoices/:requestId/shipping')
  setShipping(
    @Param('requestId', ParseIntPipe) requestId: number,
    @Body() body: { shippingMethod: string; notes?: string },
    @Request() req,
  ) {
    return this.service.setShippingMethod(requestId, req.user, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('invoices/seller-requests')
  getSellerInvoiceRequests(@Request() req) {
    return this.service.getSellerInvoiceRequests(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Get('user/mine')
  findMine(@Request() req) {
    return this.service.findMine(req.user);
  }

  // ─── Admin endpoints ──────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('admin')
  findAllAdmin(@Query('status') status?: string) {
    return this.service.findAllAdmin(status);
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
  createManualInvoice(
    @Request() req,
    @Body()
    body: {
      buyerName: string;
      buyerPhone: string;
      buyerId?: number;
      deliveryAddress?: string;
      productName: string;
      classifiedId?: number;
      amount: number;
      notes?: string;
      dueDays?: number;
    },
  ) {
    return this.service.createManualInvoice(req.user, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('invoices/:requestId/create')
  createInvoiceForRequest(
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
    return this.service.createInvoiceForRequest(requestId, req.user, body);
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
  create(@Body() dto: CreateClassifiedDto, @Request() req) {
    return this.service.create(dto, req.user);
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
    },
  ) {
    return this.service.requestInvoice(id, req.user, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: updateClassifiedDto,
    @Request() req,
  ) {
    return this.service.update(id, dto, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/sold')
  markAsSold(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.service.markAsSold(id, req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.service.remove(id, req.user);
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
