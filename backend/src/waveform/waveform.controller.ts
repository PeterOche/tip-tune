import {
  Controller,
  Get,
  Post,
  Param,
  NotFoundException,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from "@nestjs/common";
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { WaveformService } from "./waveform.service";
import { TracksService } from "../tracks/tracks.service";
import {
  RegenerateResponseDto,
  WaveformStatusDto,
} from "./dto/waveform.dto";

@ApiTags("waveform")
@Controller({ path: "tracks/:trackId/waveform", version: "1" })
export class WaveformController {
  constructor(
    private readonly waveformService: WaveformService,
    private readonly tracksService: TracksService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get waveform status and peak data for a track" })
  @ApiOkResponse({ type: WaveformStatusDto })
  @ApiNotFoundResponse({ description: "No waveform record exists for track" })
  async getStatus(
    @Param("trackId", ParseUUIDPipe) trackId: string,
  ): Promise<WaveformStatusDto> {
    return this.waveformService.getStatus(trackId);
  }

  @Post("regenerate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Force-regenerate the waveform for a track",
    description: "Enqueues a durable BullMQ job.",
  })
  @ApiOkResponse({ type: RegenerateResponseDto })
  @ApiNotFoundResponse({ description: "No waveform record exists for track" })
  @ApiConflictResponse({
    description: "Waveform generation already in progress",
  })
  async regenerate(
    @Param("trackId", ParseUUIDPipe) trackId: string,
  ): Promise<RegenerateResponseDto> {
    const track = await this.tracksService.findOne(trackId);

    if (!track.audioUrl && !track.filename) {
      throw new NotFoundException("Track audio file not found");
    }

    const audioPath = track.filename || track.audioUrl;
    return this.waveformService.regenerate(trackId, audioPath);
  }
}
