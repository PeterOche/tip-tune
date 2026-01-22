import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tip, TipStatus } from './entities/tip.entity';
import { CreateTipDto } from './dto/create-tip.dto';
import { PaginationQueryDto, PaginatedResponseDto } from './dto/pagination.dto';

@Injectable()
export class TipsService {
  constructor(
    @InjectRepository(Tip)
    private readonly tipRepository: Repository<Tip>,
  ) {}

  async create(createTipDto: CreateTipDto): Promise<Tip> {
    // Check if stellar transaction hash already exists
    const existingTip = await this.tipRepository.findOne({
      where: { stellarTxHash: createTipDto.stellarTxHash },
    });

    if (existingTip) {
      throw new ConflictException('Tip with this Stellar transaction hash already exists');
    }

    // Validate that fromUserId and toArtistId are different
    if (createTipDto.fromUserId === createTipDto.toArtistId) {
      throw new BadRequestException('Cannot tip yourself');
    }

    const tip = this.tipRepository.create(createTipDto);
    return this.tipRepository.save(tip);
  }

  async findOne(id: string): Promise<Tip> {
    const tip = await this.tipRepository.findOne({
      where: { id },
      relations: ['fromUser', 'toArtist', 'track'],
    });

    if (!tip) {
      throw new NotFoundException(`Tip with ID ${id} not found`);
    }

    return tip;
  }

  async getUserTipHistory(
    userId: string,
    paginationQuery: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<Tip>> {
    const { page = 1, limit = 10, status } = paginationQuery;
    const skip = (page - 1) * limit;

    const queryBuilder = this.tipRepository
      .createQueryBuilder('tip')
      .leftJoinAndSelect('tip.toArtist', 'artist')
      .leftJoinAndSelect('tip.track', 'track')
      .where('tip.fromUserId = :userId', { userId })
      .orderBy('tip.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (status) {
      queryBuilder.andWhere('tip.status = :status', { status });
    }

    const [data, total] = await queryBuilder.getManyAndCount();

    return this.createPaginatedResponse(data, total, page, limit);
  }

  async getArtistReceivedTips(
    artistId: string,
    paginationQuery: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<Tip>> {
    const { page = 1, limit = 10, status } = paginationQuery;
    const skip = (page - 1) * limit;

    const queryBuilder = this.tipRepository
      .createQueryBuilder('tip')
      .leftJoinAndSelect('tip.fromUser', 'user')
      .leftJoinAndSelect('tip.track', 'track')
      .where('tip.toArtistId = :artistId', { artistId })
      .orderBy('tip.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (status) {
      queryBuilder.andWhere('tip.status = :status', { status });
    }

    const [data, total] = await queryBuilder.getManyAndCount();

    return this.createPaginatedResponse(data, total, page, limit);
  }

  async updateTipStatus(id: string, status: TipStatus): Promise<Tip> {
    const tip = await this.findOne(id);
    tip.status = status;
    return this.tipRepository.save(tip);
  }

  async getTipsByTrack(
    trackId: string,
    paginationQuery: PaginationQueryDto,
  ): Promise<PaginatedResponseDto<Tip>> {
    const { page = 1, limit = 10, status } = paginationQuery;
    const skip = (page - 1) * limit;

    const queryBuilder = this.tipRepository
      .createQueryBuilder('tip')
      .leftJoinAndSelect('tip.fromUser', 'user')
      .leftJoinAndSelect('tip.toArtist', 'artist')
      .where('tip.trackId = :trackId', { trackId })
      .orderBy('tip.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (status) {
      queryBuilder.andWhere('tip.status = :status', { status });
    }

    const [data, total] = await queryBuilder.getManyAndCount();

    return this.createPaginatedResponse(data, total, page, limit);
  }

  async getArtistTipStats(artistId: string): Promise<{
    totalTips: number;
    totalAmount: number;
    totalUsdValue: number;
    averageTip: number;
  }> {
    const result = await this.tipRepository
      .createQueryBuilder('tip')
      .select('COUNT(*)', 'totalTips')
      .addSelect('SUM(tip.amount)', 'totalAmount')
      .addSelect('SUM(tip.usdValue)', 'totalUsdValue')
      .addSelect('AVG(tip.amount)', 'averageTip')
      .where('tip.toArtistId = :artistId', { artistId })
      .andWhere('tip.status = :status', { status: TipStatus.COMPLETED })
      .getRawOne();

    return {
      totalTips: parseInt(result.totalTips) || 0,
      totalAmount: parseFloat(result.totalAmount) || 0,
      totalUsdValue: parseFloat(result.totalUsdValue) || 0,
      averageTip: parseFloat(result.averageTip) || 0,
    };
  }

  private createPaginatedResponse<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
  ): PaginatedResponseDto<T> {
    const totalPages = Math.ceil(total / limit);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }
}