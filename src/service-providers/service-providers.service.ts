import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ServiceProvider,
  ServiceProviderStatus,
} from './entities/service-provider.entity';
import { CreateServiceProviderDto } from './dto/create-service-provider.dto';
import { User } from '../users/entities/user.entity';
import { mergeActiveRole } from '../users/utils/merge-active-role.util';

@Injectable()
export class ServiceProvidersService {
  constructor(
    @InjectRepository(ServiceProvider)
    private providerRepo: Repository<ServiceProvider>,
    @InjectRepository(User) private userRepo: Repository<User>,
  ) {}

  // Multi-Business Authority Stage 1B. Fails closed (returns null) rather
  // than arbitrarily picking one, if this user ever had more than one
  // active ServiceProvider row. Unreachable today -- apply()'s own
  // "already have a service provider application" guard below still
  // blocks a second row from ever being created -- but this must never
  // silently trust that guard to hold forever.
  private async resolveActingServiceProvider(userId: number): Promise<ServiceProvider | null> {
    const matches = await this.providerRepo.find({ where: { user: { id: userId } }, order: { id: 'ASC' } });
    return matches.length === 1 ? matches[0] : null;
  }

  // ── Apply to become a service provider ───────────────────────────────────
  async apply(dto: CreateServiceProviderDto, user: User) {
    const existing = await this.resolveActingServiceProvider(user.id);
    if (existing)
      throw new ConflictException(
        'You already have a service provider application',
      );

    const provider = this.providerRepo.create({
      ...dto,
      user,
      status: ServiceProviderStatus.PENDING,
    });
    return this.providerRepo.save(provider);
  }

  // ── My profile ─────────────────────────────────────────────────────────
  async getMyProfile(userId: number) {
    return this.resolveActingServiceProvider(userId);
  }

  async updateProfile(userId: number, dto: Partial<CreateServiceProviderDto>) {
    const provider = await this.resolveActingServiceProvider(userId);
    if (!provider) throw new NotFoundException('Service provider profile not found');
    await this.providerRepo.update(provider.id, dto);
    return this.providerRepo.findOne({ where: { id: provider.id } });
  }

  // ── Public: approved-only ─────────────────────────────────────────────────
  async findByUserId(userId: number) {
    return this.providerRepo
      .findOne({
        where: { user: { id: userId }, status: ServiceProviderStatus.APPROVED },
      })
      .catch(() => null);
  }

  // ── Admin ──────────────────────────────────────────────────────────────
  async findAll(status?: string) {
    return this.providerRepo.find({
      where: status ? { status: status as ServiceProviderStatus } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async approve(id: number) {
    const provider = await this.providerRepo.findOne({
      where: { id },
      relations: { user: true },
    });
    if (!provider) throw new NotFoundException('Service provider not found');

    await this.providerRepo.update(id, {
      status: ServiceProviderStatus.APPROVED,
      rejectionReason: null,
      verifiedAt: new Date(),
    });

    if (provider.user) {
      await this.userRepo.update(provider.user.id, {
        activeRoles: mergeActiveRole(
          provider.user.activeRoles,
          'service_provider',
        ),
      });
    }

    return this.providerRepo.findOne({ where: { id } });
  }

  async reject(id: number, reason: string) {
    const provider = await this.providerRepo.findOne({ where: { id } });
    if (!provider) throw new NotFoundException('Service provider not found');
    await this.providerRepo.update(id, {
      status: ServiceProviderStatus.REJECTED,
      rejectionReason: reason,
    });
    return this.providerRepo.findOne({ where: { id } });
  }
}
