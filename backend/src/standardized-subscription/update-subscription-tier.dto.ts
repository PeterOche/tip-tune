import { PartialType } from '@nestjs/swagger';
import { CreateSubscriptionTierDto } from './create-subscription-tier.dto';

/**
 * All fields from CreateSubscriptionTierDto become optional.
 * Artists may patch any subset of tier properties.
 */
export class UpdateSubscriptionTierDto extends PartialType(
  CreateSubscriptionTierDto,
) {}
