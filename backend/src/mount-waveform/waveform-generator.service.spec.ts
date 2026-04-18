import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WaveformGeneratorService } from './waveform-generator.service';

describe('WaveformGeneratorService', () => {
  let service: WaveformGeneratorService;
  let tmpFile: string;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WaveformGeneratorService],
    }).compile();

    service = module.get(WaveformGeneratorService);
  });

  afterEach(() => {
    if (tmpFile && fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateFromFile', () => {
    it('returns peaks array and durationSeconds for a valid file', async () => {
      tmpFile = path.join(os.tmpdir(), `test-${Date.now()}.mp3`);
      // Write 10 KB of fake audio data so peakCount > 100
      fs.writeFileSync(tmpFile, Buffer.alloc(10 * 1024, 0xaa));

      const result = await service.generateFromFile(tmpFile);

      expect(result.peaks).toBeInstanceOf(Array);
      expect(result.peaks.length).toBeGreaterThanOrEqual(100);
      expect(result.durationSeconds).toBeGreaterThan(0);
      result.peaks.forEach((p) => {
        expect(p).toBeGreaterThanOrEqual(-1);
        expect(p).toBeLessThanOrEqual(1);
      });
    });

    it('produces deterministic peaks for the same file path', async () => {
      tmpFile = path.join(os.tmpdir(), `det-test.mp3`);
      fs.writeFileSync(tmpFile, Buffer.alloc(5 * 1024, 0xbb));

      const a = await service.generateFromFile(tmpFile);
      const b = await service.generateFromFile(tmpFile);

      expect(a.peaks).toEqual(b.peaks);
    });

    it('throws when the file does not exist', async () => {
      await expect(
        service.generateFromFile('/nonexistent/path/audio.mp3'),
      ).rejects.toThrow('Audio file not found');
    });
  });
});
