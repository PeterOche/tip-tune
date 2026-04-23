import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ActivitiesController } from "./activities.controller";
import { ActivitiesService } from "./activities.service";
import { Activity } from "./entities/activity.entity";
import { UsersModule } from "../users/users.module";
import { BlocksModule } from "../blocks/blocks.module";
import { FollowsModule } from "../follows/follows.module";
import { ActivityFeedRepository } from "./activity-feed.repository";

@Module({
  imports: [
    TypeOrmModule.forFeature([Activity]),
    forwardRef(() => UsersModule),
    BlocksModule,
    FollowsModule,
  ],
  controllers: [ActivitiesController],
  providers: [ActivitiesService, ActivityFeedRepository],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
