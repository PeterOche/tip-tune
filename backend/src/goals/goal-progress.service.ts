import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager } from "typeorm";
import { GoalStatus, TipGoal } from "./entities/tip-goal.entity";
import { GoalProgressSnapshot } from "./entities/goal-progress-snapshot.entity";
import { SupporterActivitySummary } from "./entities/supporter-activity-summary.entity";
import { TipVerifiedEvent } from "../tips/events/tip-verified.event";
import { OnEvent } from "@nestjs/event-emitter";
import { Tip } from "../tips/entities/tip.entity";

@Injectable()
export class GoalProgressService {
  private readonly logger = new Logger(GoalProgressService.name);

  constructor(
    @InjectRepository(TipGoal)
    private readonly goalRepository: Repository<TipGoal>,
    @InjectRepository(GoalProgressSnapshot)
    private readonly snapshotRepository: Repository<GoalProgressSnapshot>,
    @InjectRepository(SupporterActivitySummary)
    private readonly supporterSummaryRepository: Repository<SupporterActivitySummary>,
  ) {}

  /**
   * Handle tip verification events to update goal progress
   */
  @OnEvent("tip.verified")
  async handleTipVerified(event: TipVerifiedEvent) {
    const { tip } = event;

    // Only process tips that are associated with goals
    if (!tip.goalId) {
      return;
    }

    this.logger.log(
      `Processing goal progress for tip ${tip.id} on goal ${tip.goalId}`,
    );

    await this.updateGoalProgress(tip.goalId, tip);
  }

  /**
   * Update goal progress and create snapshot when a tip is verified
   */
  async updateGoalProgress(goalId: string, tip: Tip): Promise<void> {
    await this.goalRepository.manager.transaction(
      async (manager: EntityManager) => {
        // Get current goal state
        const goal = await manager.findOne(TipGoal, {
          where: { id: goalId },
          relations: ["supporters"],
        });

        if (!goal) {
          this.logger.warn(`Goal ${goalId} not found for tip ${tip.id}`);
          return;
        }

        const previousAmount = goal.currentAmount;
        const newAmount = Number(previousAmount) + Number(tip.amount);

        // Update goal progress
        await manager.update(TipGoal, goalId, {
          currentAmount: newAmount,
          status:
            newAmount >= Number(goal.goalAmount)
              ? GoalStatus.COMPLETED
              : GoalStatus.ACTIVE,
        });

        // Update or create supporter summary
        await this.updateSupporterSummary(manager, goalId, tip);

        // Create progress snapshot
        await this.createProgressSnapshot(
          manager,
          goal,
          previousAmount,
          newAmount,
          tip,
        );
      },
    );
  }

  /**
   * Update or create supporter activity summary
   */
  private async updateSupporterSummary(
    manager: EntityManager,
    goalId: string,
    tip: Tip,
  ): Promise<void> {
    // Find user by wallet address (since tip might be anonymous)
    let userId = null;
    if (!tip.isAnonymous && tip.senderAddress !== "anonymous") {
      // This is a simplified lookup - in practice you'd need a proper user lookup
      // For now, we'll assume we can derive userId from the tip's fromUser field
      userId = tip.fromUser;
    }

    if (!userId) {
      // Skip supporter summary for anonymous tips
      return;
    }

    let summary = await manager.findOne(SupporterActivitySummary, {
      where: { goalId, userId },
    });

    const contributionAmount = Number(tip.amount);

    if (summary) {
      // Update existing summary
      const newTotal = Number(summary.totalAmount) + contributionAmount;
      const newCount = summary.contributionCount + 1;

      summary.totalAmount = newTotal;
      summary.contributionCount = newCount;
      summary.averageContribution = newTotal / newCount;
      summary.lastContributionAt = new Date();

      // Update contribution history
      const history = summary.contributionHistory || [];
      history.push({
        amount: contributionAmount,
        timestamp: new Date(),
        tipId: tip.id,
      });
      summary.contributionHistory = history;

      await manager.save(summary);
    } else {
      // Create new summary
      summary = manager.create(SupporterActivitySummary, {
        goalId,
        userId,
        totalAmount: contributionAmount,
        contributionCount: 1,
        averageContribution: contributionAmount,
        firstContributionAt: new Date(),
        lastContributionAt: new Date(),
        contributionHistory: [
          {
            amount: contributionAmount,
            timestamp: new Date(),
            tipId: tip.id,
          },
        ],
        isAnonymous: tip.isAnonymous,
      });
      await manager.save(summary);
    }
  }

  /**
   * Create a progress snapshot for the goal
   */
  private async createProgressSnapshot(
    manager: EntityManager,
    goal: TipGoal,
    previousAmount: number,
    newAmount: number,
    tip: Tip,
  ): Promise<void> {
    // Get supporter stats
    const supporterSummaries = await manager.find(SupporterActivitySummary, {
      where: { goalId: goal.id },
      order: { totalAmount: "DESC" },
      take: 10, // Top 10 supporters
    });

    const totalSupporters = supporterSummaries.length;
    const newSupporters = supporterSummaries.filter(
      (s) =>
        s.firstContributionAt &&
        s.lastContributionAt &&
        s.firstContributionAt.getTime() === s.lastContributionAt.getTime(),
    ).length;

    const topSupporters = supporterSummaries.map((s) => ({
      userId: s.userId,
      amount: s.totalAmount,
      contributionCount: s.contributionCount,
    }));

    const snapshot = manager.create(GoalProgressSnapshot, {
      goalId: goal.id,
      currentAmount: newAmount,
      previousAmount,
      amountDelta: newAmount - previousAmount,
      totalSupporters,
      newSupporters,
      topSupporters,
      snapshotTrigger: "tip_verified",
      triggerTipId: tip.id,
    });

    await manager.save(snapshot);
  }

  /**
   * Get goal progress history
   */
  async getGoalProgressHistory(
    goalId: string,
  ): Promise<GoalProgressSnapshot[]> {
    return this.snapshotRepository.find({
      where: { goalId },
      order: { createdAt: "ASC" },
    });
  }

  /**
   * Get supporter activity summaries for a goal
   */
  async getSupporterActivitySummaries(
    goalId: string,
  ): Promise<SupporterActivitySummary[]> {
    return this.supporterSummaryRepository.find({
      where: { goalId },
      relations: ["user"],
      order: { totalAmount: "DESC" },
    });
  }

  /**
   * Get goal progress statistics
   */
  async getGoalProgressStats(goalId: string) {
    const snapshots = await this.getGoalProgressHistory(goalId);
    const supporters = await this.getSupporterActivitySummaries(goalId);

    if (snapshots.length === 0) {
      return {
        totalProgress: 0,
        totalSupporters: 0,
        averageContribution: 0,
        progressRate: 0,
        snapshots: [],
        topSupporters: [],
      };
    }

    const latestSnapshot = snapshots[snapshots.length - 1];
    const totalProgress = latestSnapshot.currentAmount;
    const totalSupporters = latestSnapshot.totalSupporters;
    const averageContribution =
      totalSupporters > 0 ? totalProgress / totalSupporters : 0;

    // Calculate progress rate (amount per day)
    const firstSnapshot = snapshots[0];
    const daysDiff = Math.max(
      1,
      (latestSnapshot.createdAt.getTime() - firstSnapshot.createdAt.getTime()) /
        (1000 * 60 * 60 * 24),
    );
    const progressRate = totalProgress / daysDiff;

    const topSupporters = supporters.slice(0, 10).map((s) => ({
      userId: s.userId,
      totalAmount: s.totalAmount,
      contributionCount: s.contributionCount,
      averageContribution: s.averageContribution,
      lastActivityAt: s.lastContributionAt,
    }));

    return {
      totalProgress,
      totalSupporters,
      averageContribution,
      progressRate,
      snapshots: snapshots.map((s) => ({
        id: s.id,
        currentAmount: s.currentAmount,
        amountDelta: s.amountDelta,
        totalSupporters: s.totalSupporters,
        newSupporters: s.newSupporters,
        createdAt: s.createdAt,
        trigger: s.snapshotTrigger,
      })),
      topSupporters,
    };
  }

  /**
   * Manually trigger a progress snapshot (for scheduled jobs or admin actions)
   */
  async createManualSnapshot(goalId: string): Promise<void> {
    const goal = await this.goalRepository.findOne({
      where: { id: goalId },
      relations: ["supporters"],
    });

    if (!goal) {
      throw new Error(`Goal ${goalId} not found`);
    }

    await this.goalRepository.manager.transaction(
      async (manager: EntityManager) => {
        // Get supporter stats
        const supporterSummaries = await manager.find(
          SupporterActivitySummary,
          {
            where: { goalId },
            order: { totalAmount: "DESC" },
            take: 10,
          },
        );

        const totalSupporters = supporterSummaries.length;
        const topSupporters = supporterSummaries.map((s) => ({
          userId: s.userId,
          amount: s.totalAmount,
          contributionCount: s.contributionCount,
        }));

        const snapshot = manager.create(GoalProgressSnapshot, {
          goalId,
          currentAmount: goal.currentAmount,
          previousAmount: goal.currentAmount, // No change for manual snapshots
          amountDelta: 0,
          totalSupporters,
          newSupporters: 0,
          topSupporters,
          snapshotTrigger: "manual",
        });

        await manager.save(snapshot);
      },
    );
  }
}
