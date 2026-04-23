import { ApiProperty } from '@nestjs/swagger';
import { GenerationStatus } from '../entities/track-waveform.entity';

export class WaveformStatusDto {
  @ApiProperty({ enum: GenerationStatus })
  status: GenerationStatus;

  @ApiProperty({ type: [Number], required: false })
  waveformData?: number[];

  @ApiProperty()
  attempts: number;

  @ApiProperty({ required: false })
  failReason?: string;

  @ApiProperty()
  updatedAt: string;
}

export class RegenerateResponseDto {
  @ApiProperty({ example: 'queued' })
  result: 'queued' | 'already_processing';

  @ApiProperty({ required: false })
  jobId?: string;
}
