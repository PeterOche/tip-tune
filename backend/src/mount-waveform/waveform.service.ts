import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';

import {
  RegenerateResponseDto,
  WaveformStatus,
  WaveformStatusDto,
} from './dto/waveform.dto';
import { WaveformEntity } from './waveform.entity';
import {
  WAVEFORM_JOB_DEFAULTS,
  WAVEFORM_JOBS,
  WAVEFORM_QUEUE,
} from './waveform.constants';

export interface WaveformJobPayload {
  trackId: string;
  audioFilePath: string;
}

@Injectable()
export class WaveformService {
  private readonly logger = new Logger(WaveformService.name);

  constructor(
    @InjectRepository(WaveformEntity)
    private readonly waveformRepo: Repository<WaveformEntity>,

    @InjectQueue(WAVEFORM_QUEUE)
    private readonly waveformQueue: Queue<WaveformJobPayload>,
  ) {}

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Enqueues a waveform generation job for a newly created track.
   * Safe to call multiple times – idempotent when a job is already queued
   * or processing.
   */
  async enqueueForTrack(
    trackId: string,
    audioFilePath: string,
  ): Promise<string> {
    let record = await this.waveformRepo.findOne({ where: { trackId } });

    if (
      record &&
      [WaveformStatus.PENDING, WaveformStatus.PROCESSING].includes(
        record.status,
      )
    ) {
      this.logger.log(
        `Waveform already ${record.status} for track ${trackId} – skipping enqueue`,
      );
      return record.bullJobId ?? '';
    }

    if (!record) {
      record = this.waveformRepo.create({
        trackId,
        status: WaveformStatus.PENDING,
      });
    } else {
      record.status = WaveformStatus.PENDING;
      record.failReason = null;
      record.peaks = null;
    }

    await this.waveformRepo.save(record);

    const job = await this.waveformQueue.add(
      WAVEFORM_JOBS.GENERATE,
      { trackId, audioFilePath },
      {
        jobId: `waveform:${trackId}`,
        attempts: WAVEFORM_JOB_DEFAULTS.ATTEMPTS,
        backoff: {
          type: 'exponential',
          delay: WAVEFORM_JOB_DEFAULTS.BACKOFF_DELAY_MS,
        },
        removeOnComplete: true,
        removeOnFail: false, // keep failed jobs in BullMQ dashboard
      },
    );

    record.bullJobId = job.id ?? null;
    await this.waveformRepo.save(record);

    this.logger.log(
      `Waveform job ${job.id} enqueued for track ${trackId}`,
    );

    return job.id ?? '';
  }

  /**
   * Force-regenerates the waveform for an existing track.
   * Returns 409 if a generation is already in flight.
   */
  async regenerate(trackId: string): Promise<RegenerateResponseDto> {
    const record = await this.waveformRepo.findOne({ where: { trackId } });

    if (!record) {
      throw new NotFoundException(
        `No waveform record found for track ${trackId}`,
      );
    }

    if (
      [WaveformStatus.PENDING, WaveformStatus.PROCESSING].includes(
        record.status,
      )
    ) {
      return { result: 'already_processing', jobId: record.bullJobId ?? undefined };
    }

    // Derive audio path stored during original enqueue – in a real app you
    // would look it up from the tracks table.  Here we re-use the job payload
    // that BullMQ might still hold, or fall back to a placeholder so the
    // worker can re-resolve it.
    const existingJob = record.bullJobId
      ? await this.waveformQueue.getJob(record.bullJobId)
      : null;

    const audioFilePath =
      (existingJob?.data as WaveformJobPayload | null)?.audioFilePath ??
      `__RESOLVE_FROM_TRACK__${trackId}`;

    const jobId = await this.enqueueForTrack(trackId, audioFilePath);
    return { result: 'queued', jobId };
  }

  /**
   * Returns the current status + peaks for a given track.
   */
  async getStatus(trackId: string): Promise<WaveformStatusDto> {
    const record = await this.waveformRepo.findOne({ where: { trackId } });

    if (!record) {
      throw new NotFoundException(
        `No waveform record found for track ${trackId}`,
      );
    }

    return {
      status: record.status,
      peaks: record.peaks ?? undefined,
      attempts: record.attemptCount,
      failReason: record.failReason ?? undefined,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Called by the BullMQ processor – not part of the public HTTP surface
  // -------------------------------------------------------------------------

  async markProcessing(trackId: string): Promise<void> {
    await this.waveformRepo.update(
      { trackId },
      { status: WaveformStatus.PROCESSING },
    );
  }

  async markDone(trackId: string, peaks: number[]): Promise<void> {
    await this.waveformRepo.update(
      { trackId },
      { status: WaveformStatus.DONE, peaks, failReason: null },
    );
    this.logger.log(`Waveform done for track ${trackId} (${peaks.length} peaks)`);
  }

  async markFailed(
    trackId: string,
    reason: string,
    attemptsMade: number,
  ): Promise<void> {
    await this.waveformRepo.update(
      { trackId },
      {
        status: WaveformStatus.FAILED,
        failReason: reason,
        attemptCount: attemptsMade,
      },
    );
    this.logger.error(
      `Waveform FAILED for track ${trackId} after ${attemptsMade} attempts: ${reason}`,
    );
  }

  async incrementAttemptCount(trackId: string): Promise<void> {
    await this.waveformRepo.increment({ trackId }, 'attemptCount', 1);
  }
}
