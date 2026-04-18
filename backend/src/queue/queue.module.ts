import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DeadLetter } from "./entities/dead-letter.entity";
import { DlqService } from "./dlq.service";

@Module({
  imports: [TypeOrmModule.forFeature([DeadLetter])],
  providers: [DlqService],
  exports: [DlqService],
})
export class QueueModule {}
