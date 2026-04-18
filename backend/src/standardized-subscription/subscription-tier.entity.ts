import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  Check,
} from 'typeorm';
import { FanSubscription } from './fan-subscription.entity';

/**
 * Represents a monetisation tier defined by an artist.
 * e.g. "Gold Fan – 10 USDC/month"
 */
@Entity('subscription_tiers')
@Index(['artistId', 'name'], { unique: true })
export class SubscriptionTier {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK to the Artist profile (not the User). */
  @Column({ type: 'uuid' })
  @Index()
  artistId: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  /**
   * Price in USDC (stored as a decimal string to avoid float precision issues).
   * Must be ≥ 0; 0 is valid for free tiers.
   */
  @Column({ type: 'numeric', precision: 18, scale: 7 })
  @Check(`"price_usdc" >= 0`)
  priceUsdc: string;

  /** Billing cadence in days (e.g. 30 = monthly). */
  @Column({ type: 'int', default: 30 })
  billingCycleDays: number;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => FanSubscription, (sub) => sub.tier, { lazy: true })
  subscriptions: Promise<FanSubscription[]>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
