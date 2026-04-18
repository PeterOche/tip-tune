import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DeadLetter } from "./entities/dead-letter.entity";
import { PrometheusService } from "../metrics/services/prometheus.service";
import { EventEmitter2 } from "@nestjs/event-emitter";

@Injectable()
export class DlqService {
  private readonly logger = new Logger(DlqService.name);

  constructor(
    @InjectRepository(DeadLetter)
    private readonly dlqRepo: Repository<DeadLetter>,
    private readonly prometheus: PrometheusService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createEntry(opts: {
    jobType: string;
    jobId?: string | null;
    payload?: any;
    lastError?: string | null;
    retryCount?: number;
    recoveryMetadata?: any | null;
  }) {
    const entry = this.dlqRepo.create({
      jobType: opts.jobType,
      jobId: opts.jobId ?? null,
      payload: opts.payload ?? null,
      lastError: opts.lastError ?? null,
      retryCount: opts.retryCount ?? 0,
      recoveryMetadata: opts.recoveryMetadata ?? null,
    });

    const saved = await this.dlqRepo.save(entry);
    // Update metrics
    try {
      this.prometheus.dlqExhaustedTotal.inc({ job_type: opts.jobType }, 1);
      const count = await this.dlqRepo.count();
      this.prometheus.dlqSize.set({ job_type: opts.jobType }, count);
    } catch (err) {
      this.logger.error("Failed updating DLQ metrics", err);
    }

    // Emit event for alerting/consumers
    this.eventEmitter.emit("dlq.job_exhausted", {
      id: saved.id,
      jobType: saved.jobType,
      jobId: saved.jobId,
      retryCount: saved.retryCount,
      exhaustedAt: saved.exhaustedAt,
    });

    this.logger.warn(`Job moved to DLQ: ${saved.jobType} / ${saved.jobId}`);
    return saved;
  }

  async countByType(jobType: string) {
    return this.dlqRepo.count({ where: { jobType } });
  }
}
