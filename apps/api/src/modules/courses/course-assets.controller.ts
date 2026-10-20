import { Controller, Get, Param, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CoursesService } from './courses.service';

@Public()
@Controller('course-assets')
export class CourseAssetsController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get(':key')
  async thumbnail(@Param('key') key: string, @Res({ passthrough: true }) response: Response) {
    const file = await this.coursesService.openThumbnail(key);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', String(file.sizeBytes));
    response.setHeader('Content-Disposition', 'inline');
    response.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(file.stream);
  }
}
