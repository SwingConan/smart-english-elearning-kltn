import {
  ArgumentsHost,
  BadRequestException,
  Body,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  PayloadTooLargeException,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CoursesService } from '../courses/courses.service';
import { CreateCourseDto } from '../courses/dto/create-course.dto';
import { AdminCourseQueryDto } from '../courses/dto/admin-course-query.dto';
import { UpdateCourseDto } from '../courses/dto/update-course.dto';
import { PublicUser } from '../users/user.types';

@Catch(PayloadTooLargeException)
class CourseThumbnailSizeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost) {
    host.switchToHttp().getResponse().status(413).json({
      statusCode: 413,
      message: 'Ảnh đại diện không được vượt quá 5 MB.',
    });
  }
}

@ApiTags('admin courses')
@Roles(UserRole.ADMIN_COORDINATOR)
@Controller('admin/courses')
export class AdminCoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  @ApiOperation({ summary: 'List all courses for administration' })
  list(@Query() query: AdminCourseQueryDto) {
    return this.coursesService.listAdmin(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one course for administration' })
  detail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.coursesService.getAdminById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a course' })
  create(@Body() input: CreateCourseDto, @CurrentUser() user: PublicUser) {
    return this.coursesService.create(input, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an allowed set of course fields' })
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() input: UpdateCourseDto) {
    return this.coursesService.update(id, input);
  }

  @Post(':id/thumbnail')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @UseFilters(CourseThumbnailSizeFilter)
  @ApiOperation({ summary: 'Upload or replace a course thumbnail' })
  uploadThumbnail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    if (!file) throw new BadRequestException('Vui lòng chọn ảnh đại diện khóa học.');
    return this.coursesService.uploadThumbnail(id, file);
  }

  @Delete(':id/thumbnail')
  @ApiOperation({ summary: 'Remove a course thumbnail' })
  removeThumbnail(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.coursesService.removeThumbnail(id);
  }
}
