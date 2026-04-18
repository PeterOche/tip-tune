import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoalProgressService } from './goal-progress.service';
import { TipGoal } from './entities/tip-goal.entity';
import { GoalProgressSnapshot } from './entities/goal-progress-snapshot.entity';
import { SupporterActivitySummary } from './entities/supporter-activity-summary.entity';
import { Tip, TipStatus, TipType } from '../tips/entities/tip.entity';
import { TipVerifiedEvent } from '../tips/events/tip-verified.event';

describe('GoalProgressService', () => {
  let service: GoalProgressService;
  let goalRepository: Repository<TipGoal>;
  let snapshotRepository: Repository<GoalProgressSnapshot>;
  let supporterSummaryRepository: Repository<SupporterActivitySummary>;

  const mockGoal = {
    id: 'goal-1',
    artistId: 'artist-1',
    currentAmount: 50,
    goalAmount: 100,
    supporters: [],
  };

  const createMockTip = (overrides: Partial<Tip> = {}): Tip =>
    ({
      id: 'tip-1',
      artistId: 'artist-1',
      goalId: 'goal-1',
      stellarTxHash: 'stellar-hash-1',
      senderAddress: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
      receiverAddress: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBR',
      amount: 25,
      assetCode: 'XLM',
      fromUser: 'user-1',
      assetType: 'native',
      status: TipStatus.VERIFIED,
      type: TipType.ARTIST,
      isAnonymous: false,
      asset: 'XLM',
      isPublic: true,
      isDeleted: false,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      ...overrides,
    }) as Tip;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoalProgressService,
        {
          provide: getRepositoryToken(TipGoal),
          useValue: {
            findOne: jest.fn().mockResolvedValue(mockGoal),
            manager: {
              transaction: jest.fn((callback) => callback({
                findOne: jest.fn().mockResolvedValue(mockGoal),
                update: jest.fn().mockResolvedValue(undefined),
                create: jest.fn().mockReturnValue({}),
                save: jest.fn().mockResolvedValue(undefined),
                find: jest.fn().mockResolvedValue([]),
              })),
            },
          },
        },
        {
          provide: getRepositoryToken(GoalProgressSnapshot),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: getRepositoryToken(SupporterActivitySummary),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<GoalProgressService>(GoalProgressService);
    goalRepository = module.get<Repository<TipGoal>>(getRepositoryToken(TipGoal));
    snapshotRepository = module.get<Repository<GoalProgressSnapshot>>(getRepositoryToken(GoalProgressSnapshot));
    supporterSummaryRepository = module.get<Repository<SupporterActivitySummary>>(getRepositoryToken(SupporterActivitySummary));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleTipVerified', () => {
    it('should skip tips without goalId', async () => {
      const event = new TipVerifiedEvent(createMockTip({ goalId: undefined }), 'user-1');

      await service.handleTipVerified(event);

      // Should not call any repository methods
      expect(goalRepository.manager.transaction).not.toHaveBeenCalled();
    });

    it('should update goal progress for tips with goalId', async () => {
      const event = new TipVerifiedEvent(createMockTip(), 'user-1');

      await service.handleTipVerified(event);

      expect(goalRepository.manager.transaction).toHaveBeenCalled();
    });
  });

  describe('getGoalProgressHistory', () => {
    it('should return progress snapshots ordered by creation date', async () => {
      const mockSnapshots = [
        { id: '1', createdAt: new Date('2023-01-01') },
        { id: '2', createdAt: new Date('2023-01-02') },
      ];

      jest.spyOn(snapshotRepository, 'find').mockResolvedValue(mockSnapshots as any);

      const result = await service.getGoalProgressHistory('goal-1');

      expect(result).toEqual(mockSnapshots);
      expect(snapshotRepository.find).toHaveBeenCalledWith({
        where: { goalId: 'goal-1' },
        order: { createdAt: 'ASC' },
      });
    });
  });

  describe('getSupporterActivitySummaries', () => {
    it('should return supporter summaries with user relations', async () => {
      const mockSummaries = [
        { id: '1', userId: 'user-1', totalAmount: 50 },
      ];

      jest.spyOn(supporterSummaryRepository, 'find').mockResolvedValue(mockSummaries as any);

      const result = await service.getSupporterActivitySummaries('goal-1');

      expect(result).toEqual(mockSummaries);
      expect(supporterSummaryRepository.find).toHaveBeenCalledWith({
        where: { goalId: 'goal-1' },
        relations: ['user'],
        order: { totalAmount: 'DESC' },
      });
    });
  });

  describe('getGoalProgressStats', () => {
    it('should return comprehensive progress statistics', async () => {
      const mockSnapshots = [
        {
          id: '1',
          currentAmount: 25,
          createdAt: new Date('2023-01-01'),
          totalSupporters: 1,
        },
        {
          id: '2',
          currentAmount: 50,
          createdAt: new Date('2023-01-02'),
          totalSupporters: 2,
        },
      ];

      const mockSupporters = [
        {
          userId: 'user-1',
          totalAmount: 30,
          contributionCount: 2,
          averageContribution: 15,
          lastContributionAt: new Date(),
        },
      ];

      jest.spyOn(snapshotRepository, 'find').mockResolvedValue(mockSnapshots as any);
      jest.spyOn(supporterSummaryRepository, 'find').mockResolvedValue(mockSupporters as any);

      const result = await service.getGoalProgressStats('goal-1');

      expect(result.totalProgress).toBe(50);
      expect(result.totalSupporters).toBe(2);
      expect(result.averageContribution).toBe(25);
      expect(result.snapshots).toHaveLength(2);
      expect(result.topSupporters).toHaveLength(1);
    });

    it('should handle goals with no snapshots', async () => {
      jest.spyOn(snapshotRepository, 'find').mockResolvedValue([]);
      jest.spyOn(supporterSummaryRepository, 'find').mockResolvedValue([]);

      const result = await service.getGoalProgressStats('goal-1');

      expect(result.totalProgress).toBe(0);
      expect(result.totalSupporters).toBe(0);
      expect(result.averageContribution).toBe(0);
      expect(result.snapshots).toEqual([]);
      expect(result.topSupporters).toEqual([]);
    });
  });

  describe('createManualSnapshot', () => {
    it('should create a manual progress snapshot', async () => {
      const goalWithSupporters = { ...mockGoal, supporters: [] };

      jest.spyOn(goalRepository, 'findOne').mockResolvedValue(goalWithSupporters as any);

      await service.createManualSnapshot('goal-1');

      expect(goalRepository.manager.transaction).toHaveBeenCalled();
    });

    it('should throw error for non-existent goal', async () => {
      jest.spyOn(goalRepository, 'findOne').mockResolvedValue(null);

      await expect(service.createManualSnapshot('goal-1')).rejects.toThrow('Goal goal-1 not found');
    });
  });
});
