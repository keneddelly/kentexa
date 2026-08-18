import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  PolicyVersion,
  PolicyType,
  PolicyVersionStatus,
} from './entities/policy-version.entity';

@Injectable()
export class PolicyVersionService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(PolicyVersion)
    private repo: Repository<PolicyVersion>,
  ) {}

  // Ensures there is always an ACTIVE Terms of Service version to record
  // acceptance against — without this, a fresh environment would have
  // nothing for signup to reference. Idempotent: only creates the seed row
  // if this policy type has never been versioned at all. Admin
  // create/publish tooling for every policy type is P1; this keeps the
  // single consent capture that matters most for launch working today.
  async onApplicationBootstrap() {
    const existing = await this.repo.findOne({
      where: { type: PolicyType.TERMS_OF_SERVICE },
    });
    if (existing) return;
    await this.repo.save(
      this.repo.create({
        type: PolicyType.TERMS_OF_SERVICE,
        version: '1.0',
        effectiveDate: new Date(),
        status: PolicyVersionStatus.ACTIVE,
        contentRef: '/terms',
      }),
    );
  }

  async getActive(type: PolicyType): Promise<PolicyVersion | null> {
    return this.repo.findOne({
      where: { type, status: PolicyVersionStatus.ACTIVE },
      order: { effectiveDate: 'DESC' },
    });
  }
}
