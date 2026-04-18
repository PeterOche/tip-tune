import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WaveformGeneratorService } from './waveform-generator.service';
import { WaveformController } from './waveform.controller';
import { WAVEFORM_QUEUE } from './waveform.constants';
import { WaveformEntity } from './waveform.entity';
import { WaveformProcessor } from './waveform.processor';
import { WaveformService } from './waveform.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([WaveformEntity]),

    // Register the BullMQ queue.  The shared Redis connection is configured
    // once in AppModule via BullModule.forRootAsync.
    BullModule.registerQueue({ name: WAVEFORM_QUEUE }),
  ],
  controllers: [WaveformController],
  providers: [WaveformService, WaveformGeneratorService, WaveformProcessor],
  // Export WaveformService so TracksModule can call enqueueForTrack on
  // track creation without creating a circular dependency.
  exports: [WaveformService],
})
export class WaveformModule {}
