import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bullmq";
import { ConfigModule, ConfigService } from "@nestjs/config";

import { TrackWaveform } from "./entities/track-waveform.entity";
import { WaveformService } from "./waveform.service";
import { WaveformController } from "./waveform.controller";
import { WaveformGeneratorService } from "./waveform-generator.service";
import { WaveformProcessor } from "./waveform.processor";
import { TracksModule } from "../tracks/tracks.module";
import { WAVEFORM_QUEUE } from "./waveform.constants";

@Module({
  imports: [
    TypeOrmModule.forFeature([TrackWaveform]),
    BullModule.registerQueueAsync({
      name: WAVEFORM_QUEUE,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>("REDIS_HOST", "localhost"),
          port: configService.get<number>("REDIS_PORT", 6379),
          password: configService.get<string>("REDIS_PASSWORD"),
          db: configService.get<number>("REDIS_DB", 0),
        },
      }),
    }),
    TracksModule,
  ],
  controllers: [WaveformController],
  providers: [
    WaveformService,
    WaveformGeneratorService,
    WaveformProcessor,
  ],
  exports: [WaveformService],
})
export class WaveformModule {}
