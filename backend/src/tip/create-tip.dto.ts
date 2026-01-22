import { IsUUID, IsNumber, IsOptional, IsString, IsEnum, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TipStatus } from '../entities/tip.entity';

export class CreateTipDto {
  @ApiProperty({ description: 'User ID sending the tip', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsUUID()
  fromUserId: string;

  @ApiProperty({ description: 'Artist ID receiving the tip', example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsUUID()
  toArtistId: string;

  @ApiPropertyOptional({ description: 'Track ID (optional)', example: '550e8400-e29b-41d4-a716-446655440002' })
  @IsOptional()
  @IsUUID()
  trackId?: string;

  @ApiProperty({ description: 'Tip amount in XLM', example: 10.5 })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({ description: 'USD equivalent at time of tip', example: 5.25 })
  @IsNumber()
  @Min(0)
  usdValue: number;

  @ApiProperty({ description: 'Stellar transaction hash', example: 'abc123def456...' })
  @IsString()
  stellarTxHash: string;

  @ApiPropertyOptional({ description: 'Tip status', enum: TipStatus, default: TipStatus.PENDING })
  @IsOptional()
  @IsEnum(TipStatus)
  status?: TipStatus;

  @ApiPropertyOptional({ description: 'Optional message with the tip', example: 'Love your music!' })
  @IsOptional()
  @IsString()
  message?: string;
}