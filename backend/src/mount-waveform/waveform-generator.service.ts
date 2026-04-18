import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface GeneratedWaveform {
  peaks: number[];
  /** Duration in seconds derived from the audio file. */
  durationSeconds: number;
}

/**
 * Responsible solely for reading an audio file and producing normalised
 * peak-amplitude data.  All retry / persistence logic lives elsewhere.
 *
 * Production swap-in: replace `generateFromFile` with a call to ffprobe /
 * audiowaveform CLI or a cloud-based audio analysis service.
 */
@Injectable()
export class WaveformGeneratorService {
  private readonly logger = new Logger(WaveformGeneratorService.name);

  /**
   * Generates waveform peaks from a local file path.
   *
   * @throws {Error} when the file cannot be read or parsed.
   */
  async generateFromFile(filePath: string): Promise<GeneratedWaveform> {
    this.logger.log(`Generating waveform for: ${filePath}`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Audio file not found: ${filePath}`);
    }

    // ------------------------------------------------------------------
    // Real implementation would shell out to `audiowaveform` or `ffprobe`.
    // The stub below produces deterministic fake data so the rest of the
    // stack (queue, persistence, API) can be exercised in tests.
    // ------------------------------------------------------------------
    const stats = fs.statSync(filePath);
    const peakCount = Math.max(100, Math.floor(stats.size / 1024));
    const peaks = this.buildFakePeaks(peakCount, filePath);
    const durationSeconds = peakCount * 0.1; // 100 ms per sample – rough stub

    return { peaks, durationSeconds };
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private buildFakePeaks(count: number, seed: string): number[] {
    // Simple seeded PRNG so tests get deterministic output.
    let s = seed.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const rand = () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };

    return Array.from({ length: count }, () =>
      parseFloat((rand() * 2 - 1).toFixed(4)),
    );
  }
}
