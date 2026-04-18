import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionTier } from './entities/subscription-tier.entity';
import {
  FanSubscription,
  SubscriptionStatus,
} from './entities/fan-subscription.entity';
import { CreateSubscriptionTierDto } from './dto/create-subscription-tier.dto';
import { UpdateSubscriptionTierDto } from './dto/update-subscription-tier.dto';
import { SubscribeFanDto } from './dto/subscribe-fan.dto';
import { AuthenticatedPrincipal } from '../auth/decorators/current-user.decorator';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(SubscriptionTier)
    private readonly tierRepo: Repository<SubscriptionTier>,
    @InjectRepository(FanSubscription)
    private readonly fanSubRepo: Repository<FanSubscription>,
  ) {}

  // ─── Artist-side tier CRUD ────────────────────────────────────────────────

  /**
   * Create a new subscription tier owned by the authenticated artist.
   *
   * @param principal - the JWT principal; must have an artistId.
   */
  async createTier(
    dto: CreateSubscriptionTierDto,
    principal: AuthenticatedPrincipal,
  ): Promise<SubscriptionTier> {
    this.requireArtist(principal);

    const tier = this.tierRepo.create({
      ...dto,
      artistId: principal.artistId!,
      billingCycleDays: dto.billingCycleDays ?? 30,
      isActive: dto.isActive ?? true,
    });

    return this.tierRepo.save(tier);
  }

  /**
   * List all tiers belonging to a given artist profile (public read).
   */
  async findTiersByArtist(artistId: string): Promise<SubscriptionTier[]> {
    return this.tierRepo.find({
      where: { artistId, isActive: true },
      order: { priceUsdc: 'ASC' },
    });
  }

  /**
   * Get a single tier by ID (public read).
   */
  async findOneTier(tierId: string): Promise<SubscriptionTier> {
    const tier = await this.tierRepo.findOne({ where: { id: tierId } });
    if (!tier) {
      throw new NotFoundException(`Subscription tier ${tierId} not found`);
    }
    return tier;
  }

  /**
   * Update a tier — only the owning artist may do this.
   */
  async updateTier(
    tierId: string,
    dto: UpdateSubscriptionTierDto,
    principal: AuthenticatedPrincipal,
  ): Promise<SubscriptionTier> {
    this.requireArtist(principal);
    const tier = await this.findOneTier(tierId);
    this.assertTierOwnership(tier, principal);

    Object.assign(tier, dto);
    return this.tierRepo.save(tier);
  }

  /**
   * Soft-delete by marking tier inactive — only the owning artist may do this.
   */
  async deactivateTier(
    tierId: string,
    principal: AuthenticatedPrincipal,
  ): Promise<void> {
    this.requireArtist(principal);
    const tier = await this.findOneTier(tierId);
    this.assertTierOwnership(tier, principal);

    await this.tierRepo.update(tierId, { isActive: false });
    this.logger.log(
      `Tier ${tierId} deactivated by artist ${principal.artistId}`,
    );
  }

  /**
   * Hard-delete a tier — only the owning artist may do this.
   * Cascades to all FanSubscription rows via FK.
   */
  async deleteTier(
    tierId: string,
    principal: AuthenticatedPrincipal,
  ): Promise<void> {
    this.requireArtist(principal);
    const tier = await this.findOneTier(tierId);
    this.assertTierOwnership(tier, principal);

    await this.tierRepo.remove(tier);
    this.logger.log(`Tier ${tierId} deleted by artist ${principal.artistId}`);
  }

  // ─── Fan subscription flows ───────────────────────────────────────────────

  /**
   * Subscribe the authenticated fan to a tier.
   *
   * The fan identity is always `principal.id` (User.id) — never a body param.
   */
  async subscribe(
    tierId: string,
    dto: SubscribeFanDto,
    principal: AuthenticatedPrincipal,
  ): Promise<FanSubscription> {
    const tier = await this.findOneTier(tierId);

    if (!tier.isActive) {
      throw new ConflictException('This subscription tier is no longer active');
    }

    const existing = await this.fanSubRepo.findOne({
      where: {
        fanUserId: principal.id,
        tierId,
        status: SubscriptionStatus.ACTIVE,
      },
    });

    if (existing) {
      throw new ConflictException(
        `You already have an active subscription to tier ${tierId}`,
      );
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + tier.billingCycleDays);

    const sub = this.fanSubRepo.create({
      fanUserId: principal.id, // ← always the canonical user id
      tierId,
      status: SubscriptionStatus.ACTIVE,
      startedAt: now,
      expiresAt,
      lastPaymentTxId: dto.paymentTxId,
    });

    this.logger.log(
      `Fan ${principal.id} subscribed to tier ${tierId} (artist ${tier.artistId})`,
    );

    return this.fanSubRepo.save(sub);
  }

  /**
   * Cancel an active subscription — only the subscribing fan can cancel.
   */
  async cancelSubscription(
    subscriptionId: string,
    principal: AuthenticatedPrincipal,
  ): Promise<FanSubscription> {
    const sub = await this.fanSubRepo.findOne({
      where: { id: subscriptionId },
    });

    if (!sub) {
      throw new NotFoundException(`Subscription ${subscriptionId} not found`);
    }

    // ← ownership: fan can only cancel their own subscription
    if (sub.fanUserId !== principal.id) {
      throw new ForbiddenException(
        'You are not the owner of this subscription',
      );
    }

    if (sub.status === SubscriptionStatus.CANCELLED) {
      throw new ConflictException('Subscription is already cancelled');
    }

    sub.status = SubscriptionStatus.CANCELLED;
    return this.fanSubRepo.save(sub);
  }

  /**
   * List all subscriptions for the authenticated fan.
   */
  async mySubscriptions(principal: AuthenticatedPrincipal): Promise<FanSubscription[]> {
    return this.fanSubRepo.find({
      where: { fanUserId: principal.id },
      relations: ['tier'],
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Guards any artist-only action.
   * Throws ForbiddenException if the principal has no artist profile.
   */
  private requireArtist(principal: AuthenticatedPrincipal): void {
    if (!principal.artistId) {
      throw new ForbiddenException(
        'You must have an artist profile to manage subscription tiers',
      );
    }
  }

  /**
   * Verifies the principal owns the tier by comparing artistIds.
   * Uses artistId (not User.id) because the tier is owned by an Artist row.
   */
  private assertTierOwnership(
    tier: SubscriptionTier,
    principal: AuthenticatedPrincipal,
  ): void {
    if (tier.artistId !== principal.artistId) {
      throw new ForbiddenException(
        `You do not own subscription tier ${tier.id}`,
      );
    }
  }
}
