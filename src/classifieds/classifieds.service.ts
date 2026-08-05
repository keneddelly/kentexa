import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Classified, ClassifiedStatus } from './entities/classified.entity';
import {
  ClassifiedInvoiceRequest,
  ClassifiedInvoiceStatus,
} from './entities/classified-invoice-request.entity';
import { Invoice, InvoiceStatus } from '../invoices/entities/invoice.entity';
import {
  Order,
  OrderStatus,
  PaymentStatus,
  EscrowStatus,
} from '../orders/entities/order.entity';
import { CreateClassifiedDto } from './dto/create-classified.dto';
import { updateClassifiedDto } from './dto/update-classified.dto';
import { User, UserRole } from '../users/entities/user.entity';
import { InvoicesService } from '../invoices/invoices.service';
import { FeedService } from '../feed/feed.service';

@Injectable()
export class ClassifiedsService {
  constructor(
    @InjectRepository(Classified)
    private repo: Repository<Classified>,

    @InjectRepository(ClassifiedInvoiceRequest)
    private invoiceRequestRepo: Repository<ClassifiedInvoiceRequest>,

    @InjectRepository(Invoice)
    private invoiceRepo: Repository<Invoice>,

    @InjectRepository(Order)
    private orderRepo: Repository<Order>,

    private invoicesService: InvoicesService,
    private dataSource: DataSource,
    private readonly feedService: FeedService,
  ) {}

  // ─── Create listing ───────────────────────────────────────────────────────
  async create(dto: CreateClassifiedDto, user: User) {
    const listing = this.repo.create({ ...dto, seller: user });
    const saved = await this.repo.save(listing);

    // Auto-share as a Moment — fire-and-forget, never blocks listing creation
    if (user?.id) {
      this.feedService
        .publish(user.id, {
          type: 'moment',
          title: saved.title,
          imageUrl: saved.images?.[0] || undefined,
          linkedEntityType: 'classified',
          linkedEntityId: saved.id,
        })
        .catch(() => {});
    }

    return saved;
  }

  // ─── Find all ─────────────────────────────────────────────────────────────

  // ── Admin: all classifieds with seller contact info ──────────────────────
  async findAllAdmin(status?: string): Promise<Classified[]> {
    const query = this.repo
      .createQueryBuilder('c')
      .leftJoin('c.seller', 'seller')
      .addSelect([
        'seller.id',
        'seller.name',
        'seller.storeName',
        'seller.logo',
        'seller.phone',
        'seller.email',
        'seller.businessLocation',
        'seller.role',
      ]);
    if (status) {
      query.where('c.status = :status', { status });
    }
    return query.orderBy('c.createdAt', 'DESC').getMany();
  }

  async findAll(category?: string, location?: string) {
    const query = this.repo
      .createQueryBuilder('c')
      .where('c.status = :status', { status: ClassifiedStatus.ACTIVE });
    if (category) query.andWhere('c.category = :category', { category });
    if (location)
      query.andWhere('c.location ILIKE :location', {
        location: `%${location}%`,
      });
    return query.orderBy('c.createdAt', 'DESC').getMany();
  }

  // ─── Find one ─────────────────────────────────────────────────────────────
  async findOne(id: number) {
    const listing = await this.repo.findOne({ where: { id } });
    if (!listing) throw new NotFoundException('Listing not found');
    return listing;
  }

  // ─── Find mine ────────────────────────────────────────────────────────────
  async findMine(user: User) {
    return this.repo.find({
      where: { seller: { id: user.id } },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Find by seller ───────────────────────────────────────────────────────
  async findBySeller(sellerId: number) {
    return this.repo.find({
      where: { seller: { id: sellerId }, status: ClassifiedStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Search ───────────────────────────────────────────────────────────────
  // FIX: cast category enum to text before applying LOWER()
  // PostgreSQL cannot apply LOWER() to enum types directly
  async search(
    query: string,
    opts?: {
      minPrice?: number;
      maxPrice?: number;
      location?: string;
      sort?: string;
      category?: string | null; // NEW — Kentexa AI search-query parsing
    },
  ) {
    const qb = this.repo
      .createQueryBuilder('c')
      .leftJoin('c.seller', 's')
      .addSelect([
        's.id',
        's.name',
        's.storeName',
        's.logo',
        's.businessLocation',
        's.reputationScore',
        's.followersCount',
        's.isVerified',
        's.isOfficialStore',
        's.storeWhatsApp',
        's.phone',
        's.role',
      ])
      .where('c.status = :status', { status: 'active' })
      .andWhere(
        `(LOWER(c.title) LIKE :query
          OR LOWER(c.description) LIKE :query
          OR LOWER(c.category::text) LIKE :query
          OR LOWER(c.location) LIKE :query)`,
        { query: `%${query.toLowerCase()}%` },
      );

    if (opts?.minPrice) qb.andWhere('c.price >= :min', { min: opts.minPrice });
    if (opts?.maxPrice) qb.andWhere('c.price <= :max', { max: opts.maxPrice });
    if (opts?.location)
      qb.andWhere('LOWER(c.location) LIKE :loc', {
        loc: `%${opts.location.toLowerCase()}%`,
      });
    if (opts?.category)
      qb.andWhere('LOWER(c.category::text) = :aiCategory', {
        aiCategory: opts.category.toLowerCase(),
      });

    // Ranking: verified sellers first, then by reputation score, then by recency
    const sort = opts?.sort;
    if (sort === 'price_asc') qb.orderBy('c.price', 'ASC');
    else if (sort === 'price_desc') qb.orderBy('c.price', 'DESC');
    else if (sort === 'rating')
      qb.orderBy('s.rating', 'DESC').addOrderBy('c.createdAt', 'DESC');
    else {
      // Default: reputation-ranked
      qb.orderBy('CASE WHEN s."isVerified" = true THEN 1 ELSE 2 END', 'ASC')
        .addOrderBy('COALESCE(CAST(s."reputationScore" AS int), 0)', 'DESC')
        .addOrderBy('c.createdAt', 'DESC');
    }

    return qb.take(50).getMany();
  }

  // ─── Update ───────────────────────────────────────────────────────────────
  async update(id: number, dto: updateClassifiedDto, user: User) {
    const listing = await this.findOne(id);
    if (listing.seller.id !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Not your listing');
    }
    Object.assign(listing, dto);
    return this.repo.save(listing);
  }

  // ─── Remove ───────────────────────────────────────────────────────────────
  async remove(id: number, user: User) {
    const listing = await this.findOne(id);
    if (listing.seller.id !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Not your listing');
    }
    await this.repo.remove(listing);
    return { message: 'Listing deleted successfully' };
  }

  // ─── Mark as sold ─────────────────────────────────────────────────────────
  async markAsSold(id: number, user: User) {
    const listing = await this.findOne(id);
    if (listing.seller.id !== user.id) {
      throw new ForbiddenException('Not your listing');
    }
    listing.status = ClassifiedStatus.SOLD;
    return this.repo.save(listing);
  }

  // ─── Get contact info ─────────────────────────────────────────────────────
  async getContactInfo(id: number) {
    const classified = await this.findOne(id);
    return {
      sellerName: classified.seller?.name || 'Seller',
      sellerEmail: classified.seller?.email || null,
      sellerPhone: classified.seller?.phone || null,
      title: classified.title,
      price: classified.price,
    };
  }

  // ─── Buyer: Request invoice from seller ───────────────────────────────────
  async requestInvoice(
    id: number,
    buyer: User,
    data: {
      buyerName: string;
      buyerPhone: string;
      deliveryAddress: string;
      message?: string;
    },
  ) {
    const classified = await this.findOne(id);

    if (classified.status !== ClassifiedStatus.ACTIVE) {
      throw new BadRequestException('This listing is no longer active');
    }
    if (classified.seller.id === buyer.id) {
      throw new BadRequestException(
        'You cannot request an invoice for your own listing',
      );
    }

    const existing = await this.invoiceRequestRepo.findOne({
      where: {
        classified: { id },
        buyer: { id: buyer.id },
        status: ClassifiedInvoiceStatus.PENDING,
      },
    });
    if (existing) {
      throw new BadRequestException(
        'You already have a pending invoice request for this listing',
      );
    }

    const request = this.invoiceRequestRepo.create({
      classified,
      buyer,
      seller: classified.seller,
      buyerMessage: `Name: ${data.buyerName} | Phone: ${data.buyerPhone} | Address: ${data.deliveryAddress}${data.message ? ' | Note: ' + data.message : ''}`,
      status: ClassifiedInvoiceStatus.PENDING,
    });
    await this.invoiceRequestRepo.save(request);

    return {
      success: true,
      requestId: request.id,
      classifiedTitle: classified.title,
      listingPrice: classified.price,
      buyerEmail: buyer.email,
      price: classified.price,
    };
  }

  // ─── Seller: Create manual invoice ────────────────────────────────────────
  async createManualInvoice(
    seller: User,
    data: {
      buyerName: string;
      buyerPhone: string;
      deliveryAddress?: string;
      productName: string;
      classifiedId?: number;
      amount: number;
      notes?: string;
      dueDays?: number;
    },
  ) {
    const invoiceNumber = await this.invoicesService.generateInvoiceNumber();
    const dueDate = new Date();
    dueDate.setHours(dueDate.getHours() + (data.dueDays || 3) * 24);

    let classified: Classified | null = null;
    if (data.classifiedId) {
      classified = await this.repo.findOne({
        where: { id: data.classifiedId, seller: { id: seller.id } },
      });
    }

    const request = this.invoiceRequestRepo.create({
      seller,
      buyerMessage: `Name: ${data.buyerName} | Phone: ${data.buyerPhone} | Address: ${data.deliveryAddress || '—'} | Note: ${data.notes || ''}`,
      amount: data.amount,
      invoiceDescription: data.productName,
      sellerNotes: data.notes || null,
      dueDate,
      invoiceNumber,
      status: ClassifiedInvoiceStatus.SENT,
    });

    request.buyer = null as any;
    request.classified = classified as any;

    await this.invoiceRequestRepo.save(request);

    return {
      invoiceNumber,
      buyerName: data.buyerName,
      buyerPhone: data.buyerPhone,
      productName: data.productName,
      amount: data.amount,
      dueDate,
      classifiedId: classified?.id || null,
    };
  }

  // ─── Buyer: Get my invoice requests ───────────────────────────────────────
  async getMyInvoiceRequests(user: User) {
    const requests = await this.invoiceRequestRepo.find({
      where: { buyer: { id: user.id } },
      order: { createdAt: 'DESC' },
      relations: { classified: true, seller: true },
    });
    return requests.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      classifiedTitle: r.classified?.title,
      classifiedId: r.classified?.id,
      sellerName: r.seller?.name || r.seller?.email,
      amount: r.amount ? Number(r.amount) : null,
      invoiceDescription: r.invoiceDescription,
      dueDate: r.dueDate,
      status: r.status,
      buyerMessage: r.buyerMessage,
      sellerNotes: r.sellerNotes,
      paidAt: r.paidAt,
      paymentMethod: r.paymentMethod,
      createdAt: r.createdAt,
    }));
  }

  // ─── Seller: Get incoming invoice requests ────────────────────────────────
  async getSellerInvoiceRequests(user: User) {
    const requests = await this.invoiceRequestRepo.find({
      where: { seller: { id: user.id } },
      order: { createdAt: 'DESC' },
      relations: { classified: true, buyer: true },
    });
    return requests.map((r) => ({
      id: r.id,
      invoiceNumber: r.invoiceNumber,
      classifiedTitle: r.classified?.title,
      classifiedId: r.classified?.id,
      listingPrice: r.classified?.price,
      buyerName: r.buyer?.name || r.buyer?.email,
      buyerEmail: r.buyer?.email,
      buyerPhone: r.buyer?.phone,
      buyerMessage: r.buyerMessage,
      amount: r.amount ? Number(r.amount) : null,
      status: r.status,
      dueDate: r.dueDate,
      createdAt: r.createdAt,
    }));
  }

  // ─── Seller: Create invoice for buyer request ─────────────────────────────
  async createInvoiceForRequest(
    requestId: number,
    seller: User,
    data: {
      amount: number;
      invoiceDescription: string;
      sellerNotes?: string;
      dueDays?: number;
    },
  ) {
    const request = await this.invoiceRequestRepo.findOne({
      where: { id: requestId },
      relations: { seller: true, buyer: true, classified: true },
    });
    if (!request) throw new NotFoundException('Invoice request not found');
    if (request.seller.id !== seller.id) {
      throw new ForbiddenException('Not your invoice request');
    }
    if (request.status !== ClassifiedInvoiceStatus.PENDING) {
      throw new BadRequestException(
        `Cannot create invoice. Request is already ${request.status}`,
      );
    }

    const invoiceNumber = await this.invoicesService.generateInvoiceNumber();
    const dueDate = new Date();
    dueDate.setHours(dueDate.getHours() + (data.dueDays || 24) * 24);

    request.invoiceNumber = invoiceNumber;
    request.amount = data.amount;
    request.invoiceDescription = data.invoiceDescription;
    request.sellerNotes = data.sellerNotes || null;
    request.dueDate = dueDate;
    request.status = ClassifiedInvoiceStatus.SENT;

    await this.invoiceRequestRepo.save(request);

    return {
      success: true,
      invoiceNumber,
      amount: data.amount,
      invoiceDescription: data.invoiceDescription,
      dueDate,
      buyerName: request.buyer?.name || request.buyer?.email,
      buyerEmail: request.buyer?.email,
      message: `Invoice ${invoiceNumber} created and sent to buyer.`,
    };
  }

  // ─── Universal Invoice Lookup ─────────────────────────────────────────────
  async getInvoiceByNumber(invoiceNumber: string) {
    const classifiedInvoice = await this.invoiceRequestRepo.findOne({
      where: { invoiceNumber },
      relations: { classified: true, buyer: true, seller: true },
    });

    if (classifiedInvoice) {
      if (classifiedInvoice.status === ClassifiedInvoiceStatus.CANCELLED) {
        throw new BadRequestException('This invoice has been cancelled');
      }
      const msgParts = (classifiedInvoice.buyerMessage || '').split(' | ');
      const parsedName =
        msgParts.find((p) => p.startsWith('Name:'))?.replace('Name: ', '') ||
        classifiedInvoice.buyer?.name ||
        '—';
      const parsedPhone =
        msgParts.find((p) => p.startsWith('Phone:'))?.replace('Phone: ', '') ||
        classifiedInvoice.buyer?.phone ||
        '—';

      return {
        invoiceNumber: classifiedInvoice.invoiceNumber,
        invoiceDescription:
          classifiedInvoice.invoiceDescription ||
          classifiedInvoice.classified?.title ||
          '—',
        classifiedTitle: classifiedInvoice.classified?.title || null,
        amount: Number(classifiedInvoice.amount),
        buyerName: parsedName,
        buyerPhone: parsedPhone,
        buyerEmail: classifiedInvoice.buyer?.email || '—',
        sellerName:
          classifiedInvoice.seller?.name ||
          classifiedInvoice.seller?.email ||
          '—',
        dueDate: classifiedInvoice.dueDate,
        status: classifiedInvoice.status,
        createdAt: classifiedInvoice.createdAt,
        type: 'classified',
      };
    }

    const orderInvoice = await this.invoiceRepo.findOne({
      where: { invoiceNumber },
      relations: {
        order: { buyer: true, product: true, seller: true },
        buyer: true,
      },
    });

    if (orderInvoice) {
      if (orderInvoice.status === InvoiceStatus.CANCELLED)
        throw new BadRequestException('This invoice has been cancelled');
      if (orderInvoice.status === InvoiceStatus.EXPIRED)
        throw new BadRequestException('This invoice has expired');

      return {
        invoiceNumber: orderInvoice.invoiceNumber,
        invoiceDescription:
          orderInvoice.order?.product?.name || 'Order Invoice',
        classifiedTitle: null,
        amount: Number(orderInvoice.amount),
        buyerName:
          orderInvoice.buyer?.name || orderInvoice.order?.buyer?.name || '—',
        buyerPhone:
          orderInvoice.buyer?.phone || orderInvoice.order?.buyer?.phone || '—',
        buyerEmail:
          orderInvoice.buyer?.email || orderInvoice.order?.buyer?.email || '—',
        sellerName:
          orderInvoice.order?.seller?.name ||
          orderInvoice.order?.seller?.email ||
          '—',
        dueDate: orderInvoice.dueDate,
        status: orderInvoice.status,
        createdAt: orderInvoice.createdAt,
        type: 'order',
      };
    }

    throw new NotFoundException('Invoice not found');
  }

  // ─── Set shipping method after payment — creates a real Order ────────────
  async setShippingMethod(
    requestId: number,
    seller: User,
    data: { shippingMethod: string; notes?: string },
  ) {
    const request = await this.invoiceRequestRepo.findOne({
      where: { id: requestId },
      relations: { seller: true, buyer: true, classified: true },
    });
    if (!request) throw new NotFoundException('Invoice not found');
    if (request.seller?.id !== seller.id)
      throw new ForbiddenException('Not your invoice');
    if (request.status !== ClassifiedInvoiceStatus.PAID)
      throw new BadRequestException('Invoice must be paid first');

    // ✅ Calculate commission — 10% platform fee on amount
    const amount = Number(request.amount || 0);
    const platformFee = parseFloat((amount * 0.1).toFixed(2));
    const sellerAmt = parseFloat((amount - platformFee).toFixed(2));

    // Parse buyer details from buyerMessage
    const msgParts = (request.buyerMessage || '').split(' | ');
    const buyerName =
      msgParts.find((p) => p.startsWith('Name:'))?.replace('Name: ', '') ||
      request.buyer?.name ||
      'Buyer';
    const buyerPhone =
      msgParts.find((p) => p.startsWith('Phone:'))?.replace('Phone: ', '') ||
      request.buyer?.phone ||
      '';
    const buyerAddr =
      msgParts
        .find((p) => p.startsWith('Address:'))
        ?.replace('Address: ', '') || '';

    // ✅ Create a real Order so the full KenteXa tracking flow kicks in
    // This links classified invoice payment → normal order → tracking → payout
    let orderId: number | null = null;
    try {
      const order = this.orderRepo.create({
        buyer: request.buyer || null,
        seller: seller,
        quantity: 1,
        totalAmount: amount,
        baseAmount: amount,
        deliveryFeeAmount: 0,
        platformFeePercent: 10,
        platformFeeAmount: platformFee,
        agentCommissionAmount: 0,
        sellerAmount: sellerAmt,
        deliveryAddress: buyerAddr || 'As agreed with seller',
        phone: buyerPhone,
        recipientName: buyerName,
        shippingMethod: data.shippingMethod,
        shippingNote: data.notes || null,
        status: OrderStatus.PAID, // Already paid
        paymentStatus: PaymentStatus.PAID,
        escrowStatus: EscrowStatus.HOLDING,
        payoutStatus: 'pending',
        // Link back to the classified invoice
        classifiedInvoiceId: requestId,
      } as any);

      const savedOrder = (await this.orderRepo.save(order)) as unknown as Order;
      orderId = savedOrder.id;

      // ── Assign tracking number immediately so buyer can track ──────────────
      const trackingNumber = `KTX-ORD-${savedOrder.id}`;
      await this.orderRepo.update(savedOrder.id, { trackingNumber });

      // ── Create initial tracking event ──────────────────────────────────────
      // This ensures TrackParcel shows the full history from day one
      try {
        await this.dataSource.query(
          `INSERT INTO parcel_tracking (status, city, note, "updatedBy", "parcelId", "createdAt")
           VALUES ($1, $2, $3, $4, NULL, NOW())`,
          [
            'paid',
            (seller as any).city || 'Tanzania',
            `Agizo limeundwa kupitia ankara ya KenteXa. Muuzaji atawasiliana nawe kwa maelezo ya utoaji.`,
            seller.name || 'KenteXa',
          ],
        );
      } catch {
        /* non-fatal */
      }

      // Generate invoice for the order
      try {
        await this.invoicesService.createForOrder(savedOrder);
      } catch (e) {
        console.error('Order invoice creation failed:', e.message);
      }

      // Return tracking number so seller can share it with buyer
      orderId = savedOrder.id;

      // Still proceed — just won't have order tracking
    } catch (e) {
      console.error(
        'Order creation from classified invoice failed:',
        e.message,
      );
    }

    // Update the invoice request
    (request as any).shippingMethod = data.shippingMethod;
    if (data.notes) request.sellerNotes = data.notes;
    (request as any).platformFee = platformFee;
    (request as any).sellerAmount = sellerAmt;
    (request as any).linkedOrderId = orderId;
    await this.invoiceRequestRepo.save(request);

    return {
      success: true,
      shippingMethod: data.shippingMethod,
      orderId,
      trackingNumber: orderId ? `KTX-ORD-${orderId}` : null,
      trackingUrl: orderId
        ? `https://kentexa.com/?track=KTX-ORD-${orderId}`
        : null,
      amount,
      platformFee,
      sellerAmount: sellerAmt,
      message: orderId
        ? `Agizo #${orderId} limeundwa. Namba ya kufuatilia: KTX-ORD-${orderId}. Tuma kiungo hiki kwa mnunuzi: kentexa.com/?track=KTX-ORD-${orderId}`
        : `Njia ya utoaji imewekwa. TZS ${sellerAmt.toLocaleString()} itatolewa baada ya mteja kuthibitisha.`,
    };
  }

  // ─── Mark invoice paid ────────────────────────────────────────────────────
  async markInvoicePaid(
    invoiceNumber: string,
    paymentMethod: string,
    transactionReference: string,
  ) {
    const request = await this.invoiceRequestRepo.findOne({
      where: { invoiceNumber },
    });
    if (!request) throw new NotFoundException('Invoice not found');
    if (request.status === ClassifiedInvoiceStatus.PAID)
      throw new BadRequestException('Already paid');

    request.status = ClassifiedInvoiceStatus.PAID;
    request.paidAt = new Date();
    request.paymentMethod = paymentMethod;
    request.transactionReference = transactionReference;
    await this.invoiceRequestRepo.save(request);

    return { success: true, invoiceNumber, message: 'Payment confirmed' };
  }
}
