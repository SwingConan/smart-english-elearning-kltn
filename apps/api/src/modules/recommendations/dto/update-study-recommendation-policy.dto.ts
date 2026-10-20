import { IsInt, IsNumber, Max, Min } from 'class-validator';

export class UpdateStudyRecommendationPolicyDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  weakThreshold!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  strongThreshold!: number;

  @IsInt()
  @Min(1)
  @Max(20)
  minimumTaskQuestions!: number;

  @IsInt()
  @Min(1)
  @Max(5)
  maxRecommendations!: number;
}
