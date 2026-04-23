import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { GoalProgressSnapshot } from './entities/goal-progress-snapshot.entity';
import { subDays } from 'date-fns';

@Injectable()
export class GoalProgressRetentionService {
  private readonly logger = new Logger(GoalProgressRetentionService.name);
  private readonly BATCH_SIZE = 1000;

  constructor(
    @InjectRepository(GoalProgressSnapshot)
    private readonly snapshotRepository: Repository<GoalProgressSnapshot>,
  ) {}

  /**
   * Prune snapshots older than the specified number of days
   */
  async pruneOldSnapshots(retentionDays: number = 90): Promise<{ prunedCount: number }> {
    const cutoffDate = subDays(new Date(), retentionDays);
    this.logger.log(`Starting snapshot pruning for snapshots older than ${cutoffDate.toISOString()} (${retentionDays} days)`);

    let totalPruned = 0;
    let hasMore = true;

    try {
      while (hasMore) {
        // Find snapshots to prune in batches
        const snapshotsToPrune = await this.snapshotRepository.find({
          where: {
            createdAt: LessThan(cutoffDate),
          },
          select: ['id'],
          take: this.BATCH_SIZE,
        });

        if (snapshotsToPrune.length === 0) {
          hasMore = false;
          break;
        }

        const ids = snapshotsToPrune.map(s => s.id);
        await this.snapshotRepository.delete(ids);
        
        totalPruned += ids.length;
        this.logger.debug(`Pruned batch of ${ids.length} snapshots. Total pruned: ${totalPruned}`);

        // If we got fewer than BATCH_SIZE, we've reached the end
        if (snapshotsToPrune.length < this.BATCH_SIZE) {
          hasMore = false;
        }
      }

      this.logger.log(`Snapshot pruning completed. Total snapshots removed: ${totalPruned}`);
    } catch (error) {
      this.logger.error('Error during snapshot pruning:', error);
      throw error;
    }

    return { prunedCount: totalPruned };
  }
}
