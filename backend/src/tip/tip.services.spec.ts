import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TipsService } from './tips.service';
import { Tip, TipStatus } from './entities/tip.entity';
import { CreateTipDto } from './dto/create-tip.dto';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';

describe('TipsService', () => {
  let service: TipsService;
  let repository: Repository<Tip>;

  const mockTipRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockTip: Tip = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    fromUserId: '550e8400-e29b-41d4-a716-446655440001',
    toArtistId: '550e8400-e29b-41d4-a716-446655440002',
    trackId: '550e8400-e29b-41d4-a716-446655440003',
    amount: 10.5,
    usdValue: 5.25,
    stellarTxHash: 'abc123def456',
    status: TipStatus.COMPLETED,
    message: 'Great music!',
    createdAt: new Date(),
    fromUser: null,
    toArtist: null,
    track: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TipsService,
        {
          provide: getRepositoryToken(Tip),
          useValue: mockTipRepository,
        },
      ],
    }).compile();

    service = module.get<TipsService>(TipsService);
    repository = module.get<Repository<Tip>>(getRepositoryToken(Tip));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createTipDto: CreateTipDto = {
      fromUserId: '550e8400-e29b-41d4-a716-446655440001',
      toArtistId: '550e8400-e29b-41d4-a716-446655440002',
      trackId: '550e8400-e29b-41d4-a716-446655440003',
      amount: 10.5,
      usdValue: 5.25,
      stellarTxHash: 'abc123def456',
      status: TipStatus.PENDING,
      message: 'Great music!',
    };

    it('should create a tip successfully', async () => {
      mockTipRepository.findOne.mockResolvedValue(null);
      mockTipRepository.create.mockReturnValue(mockTip);
      mockTipRepository.save.mockResolvedValue(mockTip);

      const result = await service.create(createTipDto);

      expect(result).toEqual(mockTip);
      expect(mockTipRepository.findOne).toHaveBeenCalledWith({
        where: { stellarTxHash: createTipDto.stellarTxHash },
      });
      expect(mockTipRepository.create).toHaveBeenCalledWith(createTipDto);
      expect(mockTipRepository.save).toHaveBeenCalledWith(mockTip);
    });

    it('should throw ConflictException if stellar transaction hash already exists', async () => {
      mockTipRepository.findOne.mockResolvedValue(mockTip);

      await expect(service.create(createTipDto)).rejects.toThrow(ConflictException);
      expect(mockTipRepository.save).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if user tries to tip themselves', async () => {
      const selfTipDto = {
        ...createTipDto,
        fromUserId: '550e8400-e29b-41d4-a716-446655440001',
        toArtistId: '550e8400-e29b-41d4-a716-446655440001',
      };

      mockTipRepository.findOne.mockResolvedValue(null);

      await expect(service.create(selfTipDto)).rejects.toThrow(BadRequestException);
      expect(mockTipRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a tip by id', async () => {
      mockTipRepository.findOne.mockResolvedValue(mockTip);

      const result = await service.findOne(mockTip.id);

      expect(result).toEqual(mockTip);
      expect(mockTipRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockTip.id },
        relations: ['fromUser', 'toArtist', 'track'],
      });
    });

    it('should throw NotFoundException if tip not found', async () => {
      mockTipRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUserTipHistory', () => {
    it('should return paginated user tip history', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockTip], 1]),
      };

      mockTipRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getUserTipHistory('user-id', { page: 1, limit: 10 });

      expect(result.data).toEqual([mockTip]);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });
    });

    it('should filter by status when provided', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockTip], 1]),
      };

      mockTipRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      await service.getUserTipHistory('user-id', { 
        page: 1, 
        limit: 10, 
        status: TipStatus.COMPLETED 
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith('tip.status = :status', { 
        status: TipStatus.COMPLETED 
      });
    });
  });

  describe('getArtistReceivedTips', () => {
    it('should return paginated artist received tips', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockTip], 1]),
      };

      mockTipRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getArtistReceivedTips('artist-id', { page: 1, limit: 10 });

      expect(result.data).toEqual([mockTip]);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('getTipsByTrack', () => {
    it('should return paginated tips for a track', async () => {
      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockTip], 1]),
      };

      mockTipRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getTipsByTrack('track-id', { page: 1, limit: 10 });

      expect(result.data).toEqual([mockTip]);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith('tip.trackId = :trackId', { 
        trackId: 'track-id' 
      });
    });
  });

  describe('updateTipStatus', () => {
    it('should update tip status', async () => {
      const updatedTip = { ...mockTip, status: TipStatus.FAILED };
      mockTipRepository.findOne.mockResolvedValue(mockTip);
      mockTipRepository.save.mockResolvedValue(updatedTip);

      const result = await service.updateTipStatus(mockTip.id, TipStatus.FAILED);

      expect(result.status).toBe(TipStatus.FAILED);
      expect(mockTipRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if tip not found', async () => {
      mockTipRepository.findOne.mockResolvedValue(null);

      await expect(service.updateTipStatus('non-existent-id', TipStatus.FAILED))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('getArtistTipStats', () => {
    it('should return artist tip statistics', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalTips: '10',
          totalAmount: '105.5',
          totalUsdValue: '52.75',
          averageTip: '10.55',
        }),
      };

      mockTipRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getArtistTipStats('artist-id');

      expect(result).toEqual({
        totalTips: 10,
        totalAmount: 105.5,
        totalUsdValue: 52.75,
        averageTip: 10.55,
      });
    });

    it('should handle zero tips', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({
          totalTips: null,
          totalAmount: null,
          totalUsdValue: null,
          averageTip: null,
        }),
      };

      mockTipRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.getArtistTipStats('artist-id');

      expect(result).toEqual({
        totalTips: 0,
        totalAmount: 0,
        totalUsdValue: 0,
        averageTip: 0,
      });
    });
  });
});