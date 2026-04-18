import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionsService } from '../subscriptions.service';
import { SubscriptionTier } from '../entities/subscription-tier.entity';
import {
  FanSubscription,
  SubscriptionStatus,
} from '../entities/fan-subscription.entity';
import { AuthenticatedPrincipal } from '../../auth/decorators/current-user.decorator';

// ─── Fixtures ─────────────────────────────────────────────────────────────

const artistPrincipal: AuthenticatedPrincipal = {
  id: 'user-uuid-artist',
  artistId: 'artist-uuid-1',
  walletAddress: 'GART...',
  roles: ['artist'],
};

const otherArtistPrincipal: AuthenticatedPrincipal = {
  id: 'user-uuid-artist-2',
  artistId: 'artist-uuid-2',
  walletAddress: 'GART2...',
  roles: ['artist'],
};

const fanPrincipal: AuthenticatedPrincipal = {
  id: 'user-uuid-fan',
  artistId: undefined,
  walletAddress: 'GFAN...',
  roles: ['fan'],
};

const baseTier: SubscriptionTier = {
  id: 'tier-uuid-1',
  artistId: 'artist-uuid-1',
  name: 'Gold Fan',
  description: 'Early access',
  priceUsdc: '10.0000000',
  billingCycleDays: 30,
  isActive: true,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  subscriptions: Promise.resolve([]),
};

const activeSub: FanSubscription = {
  id: 'sub-uuid-1',
  fanUserId: fanPrincipal.id,
  tierId: baseTier.id,
  tier: baseTier,
  status: SubscriptionStatus.ACTIVE,
  startedAt: new Date(),
  expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ─── Repository mocks ─────────────────────────────────────────────────────

type MockRepo<T> = Partial<jest.Mocked<Repository<T>>>;

const mockTierRepo: MockRepo<SubscriptionTier> = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

const mockFanSubRepo: MockRepo<FanSubscription> = {
  create: jest.fn(),
  save: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
};

// ─── Test suite ───────────────────────────────────────────────────────────

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        {
          provide: getRepositoryToken(SubscriptionTier),
          useValue: mockTierRepo,
        },
        {
          provide: getRepositoryToken(FanSubscription),
          useValue: mockFanSubRepo,
        },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
    jest.clearAllMocks();
  });

  // ─── createTier ──────────────────────────────────────────────────────────

  describe('createTier', () => {
    it('creates and saves a tier using principal.artistId', async () => {
      const dto = { name: 'Gold Fan', priceUsdc: '10.0000000' };
      const built = { ...baseTier };
      (mockTierRepo.create as jest.Mock).mockReturnValue(built);
      (mockTierRepo.save as jest.Mock).mockResolvedValue(built);

      const result = await service.createTier(dto as any, artistPrincipal);

      expect(mockTierRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ artistId: artistPrincipal.artistId }),
      );
      expect(result).toBe(built);
    });

    it('throws ForbiddenException when principal has no artistId', async () => {
      const dto = { name: 'Gold Fan', priceUsdc: '10.0000000' };

      await expect(service.createTier(dto as any, fanPrincipal)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockTierRepo.create).not.toHaveBeenCalled();
    });

    it('applies default billingCycleDays of 30 when not provided', async () => {
      const dto = { name: 'Bronze', priceUsdc: '1.0000000' };
      const built = { ...baseTier };
      (mockTierRepo.create as jest.Mock).mockReturnValue(built);
      (mockTierRepo.save as jest.Mock).mockResolvedValue(built);

      await service.createTier(dto as any, artistPrincipal);

      expect(mockTierRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ billingCycleDays: 30 }),
      );
    });
  });

  // ─── updateTier ──────────────────────────────────────────────────────────

  describe('updateTier', () => {
    it('updates tier when caller is the owning artist', async () => {
      (mockTierRepo.findOne as jest.Mock).mockResolvedValue({ ...baseTier });
      (mockTierRepo.save as jest.Mock).mockImplementation((t) =>
        Promise.resolve(t),
      );

      const result = await service.updateTier(
        baseTier.id,
        { name: 'Platinum Fan' },
        artistPrincipal,
      );

      expect(result.name).toBe('Platinum Fan');
    });

    it('throws ForbiddenException when a different artist tries to update', async () => {
      (mockTierRepo.findOne as jest.Mock).mockResolvedValue({ ...baseTier });

      await expect(
        service.updateTier(baseTier.id, { name: 'Hijacked' }, otherArtistPrincipal),
      ).rejects.toThrow(ForbiddenException);

      expect(mockTierRepo.save).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when a fan tries to update', async () => {
      await expect(
        service.updateTier(baseTier.id, { name: 'Hijacked' }, fanPrincipal),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when tier does not exist', async () => {
      (mockTierRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateTier('bad-uuid', {}, artistPrincipal),
      ).rejects.toThrow(NotFoundException);
    });

    it('uses principal.artistId for ownership — NOT principal.id', async () => {
      // Specifically guard against the bug where artistId was confused with id
      const tierOwnedByArtist2 = { ...baseTier, artistId: 'artist-uuid-2' };
      (mockTierRepo.findOne as jest.Mock).mockResolvedValue(tierOwnedByArtist2);

      // artistPrincipal has artistId='artist-uuid-1', so this should be forbidden
      await expect(
        service.updateTier(baseTier.id, {}, artistPrincipal),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── deleteTier ──────────────────────────────────────────────────────────

  describe('deleteTier', () => {
    it('deletes tier when caller is the owning artist', async () => {
      (mockTierRepo.findOne as jest.Mock).mockResolvedValue({ ...baseTier });
      (mockTierRepo.remove as jest.Mock).mockResolvedValue(undefined);

      await service.deleteTier(baseTier.id, artistPrincipal);

      expect(mockTierRepo.remove).toHaveBeenCalledWith(
        expect.objectContaining({ id: baseTier.id }),
      );
    });

    it('throws ForbiddenException when a non-owner artist tries to delete', async () => {
      (mockTierRepo.findOne as jest.Mock).mockResolvedValue({ ...baseTier });

      await expect(
        service.deleteTier(baseTier.id, otherArtistPrincipal),
      ).rejects.toThrow(ForbiddenException);

      expect(mockTierRepo.remove).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException for fans', async () => {
      await expect(
        service.deleteTier(baseTier.id, fanPrincipal),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── subscribe ───────────────────────────────────────────────────────────

  describe('subscribe', () => {
    it('creates a fan subscription using principal.id as fanUserId', async () => {
      (mockTierRepo.findOne as jest.Mock).mockResolvedValue({ ...baseTier });
      (mockFanSubRepo.findOne as jest.Mock).mockResolvedValue(null); // no existing sub
      const built = { ...activeSub };
      (mockFanSubRepo.create as jest.Mock).mockReturnValue(built);
      (mockFanSubRepo.save as jest.Mock).mockResolvedValue(built);

      const result = await service.subscribe(baseTier.id, {}, fanPrincipal);

      expect(mockFanSubRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          fanUserId: fanPrincipal.id, // must be principal.id, not artistId
          tierId: baseTier.id,
          status: SubscriptionStatus.ACTIVE,
        }),
      );
      expect(result.fanUserId).toBe(fanPrincipal.id);
    });

    it('never uses principal.artistId as the fan identity', async () => {
      (mockTierRepo.findOne as jest.Mock).mockResolvedValue({ ...baseTier });
      (mockFanSubRepo.findOne as jest.Mock).mockResolvedValue(null);
      (mockFanSubRepo.create as jest.Mock).mockReturnValue(activeSub);
      (mockFanSubRepo.save as jest.Mock).mockResolvedValue(activeSub);

      // Even if an artist subscribes to another tier, the identity is .id not .artistId
      await service.subscribe(baseTier.id, {}, artistPrincipal);

      const [createArgs] = (mockFanSubRepo.create as jest.Mock).mock.calls[0];
      expect(createArgs.fanUserId).toBe(artistPrincipal.id);
      expect(createArgs.fanUserId).not.toBe(artistPrincipal.artistId);
    });

    it('throws ConflictException when fan already has an active subscription', async () => {
      (mockTierRepo.findOne as jest.Mock).mockResolvedValue({ ...baseTier });
      (mockFanSubRepo.findOne as jest.Mock).mockResolvedValue(activeSub);

      await expect(
        service.subscribe(baseTier.id, {}, fanPrincipal),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when tier is inactive', async () => {
      (mockTierRepo.findOne as jest.Mock).mockResolvedValue({
        ...baseTier,
        isActive: false,
      });

      await expect(
        service.subscribe(baseTier.id, {}, fanPrincipal),
      ).rejects.toThrow(ConflictException);
    });

    it('stores paymentTxId when provided', async () => {
      (mockTierRepo.findOne as jest.Mock).mockResolvedValue({ ...baseTier });
      (mockFanSubRepo.findOne as jest.Mock).mockResolvedValue(null);
      (mockFanSubRepo.create as jest.Mock).mockReturnValue(activeSub);
      (mockFanSubRepo.save as jest.Mock).mockResolvedValue(activeSub);

      await service.subscribe(baseTier.id, { paymentTxId: 'txid-abc' }, fanPrincipal);

      expect(mockFanSubRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ lastPaymentTxId: 'txid-abc' }),
      );
    });
  });

  // ─── cancelSubscription ──────────────────────────────────────────────────

  describe('cancelSubscription', () => {
    it('cancels the subscription when caller is the subscribing fan', async () => {
      const sub = { ...activeSub };
      (mockFanSubRepo.findOne as jest.Mock).mockResolvedValue(sub);
      (mockFanSubRepo.save as jest.Mock).mockImplementation((s) =>
        Promise.resolve(s),
      );

      const result = await service.cancelSubscription(sub.id, fanPrincipal);

      expect(result.status).toBe(SubscriptionStatus.CANCELLED);
    });

    it('throws ForbiddenException when a different user tries to cancel', async () => {
      (mockFanSubRepo.findOne as jest.Mock).mockResolvedValue({ ...activeSub });

      const intruder: AuthenticatedPrincipal = {
        id: 'user-uuid-intruder',
        walletAddress: 'GINT...',
        roles: ['fan'],
      };

      await expect(
        service.cancelSubscription(activeSub.id, intruder),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ConflictException when subscription is already cancelled', async () => {
      (mockFanSubRepo.findOne as jest.Mock).mockResolvedValue({
        ...activeSub,
        status: SubscriptionStatus.CANCELLED,
      });

      await expect(
        service.cancelSubscription(activeSub.id, fanPrincipal),
      ).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when subscription does not exist', async () => {
      (mockFanSubRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.cancelSubscription('bad-uuid', fanPrincipal),
      ).rejects.toThrow(NotFoundException);
    });

    it('uses fanUserId (principal.id) for ownership — not artistId', async () => {
      // Sub belongs to fanPrincipal (id = 'user-uuid-fan')
      // artistPrincipal has id = 'user-uuid-artist' → should be forbidden even though they have an artistId
      (mockFanSubRepo.findOne as jest.Mock).mockResolvedValue({ ...activeSub });

      await expect(
        service.cancelSubscription(activeSub.id, artistPrincipal),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── mySubscriptions ─────────────────────────────────────────────────────

  describe('mySubscriptions', () => {
    it('returns subscriptions filtered by principal.id', async () => {
      (mockFanSubRepo.find as jest.Mock).mockResolvedValue([activeSub]);

      const result = await service.mySubscriptions(fanPrincipal);

      expect(mockFanSubRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { fanUserId: fanPrincipal.id },
        }),
      );
      expect(result).toEqual([activeSub]);
    });
  });

  // ─── findTiersByArtist ───────────────────────────────────────────────────

  describe('findTiersByArtist', () => {
    it('returns active tiers for the given artistId', async () => {
      (mockTierRepo.find as jest.Mock).mockResolvedValue([baseTier]);

      const result = await service.findTiersByArtist('artist-uuid-1');

      expect(mockTierRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { artistId: 'artist-uuid-1', isActive: true },
        }),
      );
      expect(result).toEqual([baseTier]);
    });
  });
});
