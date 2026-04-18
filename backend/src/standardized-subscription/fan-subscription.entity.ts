import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Check,
} from 'typeorm';
import { SubscriptionTier } from './subscription-tier.entity';

export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  PENDING = 'pending',
}

/**
 * Records a fan's subscription to a specific artist tier.
 *
 * Identity note: `fanUserId` is the User.id of the subscriber — not an
 * artistId. This is intentional: fans subscribe as users, not as artists.
 */
@Entity('fan_subscriptions')
@Index(['fanUserId', 'tierId'], { unique: true })
export class FanSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** User.id of the subscribing fan (canonical user identity). */
  @Column({ type: 'uuid' })
  @Index()
  fanUserId: string;

  @Column({ type: 'uuid' })
  @Index()
  tierId: string;

  @ManyToOne(() => SubscriptionTier, (tier) => tier.subscriptions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tierId' })
  tier: SubscriptionTier;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.PENDING,
  })
  status: SubscriptionStatus;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date;

  /** Stellar transaction ID of the most recent payment. */
  @Column({ nullable: true })
  lastPaymentTxId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
