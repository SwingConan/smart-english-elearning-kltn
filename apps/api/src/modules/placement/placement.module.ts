import { Module } from '@nestjs/common';
import { PlacementWorkflowController } from './workflow.controller';
import { PlacementWorkflowService } from './workflow.service';
import { ClassLmsModule } from '../class-lms/class-lms.module';
import { PlacementIntegrationController } from './integration.controller';
import { PlacementIntegrationService } from './integration.service';
import { LegacyPlacementFixtureGuard } from './legacy-fixture.guard';
import { RecommendationModule } from '../recommendations/recommendation.module';
import { PlacementController } from './placement.controller';
import { PlacementService } from './placement.service';
import { S10DurableService } from './s10-durable.service';
import { S10DurableController } from './s10-durable.controller';
import {
  AssessmentResponseStorage,
  LocalAssessmentResponseStorage,
} from './assessment-response.storage';
import { AssessmentStimulusMediaStorage } from './assessment-stimulus-media.storage';

@Module({
  imports: [RecommendationModule, ClassLmsModule],
  controllers: [PlacementController, S10DurableController, PlacementIntegrationController, PlacementWorkflowController],
  providers: [
    PlacementWorkflowService,
    LegacyPlacementFixtureGuard,
    PlacementIntegrationService,
    S10DurableService,
    PlacementService,
    AssessmentStimulusMediaStorage,
    { provide: AssessmentResponseStorage, useClass: LocalAssessmentResponseStorage },
  ],
})
export class PlacementModule {}
