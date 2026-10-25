import { Module } from '@nestjs/common';
import {
  AdminPublicContentAssetsController,
  AdminPublicContentCategoriesController,
  AdminPublicContentController,
  PublicContentAssetsController,
  PublicContentController,
} from './public-content.controller';
import { PublicContentService } from './public-content.service';
import {
  LocalPublicContentAssetStorage,
  PublicContentAssetStorage,
} from './public-content-asset.storage';

@Module({
  controllers: [
    PublicContentController,
    PublicContentAssetsController,
    AdminPublicContentController,
    AdminPublicContentCategoriesController,
    AdminPublicContentAssetsController,
  ],
  providers: [
    PublicContentService,
    LocalPublicContentAssetStorage,
    { provide: PublicContentAssetStorage, useExisting: LocalPublicContentAssetStorage },
  ],
})
export class PublicContentModule {}
