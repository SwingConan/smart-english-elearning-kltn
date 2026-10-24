import { Module } from '@nestjs/common';
import { AdminPublicContentController, PublicContentController } from './public-content.controller';
import { PublicContentService } from './public-content.service';

@Module({
  controllers: [PublicContentController, AdminPublicContentController],
  providers: [PublicContentService],
})
export class PublicContentModule {}
