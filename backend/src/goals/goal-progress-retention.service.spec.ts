import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { GoalProgressRetentionService } from './goal-progress-retention.service';
import { GoalProgressSnapshot } from './entities/goal-progress-snapshot.entity';

describe('GoalProgressRetentionService', () => {
  let service: GoalProgressRetentionService;
  let repository: any;

  const mockRepository = {
    find: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GoalProgressRetentionService,
        {
          provide: getRepositoryToken(GoalProgressSnapshot),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<GoalProgressRetentionService>(GoalProgressRetentionService);
    repository = module.get(getRepositoryToken(GoalProgressSnapshot));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('pruneOldSnapshots', () => {
    it('should prune snapshots in batches', async () => {
      repository.find
        .mockResolvedValueOnce([{ id: '1' }, { id: '2' }]) // First batch
        .mockResolvedValueOnce([]); // Second batch (empty)

      const result = await service.pruneOldSnapshots(90);

      expect(result.prunedCount).toBe(2);
      expect(repository.find).toHaveBeenCalledTimes(2);
      expect(repository.delete).toHaveBeenCalledWith(['1', '2']);
    });

    it('should handle multiple batches', async () => {
      const fullBatch = Array(1000).fill(0).map((_, i) => ({ id: `${i}` }));
      repository.find
        .mockResolvedValueOnce(fullBatch)
        .mockResolvedValueOnce([{ id: '1001' }])
        .mockResolvedValueOnce([]);

      const result = await service.pruneOldSnapshots(90);

      expect(result.prunedCount).toBe(1001);
      expect(repository.find).toHaveBeenCalledTimes(3);
      expect(repository.delete).toHaveBeenCalledTimes(2);
    });

    it('should handle errors gracefully', async () => {
      repository.find.mockRejectedValue(new Error('DB Error'));

      await expect(service.pruneOldSnapshots(90)).rejects.toThrow('DB Error');
    });
  });
});
