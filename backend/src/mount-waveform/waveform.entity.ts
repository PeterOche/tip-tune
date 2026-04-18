import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WaveformStatus } from './dto/waveform.dto';

@Entity('waveforms')
export class WaveformEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Foreign-key to the tracks table (loose coupling – no FK constraint). */
  @Index()
  @Column({ name: 'track_id', type: 'uuid', unique: true })
  trackId: string;

  @Column({
    type: 'enum',
    enum: WaveformStatus,
    default: WaveformStatus.PENDING,
  })
  status: WaveformStatus;

  /** Normalised peak data stored as a JSON array. */
  @Column({ type: 'jsonb', nullable: true })
  peaks: number[] | null;

  /** How many BullMQ attempts have been consumed. */
  @Column({ name: 'attempt_count', default: 0 })
  attemptCount: number;

  /** Last failure reason forwarded to operators. */
  @Column({ name: 'fail_reason', type: 'text', nullable: true })
  failReason: string | null;

  /** BullMQ job id – lets us correlate queue state with DB row. */
  @Column({ name: 'bull_job_id', type: 'text', nullable: true })
  bullJobId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
