import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

/**
 * Canonical shape of the authenticated principal attached to every request
 * by the WalletStrategy (and future OAuth strategies).
 *
 * Rules:
 *  - `id`       → internal UUID of the User row (always present)
 *  - `artistId` → UUID of the Artist profile, present only when the user
 *                 has completed artist onboarding; undefined otherwise.
 *  - `walletAddress` → the Stellar public key used to sign the auth token.
 *
 * Use `@CurrentUser()` instead of accessing `req.user` directly so that
 * callers always get the typed principal and never reference stale fields
 * like `req.user.artistId` without a guard.
 */
export interface AuthenticatedPrincipal {
  id: string;
  artistId?: string;
  walletAddress: string;
  roles: string[];
}

/**
 * Extracts the full authenticated principal from the request.
 *
 * @example
 * \@Get('me')
 * getMe(\@CurrentUser() user: AuthenticatedPrincipal) { ... }
 *
 * @example – pull a single field
 * \@Get('me')
 * getMe(\@CurrentUser('id') userId: string) { ... }
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedPrincipal | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedPrincipal;

    if (!user) return null;
    return field ? user[field] : user;
  },
);
