import { Module } from '@nestjs/common';
import { RecommendationModule } from '../recommendations/recommendation.module';
import { PlacementController } from './placement.controller';
import { PlacementService } from './placement.service';
import {
  AssessmentResponseStorage,
  LocalAssessmentResponseStorage,
} from './assessment-response.storage';
import { AssessmentStimulusMediaStorage } from './assessment-stimulus-media.storage';

@Module({
  imports: [RecommendationModule],
  controllers: [PlacementController],
  providers: [
    PlacementService,
    AssessmentStimulusMediaStorage,
    { provide: AssessmentResponseStorage, useClass: LocalAssessmentResponseStorage },
  ],
})
export class PlacementModule {}
