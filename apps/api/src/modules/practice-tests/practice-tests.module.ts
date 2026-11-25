import { Module } from '@nestjs/common';
import { PracticeTestsController } from './practice-tests.controller';
import { PracticeTestsService } from './practice-tests.service';

@Module({
  controllers: [PracticeTestsController],
  providers: [PracticeTestsService],
  exports: [PracticeTestsService],
})
export class PracticeTestsModule {}
