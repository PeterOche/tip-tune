import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GoalProgressService } from './goal-progress.service';
import { GoalProgressRetentionService } from './goal-progress-retention.service';
import { GoalsService } from './goals.service';
import { TipGoal, GoalStatus } from './entities/tip-goal.entity';

@Injectable()
export class GoalProgressScheduler {
  private readonly logger = new Logger(GoalProgressScheduler.name);

  constructor(
    private readonly goalProgressService: GoalProgressService,
    private readonly goalProgressRetentionService: GoalProgressRetentionService,
    private readonly goalsService: GoalsService,
  ) {}

  /**
   * Create daily snapshots for active goals
   * Runs every day at 2 AM
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async createDailySnapshots() {
    this.logger.log('Starting daily goal progress snapshots');

    try {
      // Get all active goals
      const activeGoals = await this.getActiveGoals();

      this.logger.log(`Creating snapshots for ${activeGoals.length} active goals`);

      for (const goal of activeGoals) {
        try {
          await this.goalProgressService.createManualSnapshot(goal.id);
          this.logger.debug(`Created daily snapshot for goal ${goal.id}`);
        } catch (error) {
          this.logger.error(`Failed to create snapshot for goal ${goal.id}:`, error);
        }
      }

      this.logger.log('Completed daily goal progress snapshots');
    } catch (error) {
      this.logger.error('Failed to create daily snapshots:', error);
    }
  }

  /**
   * Clean up old snapshots (keep last 90 days)
   * Runs weekly on Sundays at 3 AM
   */
  @Cron(CronExpression.EVERY_WEEK)
  async cleanupOldSnapshots() {
    this.logger.log('Starting cleanup of old goal progress snapshots');
    try {
      const { prunedCount } = await this.goalProgressRetentionService.pruneOldSnapshots(90);
      this.logger.log(`Cleanup completed. Removed ${prunedCount} stale snapshots.`);
    } catch (error) {
      this.logger.error('Failed to cleanup old snapshots:', error);
    }
  }

  /**
   * Get all active goals for snapshot creation
   */
  private async getActiveGoals(): Promise<TipGoal[]> {
    return this.goalsService.findActiveGoals();
  }
}