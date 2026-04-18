import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { CollaborationService } from './collaboration.service';
import { Collaboration, ApprovalStatus, CollaborationRole } from './entities/collaboration.entity';
import { Track } from '../tracks/entities/track.entity';
import { Artist } from '../artists/entities/artist.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InviteCollaboratorsDto } from './dto/invite-collaborators.dto';
import { UpdateCollaborationDto } from './dto/update-collaboration.dto';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

describe('CollaborationService', () => {
  let service: CollaborationService;
  let collaborationRepo: Repository<Collaboration>;
  let trackRepo: Repository<Track>;
  let artistRepo: Repository<Artist>;
  let notificationsService: NotificationsService;
  let eventEmitter: EventEmitter2;
  let dataSource: DataSource;

  const mockArtist = {
    id: 'artist-1',
    userId: 'user-1',
    artistName: 'Test Artist',
    genre: 'Pop',
    bio: 'Test bio',
    walletAddress: 'test-wallet',
    isVerified: false,
    status: 'active',
    totalTipsReceived: '0',
    emailNotifications: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTrack = {
    id: 'track-1',
    title: 'Test Track',
    artist: mockArtist,
    artistId: 'artist-1',
    duration: 180,
    fileUrl: 'test.mp3',
    isPublic: true,
    playCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCollaboration = {
    id: 'collab-1',
    trackId: 'track-1',
    artistId: 'artist-2',
    role: CollaborationRole.FEATURED,
    splitPercentage: 10.5,
    approvalStatus: ApprovalStatus.PENDING,
    invitationMessage: 'Test invite',
    rejectionReason: null,
    respondedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockQueryRunner = {
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
    };

    const mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollaborationService,
        {
          provide: getRepositoryToken(Collaboration),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Track),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Artist),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: NotificationsService,
          useValue: {
            sendCollaborationInvite: jest.fn(),
            sendCollaborationResponse: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CollaborationService>(CollaborationService);
    collaborationRepo = module.get<Repository<Collaboration>>(getRepositoryToken(Collaboration));
    trackRepo = module.get<Repository<Track>>(getRepositoryToken(Track));
    artistRepo = module.get<Repository<Artist>>(getRepositoryToken(Artist));
    notificationsService = module.get<NotificationsService>(NotificationsService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('inviteCollaborators', () => {
    const inviteDto: InviteCollaboratorsDto = {
      trackId: 'track-1',
      collaborators: [
        {
          artistId: 'artist-2',
          role: CollaborationRole.FEATURED,
          splitPercentage: 10.5,
          invitationMessage: 'Test invite',
        },
      ],
    };

    it('should successfully invite collaborators', async () => {
      jest.spyOn(trackRepo, 'findOne').mockResolvedValue(mockTrack as Track);
      jest.spyOn(artistRepo, 'findOne').mockResolvedValue({ ...mockArtist, id: 'artist-2', userId: 'user-2' } as Artist);
      jest.spyOn(collaborationRepo, 'find').mockResolvedValue([]);
      jest.spyOn(collaborationRepo, 'findOne').mockResolvedValue(null);
      jest.spyOn(collaborationRepo, 'create').mockReturnValue(mockCollaboration as Collaboration);

      const result = await service.inviteCollaborators('user-1', inviteDto);

      expect(result).toEqual([mockCollaboration]);
      expect(notificationsService.sendCollaborationInvite).toHaveBeenCalledWith({
        userId: 'user-2',
        trackId: 'track-1',
        trackTitle: 'Test Track',
        invitedBy: 'Test Artist',
        role: CollaborationRole.FEATURED,
        splitPercentage: 10.5,
        message: 'Test invite',
      });
    });

    it('should throw error if track not found', async () => {
      jest.spyOn(trackRepo, 'findOne').mockResolvedValue(null);

      await expect(service.inviteCollaborators('user-1', inviteDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw error if user is not track owner', async () => {
      jest.spyOn(trackRepo, 'findOne').mockResolvedValue(mockTrack as Track);

      await expect(service.inviteCollaborators('user-2', inviteDto)).rejects.toThrow(ForbiddenException);
    });

    it('should throw error if total split exceeds 100%', async () => {
      const highSplitDto = {
        ...inviteDto,
        collaborators: [
          {
            ...inviteDto.collaborators[0],
            splitPercentage: 150,
          },
        ],
      };

      jest.spyOn(trackRepo, 'findOne').mockResolvedValue(mockTrack as Track);

      await expect(service.inviteCollaborators('user-1', highSplitDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw error if artist not found', async () => {
      jest.spyOn(trackRepo, 'findOne').mockResolvedValue(mockTrack as Track);
      jest.spyOn(collaborationRepo, 'find').mockResolvedValue([]);
      jest.spyOn(artistRepo, 'findOne').mockResolvedValue(null);

      await expect(service.inviteCollaborators('user-1', inviteDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw error if trying to invite self', async () => {
      const selfInviteDto = {
        ...inviteDto,
        collaborators: [
          {
            ...inviteDto.collaborators[0],
            artistId: 'artist-1', // Same as track owner
          },
        ],
      };

      jest.spyOn(trackRepo, 'findOne').mockResolvedValue(mockTrack as Track);
      jest.spyOn(artistRepo, 'findOne').mockResolvedValue(mockArtist as Artist);

      await expect(service.inviteCollaborators('user-1', selfInviteDto)).rejects.toThrow(BadRequestException);
    });

    it('should throw error if duplicate invitation', async () => {
      jest.spyOn(trackRepo, 'findOne').mockResolvedValue(mockTrack as Track);
      jest.spyOn(collaborationRepo, 'find').mockResolvedValue([]);
      jest.spyOn(artistRepo, 'findOne').mockResolvedValue({ ...mockArtist, id: 'artist-2', userId: 'user-2' } as Artist);
      jest.spyOn(collaborationRepo, 'findOne').mockResolvedValue(mockCollaboration as Collaboration);

      await expect(service.inviteCollaborators('user-1', inviteDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('respondToInvitation', () => {
    const responseDto: UpdateCollaborationDto = {
      approvalStatus: ApprovalStatus.APPROVED,
      rejectionReason: null,
    };

    it('should successfully approve invitation', async () => {
      const collaborationWithRelations = {
        ...mockCollaboration,
        artist: { ...mockArtist, id: 'artist-2', userId: 'user-2' },
        track: mockTrack,
      };

      jest.spyOn(collaborationRepo, 'findOne').mockResolvedValue(collaborationWithRelations as any);
      jest.spyOn(collaborationRepo, 'save').mockResolvedValue(mockCollaboration as Collaboration);

      const result = await service.respondToInvitation('user-2', 'collab-1', responseDto);

      expect(result).toEqual(mockCollaboration);
      expect(notificationsService.sendCollaborationResponse).toHaveBeenCalledWith({
        userId: 'user-1',
        collaboratorName: 'Test Artist',
        trackTitle: 'Test Track',
        status: ApprovalStatus.APPROVED,
        reason: null,
      });
    });

    it('should throw error if collaboration not found', async () => {
      jest.spyOn(collaborationRepo, 'findOne').mockResolvedValue(null);

      await expect(service.respondToInvitation('user-2', 'collab-1', responseDto)).rejects.toThrow(NotFoundException);
    });

    it('should throw error if user not authorized', async () => {
      const collaborationWithRelations = {
        ...mockCollaboration,
        artist: { ...mockArtist, id: 'artist-2', userId: 'user-3' }, // Different user
        track: mockTrack,
      };

      jest.spyOn(collaborationRepo, 'findOne').mockResolvedValue(collaborationWithRelations as any);

      await expect(service.respondToInvitation('user-2', 'collab-1', responseDto)).rejects.toThrow(ForbiddenException);
    });

    it('should throw error if invitation already responded', async () => {
      const collaborationWithRelations = {
        ...mockCollaboration,
        approvalStatus: ApprovalStatus.APPROVED,
        artist: { ...mockArtist, id: 'artist-2', userId: 'user-2' },
        track: mockTrack,
      };

      jest.spyOn(collaborationRepo, 'findOne').mockResolvedValue(collaborationWithRelations as any);

      await expect(service.respondToInvitation('user-2', 'collab-1', responseDto)).rejects.toThrow(BadRequestException);
    });

    it('should require rejection reason when rejecting', async () => {
      const rejectDto: UpdateCollaborationDto = {
        approvalStatus: ApprovalStatus.REJECTED,
        rejectionReason: null,
      };

      const collaborationWithRelations = {
        ...mockCollaboration,
        artist: { ...mockArtist, id: 'artist-2', userId: 'user-2' },
        track: mockTrack,
      };

      jest.spyOn(collaborationRepo, 'findOne').mockResolvedValue(collaborationWithRelations as any);

      await expect(service.respondToInvitation('user-2', 'collab-1', rejectDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeCollaborator', () => {
    it('should successfully remove collaborator', async () => {
      const collaborationWithRelations = {
        ...mockCollaboration,
        track: mockTrack,
      };

      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
          findOne: jest.fn().mockResolvedValue(collaborationWithRelations),
          remove: jest.fn().mockResolvedValue(mockCollaboration),
        },
      };

      jest.spyOn(dataSource, 'createQueryRunner').mockReturnValue(mockQueryRunner);

      await service.removeCollaborator('user-1', 'collab-1');

      expect(mockQueryRunner.manager.remove).toHaveBeenCalledWith(mockCollaboration);
      expect(eventEmitter.emit).toHaveBeenCalledWith('collaboration.removed', {
        collaborationId: 'collab-1',
        trackId: 'track-1',
        removedBy: 'user-1',
      });
    });

    it('should throw error if collaboration not found', async () => {
      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
          findOne: jest.fn().mockResolvedValue(null),
          remove: jest.fn(),
        },
      };

      jest.spyOn(dataSource, 'createQueryRunner').mockReturnValue(mockQueryRunner);

      await expect(service.removeCollaborator('user-1', 'collab-1')).rejects.toThrow(NotFoundException);
    });

    it('should throw error if user not track owner', async () => {
      const collaborationWithRelations = {
        ...mockCollaboration,
        track: mockTrack,
      };

      const mockQueryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
        manager: {
          findOne: jest.fn().mockResolvedValue(collaborationWithRelations),
          remove: jest.fn(),
        },
      };

      jest.spyOn(dataSource, 'createQueryRunner').mockReturnValue(mockQueryRunner);

      await expect(service.removeCollaborator('user-2', 'collab-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('validateSplitPercentages', () => {
    it('should return valid split information', async () => {
      const mockCollaborations = [
        { ...mockCollaboration, splitPercentage: 10, approvalStatus: ApprovalStatus.APPROVED },
        { ...mockCollaboration, id: 'collab-2', splitPercentage: 15, approvalStatus: ApprovalStatus.APPROVED },
      ];

      jest.spyOn(collaborationRepo, 'find').mockResolvedValue(mockCollaborations as Collaboration[]);

      const result = await service.validateSplitPercentages('track-1');

      expect(result).toEqual({
        isValid: true,
        total: 25,
        remaining: 75,
      });
    });

    it('should return invalid if total exceeds 100%', async () => {
      const mockCollaborations = [
        { ...mockCollaboration, splitPercentage: 60, approvalStatus: ApprovalStatus.APPROVED },
        { ...mockCollaboration, id: 'collab-2', splitPercentage: 50, approvalStatus: ApprovalStatus.APPROVED },
      ];

      jest.spyOn(collaborationRepo, 'find').mockResolvedValue(mockCollaborations as Collaboration[]);

      const result = await service.validateSplitPercentages('track-1');

      expect(result).toEqual({
        isValid: false,
        total: 110,
        remaining: -10,
      });
    });
  });

  describe('getCollaborationStats', () => {
    it('should return collaboration statistics', async () => {
      const mockCollaborations = [
        { ...mockCollaboration, approvalStatus: ApprovalStatus.APPROVED, splitPercentage: 10 },
        { ...mockCollaboration, id: 'collab-2', approvalStatus: ApprovalStatus.PENDING, splitPercentage: 15 },
        { ...mockCollaboration, id: 'collab-3', approvalStatus: ApprovalStatus.REJECTED, splitPercentage: 5 },
      ];

      jest.spyOn(service, 'getTrackCollaborators').mockResolvedValue(mockCollaborations as Collaboration[]);

      const result = await service.getCollaborationStats('track-1');

      expect(result).toEqual({
        total: 3,
        approved: 1,
        pending: 1,
        rejected: 1,
        splitAllocated: 10,
      });
    });
  });
});
