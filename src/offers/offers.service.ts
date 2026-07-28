/**
 * OffersService
 * Place at: src/offers/offers.service.ts
 */
import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Offer, OfferStatus } from './entities/offer.entity';
import { Classified } from '../classifieds/entities/classified.entity';

@Injectable()
export class OffersService {
  constructor(
    @InjectRepository(Offer) private offerRepo: Repository<Offer>,
    @InjectRepository(Classified)
    private classifiedRepo: Repository<Classified>,
  ) {}

  async makeOffer(
    buyerId: number,
    dto: {
      classifiedId: number;
      offerAmount: number;
      buyerNote?: string;
    },
  ): Promise<Offer> {
    const classified = await this.classifiedRepo.findOne({
      where: { id: dto.classifiedId },
      relations: { seller: true },
    });
    if (!classified) throw new NotFoundException('Tangazo halijapatikana');
    if (
      (classified as any).sellerId === buyerId ||
      classified.seller?.id === buyerId
    ) {
      throw new BadRequestException(
        'Huwezi kutoa bei kwenye bidhaa yako mwenyewe',
      );
    }
    if (dto.offerAmount <= 0)
      throw new BadRequestException('Bei lazima iwe zaidi ya sifuri');

    // Check existing pending offer
    const existing = await this.offerRepo.findOne({
      where: {
        classifiedId: dto.classifiedId,
        buyerId,
        status: OfferStatus.PENDING,
      },
    });
    if (existing)
      throw new BadRequestException(
        'Una bei inayosubiri tayari kwa bidhaa hii',
      );

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48); // 48hr expiry

    return this.offerRepo.save(
      this.offerRepo.create({
        classifiedId: dto.classifiedId,
        buyerId,
        sellerId: classified.seller?.id || (classified as any).sellerId,
        offerAmount: dto.offerAmount,
        buyerNote: dto.buyerNote || null,
        status: OfferStatus.PENDING,
        expiresAt,
      }),
    );
  }

  async respondToOffer(
    sellerId: number,
    offerId: number,
    dto: {
      action: 'accept' | 'decline' | 'counter';
      counterAmount?: number;
      sellerNote?: string;
    },
  ): Promise<Offer> {
    const offer = await this.offerRepo.findOne({
      where: { id: offerId, sellerId },
      relations: { classified: true, buyer: true },
    });
    if (!offer) throw new NotFoundException('Bei haijapatikana');
    if (offer.status !== OfferStatus.PENDING) {
      throw new BadRequestException('Bei hii imeshughulikiwa tayari');
    }

    if (dto.action === 'accept') {
      offer.status = OfferStatus.ACCEPTED;
    } else if (dto.action === 'decline') {
      offer.status = OfferStatus.DECLINED;
    } else if (dto.action === 'counter') {
      if (!dto.counterAmount || dto.counterAmount <= 0) {
        throw new BadRequestException('Weka bei ya kujibu');
      }
      offer.status = OfferStatus.COUNTERED;
      offer.counterAmount = dto.counterAmount;
    }

    offer.sellerNote = dto.sellerNote || null;
    return this.offerRepo.save(offer);
  }

  async getMyOffersSent(buyerId: number): Promise<Offer[]> {
    return this.offerRepo.find({
      where: { buyerId },
      relations: { classified: true, seller: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getMyOffersReceived(sellerId: number): Promise<Offer[]> {
    return this.offerRepo.find({
      where: { sellerId },
      relations: { classified: true, buyer: true },
      order: { createdAt: 'DESC' },
    });
  }

  async getOffersForClassified(
    classifiedId: number,
    sellerId: number,
  ): Promise<Offer[]> {
    return this.offerRepo.find({
      where: { classifiedId, sellerId },
      relations: { buyer: true },
      order: { createdAt: 'DESC' },
    });
  }
}
