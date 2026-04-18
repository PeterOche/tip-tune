import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumberString,
  IsInt,
  Min,
  MaxLength,
  IsBoolean,
} from 'class-validator';

export class CreateSubscriptionTierDto {
  @ApiProperty({ example: 'Gold Fan', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'Early access + monthly Q&A' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    example: '10.0000000',
    description: 'Price in USDC (decimal string, ≥ 0)',
  })
  @IsNumberString({}, { message: 'priceUsdc must be a numeric string' })
  priceUsdc: string;

  @ApiPropertyOptional({
    example: 30,
    description: 'Billing cycle in days (default 30)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  billingCycleDays?: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
