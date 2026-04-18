import { Test } from "@nestjs/testing";
import { DlqService } from "../src/queue/dlq.service";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DeadLetter } from "../src/queue/entities/dead-letter.entity";
import { PrometheusService } from "../src/metrics/services/prometheus.service";
import { EventEmitter2 } from "@nestjs/event-emitter";

describe("DLQ Service", () => {
  let dlqService: DlqService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: "sqlite",
          database: ":memory:",
          entities: [DeadLetter],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([DeadLetter]),
      ],
      providers: [DlqService, PrometheusService, EventEmitter2],
    }).compile();

    dlqService = module.get(DlqService);
  });

  it("should create DLQ entry and return saved record", async () => {
    const entry = await dlqService.createEntry({
      jobType: "test_job",
      jobId: "job-1",
      payload: { foo: "bar" },
      lastError: "boom",
      retryCount: 3,
      recoveryMetadata: { attempt: 3 },
    });

    expect(entry).toBeDefined();
    expect(entry.jobType).toBe("test_job");
    expect(entry.jobId).toBe("job-1");
  });
});
