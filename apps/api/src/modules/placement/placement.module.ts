import { Module } from '@nestjs/common';
import { RecommendationModule } from '../recommendations/recommendation.module';
import { PlacementController } from './placement.controller';
import { PlacementService } from './placement.service';

@Module({
  imports: [RecommendationModule],
  controllers: [PlacementController],
  providers: [PlacementService],
})
export class PlacementModule {}
