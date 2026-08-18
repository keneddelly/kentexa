import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PolicyVersion } from './entities/policy-version.entity';
import { PolicyVersionService } from './policy-version.service';

@Module({
  imports: [TypeOrmModule.forFeature([PolicyVersion])],
  providers: [PolicyVersionService],
  exports: [PolicyVersionService],
})
export class PoliciesModule {}
