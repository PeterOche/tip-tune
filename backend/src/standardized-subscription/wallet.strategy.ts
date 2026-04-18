import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedPrincipal } from '../decorators/current-user.decorator';

/**
 * Minimal shape expected from the JWT payload minted at login time.
 * The token is signed with the app's JWT_SECRET and carries only stable
 * identifiers — never mutable profile data — so that the strategy can
 * hydrate the rest from the DB if required.
 */
interface JwtPayload {
  sub: string;         // User.id (UUID)
  wallet: string;      // Stellar public key
  roles?: string[];
}

/**
 * WalletStrategy — Bearer JWT strategy backed by Stellar wallet auth.
 *
 * What it guarantees:
 *  - `req.user.id`            → User.id from JWT sub
 *  - `req.user.artistId`      → Artist.id if profile exists, undefined otherwise
 *  - `req.user.walletAddress` → Stellar G… public key from JWT
 *  - `req.user.roles`         → role list (defaults to ['fan'])
 *
 * NOTE: artistId is resolved here once per request so that controllers and
 * services never query for it themselves, eliminating the req.user.artistId
 * vs req.user.id confusion in the subscription-tier module.
 */
@Injectable()
export class WalletStrategy extends PassportStrategy(Strategy, 'wallet-jwt') {
  private readonly logger = new Logger(WalletStrategy.name);

  constructor(
    private readonly config: ConfigService,
    // Inject the Artist repository to resolve artistId.
    // Use a lazy-loaded token here to avoid circular module deps.
    @InjectRepository('Artist')
    private readonly artistRepo: Repository<{ id: string; userId: string }>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Called by Passport after the JWT signature is verified.
   * Returns the object that becomes `req.user`.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedPrincipal> {
    const userId = payload.sub;
    if (!userId) {
      throw new UnauthorizedException('Malformed token: missing sub');
    }

    // Resolve artist profile if one exists for this user.
    let artistId: string | undefined;
    try {
      const artist = await this.artistRepo.findOne({
        where: { userId },
        select: ['id'],
      });
      artistId = artist?.id;
    } catch (err) {
      // Non-fatal: a user without an artist profile is a valid fan.
      this.logger.warn(
        `Could not resolve artistId for user ${userId}: ${(err as Error).message}`,
      );
    }

    return {
      id: userId,
      artistId,
      walletAddress: payload.wallet,
      roles: payload.roles ?? ['fan'],
    };
  }
}
