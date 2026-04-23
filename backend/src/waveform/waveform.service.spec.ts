import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { WaveformService } from './waveform.service';
import { TrackWaveform, GenerationStatus } from './entities/track-waveform.entity';
import { WAVEFORM_QUEUE, WAVEFORM_JOBS } from './waveform.constants';
import { NotFoundException } from '@nestjs/common';

describe('WaveformService', () => {
  let service: WaveformService;
  let repository: Repository<TrackWaveform>;
  let queue: any;

  const mockRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    increment: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WaveformService,
        {
          provide: getRepositoryToken(TrackWaveform),
          useValue: mockRepository,
        },
        {
          provide: getQueueToken(WAVEFORM_QUEUE),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<WaveformService>(WaveformService);
    repository = module.get<Repository<TrackWaveform>>(getRepositoryToken(TrackWaveform));
    queue = module.get(getQueueToken(WAVEFORM_QUEUE));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('enqueueForTrack', () => {
    it('should create a new record and enqueue a job', async () => {
      const trackId = 'track-1';
      const audioPath = 'path/to/audio.mp3';
      
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue({ trackId, generationStatus: GenerationStatus.PENDING });
      mockRepository.save.mockResolvedValue({ trackId, generationStatus: GenerationStatus.PENDING });
      mockQueue.add.mockResolvedValue({ id: 'job-1' });

      const jobId = await service.enqueueForTrack(trackId, audioPath);

      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith(
        WAVEFORM_JOBS.GENERATE,
        { trackId, audioFilePath: audioPath, dataPoints: 200 },
        expect.any(Object)
      );
      expect(jobId).toBe('job-1');
    });

    it('should skip enqueue if already processing', async () => {
      const trackId = 'track-1';
      mockRepository.findOne.mockResolvedValue({ 
        trackId, 
        generationStatus: GenerationStatus.PROCESSING,
        bullJobId: 'job-existing' 
      });

      const jobId = await service.enqueueForTrack(trackId, 'path.mp3');

      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(jobId).toBe('job-existing');
    });
  });

  describe('getStatus', () => {
    it('should return status and data', async () => {
      const trackId = 'track-1';
      const updatedAt = new Date();
      mockRepository.findOne.mockResolvedValue({
        trackId,
        generationStatus: GenerationStatus.COMPLETED,
        waveformData: [1, 2, 3],
        attemptCount: 1,
        updatedAt
      });

      const result = await service.getStatus(trackId);

      expect(result.status).toBe(GenerationStatus.COMPLETED);
      expect(result.waveformData).toEqual([1, 2, 3]);
      expect(result.updatedAt).toBe(updatedAt.toISOString());
    });

    it('should throw NotFoundException if no record', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      await expect(service.getStatus('none')).rejects.toThrow(NotFoundException);
    });
  });

  describe('Worker methods', () => {
    it('markDone should update status and data', async () => {
      await service.markDone('track-1', [0.1, 0.2]);
      expect(mockRepository.update).toHaveBeenCalledWith(
        { trackId: 'track-1' },
        expect.objectContaining({ generationStatus: GenerationStatus.COMPLETED, waveformData: [0.1, 0.2] })
      );
    });

    it('markFailed should update status and reason', async () => {
      await service.markFailed('track-1', 'error', 3);
      expect(mockRepository.update).toHaveBeenCalledWith(
        { trackId: 'track-1' },
        expect.objectContaining({ generationStatus: GenerationStatus.FAILED, failReason: 'error', attemptCount: 3 })
      );
    });
  });
});
