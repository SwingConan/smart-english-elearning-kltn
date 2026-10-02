import { Module } from '@nestjs/common';
import { RecommendationModule } from '../recommendations/recommendation.module';
import { PlacementController } from './placement.controller';
import { PlacementService } from './placement.service';
import {
  AssessmentResponseStorage,
  LocalAssessmentResponseStorage,
} from './assessment-response.storage';

@Module({
  imports: [RecommendationModule],
  controllers: [PlacementController],
  providers: [
    PlacementService,
    { provide: AssessmentResponseStorage, useClass: LocalAssessmentResponseStorage },
  ],
})
export class PlacementModule {}
