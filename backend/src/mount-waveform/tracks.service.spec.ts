import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WaveformService } from '../waveform/waveform.service';
import { TrackEntity } from './track.entity';
import { TracksService } from './tracks.service';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const trackRepoMock = {
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
};

const waveformServiceMock = {
  enqueueForTrack: jest.fn(),
};

const makeTrack = (overrides: Partial<TrackEntity> = {}): TrackEntity =>
  Object.assign(new TrackEntity(), {
    id: 'track-uuid',
    title: 'Test Track',
    audioFilePath: '/uploads/test.mp3',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TracksService', () => {
  let service: TracksService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TracksService,
        { provide: getRepositoryToken(TrackEntity), useValue: trackRepoMock },
        { provide: WaveformService, useValue: waveformServiceMock },
      ],
    }).compile();

    service = module.get(TracksService);
  });

  // ── createTrack ─────────────────────────────────────────────────────────────

  describe('createTrack', () => {
    it('persists the track and enqueues waveform generation', async () => {
      const track = makeTrack();
      trackRepoMock.create.mockReturnValue(track);
      trackRepoMock.save.mockResolvedValue(track);
      waveformServiceMock.enqueueForTrack.mockResolvedValue('job-1');

      const result = await service.createTrack({
        title: 'Test Track',
        audioFilePath: '/uploads/test.mp3',
      });

      expect(trackRepoMock.save).toHaveBeenCalledWith(track);
      expect(waveformServiceMock.enqueueForTrack).toHaveBeenCalledWith(
        'track-uuid',
        '/uploads/test.mp3',
      );
      expect(result).toEqual(track);
    });

    it('does NOT use setTimeout (no timer mocking needed)', async () => {
      const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
      const track = makeTrack();
      trackRepoMock.create.mockReturnValue(track);
      trackRepoMock.save.mockResolvedValue(track);
      waveformServiceMock.enqueueForTrack.mockResolvedValue('job-1');

      await service.createTrack({ title: 'T', audioFilePath: '/a.mp3' });

      // Durable queue – no in-process timers
      expect(setTimeoutSpy).not.toHaveBeenCalled();
      setTimeoutSpy.mockRestore();
    });
  });

  // ── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the track when found', async () => {
      const track = makeTrack();
      trackRepoMock.findOne.mockResolvedValue(track);

      const result = await service.findOne('track-uuid');
      expect(result).toEqual(track);
    });

    it('throws NotFoundException when track is missing', async () => {
      trackRepoMock.findOne.mockResolvedValue(null);
      await expect(service.findOne('ghost')).rejects.toThrow(NotFoundException);
    });
  });
});
