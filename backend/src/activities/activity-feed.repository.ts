import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, SelectQueryBuilder } from "typeorm";
import { Activity } from "./entities/activity.entity";

@Injectable()
export class ActivityFeedRepository {
  constructor(
    @InjectRepository(Activity)
    private readonly activityRepo: Repository<Activity>,
  ) {}

  /**
   * Create a query builder for the activity feed
   * Combines user's own activities and activities from followed artists,
   * while excluding muted users.
   */
  createFeedQueryBuilder(
    userId: string,
    followedArtistIds: string[],
    mutedUserIds: string[],
  ): SelectQueryBuilder<Activity> {
    const queryBuilder = this.activityRepo
      .createQueryBuilder("activity")
      .leftJoinAndSelect("activity.user", "user")
      .where(
        "(activity.userId = :userId OR activity.userId IN (:...followedArtistIds))",
        {
          userId,
          followedArtistIds: followedArtistIds.length > 0 ? followedArtistIds : [""],
        },
      );

    // Exclude muted users
    if (mutedUserIds.length > 0) {
      queryBuilder.andWhere("activity.userId NOT IN (:...mutedUserIds)", {
        mutedUserIds,
      });
    }

    return queryBuilder;
  }

  /**
   * Get unseen count for the activity feed
   */
  async getUnseenCount(
    userId: string,
    followedArtistIds: string[],
    mutedUserIds: string[],
  ): Promise<number> {
    const qb = this.createFeedQueryBuilder(userId, followedArtistIds, mutedUserIds);
    qb.andWhere("activity.isSeen = :isSeen", { isSeen: false });
    return qb.getCount();
  }
}
