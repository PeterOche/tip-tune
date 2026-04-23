import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsGateway } from './notifications.gateway';
import { AuthService } from '../auth/auth.service';
import { ArtistsService } from '../artists/artists.service';
import { Socket } from 'socket.io';
import { WsException } from '@nestjs/websockets';

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let authService: AuthService;
  let artistsService: ArtistsService;

  const mockAuthService = {
    verifyAccessToken: jest.fn(),
  };

  const mockArtistsService = {
    findOne: jest.fn(),
  };

  const mockClient = {
    id: 'client-123',
    handshake: {
      auth: {
        token: 'valid-token',
      },
      headers: {},
    },
    join: jest.fn(),
    leave: jest.fn(),
    disconnect: jest.fn(),
    data: {},
    emit: jest.fn(),
  } as unknown as Socket;

  const mockServer = {
    to: jest.fn().mockReturnThis(),
    emit: jest.fn(),
    timeout: jest.fn().mockReturnThis(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsGateway,
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: ArtistsService,
          useValue: mockArtistsService,
        },
      ],
    }).compile();

    gateway = module.get<NotificationsGateway>(NotificationsGateway);
    gateway.server = mockServer as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleConnection', () => {
    it('should authenticate user and join user room', async () => {
      const user = { id: 'user-1' };
      mockAuthService.verifyAccessToken.mockResolvedValue(user);

      await gateway.handleConnection(mockClient);

      expect(mockAuthService.verifyAccessToken).toHaveBeenCalledWith('valid-token');
      expect(mockClient.join).toHaveBeenCalledWith('user:user-1');
      expect(mockClient.data.user).toEqual(user);
    });

    it('should disconnect if no token provided', async () => {
      const noTokenClient = {
        id: 'no-token',
        handshake: { auth: {}, headers: {} },
        emit: jest.fn(),
        disconnect: jest.fn(),
      } as unknown as Socket;

      await gateway.handleConnection(noTokenClient);

      expect(noTokenClient.disconnect).toHaveBeenCalled();
      expect(noTokenClient.emit).toHaveBeenCalledWith('error', expect.any(String));
    });
  });

  describe('handleJoinArtistRoom', () => {
    it('should allow joining if artist exists', async () => {
      mockArtistsService.findOne.mockResolvedValue({ id: 'artist-1' });
      mockClient.data = { user: { id: 'user-1' } };

      const result = await gateway.handleJoinArtistRoom(mockClient, 'artist-1');

      expect(mockArtistsService.findOne).toHaveBeenCalledWith('artist-1');
      expect(mockClient.join).toHaveBeenCalledWith('artist:artist-1');
      expect(result.status).toBe('ok');
    });

    it('should throw WsException if artist does not exist', async () => {
      mockArtistsService.findOne.mockResolvedValue(null);

      await expect(gateway.handleJoinArtistRoom(mockClient, 'invalid'))
        .rejects.toThrow(WsException);
    });
  });

  describe('sendNotificationToUser', () => {
    it('should emit to user room and handle timeout', async () => {
      const userId = 'user-1';
      const payload = { msg: 'hi' };
      
      // Mock the callback logic for emit with timeout
      mockServer.emit.mockImplementation((event, data, cb) => {
        cb(null, ['ack']); // Simulate success
      });

      const result = await gateway.sendNotificationToUser(userId, payload);

      expect(mockServer.to).toHaveBeenCalledWith('user:user-1');
      expect(mockServer.timeout).toHaveBeenCalledWith(5000);
      expect(result).toBe(true);
    });
  });
});
