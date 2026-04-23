import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { WebsocketAuthGuard } from './websocket-auth.guard';
import { ArtistsService } from '../artists/artists.service';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: 'notifications',
})
export class NotificationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationsGateway.name);

  constructor(
    private readonly authService: AuthService,
    private readonly artistsService: ArtistsService,
  ) {}

  /**
   * Connection handling with mandatory authentication.
   */
  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      
      if (!token) {
        this.logger.warn(`Client ${client.id} tried to connect without token`);
        client.emit('error', 'Authentication token required');
        client.disconnect();
        return;
      }

      const user = await this.authService.verifyAccessToken(token);
      
      // Join user-specific room for private notifications
      client.join(`user:${user.id}`);
      client.data.user = user;
      
      this.logger.log(`Client ${client.id} authenticated for user ${user.id}`);
    } catch (error) {
      this.logger.warn(`Client ${client.id} failed authentication: ${error.message}`);
      client.emit('error', 'Invalid authentication token');
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Joins an artist room for public notifications (e.g., live tips).
   * Hardened to verify artist existence.
   */
  @UseGuards(WebsocketAuthGuard)
  @SubscribeMessage('joinArtistRoom')
  async handleJoinArtistRoom(client: Socket, artistId: string) {
    if (!artistId) throw new WsException('Artist ID is required');

    try {
      const artist = await this.artistsService.findOne(artistId);
      if (!artist) {
        throw new WsException('Artist not found');
      }

      await client.join(`artist:${artistId}`);
      this.logger.log(`User ${client.data.user?.id} joined room artist:${artistId}`);
      
      return { status: 'ok', room: `artist:${artistId}` };
    } catch (error) {
      this.logger.error(`Failed to join artist room: ${error.message}`);
      throw new WsException(error.message || 'Failed to join artist room');
    }
  }

  /**
   * Leaves an artist room.
   */
  @UseGuards(WebsocketAuthGuard)
  @SubscribeMessage('leaveArtistRoom')
  async handleLeaveArtistRoom(client: Socket, artistId: string) {
    await client.leave(`artist:${artistId}`);
    return { status: 'ok', room: `artist:${artistId}` };
  }

  /**
   * Sends a private notification to a specific user.
   * Expects an acknowledgment from the client if provided.
   */
  async sendNotificationToUser(userId: string, payload: any): Promise<boolean> {
    const room = `user:${userId}`;
    return new Promise((resolve) => {
      this.server.to(room).timeout(5000).emit('notification', payload, (err: any, responses: any[]) => {
        if (err) {
          this.logger.warn(`Notification delivery timed out for user ${userId}`);
          resolve(false);
        } else {
          // At least one client acknowledged
          resolve(responses.length > 0);
        }
      });
    });
  }

  /**
   * Broadcasts a tip event to the artist's public room.
   */
  sendTipEventToArtistRoom(artistId: string, payload: any) {
    this.server.to(`artist:${artistId}`).emit('tipReceived', payload);
  }

  private extractToken(client: Socket): string | null {
    if (client.handshake?.auth?.token) return client.handshake.auth.token;
    const authHeader = client.handshake?.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) return authHeader.split(' ')[1];
    return null;
  }
}
