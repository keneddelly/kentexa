import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { AiModule } from '../ai/ai.module';
import { SearchController } from './search.controller';

@Module({
  imports: [
    AiModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 100 }]),
  ],
  controllers: [SearchController],
})
export class SearchModule {}
