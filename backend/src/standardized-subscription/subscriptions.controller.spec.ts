import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SubscriptionsController } from '../subscriptions.controller';
import { SubscriptionsService } from '../subscriptions.service';
import { CreateSubscriptionTierDto } from '../dto/create-subscription-tier.dto';
import { UpdateSubscriptionTierDto } from '../dto/update-subscription-tier.dto';
import { SubscribeFanDto } from '../dto/subscribe-fan.dto';
import { AuthenticatedPrincipal } from '../../auth/decorators/current-user.decorator';
import { SubscriptionTier } from '../entities/subscription-tier.entity';
import {
  FanSubscription,
  SubscriptionStatus,
} from '../entities/fan-subscription.entity';

// ─── Fixtures ─────────────────────────────────────────────────────────────

const artistPrincipal: AuthenticatedPrincipal = {
  id: 'user-uuid-artist',
  artistId: 'artist-uuid-1',
  walletAddress: 'GART...',
  roles: ['artist'],
};

const fanPrincipal: AuthenticatedPrincipal = {
  id: 'user-uuid-fan',
  artistId: undefined, // fans have no artistId
  walletAddress: 'GFAN...',
  roles: ['fan'],
};

const mockTier: SubscriptionTier = {
  id: 'tier-uuid-1',
  artistId: 'artist-uuid-1',
  name: 'Gold Fan',
  description: 'Early access',
  priceUsdc: '10.0000000',
  billingCycleDays: 30,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  subscriptions: Promise.resolve([]),
};

const mockFanSub: FanSubscription = {
  id: 'sub-uuid-1',
  fanUserId: fanPrincipal.id,
  tierId: mockTier.id,
  tier: mockTier,
  status: SubscriptionStatus.ACTIVE,
  startedAt: new Date(),
  expiresAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── Mock service ─────────────────────────────────────────────────────────

const mockService: jest.Mocked<SubscriptionsService> = {
  createTier: jest.fn(),
  findTiersByArtist: jest.fn(),
  findOneTier: jest.fn(),
  updateTier: jest.fn(),
  deactivateTier: jest.fn(),
  deleteTier: jest.fn(),
  subscribe: jest.fn(),
  cancelSubscription: jest.fn(),
  mySubscriptions: jest.fn(),
} as any;

// ─── Helper: bypass AuthGuard ─────────────────────────────────────────────

const mockAuthGuard = { canActivate: (_ctx: ExecutionContext) => true };

// ─── Test suite ───────────────────────────────────────────────────────────

describe('SubscriptionsController', () => {
  let controller: SubscriptionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [{ provide: SubscriptionsService, useValue: mockService }],
    })
      .overrideGuard(AuthGuard('wallet-jwt'))
      .useValue(mockAuthGuard)
      .compile();

    controller = module.get<SubscriptionsController>(SubscriptionsController);
    jest.clearAllMocks();
  });

  // ─── Artist tier CRUD ────────────────────────────────────────────────────

  describe('POST / (createTier)', () => {
    it('delegates to service with the artist principal', async () => {
      const dto: CreateSubscriptionTierDto = {
        name: 'Gold Fan',
        priceUsdc: '10.0000000',
      };
      mockService.createTier.mockResolvedValue(mockTier);

      const result = await controller.createTier(dto, artistPrincipal);

      expect(mockService.createTier).toHaveBeenCalledWith(dto, artistPrincipal);
      expect(result).toBe(mockTier);
    });

    it('never injects artistId from body — service receives only dto + principal', async () => {
      // The controller should not spread/override artistId from anywhere
      const dto: CreateSubscriptionTierDto = {
        name: 'Silver Fan',
        priceUsdc: '5.0000000',
      };
      mockService.createTier.mockResolvedValue(mockTier);

      await controller.createTier(dto, artistPrincipal);

      const [receivedDto, receivedPrincipal] = mockService.createTier.mock.calls[0];
      // artistId comes from principal — not from dto
      expect((receivedDto as any).artistId).toBeUndefined();
      expect(receivedPrincipal.artistId).toBe('artist-uuid-1');
    });
  });

  describe('GET /artist/:artistId (findTiersByArtist)', () => {
    it('returns tiers without requiring auth', async () => {
      mockService.findTiersByArtist.mockResolvedValue([mockTier]);

      const result = await controller.findTiersByArtist('artist-uuid-1');

      expect(mockService.findTiersByArtist).toHaveBeenCalledWith('artist-uuid-1');
      expect(result).toEqual([mockTier]);
    });
  });

  describe('GET /:tierId (findOneTier)', () => {
    it('returns the tier for any caller', async () => {
      mockService.findOneTier.mockResolvedValue(mockTier);

      const result = await controller.findOneTier('tier-uuid-1');

      expect(result).toBe(mockTier);
    });
  });

  describe('PATCH /:tierId (updateTier)', () => {
    it('forwards dto and principal to service', async () => {
      const dto: UpdateSubscriptionTierDto = { name: 'Platinum Fan' };
      mockService.updateTier.mockResolvedValue({ ...mockTier, name: 'Platinum Fan' });

      const result = await controller.updateTier('tier-uuid-1', dto, artistPrincipal);

      expect(mockService.updateTier).toHaveBeenCalledWith(
        'tier-uuid-1',
        dto,
        artistPrincipal,
      );
      expect(result.name).toBe('Platinum Fan');
    });

    it('does NOT mix req.user.id into the ownership check — that is the service job', () => {
      // The controller must not pass `principal.id` in place of `principal.artistId`.
      // We verify the service is always called with the full principal object.
      const dto: UpdateSubscriptionTierDto = { priceUsdc: '12.0000000' };
      mockService.updateTier.mockResolvedValue(mockTier);

      controller.updateTier('tier-uuid-1', dto, artistPrincipal);

      const [, , p] = mockService.updateTier.mock.calls[0];
      expect(p).toStrictEqual(artistPrincipal);
      // The controller should not strip or mutate the principal
      expect(p.artistId).toBe('artist-uuid-1');
      expect(p.id).toBe('user-uuid-artist');
    });
  });

  describe('DELETE /:tierId (deleteTier)', () => {
    it('calls service.deleteTier and returns void', async () => {
      mockService.deleteTier.mockResolvedValue(undefined);

      const result = await controller.deleteTier('tier-uuid-1', artistPrincipal);

      expect(mockService.deleteTier).toHaveBeenCalledWith(
        'tier-uuid-1',
        artistPrincipal,
      );
      expect(result).toBeUndefined();
    });
  });

  // ─── Fan subscription flows ───────────────────────────────────────────────

  describe('POST /:tierId/subscribe (subscribe)', () => {
    it('passes the fan principal (not artistPrincipal) to service', async () => {
      const dto: SubscribeFanDto = { paymentTxId: 'txid123' };
      mockService.subscribe.mockResolvedValue(mockFanSub);

      const result = await controller.subscribe('tier-uuid-1', dto, fanPrincipal);

      expect(mockService.subscribe).toHaveBeenCalledWith(
        'tier-uuid-1',
        dto,
        fanPrincipal,
      );
      expect(result.fanUserId).toBe(fanPrincipal.id);
    });

    it('does NOT pass req.user.artistId as the fan identity — principal.id is canonical', async () => {
      const dto: SubscribeFanDto = {};
      mockService.subscribe.mockResolvedValue(mockFanSub);

      await controller.subscribe('tier-uuid-1', dto, fanPrincipal);

      const [, , p] = mockService.subscribe.mock.calls[0];
      // fan identity is p.id, not p.artistId
      expect(p.id).toBe('user-uuid-fan');
      expect(p.artistId).toBeUndefined();
    });
  });

  describe('DELETE /subscriptions/:subscriptionId/cancel (cancelSubscription)', () => {
    it('forwards subscriptionId and principal to service', async () => {
      mockService.cancelSubscription.mockResolvedValue({
        ...mockFanSub,
        status: SubscriptionStatus.CANCELLED,
      });

      const result = await controller.cancelSubscription('sub-uuid-1', fanPrincipal);

      expect(mockService.cancelSubscription).toHaveBeenCalledWith(
        'sub-uuid-1',
        fanPrincipal,
      );
      expect(result.status).toBe(SubscriptionStatus.CANCELLED);
    });
  });

  describe('GET /me/subscriptions (mySubscriptions)', () => {
    it("returns the fan's own subscriptions using principal.id", async () => {
      mockService.mySubscriptions.mockResolvedValue([mockFanSub]);

      const result = await controller.mySubscriptions(fanPrincipal);

      expect(mockService.mySubscriptions).toHaveBeenCalledWith(fanPrincipal);
      expect(result).toEqual([mockFanSub]);
    });
  });
});
