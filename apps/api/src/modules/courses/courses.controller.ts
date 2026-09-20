import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CoursesService } from './courses.service';
import { CatalogQueryDto } from './dto/catalog-query.dto';

@ApiTags('courses')
@Public()
@Controller('courses')
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  @ApiOperation({ summary: 'List published courses' })
  list(@Query() query: CatalogQueryDto) {
    return this.coursesService.listPublic(query);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get a published course by slug' })
  detail(@Param('slug') slug: string) {
    return this.coursesService.getPublicBySlug(slug);
  }
}
