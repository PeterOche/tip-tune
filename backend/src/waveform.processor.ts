import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { WaveformGeneratorService } from './waveform-generator.service';
import { WaveformService, WaveformJobPayload } from './waveform.service';
import { WAVEFORM_JOBS, WAVEFORM_QUEUE } from './waveform.constants';

/**
 * BullMQ worker that replaces the old `setTimeout`-based retry mechanism.
 *
 * BullMQ persists jobs in Redis, so:
 *  - Restarts do NOT lose queued or in-flight work.
 *  - Exponential back-off with a configurable number of attempts is handled
 *    by the queue, not application code.
 *  - Failed jobs remain visible in the BullMQ dashboard for inspection /
 *    manual retry without restarting the process.
 */
@Processor(WAVEFORM_QUEUE)
export class WaveformProcessor extends WorkerHost {
  private readonly logger = new Logger(WaveformProcessor.name);

  constructor(
    private readonly generatorService: WaveformGeneratorService,
    private readonly waveformService: WaveformService,
  ) {
    super();
  }

  async process(job: Job<WaveformJobPayload>): Promise<void> {
    if (job.name !== WAVEFORM_JOBS.GENERATE) {
      this.logger.warn(`Unknown job name received: ${job.name}`);
      return;
    }

    const { trackId, audioFilePath } = job.data;
    this.logger.log(
      `Processing waveform job ${job.id} for track ${trackId} ` +
        `(attempt ${job.attemptsMade + 1} / ${job.opts.attempts})`,
    );

    await this.waveformService.markProcessing(trackId);
    await this.waveformService.incrementAttemptCount(trackId);

    try {
      const { peaks } = await this.generatorService.generateFromFile(
        audioFilePath,
      );
      await this.waveformService.markDone(trackId, peaks);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isLastAttempt =
        job.attemptsMade + 1 >= (job.opts.attempts ?? 1);

      if (isLastAttempt) {
        // Persist terminal failure so the API can surface it.
        await this.waveformService.markFailed(
          trackId,
          message,
          job.attemptsMade + 1,
        );
      }

      // Re-throw so BullMQ applies exponential back-off on non-final attempts
      // and moves the job to the 'failed' set on the final attempt.
      throw err;
    }
  }
}
