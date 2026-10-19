import { Module } from '@nestjs/common';
import { EvaluationModule } from '../evaluation/evaluation.module';
import { RecommendationService } from './recommendation.service';
import { AdminStudyRecommendationController } from './admin-study-recommendation.controller';
import { StudyRecommendationController } from './study-recommendation.controller';
import { StudyRecommendationService } from './study-recommendation.service';

@Module({
  imports: [EvaluationModule],
  controllers: [StudyRecommendationController, AdminStudyRecommendationController],
  providers: [RecommendationService, StudyRecommendationService],
  exports: [RecommendationService, StudyRecommendationService],
})
export class RecommendationModule {}
