import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

/**
 * Body accepted by POST /subscription-tiers/:tierId/subscribe.
 * The fan's identity is always sourced from the JWT principal —
 * never from the request body.
 */
export class SubscribeFanDto {
  /**
   * Optional Stellar transaction ID if the fan pre-paid on-chain.
   * Omit for "subscribe now, pay later" flows.
   */
  @ApiPropertyOptional({
    example: 'a1b2c3d4...',
    description: 'Stellar transaction ID of the initial payment (optional)',
  })
  @IsOptional()
  @IsString()
  paymentTxId?: string;
}
