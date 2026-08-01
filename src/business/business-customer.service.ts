/**
 * BusinessCustomerService
 *
 * Manages seller's private customer database.
 * Auto-populates from orders — seller gets a CRM automatically.
 *
 * Key principle: Every time a seller gets an order,
 * a BusinessCustomer record is created/updated automatically.
 * Sellers never have to manually add customers.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessCustomer } from './entities/business-customer.entity';
import { Order } from '../orders/entities/order.entity';

@Injectable()
export class BusinessCustomerService {
  constructor(
    @InjectRepository(BusinessCustomer)
    private repo: Repository<BusinessCustomer>,
    @InjectRepository(Order)
    private orderRepo: Repository<Order>,
  ) {}

  // ── Auto-create or update customer from order ─────────────────────────────
  // Called every time a seller gets an order (any type)

  async upsertFromOrder(params: {
    sellerId: number;
    userId?: number | null;
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    regionId?: number | null;
    region?: string | null;
    districtId?: number | null;
    district?: string | null;
    wardId?: number | null;
    ward?: string | null;
    orderAmount: number;
    channel?: string;
    orderId?: number | null; // track which orders already counted
  }): Promise<BusinessCustomer> {
    // Find existing by phone (most reliable for Tanzania)
    let customer: BusinessCustomer | null = null;

    if (params.phone) {
      customer = await this.repo.findOne({
        where: { sellerId: params.sellerId, phone: params.phone },
      });
    }
    if (!customer && params.userId) {
      customer = await this.repo.findOne({
        where: { sellerId: params.sellerId, userId: params.userId },
      });
    }

    if (customer) {
      // Update existing customer stats
      customer.totalOrders += 1;
      customer.totalSpent = Number(customer.totalSpent) + params.orderAmount;
      customer.averageOrderValue = customer.totalSpent / customer.totalOrders;
      customer.lastOrderAt = new Date();
      if (!customer.name && params.name) customer.name = params.name;
      if (!customer.phone && params.phone) customer.phone = params.phone;
      if (!customer.email && params.email) customer.email = params.email;
      if (!customer.address && params.address)
        customer.address = params.address;
      if (!customer.regionId && params.regionId) {
        customer.regionId = params.regionId;
        customer.region = params.region || customer.region;
      }
      if (!customer.districtId && params.districtId) {
        customer.districtId = params.districtId;
        customer.district = params.district || customer.district;
      }
      if (!customer.wardId && params.wardId) {
        customer.wardId = params.wardId;
        customer.ward = params.ward || customer.ward;
      }
      if (!customer.userId && params.userId) customer.userId = params.userId;
      // Update segment based on spending
      customer.segment = this.calculateSegment(customer);
    } else {
      // Create new customer
      customer = this.repo.create({
        sellerId: params.sellerId,
        userId: params.userId || null,
        name: params.name,
        phone: params.phone || null,
        email: params.email || null,
        address: params.address || null,
        regionId: params.regionId || null,
        region: params.region || null,
        districtId: params.districtId || null,
        district: params.district || null,
        wardId: params.wardId || null,
        ward: params.ward || null,
        totalOrders: 1,
        totalSpent: params.orderAmount,
        averageOrderValue: params.orderAmount,
        firstOrderAt: new Date(),
        lastOrderAt: new Date(),
        segment: 'new',
        channel: params.channel || 'kentexa',
      });
    }

    return this.repo.save(customer);
  }

  // ── Find or create a bare customer record for chat (no order yet) ─────────
  // Lets a buyer message a seller before ever placing an order — the CRM
  // stats fields just start at zero and fill in naturally if/when they buy.

  async findOrCreateForChat(
    sellerId: number,
    buyer: {
      id: number;
      name: string;
      phone?: string | null;
      email?: string | null;
    },
  ): Promise<BusinessCustomer> {
    let customer = await this.repo.findOne({
      where: { sellerId, userId: buyer.id },
    });
    if (customer) return customer;

    customer = this.repo.create({
      sellerId,
      userId: buyer.id,
      name: buyer.name || 'Mnunuzi',
      phone: buyer.phone || null,
      email: buyer.email || null,
      segment: 'new',
      channel: 'kentexa',
    });
    return this.repo.save(customer);
  }

  private calculateSegment(c: BusinessCustomer): string {
    const spent = Number(c.totalSpent);
    const orders = c.totalOrders;
    const daysSinceLast = c.lastOrderAt
      ? (Date.now() - new Date(c.lastOrderAt).getTime()) / 86400000
      : 999;

    if (daysSinceLast > 90) return 'inactive';
    if (spent > 500000) return 'vip';
    if (orders >= 10) return 'regular';
    if (spent > 100000) return 'regular';
    return 'new';
  }

  // ── Seller: get all customers ─────────────────────────────────────────────

  async getMyCustomers(
    sellerId: number,
    params: {
      search?: string;
      segment?: string;
      page?: number;
      limit?: number;
    },
  ) {
    const page = params.page || 1;
    const limit = Math.min(params.limit || 20, 100);
    const skip = (page - 1) * limit;

    const query = this.repo
      .createQueryBuilder('c')
      .where('c.seller_id = :sellerId', { sellerId })
      .andWhere('c.isActive = true')
      .andWhere('c.isBlocked = false');

    if (params.search) {
      query.andWhere(
        '(LOWER(c.name) LIKE :q OR c.phone LIKE :q OR LOWER(c.email) LIKE :q)',
        { q: `%${params.search.toLowerCase()}%` },
      );
    }
    if (params.segment) {
      query.andWhere('c.segment = :segment', { segment: params.segment });
    }

    const [customers, total] = await query
      .orderBy('c.lastOrderAt', 'DESC', 'NULLS LAST')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      customers,
      total,
      page,
      pages: Math.ceil(total / limit),
      // Segment summary
      segments: {
        vip: await this.repo.count({
          where: { sellerId, segment: 'vip', isActive: true },
        }),
        regular: await this.repo.count({
          where: { sellerId, segment: 'regular', isActive: true },
        }),
        new: await this.repo.count({
          where: { sellerId, segment: 'new', isActive: true },
        }),
        inactive: await this.repo.count({
          where: { sellerId, segment: 'inactive', isActive: true },
        }),
      },
    };
  }

  // ── Customer detail with full order history ───────────────────────────────

  async getCustomerDetail(sellerId: number, customerId: number) {
    const customer = await this.repo.findOne({
      where: { id: customerId, sellerId },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  // ── Manual add customer ───────────────────────────────────────────────────

  async addCustomer(
    sellerId: number,
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
  ): Promise<BusinessCustomer> {
    const existing = dto.phone
      ? await this.repo.findOne({ where: { sellerId, phone: dto.phone } })
      : null;

    if (existing) return existing;

    const customer = this.repo.create({
      sellerId,
      ...dto,
      segment: 'new',
      channel: 'manual',
    });
    return this.repo.save(customer);
  }

  // ── Update customer ───────────────────────────────────────────────────────

  async updateCustomer(
    sellerId: number,
    customerId: number,
    dto: {
      name?: string;
      phone?: string;
      email?: string;
      address?: string;
      regionId?: number;
      region?: string;
      districtId?: number;
      district?: string;
      wardId?: number;
      ward?: string;
      segment?: string;
      tags?: string[];
      notes?: string;
    },
  ): Promise<BusinessCustomer> {
    const customer = await this.getCustomerDetail(sellerId, customerId);
    Object.assign(customer, dto);
    return this.repo.save(customer);
  }

  // ── Migrate existing orders to customer records ──────────────────────────
  // Called when seller first opens Wateja Wangu to backfill historical orders

  async migrateFromExistingOrders(
    sellerId: number,
  ): Promise<{ migrated: number }> {
    // Fetch all non-cancelled orders for this seller
    const orders = await this.orderRepo
      .createQueryBuilder('o')
      .leftJoinAndSelect('o.buyer', 'buyer')
      .leftJoinAndSelect('o.seller', 'seller')
      .where('(seller.id = :sid OR o.createdByUserId = :sid)', {
        sid: sellerId,
      })
      .andWhere('o.status NOT IN (:...skip)', { skip: ['cancelled'] })
      .orderBy('o.createdAt', 'ASC')
      .getMany();

    // Group orders by buyer phone (most reliable unique key)
    const byPhone = new Map<string, typeof orders>();
    for (const order of orders) {
      const phone =
        (order as any).manualBuyerPhone ||
        order.buyer?.phone ||
        (order as any).phone ||
        null;
      const name =
        (order as any).manualBuyerName ||
        order.buyer?.name ||
        (order as any).recipientName ||
        null;
      if (!name && !phone) continue;
      const key = phone || `name:${name}`;
      if (!byPhone.has(key)) byPhone.set(key, []);
      byPhone.get(key)!.push(order);
    }

    // Upsert each unique customer with CORRECT aggregated stats
    let migrated = 0;
    for (const [, customerOrders] of byPhone) {
      const first = customerOrders[0];
      const phone =
        (first as any).manualBuyerPhone ||
        first.buyer?.phone ||
        (first as any).phone ||
        null;
      const name =
        (first as any).manualBuyerName ||
        first.buyer?.name ||
        (first as any).recipientName ||
        'Mteja';

      // Recalculate correct totals from actual orders
      const totalOrders = customerOrders.length;
      const totalSpent = customerOrders.reduce(
        (sum, o) => sum + Number(o.totalAmount || 0),
        0,
      );
      const lastOrder = customerOrders[customerOrders.length - 1];
      const firstOrder = customerOrders[0];

      // Find or create customer record
      let customer = phone
        ? await this.repo.findOne({ where: { sellerId, phone } })
        : null;
      if (!customer && first.buyer?.id) {
        customer = await this.repo.findOne({
          where: { sellerId, userId: first.buyer.id },
        });
      }

      if (customer) {
        // Reset to correct values (not additive)
        customer.totalOrders = totalOrders;
        customer.totalSpent = totalSpent;
        customer.averageOrderValue =
          totalOrders > 0 ? totalSpent / totalOrders : 0;
        customer.lastOrderAt = new Date(lastOrder.createdAt);
        customer.firstOrderAt =
          customer.firstOrderAt || new Date(firstOrder.createdAt);
        customer.segment = this.calculateSegment(customer);
        await this.repo.save(customer);
      } else {
        await this.repo.save(
          this.repo.create({
            sellerId,
            userId: first.buyer?.id || null,
            name,
            phone,
            address: (first as any).deliveryAddress || null,
            totalOrders,
            totalSpent,
            averageOrderValue: totalOrders > 0 ? totalSpent / totalOrders : 0,
            firstOrderAt: new Date(firstOrder.createdAt),
            lastOrderAt: new Date(lastOrder.createdAt),
            segment: 'new',
            channel:
              (first as any).source === 'seller_shipment'
                ? 'manual'
                : 'kentexa',
          }),
        );
      }
      migrated++;
    }
    return { migrated };
  }

  // ── Stats for seller dashboard ────────────────────────────────────────────

  async getDashboardStats(sellerId: number) {
    const total = await this.repo.count({
      where: { sellerId, isActive: true },
    });
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const newThisMonth = await this.repo
      .createQueryBuilder('c')
      .where('c.seller_id = :sellerId', { sellerId })
      .andWhere('c.createdAt >= :from', { from: thisMonth })
      .getCount();

    const topCustomers = await this.repo.find({
      where: { sellerId, isActive: true },
      order: { totalSpent: 'DESC' },
      take: 5,
    });

    const result = await this.repo
      .createQueryBuilder('c')
      .select('SUM(c.totalSpent)', 'totalRevenue')
      .addSelect('AVG(c.averageOrderValue)', 'avgOrder')
      .where('c.seller_id = :sellerId', { sellerId })
      .getRawOne();

    return {
      totalCustomers: total,
      newThisMonth,
      totalRevenue: Number(result?.totalRevenue || 0),
      avgOrderValue: Number(result?.avgOrder || 0),
      topCustomers,
    };
  }
}
