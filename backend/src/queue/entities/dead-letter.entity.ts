import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";

@Entity("dead_letters")
export class DeadLetter {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "varchar" })
  jobType: string;

  @Column({ type: "varchar", nullable: true })
  jobId: string | null;

  @Column({ type: "jsonb", nullable: true })
  payload: any;

  @Column({ type: "text", nullable: true })
  lastError: string | null;

  @Column({ type: "int", default: 0 })
  retryCount: number;

  @Column({ type: "jsonb", nullable: true })
  recoveryMetadata: any | null;

  @CreateDateColumn()
  exhaustedAt: Date;
}
