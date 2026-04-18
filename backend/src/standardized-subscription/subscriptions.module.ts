import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionTier } from './entities/subscription-tier.entity';
import { FanSubscription } from './entities/fan-subscription.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SubscriptionTier, FanSubscription])],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
