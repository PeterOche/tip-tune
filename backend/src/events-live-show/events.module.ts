import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScheduleModule } from "@nestjs/schedule";
import { EventsService } from "./events.service";
import { EventsController } from "./events.controller";
import { EventReminderCron } from "./events-reminder.cron";
import { EventLifecycleWorker } from "./event-lifecycle.worker";
import { NotificationsModule } from "../notifications/notifications.module";
import { ArtistEvent } from "./artist-event.entity";
import { EventRSVP } from "./event-rsvp.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([ArtistEvent, EventRSVP]),
    NotificationsModule,
  ],
  controllers: [EventsController],
  providers: [EventsService, EventReminderCron, EventLifecycleWorker],
  exports: [EventsService],
})
export class EventsModule {}
