import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { GoalsService } from './goals.service';
import { GoalProgressService } from './goal-progress.service';
import { GoalProgressRetentionService } from './goal-progress-retention.service';
import { GoalProgressScheduler } from './goal-progress.scheduler';
import { GoalsController } from './goals.controller';
import { TipGoal } from './entities/tip-goal.entity';
import { GoalSupporter } from './entities/goal-supporter.entity';
import { GoalProgressSnapshot } from './entities/goal-progress-snapshot.entity';
import { SupporterActivitySummary } from './entities/supporter-activity-summary.entity';
import { ArtistsModule } from '../artists/artists.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TipGoal,
      GoalSupporter,
      GoalProgressSnapshot,
      SupporterActivitySummary,
    ]),
    ScheduleModule,
    ArtistsModule,
  ],
  controllers: [GoalsController],
  providers: [GoalsService, GoalProgressService, GoalProgressRetentionService, GoalProgressScheduler],
  exports: [GoalsService, GoalProgressService, GoalProgressRetentionService],
})
export class GoalsModule {}
