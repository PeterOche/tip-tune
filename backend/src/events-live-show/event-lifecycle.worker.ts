import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ArtistEvent } from './artist-event.entity';
import { EventsService } from './events.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.entity';

@Injectable()
export class EventLifecycleWorker {
  private readonly logger = new Logger(EventLifecycleWorker.name);

  constructor(
    private readonly eventsService: EventsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @OnEvent('event.live', { async: true })
  async handleEventLive(event: ArtistEvent) {
    this.logger.log(`Handling LIVE event notification for: ${event.id}`);
    const rsvps = await this.eventsService.getRsvpsForEvent(event.id, false); // Notify everyone who RSVPed

    for (const rsvp of rsvps) {
      await this.notificationsService.create({
        userId: rsvp.userId,
        type: NotificationType.EVENT_LIVE,
        title: 'Event is LIVE!',
        message: `The event "${event.title}" has just started. Join now!`,
        data: { eventId: event.id, streamUrl: event.streamUrl },
      });
    }
  }

  @OnEvent('event.cancelled', { async: true })
  async handleEventCancelled(event: ArtistEvent) {
    this.logger.log(`Handling CANCELLED event notification for: ${event.id}`);
    const rsvps = await this.eventsService.getRsvpsForEvent(event.id, false);

    for (const rsvp of rsvps) {
      await this.notificationsService.create({
        userId: rsvp.userId,
        type: NotificationType.EVENT_CANCELLED,
        title: 'Event Cancelled',
        message: `We're sorry, but the event "${event.title}" has been cancelled.`,
        data: { eventId: event.id },
      });
    }
  }

  @OnEvent('event.ended', { async: true })
  async handleEventEnded(event: ArtistEvent) {
    this.logger.log(`Handling ENDED event archival logic for: ${event.id}`);
    // Future: Trigger automated recording processing or feedback collection
    // For now, we just acknowledge the transition
  }

  @OnEvent('event.archived', { async: true })
  async handleEventArchived(event: ArtistEvent) {
    this.logger.log(`Handling ARCHIVED event logic for: ${event.id}`);
    // Options: Move to colder storage, remove RSVPs to save space, etc.
  }
}
