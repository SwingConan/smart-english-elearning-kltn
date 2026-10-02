import { Module } from '@nestjs/common';
import { EvaluationModule } from '../evaluation/evaluation.module';
import { RecommendationService } from './recommendation.service';

@Module({
  imports: [EvaluationModule],
  providers: [RecommendationService],
  exports: [RecommendationService],
})
export class RecommendationModule {}
