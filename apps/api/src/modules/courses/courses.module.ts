import { Module } from '@nestjs/common';
import {CatalogDiagnosticsInterceptor} from './catalog-diagnostics.interceptor';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';
import { CourseAssetsController } from './course-assets.controller';
import { CourseThumbnailStorage, LocalCourseThumbnailStorage } from './course-thumbnail.storage';

@Module({
  controllers: [CoursesController, CourseAssetsController],
  providers: [
    CatalogDiagnosticsInterceptor,
    CoursesService,
    LocalCourseThumbnailStorage,
    { provide: CourseThumbnailStorage, useExisting: LocalCourseThumbnailStorage },
  ],
  exports: [CoursesService],
})
export class CoursesModule {}
