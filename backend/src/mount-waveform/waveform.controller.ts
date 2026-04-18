import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Version,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { RegenerateResponseDto, WaveformStatusDto } from './dto/waveform.dto';
import { WaveformService } from './waveform.service';

/**
 * Routes are mounted by AppModule under the global versioned prefix.
 * Final URL: /api/v1/tracks/:trackId/waveform
 *
 * The old hardcoded `/api/waveform` prefix has been removed – routing is
 * driven entirely by the global prefix + version set in main.ts.
 */
@ApiTags('waveform')
@Controller({ path: 'tracks/:trackId/waveform', version: '1' })
export class WaveformController {
  constructor(private readonly waveformService: WaveformService) {}

  // GET /api/v1/tracks/:trackId/waveform
  @Get()
  @ApiOperation({ summary: 'Get waveform status and peak data for a track' })
  @ApiOkResponse({ type: WaveformStatusDto })
  @ApiNotFoundResponse({ description: 'No waveform record exists for track' })
  async getStatus(
    @Param('trackId', ParseUUIDPipe) trackId: string,
  ): Promise<WaveformStatusDto> {
    return this.waveformService.getStatus(trackId);
  }

  // POST /api/v1/tracks/:trackId/waveform/regenerate
  @Post('regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Force-regenerate the waveform for a track',
    description:
      'Enqueues a durable BullMQ job. Returns 200 + already_processing if ' +
      'a job is already in flight.',
  })
  @ApiOkResponse({ type: RegenerateResponseDto })
  @ApiNotFoundResponse({ description: 'No waveform record exists for track' })
  @ApiConflictResponse({ description: 'Waveform generation already in progress' })
  async regenerate(
    @Param('trackId', ParseUUIDPipe) trackId: string,
  ): Promise<RegenerateResponseDto> {
    return this.waveformService.regenerate(trackId);
  }
}
