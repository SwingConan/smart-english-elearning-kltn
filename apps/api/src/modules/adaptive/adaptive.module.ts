import { Module } from '@nestjs/common';
import { AdaptiveInstructorController } from './adaptive-instructor.controller';
import { AdaptiveInstructorService } from './adaptive-instructor.service';

@Module({
  controllers: [AdaptiveInstructorController],
  providers: [AdaptiveInstructorService],
})
export class AdaptiveModule {}
