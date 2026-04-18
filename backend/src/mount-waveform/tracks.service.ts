import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WaveformService } from '../waveform/waveform.service';
import { CreateTrackDto } from './dto/create-track.dto';
import { TrackEntity } from './track.entity';

/**
 * TracksService owns the track lifecycle and delegates waveform generation
 * to WaveformService – no direct queue interaction here.
 *
 * Key change: `createTrack` now calls `waveformService.enqueueForTrack`
 * after persisting the track, replacing any fire-and-forget setTimeout that
 * may have existed.
 */
@Injectable()
export class TracksService {
  private readonly logger = new Logger(TracksService.name);

  constructor(
    @InjectRepository(TrackEntity)
    private readonly trackRepo: Repository<TrackEntity>,

    // Injected from WaveformModule (exported).
    private readonly waveformService: WaveformService,
  ) {}

  async createTrack(dto: CreateTrackDto): Promise<TrackEntity> {
    const track = this.trackRepo.create(dto);
    await this.trackRepo.save(track);

    this.logger.log(`Track ${track.id} created – enqueuing waveform generation`);

    // Durable – survives process restarts.  No setTimeout.
    await this.waveformService.enqueueForTrack(track.id, track.audioFilePath);

    return track;
  }

  async findOne(id: string): Promise<TrackEntity> {
    const track = await this.trackRepo.findOne({ where: { id } });
    if (!track) throw new NotFoundException(`Track ${id} not found`);
    return track;
  }

  async findAll(): Promise<TrackEntity[]> {
    return this.trackRepo.find();
  }
}
