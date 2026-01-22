import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TipsController } from './tips.controller';
import { TipsService } from './tips.service';
import { Tip } from './entities/tip.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Tip])],
  controllers: [TipsController],
  providers: [TipsService],
  exports: [TipsService],
})
export class TipsModule {}