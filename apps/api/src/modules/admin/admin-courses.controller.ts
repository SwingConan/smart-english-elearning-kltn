import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CoursesService } from '../courses/courses.service';
import { CreateCourseDto } from '../courses/dto/create-course.dto';
import { UpdateCourseDto } from '../courses/dto/update-course.dto';
import { PublicUser } from '../users/user.types';

@ApiTags('admin courses')
@Roles(UserRole.ADMIN_COORDINATOR)
@Controller('admin/courses')
export class AdminCoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  @ApiOperation({ summary: 'List all courses for administration' })
  list() {
    return this.coursesService.listAdmin();
  }

  @Post()
  @ApiOperation({ summary: 'Create a course' })
  create(
    @Body() input: CreateCourseDto,
    @CurrentUser() user: PublicUser,
  ) {
    return this.coursesService.create(input, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an allowed set of course fields' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() input: UpdateCourseDto,
  ) {
    return this.coursesService.update(id, input);
  }
}
