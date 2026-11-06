import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { InstagramBusinessContact } from './entities/instagram-business-contact.entity';
import { BusinessCustomer } from './entities/business-customer.entity';

/**
 * Resolves external Instagram-scoped identities into Kentexa's existing
 * per-seller CRM. The caller must first resolve an active connection and
 * its authorized SellerProfile; this service never guesses the seller.
 */
@Injectable()
export class InstagramBusinessContactService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(InstagramBusinessContact)
    private readonly contacts: Repository<InstagramBusinessContact>,
    @InjectRepository(BusinessCustomer)
    private readonly customers: Repository<BusinessCustomer>,
  ) {}

  async findOrCreate(params: {
    connectionId: number;
    sellerId: number;
    instagramScopedUserId: string;
    username?: string | null;
    displayName?: string | null;
  }): Promise<InstagramBusinessContact> {
    const scopedId = params.instagramScopedUserId?.trim();
    if (!scopedId || !/^\d{1,128}$/.test(scopedId)) {
      throw new NotFoundException('A valid Instagram-scoped sender ID is required.');
    }

    const existing = await this.contacts.findOne({
      where: { connectionId: params.connectionId, instagramScopedUserId: scopedId },
      relations: { businessCustomer: true },
    });
    if (existing) {
      let changed = false;
      if (params.username && existing.username !== params.username) {
        existing.username = params.username;
        changed = true;
      }
      if (params.displayName && existing.displayName !== params.displayName) {
        existing.displayName = params.displayName;
        changed = true;
      }
      if (changed) await this.contacts.save(existing);
      return existing;
    }

    return this.dataSource.transaction(async manager => {
      const contactRepo = manager.getRepository(InstagramBusinessContact);
      const customerRepo = manager.getRepository(BusinessCustomer);

      // Recheck inside the transaction to handle concurrent webhook retries.
      const raced = await contactRepo.findOne({
        where: { connectionId: params.connectionId, instagramScopedUserId: scopedId },
        relations: { businessCustomer: true },
      });
      if (raced) return raced;

      const customer = await customerRepo.save(customerRepo.create({
        sellerId: params.sellerId,
        userId: null,
        name: params.displayName?.trim() || params.username?.trim() || 'Instagram customer',
        phone: null,
        email: null,
        segment: 'new',
        channel: 'instagram',
        totalOrders: 0,
        totalSpent: 0,
        averageOrderValue: 0,
        firstOrderAt: null,
        lastOrderAt: null,
      }));

      const contact = contactRepo.create({
        connectionId: params.connectionId,
        businessCustomerId: customer.id,
        instagramScopedUserId: scopedId,
        username: params.username?.trim() || null,
        displayName: params.displayName?.trim() || null,
      });
      try {
        return await contactRepo.save(contact);
      } catch (error: any) {
        if (error?.code !== '23505') throw error;
        const winner = await contactRepo.findOne({
          where: { connectionId: params.connectionId, instagramScopedUserId: scopedId },
          relations: { businessCustomer: true },
        });
        if (!winner) throw error;
        // Concurrent insert won; remove the unused CRM row created by this tx.
        await customerRepo.delete(customer.id);
        return winner;
      }
    });
  }
}
