import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class WebsocketAuthGuard implements CanActivate {
  private readonly logger = new Logger(WebsocketAuthGuard.name);

  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient();
    const token = this.extractToken(client);

    if (!token) {
      this.logger.warn(`Missing WebSocket token for client ${client.id}`);
      throw new WsException('Unauthorized');
    }

    try {
      const user = await this.authService.verifyAccessToken(token);
      // Attach user to client data for later use in gateway handlers
      client.data.user = user;
      return true;
    } catch (error) {
      this.logger.warn(`Invalid WebSocket token for client ${client.id}: ${error.message}`);
      throw new WsException('Unauthorized');
    }
  }

  private extractToken(client: any): string | null {
    // Check handshake auth first (Socket.io best practice)
    if (client.handshake?.auth?.token) {
      return client.handshake.auth.token;
    }
    // Fallback to headers
    const authHeader = client.handshake?.headers?.authorization;
    if (authHeader && authHeader.split(' ')[0] === 'Bearer') {
      return authHeader.split(' ')[1];
    }
    return null;
  }
}
