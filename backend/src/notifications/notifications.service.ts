import {
  Injectable,
  NotFoundException,
  Inject,
  forwardRef,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { NotificationsGateway } from "./notifications.gateway";
import { Notification, NotificationType } from "./notification.entity";
import { BlocksService } from "../blocks/blocks.service";

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly notificationsGateway: NotificationsGateway,
    @Inject(forwardRef(() => BlocksService))
    private readonly blocksService: BlocksService,
  ) {}

  async create(createNotificationDto: {
    userId: string;
    type: NotificationType;
    title: string;
    message: string;
    data?: any;
    fromUser?: string;
  }) {
    // Check if the recipient has muted the sender (suppress notification)
    if (createNotificationDto.fromUser) {
      const shouldSuppress =
        await this.blocksService.shouldSuppressNotification(
          createNotificationDto.userId,
          createNotificationDto.fromUser,
        );
      if (shouldSuppress) {
        // Still save the notification but don't send real-time alert
        const notification = this.notificationRepository.create({
          userId: createNotificationDto.userId,
          type: createNotificationDto.type,
          title: createNotificationDto.title,
          message: createNotificationDto.message,
          data: createNotificationDto.data,
        });
        return this.notificationRepository.save(notification);
      }
    }

    const notification = this.notificationRepository.create({
      userId: createNotificationDto.userId,
      type: createNotificationDto.type,
      title: createNotificationDto.title,
      message: createNotificationDto.message,
      data: createNotificationDto.data,
    });

    const savedNotification =
      await this.notificationRepository.save(notification);

    // Send private real-time notification to the user
    this.notificationsGateway.sendNotificationToUser(
      createNotificationDto.userId,
      {
        ...savedNotification,
        type: createNotificationDto.type,
      },
    ).then(delivered => {
      if (!delivered) {
        this.logger.debug(`Notification ${savedNotification.id} not delivered via WebSocket (user might be offline)`);
      }
    });

    return savedNotification;
  }

  async notifyArtistOfTip(artistId: string, tip: any) {
    const title = "New Tip Received!";
    const message = `You received a tip of ${tip.amount} XLM!`;
    const data = {
      tipId: tip.id,
      amount: tip.amount,
      fromUser: tip.fromUser,
      stellarTxHash: tip.stellarTxHash,
    };

    // Save notification to DB
    const notification = this.notificationRepository.create({
      userId: artistId,
      type: NotificationType.TIP_RECEIVED,
      title,
      message,
      data,
    });

    const savedNotification =
      await this.notificationRepository.save(notification);

    const payload = {
      ...savedNotification,
      type: "TIP_RECEIVED",
    };

    // 1. Send private notification to the artist
    this.notificationsGateway.sendNotificationToUser(artistId, payload);

    // 2. Broadcast to the artist's public room (for live stream UI, etc.)
    this.notificationsGateway.sendTipEventToArtistRoom(artistId, payload);
  }

  async notifyUserOfBadge(userId: string, userBadge: any) {
    const title = "Achievement Unlocked!";
    const message = `You've earned a new badge: ${userBadge.badge?.name || "Badge"}`;
    const data = {
      badgeId: userBadge.badgeId,
      userBadgeId: userBadge.id,
      earnedAt: userBadge.earnedAt,
    };

    const notification = this.notificationRepository.create({
      userId,
      type: NotificationType.BADGE_EARNED,
      title,
      message,
      data,
    });

    const savedNotification =
      await this.notificationRepository.save(notification);

    // Private notification only
    this.notificationsGateway.sendNotificationToUser(userId, {
      ...savedNotification,
      type: "BADGE_EARNED",
    });
  }

  async sendCollaborationInvite(data: any) {
    const notification = this.notificationRepository.create({
      userId: data.userId,
      type: NotificationType.COLLABORATION_INVITE,
      title: "New Collaboration Invite",
      message: `${data.invitedBy} invited you to collaborate on "${data.trackTitle}"`,
      data: {
        trackId: data.trackId,
        role: data.role,
        splitPercentage: data.splitPercentage,
        message: data.message,
      },
    });

    const savedNotification =
      await this.notificationRepository.save(notification);

    if (this.notificationsGateway) {
      this.notificationsGateway.sendNotificationToUser(
        data.userId,
        savedNotification,
      );
    }

    return savedNotification;
  }

  async sendCollaborationResponse(data: any) {
    const notification = this.notificationRepository.create({
      userId: data.userId,
      type: NotificationType.COLLABORATION_RESPONSE,
      title: `Collaboration ${data.status === "approved" ? "Accepted" : "Declined"}`,
      message: `${data.collaboratorName} ${data.status === "approved" ? "accepted" : "declined"} collaboration on "${data.trackTitle}"`,
      data: {
        trackId: data.trackId,
        status: data.status,
        reason: data.reason,
      },
    });

    const savedNotification =
      await this.notificationRepository.save(notification);

    if (this.notificationsGateway) {
      this.notificationsGateway.sendNotificationToUser(
        data.userId,
        savedNotification,
      );
    }

    return savedNotification;
  }

  async getUserNotifications(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const [notifications, total] =
      await this.notificationRepository.findAndCount({
        where: { userId },
        order: { createdAt: "DESC" },
        skip: (page - 1) * limit,
        take: limit,
      });

    return {
      data: notifications,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUnreadCount(userId: string) {
    const count = await this.notificationRepository.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException("Notification not found");
    }

    notification.isRead = true;
    return this.notificationRepository.save(notification);
  }

  async markAllAsRead(userId: string) {
    await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true },
    );
    return { success: true };
  }
}
