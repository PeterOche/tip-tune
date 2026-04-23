import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import {
  TrackWaveform,
  GenerationStatus,
} from "./entities/track-waveform.entity";
import {
  WAVEFORM_JOB_DEFAULTS,
  WAVEFORM_JOBS,
  WAVEFORM_QUEUE,
} from "./waveform.constants";
import { WaveformStatusDto, RegenerateResponseDto } from "./dto/waveform.dto";

export interface WaveformJobPayload {
  trackId: string;
  audioFilePath: string;
  dataPoints: number;
}

@Injectable()
export class WaveformService {
  private readonly logger = new Logger(WaveformService.name);

  constructor(
    @InjectRepository(TrackWaveform)
    private waveformRepository: Repository<TrackWaveform>,
    @InjectQueue(WAVEFORM_QUEUE)
    private readonly waveformQueue: Queue<WaveformJobPayload>,
  ) {}

  /**
   * Enqueues a waveform generation job.
   */
  async enqueueForTrack(
    trackId: string,
    audioFilePath: string,
    dataPoints: number = 200,
  ): Promise<string> {
    let record = await this.waveformRepository.findOne({ where: { trackId } });

    if (
      record &&
      [GenerationStatus.PENDING, GenerationStatus.PROCESSING].includes(
        record.generationStatus,
      )
    ) {
      this.logger.log(
        `Waveform already ${record.generationStatus} for track ${trackId} – skipping enqueue`,
      );
      return record.bullJobId ?? "";
    }

    if (!record) {
      record = this.waveformRepository.create({
        trackId,
        dataPoints,
        generationStatus: GenerationStatus.PENDING,
      });
    } else {
      record.generationStatus = GenerationStatus.PENDING;
      record.failReason = null;
      record.waveformData = [];
      record.dataPoints = dataPoints;
    }

    await this.waveformRepository.save(record);

    const job = await this.waveformQueue.add(
      WAVEFORM_JOBS.GENERATE,
      { trackId, audioFilePath, dataPoints },
      {
        jobId: `waveform:${trackId}`,
        attempts: WAVEFORM_JOB_DEFAULTS.ATTEMPTS,
        backoff: {
          type: "exponential",
          delay: WAVEFORM_JOB_DEFAULTS.BACKOFF_DELAY_MS,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    record.bullJobId = job.id ?? null;
    await this.waveformRepository.save(record);

    this.logger.log(`Waveform job ${job.id} enqueued for track ${trackId}`);

    return job.id ?? "";
  }

  /**
   * Force-regenerates the waveform for an existing track.
   */
  async regenerate(
    trackId: string,
    audioFilePath: string,
  ): Promise<RegenerateResponseDto> {
    const record = await this.waveformRepository.findOne({ where: { trackId } });

    if (!record) {
      throw new NotFoundException(
        `No waveform record found for track ${trackId}`,
      );
    }

    if (
      [GenerationStatus.PENDING, GenerationStatus.PROCESSING].includes(
        record.generationStatus,
      )
    ) {
      return {
        result: "already_processing",
        jobId: record.bullJobId ?? undefined,
      };
    }

    const jobId = await this.enqueueForTrack(
      trackId,
      audioFilePath,
      record.dataPoints,
    );
    return { result: "queued", jobId };
  }

  async getByTrackId(trackId: string): Promise<TrackWaveform> {
    const waveform = await this.waveformRepository.findOne({
      where: { trackId },
    });
    if (!waveform) {
      throw new NotFoundException(`Waveform not found for track ${trackId}`);
    }
    return waveform;
  }

  async getStatus(trackId: string): Promise<WaveformStatusDto> {
    const record = await this.waveformRepository.findOne({
      where: { trackId },
    });

    if (!record) {
      throw new NotFoundException(
        `No waveform record found for track ${trackId}`,
      );
    }

    return {
      status: record.generationStatus,
      waveformData: record.waveformData ?? undefined,
      attempts: record.attemptCount,
      failReason: record.failReason ?? undefined,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Worker methods
  // -------------------------------------------------------------------------

  async markProcessing(trackId: string): Promise<void> {
    await this.waveformRepository.update(
      { trackId },
      { generationStatus: GenerationStatus.PROCESSING },
    );
  }

  async markDone(trackId: string, peaks: number[]): Promise<void> {
    await this.waveformRepository.update(
      { trackId },
      {
        generationStatus: GenerationStatus.COMPLETED,
        waveformData: peaks,
        failReason: null,
      },
    );
    this.logger.log(
      `Waveform done for track ${trackId} (${peaks.length} peaks)`,
    );
  }

  async markFailed(
    trackId: string,
    reason: string,
    attemptsMade: number,
  ): Promise<void> {
    await this.waveformRepository.update(
      { trackId },
      {
        generationStatus: GenerationStatus.FAILED,
        failReason: reason,
        attemptCount: attemptsMade,
      },
    );
    this.logger.error(
      `Waveform FAILED for track ${trackId} after ${attemptsMade} attempts: ${reason}`,
    );
  }

  async incrementAttemptCount(trackId: string): Promise<void> {
    await this.waveformRepository.increment({ trackId }, "attemptCount", 1);
  }
}
