import { Test, TestingModule } from '@nestjs/testing';
import { CollaborationService } from './collaboration.service';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, CollaborationRole } from './entities/collaboration.entity';

describe('CollaborationService', () => {
  let service: CollaborationService;

  const mockNotificationsService = {
    sendCollaborationInvite: jest.fn(),
    sendCollaborationResponse: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockCollaborationRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
  };

  const mockTrackRepo = {
    findOne: jest.fn(),
  };

  const mockArtistRepo = {
    findOne: jest.fn(),
  };

  const mockDataSource = {
    createQueryRunner: jest.fn().mockReturnValue({
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        save: jest.fn(),
        remove: jest.fn(),
        findOne: jest.fn(),
      },
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollaborationService,
        {
          provide: 'CollaborationRepository',
          useValue: mockCollaborationRepo,
        },
        {
          provide: 'TrackRepository',
          useValue: mockTrackRepo,
        },
        {
          provide: 'ArtistRepository',
          useValue: mockArtistRepo,
        },
        {
          provide: 'DataSource',
          useValue: mockDataSource,
        },
        {
          provide: 'NotificationsService',
          useValue: mockNotificationsService,
        },
        {
          provide: 'EventEmitter2',
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<CollaborationService>(CollaborationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Identity and Permission Tests', () => {
    it('should validate track ownership before inviting collaborators', async () => {
      const mockTrack = {
        id: 'track-1',
        artist: { userId: 'user-1', artistName: 'Artist 1' },
      };

      const inviteDto = {
        trackId: 'track-1',
        collaborators: [{
          artistId: 'artist-2',
          role: CollaborationRole.FEATURED,
          splitPercentage: 10,
        }],
      };

      mockTrackRepo.findOne.mockResolvedValue(mockTrack);

      // Test with wrong user
      await expect(service.inviteCollaborators('user-2', inviteDto))
        .rejects.toThrow(ForbiddenException);

      // Test with correct user
      mockArtistRepo.findOne.mockResolvedValue({ id: 'artist-2', userId: 'user-2' });
      mockCollaborationRepo.find.mockResolvedValue([]);
      mockCollaborationRepo.findOne.mockResolvedValue(null);
      mockCollaborationRepo.create.mockReturnValue({ id: 'collab-1' });
      
      await expect(service.inviteCollaborators('user-1', inviteDto))
        .resolves.toBeDefined();

      expect(mockNotificationsService.sendCollaborationInvite).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-2', // Should use userId, not artistId
        })
      );
    });

    it('should prevent self-invitation', async () => {
      const mockTrack = {
        id: 'track-1',
        artist: { userId: 'user-1', artistName: 'Artist 1' },
      };

      const selfInviteDto = {
        trackId: 'track-1',
        collaborators: [{
          artistId: 'artist-1', // Same as track owner
          role: CollaborationRole.FEATURED,
          splitPercentage: 10,
        }],
      };

      mockTrackRepo.findOne.mockResolvedValue(mockTrack);
      mockArtistRepo.findOne.mockResolvedValue({ id: 'artist-1', userId: 'user-1' });

      await expect(service.inviteCollaborators('user-1', selfInviteDto))
        .rejects.toThrow(BadRequestException);
    });

    it('should validate collaboration response permissions', async () => {
      const mockCollaboration = {
        id: 'collab-1',
        artist: { userId: 'user-2', artistName: 'Artist 2' },
        track: { artist: { userId: 'user-1', artistName: 'Artist 1' } },
        approvalStatus: ApprovalStatus.PENDING,
      };

      const responseDto = {
        approvalStatus: ApprovalStatus.APPROVED,
        rejectionReason: null,
      };

      mockCollaborationRepo.findOne.mockResolvedValue(mockCollaboration);

      // Wrong user trying to respond
      await expect(service.respondToInvitation('user-3', 'collab-1', responseDto))
        .rejects.toThrow(ForbiddenException);

      // Correct user responding
      mockCollaborationRepo.save.mockResolvedValue(mockCollaboration);
      
      await expect(service.respondToInvitation('user-2', 'collab-1', responseDto))
        .resolves.toBeDefined();

      expect(mockNotificationsService.sendCollaborationResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1', // Should notify track owner's userId
        })
      );
    });

    it('should validate removal permissions', async () => {
      const mockCollaboration = {
        id: 'collab-1',
        track: { artist: { userId: 'user-1' } },
        approvalStatus: ApprovalStatus.APPROVED,
      };

      const mockQueryRunner = mockDataSource.createQueryRunner();
      mockQueryRunner.manager.findOne.mockResolvedValue(mockCollaboration);

      // Wrong user trying to remove
      await expect(service.removeCollaborator('user-2', 'collab-1'))
        .rejects.toThrow(ForbiddenException);

      // Correct user removing
      mockQueryRunner.manager.remove.mockResolvedValue(mockCollaboration);
      
      await expect(service.removeCollaborator('user-1', 'collab-1'))
        .resolves.toBeUndefined();
    });
  });

  describe('Split Percentage Validation', () => {
    it('should prevent split total exceeding 100%', async () => {
      const mockTrack = {
        id: 'track-1',
        artist: { userId: 'user-1', artistName: 'Artist 1' },
      };

      const invalidDto = {
        trackId: 'track-1',
        collaborators: [{
          artistId: 'artist-2',
          role: CollaborationRole.FEATURED,
          splitPercentage: 150, // Invalid
        }],
      };

      mockTrackRepo.findOne.mockResolvedValue(mockTrack);

      await expect(service.inviteCollaborators('user-1', invalidDto))
        .rejects.toThrow(BadRequestException);
    });

    it('should ensure primary artist retains minimum split', async () => {
      const mockTrack = {
        id: 'track-1',
        artist: { userId: 'user-1', artistName: 'Artist 1' },
      };

      const highSplitDto = {
        trackId: 'track-1',
        collaborators: [{
          artistId: 'artist-2',
          role: CollaborationRole.FEATURED,
          splitPercentage: 99.99, // Leaves 0.01% for primary artist
        }],
      };

      mockTrackRepo.findOne.mockResolvedValue(mockTrack);

      // This should pass (exactly 0.01% remaining)
      mockArtistRepo.findOne.mockResolvedValue({ id: 'artist-2', userId: 'user-2' });
      mockCollaborationRepo.find.mockResolvedValue([]);
      mockCollaborationRepo.findOne.mockResolvedValue(null);
      mockCollaborationRepo.create.mockReturnValue({ id: 'collab-1' });
      
      await expect(service.inviteCollaborators('user-1', highSplitDto))
        .resolves.toBeDefined();

      // This should fail (leaves 0% for primary artist)
      const noSplitDto = {
        ...highSplitDto,
        collaborators: [{
          ...highSplitDto.collaborators[0],
          splitPercentage: 100, // Leaves 0% for primary artist
        }],
      };

      await expect(service.inviteCollaborators('user-1', noSplitDto))
        .rejects.toThrow(BadRequestException);
    });

    it('should validate individual split bounds', async () => {
      const mockTrack = {
        id: 'track-1',
        artist: { userId: 'user-1', artistName: 'Artist 1' },
      };

      const lowSplitDto = {
        trackId: 'track-1',
        collaborators: [{
          artistId: 'artist-2',
          role: CollaborationRole.FEATURED,
          splitPercentage: 0.005, // Below minimum
        }],
      };

      mockTrackRepo.findOne.mockResolvedValue(mockTrack);

      await expect(service.inviteCollaborators('user-1', lowSplitDto))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('Duplicate Prevention', () => {
    it('should prevent duplicate invitations', async () => {
      const mockTrack = {
        id: 'track-1',
        artist: { userId: 'user-1', artistName: 'Artist 1' },
      };

      const inviteDto = {
        trackId: 'track-1',
        collaborators: [{
          artistId: 'artist-2',
          role: CollaborationRole.FEATURED,
          splitPercentage: 10,
        }],
      };

      mockTrackRepo.findOne.mockResolvedValue(mockTrack);
      mockArtistRepo.findOne.mockResolvedValue({ id: 'artist-2', userId: 'user-2' });
      mockCollaborationRepo.find.mockResolvedValue([]);
      mockCollaborationRepo.findOne.mockResolvedValue({ id: 'existing-collab' }); // Existing collaboration

      await expect(service.inviteCollaborators('user-1', inviteDto))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('Response Validation', () => {
    it('should require rejection reason when declining', async () => {
      const mockCollaboration = {
        id: 'collab-1',
        artist: { userId: 'user-2', artistName: 'Artist 2' },
        track: { artist: { userId: 'user-1', artistName: 'Artist 1' } },
        approvalStatus: ApprovalStatus.PENDING,
      };

      const rejectWithoutReasonDto = {
        approvalStatus: ApprovalStatus.REJECTED,
        rejectionReason: null, // Missing reason
      };

      mockCollaborationRepo.findOne.mockResolvedValue(mockCollaboration);

      await expect(service.respondToInvitation('user-2', 'collab-1', rejectWithoutReasonDto))
        .rejects.toThrow(BadRequestException);
    });

    it('should prevent responding to already responded invitations', async () => {
      const mockCollaboration = {
        id: 'collab-1',
        artist: { userId: 'user-2', artistName: 'Artist 2' },
        track: { artist: { userId: 'user-1', artistName: 'Artist 1' } },
        approvalStatus: ApprovalStatus.APPROVED, // Already responded
      };

      const responseDto = {
        approvalStatus: ApprovalStatus.REJECTED,
        rejectionReason: 'Changed my mind',
      };

      mockCollaborationRepo.findOne.mockResolvedValue(mockCollaboration);

      await expect(service.respondToInvitation('user-2', 'collab-1', responseDto))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('Transactional Safety', () => {
    it('should rollback on invitation failure', async () => {
      const mockQueryRunner = mockDataSource.createQueryRunner();
      
      const mockTrack = {
        id: 'track-1',
        artist: { userId: 'user-1', artistName: 'Artist 1' },
      };

      const inviteDto = {
        trackId: 'track-1',
        collaborators: [{
          artistId: 'artist-2',
          role: CollaborationRole.FEATURED,
          splitPercentage: 10,
        }],
      };

      mockTrackRepo.findOne.mockResolvedValue(mockTrack);
      mockArtistRepo.findOne.mockResolvedValue(null); // Artist not found - will cause failure

      await expect(service.inviteCollaborators('user-1', inviteDto))
        .rejects.toThrow(NotFoundException);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });
});
