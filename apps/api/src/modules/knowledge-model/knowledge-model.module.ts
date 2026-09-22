import { Module } from '@nestjs/common';
import { KnowledgeModelInstructorController } from './knowledge-model-instructor.controller';
import { KnowledgeModelInstructorService } from './knowledge-model-instructor.service';

@Module({
  controllers: [KnowledgeModelInstructorController],
  providers: [KnowledgeModelInstructorService],
})
export class KnowledgeModelModule {}
