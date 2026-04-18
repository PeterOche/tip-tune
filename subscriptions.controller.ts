import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';

import { SubscriptionsService } from './subscriptions.service';
import { CreateSubscriptionTierDto } from './dto/create-subscription-tier.dto';
import { UpdateSubscriptionTierDto } from './dto/update-subscription-tier.dto';
import { SubscribeFanDto } from './dto/subscribe-fan.dto';
import {
  CurrentUser,
  AuthenticatedPrincipal,
} from '../auth/decorators/current-user.decorator';
import { SubscriptionTier } from './entities/subscription-tier.entity';
import { FanSubscription } from './entities/fan-subscription.entity';

/**
 * SubscriptionsController
 *
 * Route surface (relative to global prefix `api/v1`):
 *
 *  Artist tier management (requires artistId on principal):
 *    POST   /subscription-tiers                           → create tier
 *    GET    /subscription-tiers/artist/:artistId          → list tiers for artist (public)
 *    GET    /subscription-tiers/:tierId                   → get tier (public)
 *    PATCH  /subscription-tiers/:tierId                   → update tier (owner only)
 *    DELETE /subscription-tiers/:tierId                   → delete tier (owner only)
 *
 *  Fan subscription actions (requires authenticated user):
 *    POST   /subscription-tiers/:tierId/subscribe         → subscribe fan
 *    DELETE /subscription-tiers/subscriptions/:subId/cancel → cancel subscription
 *    GET    /subscription-tiers/me/subscriptions          → list my subscriptions
 *
 * No `/api` prefix is embedded here — that is handled globally in main.ts
 * via `app.setGlobalPrefix('api/v1')`.
 */
@ApiTags('Subscription Tiers')
@Controller('subscription-tiers')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  // ─── Artist-side tier CRUD ────────────────────────────────────────────────

  @Post()
  @UseGuards(AuthGuard('wallet-jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create a subscription tier',
    description:
      'Authenticated artist creates a new monetisation tier. ' +
      'The tier is owned by the artistId resolved from the JWT — ' +
      'never passed in the body.',
  })
  @ApiCreatedResponse({ type: SubscriptionTier })
  @ApiResponse({ status: 403, description: 'Caller has no artist profile' })
  async createTier(
    @Body() dto: CreateSubscriptionTierDto,
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<SubscriptionTier> {
    return this.subscriptionsService.createTier(dto, principal);
  }

  @Get('artist/:artistId')
  @ApiOperation({
    summary: 'List active tiers for an artist (public)',
  })
  @ApiParam({ name: 'artistId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: [SubscriptionTier] })
  async findTiersByArtist(
    @Param('artistId', ParseUUIDPipe) artistId: string,
  ): Promise<SubscriptionTier[]> {
    return this.subscriptionsService.findTiersByArtist(artistId);
  }

  /**
   * IMPORTANT: `/me/subscriptions` must be declared before `/:tierId` so that
   * Express does not swallow the literal "me" as a UUID param.
   */
  @Get('me/subscriptions')
  @UseGuards(AuthGuard('wallet-jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the authenticated fan's subscriptions" })
  @ApiOkResponse({ type: [FanSubscription] })
  async mySubscriptions(
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<FanSubscription[]> {
    return this.subscriptionsService.mySubscriptions(principal);
  }

  @Get(':tierId')
  @ApiOperation({ summary: 'Get a single subscription tier (public)' })
  @ApiParam({ name: 'tierId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: SubscriptionTier })
  @ApiResponse({ status: 404, description: 'Tier not found' })
  async findOneTier(
    @Param('tierId', ParseUUIDPipe) tierId: string,
  ): Promise<SubscriptionTier> {
    return this.subscriptionsService.findOneTier(tierId);
  }

  @Patch(':tierId')
  @UseGuards(AuthGuard('wallet-jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update a subscription tier (owning artist only)',
  })
  @ApiParam({ name: 'tierId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: SubscriptionTier })
  @ApiResponse({ status: 403, description: 'Not the tier owner' })
  @ApiResponse({ status: 404, description: 'Tier not found' })
  async updateTier(
    @Param('tierId', ParseUUIDPipe) tierId: string,
    @Body() dto: UpdateSubscriptionTierDto,
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<SubscriptionTier> {
    return this.subscriptionsService.updateTier(tierId, dto, principal);
  }

  @Delete(':tierId')
  @UseGuards(AuthGuard('wallet-jwt'))
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a subscription tier (owning artist only)',
    description:
      'Hard-deletes the tier and cascades to all fan subscriptions.',
  })
  @ApiParam({ name: 'tierId', type: 'string', format: 'uuid' })
  @ApiNoContentResponse()
  @ApiResponse({ status: 403, description: 'Not the tier owner' })
  @ApiResponse({ status: 404, description: 'Tier not found' })
  async deleteTier(
    @Param('tierId', ParseUUIDPipe) tierId: string,
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<void> {
    return this.subscriptionsService.deleteTier(tierId, principal);
  }

  // ─── Fan subscription flows ───────────────────────────────────────────────

  @Post(':tierId/subscribe')
  @UseGuards(AuthGuard('wallet-jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Subscribe the authenticated fan to a tier',
    description:
      'The fan identity is taken exclusively from the JWT — ' +
      'no userId or fanId is accepted in the body.',
  })
  @ApiParam({ name: 'tierId', type: 'string', format: 'uuid' })
  @ApiCreatedResponse({ type: FanSubscription })
  @ApiResponse({ status: 409, description: 'Already subscribed or tier inactive' })
  async subscribe(
    @Param('tierId', ParseUUIDPipe) tierId: string,
    @Body() dto: SubscribeFanDto,
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<FanSubscription> {
    return this.subscriptionsService.subscribe(tierId, dto, principal);
  }

  @Delete('subscriptions/:subscriptionId/cancel')
  @UseGuards(AuthGuard('wallet-jwt'))
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cancel a fan subscription (subscriber only)',
  })
  @ApiParam({ name: 'subscriptionId', type: 'string', format: 'uuid' })
  @ApiOkResponse({ type: FanSubscription })
  @ApiResponse({ status: 403, description: 'Not the subscription owner' })
  @ApiResponse({ status: 404, description: 'Subscription not found' })
  async cancelSubscription(
    @Param('subscriptionId', ParseUUIDPipe) subscriptionId: string,
    @CurrentUser() principal: AuthenticatedPrincipal,
  ): Promise<FanSubscription> {
    return this.subscriptionsService.cancelSubscription(
      subscriptionId,
      principal,
    );
  }
}
