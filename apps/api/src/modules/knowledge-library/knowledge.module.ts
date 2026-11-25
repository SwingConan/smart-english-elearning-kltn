import { Module } from '@nestjs/common';
import { ClassLmsModule } from '../class-lms/class-lms.module';
import { KnowledgeLibraryController } from './knowledge.controller';
import { KnowledgeLibraryService } from './knowledge.service';
@Module({
  imports: [ClassLmsModule],
  controllers: [KnowledgeLibraryController],
  providers: [KnowledgeLibraryService],
})
export class KnowledgeLibraryModule {}
