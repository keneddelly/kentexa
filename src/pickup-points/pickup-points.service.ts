/**
 * PickupPointsService
 * Place at: src/pickup-points/pickup-points.service.ts
 */
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PickupPoint, PickupPointStatus } from './entities/pickup-point.entity';
import { Agent } from '../agents/entities/agent.entity';

@Injectable()
export class PickupPointsService {
  constructor(
    @InjectRepository(PickupPoint) private repo: Repository<PickupPoint>,
    @InjectRepository(Agent) private agentRepo: Repository<Agent>,
  ) {}

  // ── Create pickup point (agent registers their location) ─────────────────
  async create(
    userId: number,
    dto: {
      name: string;
      address: string;
      city: string;
      landmark?: string;
      phone?: string;
      openHours?: string;
      latitude?: number;
      longitude?: number;
    },
  ): Promise<PickupPoint> {
    const agent = await this.agentRepo.findOne({
      where: { user: { id: userId } },
    });
    if (!agent) throw new ForbiddenException('Lazima uwe Agent wa KenteXa');

    return this.repo.save(
      this.repo.create({
        agentId: agent.id,
        userId,
        name: dto.name,
        address: dto.address,
        city: dto.city,
        landmark: dto.landmark || null,
        phone: dto.phone || null,
        openHours: dto.openHours || null,
        latitude: dto.latitude || null,
        longitude: dto.longitude || null,
      }),
    );
  }

  // ── Get by city (buyers find pickup points near them) ────────────────────
  async findByCity(city: string): Promise<PickupPoint[]> {
    return this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.user', 'u')
      .where('LOWER(p.city) LIKE LOWER(:city)', {
        city: `%${city.split(',')[0].trim()}%`,
      })
      .andWhere('p.status = :status', { status: PickupPointStatus.ACTIVE })
      .orderBy('p.totalPickups', 'DESC')
      .addOrderBy('p.rating', 'DESC')
      .getMany();
  }

  // ── All pickup points (public) ────────────────────────────────────────────
  async findAll(city?: string): Promise<PickupPoint[]> {
    const qb = this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.user', 'u')
      .where('p.status = :status', { status: PickupPointStatus.ACTIVE });
    if (city) {
      qb.andWhere('LOWER(p.city) LIKE LOWER(:city)', { city: `%${city}%` });
    }
    return qb.orderBy('p.rating', 'DESC').getMany();
  }

  // ── Agent's own pickup points ─────────────────────────────────────────────
  async findMine(userId: number): Promise<PickupPoint[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  // ── Update status ─────────────────────────────────────────────────────────
  async updateStatus(
    userId: number,
    id: number,
    status: PickupPointStatus,
  ): Promise<PickupPoint> {
    const pt = await this.repo.findOne({ where: { id, userId } });
    if (!pt) throw new NotFoundException('Mahali pa kupokelea haikupatikana');
    pt.status = status;
    return this.repo.save(pt);
  }

  // ── Update info ───────────────────────────────────────────────────────────
  async update(
    userId: number,
    id: number,
    dto: Partial<{
      name: string;
      address: string;
      landmark: string;
      phone: string;
      openHours: string;
      latitude: number;
      longitude: number;
    }>,
  ): Promise<PickupPoint> {
    const pt = await this.repo.findOne({ where: { id, userId } });
    if (!pt) throw new NotFoundException('Mahali pa kupokelea haikupatikana');
    Object.assign(pt, dto);
    return this.repo.save(pt);
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async remove(userId: number, id: number): Promise<void> {
    const pt = await this.repo.findOne({ where: { id, userId } });
    if (!pt) throw new NotFoundException('Mahali pa kupokelea haikupatikana');
    await this.repo.remove(pt);
  }

  // ── Record a pickup (increment counter) ───────────────────────────────────
  async recordPickup(id: number): Promise<void> {
    await this.repo.increment({ id }, 'totalPickups', 1);
  }
}
