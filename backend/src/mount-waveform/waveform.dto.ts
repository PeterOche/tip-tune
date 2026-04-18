import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum WaveformStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  DONE = 'done',
  FAILED = 'failed',
}

export class WaveformStatusDto {
  @ApiProperty({ enum: WaveformStatus })
  status: WaveformStatus;

  @ApiPropertyOptional({ description: 'Peak amplitude data (mono, normalised -1…1)', type: [Number] })
  peaks?: number[];

  @ApiPropertyOptional({ description: 'Number of BullMQ attempts consumed so far' })
  attempts?: number;

  @ApiPropertyOptional({ description: 'Human-readable failure reason for operators' })
  failReason?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp of last status change' })
  updatedAt?: string;
}

export class RegenerateResponseDto {
  @ApiProperty({ example: 'queued' })
  result: 'queued' | 'already_processing';

  @ApiPropertyOptional({ description: 'BullMQ job id' })
  jobId?: string;
}
