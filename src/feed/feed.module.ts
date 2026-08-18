/**
 * FeedModule — includes CVS engine + comments + universal engagements
 * Place at: src/feed/feed.module.ts
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessFeedItem } from '../business/entities/business-feed-item.entity';
import { User } from '../users/entities/user.entity';
import { Classified } from '../classifieds/entities/classified.entity';
import { Product } from '../products/entities/products.entity';
import { ServiceAd } from '../services/entities/service-ad.entity';
import { TransportRoute } from '../transport/entities/transport-route.entity';
import { ProviderAvailability } from '../transport/entities/provider-availability.entity';
import { PostEngagement } from './entities/post-engagement.entity';
import { PostComment } from './entities/post-comment.entity';
import { PostCommentHelpfulVote } from './entities/post-comment-helpful-vote.entity';
import { Order } from '../orders/entities/order.entity';
import { CommerceProfile } from '../commerce-profiles/entities/commerce-profile.entity';
import { FeedService } from './feed.service';
import { CvsService } from './cvs.service';
import { FeedController } from './feed.controller';
import {
  EngagementsController,
  CommentsController,
  EntityOwnerResolver,
} from './engagements.controller';
import {
  PurchaseVerificationService,
  AiSummaryProvider,
} from './comment-support.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModule } from '../ai/ai.module';
import { CommerceProfilesModule } from '../commerce-profiles/commerce-profiles.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BusinessFeedItem,
      Classified,
      Product,
      ServiceAd,
      TransportRoute,
      ProviderAvailability,
      User,
      PostEngagement,
      PostComment,
      PostCommentHelpfulVote,
      Order,
      CommerceProfile,
    ]),
    NotificationsModule,
    AiModule,
    CommerceProfilesModule,
  ],
  controllers: [FeedController, EngagementsController, CommentsController],
  providers: [
    FeedService,
    CvsService,
    EntityOwnerResolver,
    PurchaseVerificationService,
    AiSummaryProvider,
  ],
  exports: [FeedService, CvsService],
})
export class FeedModule {}
