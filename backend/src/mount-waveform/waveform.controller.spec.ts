import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WaveformStatus } from './dto/waveform.dto';
import { WaveformController } from './waveform.controller';
import { WaveformService } from './waveform.service';

const waveformServiceMock = {
  getStatus: jest.fn(),
  regenerate: jest.fn(),
};

describe('WaveformController', () => {
  let controller: WaveformController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WaveformController],
      providers: [{ provide: WaveformService, useValue: waveformServiceMock }],
    }).compile();

    controller = module.get(WaveformController);
  });

  it('should be defined', () => expect(controller).toBeDefined());

  // ── GET /tracks/:trackId/waveform ─────────────────────────────────────────

  describe('getStatus', () => {
    it('delegates to waveformService.getStatus', async () => {
      const dto = {
        status: WaveformStatus.DONE,
        peaks: [0.1],
        attempts: 1,
        updatedAt: new Date().toISOString(),
      };
      waveformServiceMock.getStatus.mockResolvedValue(dto);

      const result = await controller.getStatus('track-uuid');

      expect(waveformServiceMock.getStatus).toHaveBeenCalledWith('track-uuid');
      expect(result).toEqual(dto);
    });

    it('propagates NotFoundException', async () => {
      waveformServiceMock.getStatus.mockRejectedValue(
        new NotFoundException('not found'),
      );
      await expect(controller.getStatus('ghost')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── POST /tracks/:trackId/waveform/regenerate ─────────────────────────────

  describe('regenerate', () => {
    it('returns queued result', async () => {
      waveformServiceMock.regenerate.mockResolvedValue({
        result: 'queued',
        jobId: 'j-42',
      });

      const result = await controller.regenerate('track-uuid');

      expect(waveformServiceMock.regenerate).toHaveBeenCalledWith('track-uuid');
      expect(result.result).toBe('queued');
    });

    it('returns already_processing when job is in-flight', async () => {
      waveformServiceMock.regenerate.mockResolvedValue({
        result: 'already_processing',
        jobId: 'in-flight',
      });

      const result = await controller.regenerate('track-uuid');
      expect(result.result).toBe('already_processing');
    });
  });
});
