import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PublicUser } from '../users/user.types';
import { InstructorContentService } from './instructor-content.service';
import { CreateModuleDto } from './dto/create-module.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { ReorderDto } from './dto/reorder.dto';

@ApiTags('instructor content')
@Roles(UserRole.INSTRUCTOR)
@Controller('instructor')
export class InstructorContentController {
  constructor(private readonly instructorContentService: InstructorContentService) {}

  @Get('teaching')
  @ApiOperation({ summary: 'List courses the instructor is teaching' })
  listTeaching(@CurrentUser() user: PublicUser) {
    return this.instructorContentService.listTeaching(user.id);
  }

  // --- MODULES ---

  @Get('courses/:courseId/modules')
  @ApiOperation({ summary: 'List modules for a course' })
  listModules(
    @CurrentUser() user: PublicUser,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
  ) {
    return this.instructorContentService.listModules(user.id, courseId);
  }

  @Post('courses/:courseId/modules')
  @ApiOperation({ summary: 'Create a module for a course' })
  createModule(
    @CurrentUser() user: PublicUser,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Body() dto: CreateModuleDto,
  ) {
    return this.instructorContentService.createModule(user.id, courseId, dto);
  }

  @Patch('modules/:moduleId')
  @ApiOperation({ summary: 'Update a module' })
  updateModule(
    @CurrentUser() user: PublicUser,
    @Param('moduleId', new ParseUUIDPipe()) moduleId: string,
    @Body() dto: UpdateModuleDto,
  ) {
    return this.instructorContentService.updateModule(user.id, moduleId, dto);
  }

  @Delete('modules/:moduleId')
  @ApiOperation({ summary: 'Delete a module' })
  deleteModule(
    @CurrentUser() user: PublicUser,
    @Param('moduleId', new ParseUUIDPipe()) moduleId: string,
  ) {
    return this.instructorContentService.deleteModule(user.id, moduleId);
  }

  @Patch('courses/:courseId/modules/reorder')
  @ApiOperation({ summary: 'Reorder modules in a course' })
  reorderModules(
    @CurrentUser() user: PublicUser,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.instructorContentService.reorderModules(user.id, courseId, dto);
  }

  // --- LESSONS ---

  @Get('modules/:moduleId/lessons')
  @ApiOperation({ summary: 'List lessons for a module' })
  listLessons(
    @CurrentUser() user: PublicUser,
    @Param('moduleId', new ParseUUIDPipe()) moduleId: string,
  ) {
    return this.instructorContentService.listLessons(user.id, moduleId);
  }

  @Post('modules/:moduleId/lessons')
  @ApiOperation({ summary: 'Create a lesson for a module' })
  createLesson(
    @CurrentUser() user: PublicUser,
    @Param('moduleId', new ParseUUIDPipe()) moduleId: string,
    @Body() dto: CreateLessonDto,
  ) {
    return this.instructorContentService.createLesson(user.id, moduleId, dto);
  }

  @Patch('lessons/:lessonId')
  @ApiOperation({ summary: 'Update a lesson' })
  updateLesson(
    @CurrentUser() user: PublicUser,
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
    @Body() dto: UpdateLessonDto,
  ) {
    return this.instructorContentService.updateLesson(user.id, lessonId, dto);
  }

  @Delete('lessons/:lessonId')
  @ApiOperation({ summary: 'Delete a lesson' })
  deleteLesson(
    @CurrentUser() user: PublicUser,
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
  ) {
    return this.instructorContentService.deleteLesson(user.id, lessonId);
  }

  @Patch('modules/:moduleId/lessons/reorder')
  @ApiOperation({ summary: 'Reorder lessons in a module' })
  reorderLessons(
    @CurrentUser() user: PublicUser,
    @Param('moduleId', new ParseUUIDPipe()) moduleId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.instructorContentService.reorderLessons(user.id, moduleId, dto);
  }

  // --- RESOURCES ---

  @Get('lessons/:lessonId/resources')
  @ApiOperation({ summary: 'List resources for a lesson' })
  listResources(
    @CurrentUser() user: PublicUser,
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
  ) {
    return this.instructorContentService.listResources(user.id, lessonId);
  }

  @Post('lessons/:lessonId/resources')
  @ApiOperation({ summary: 'Create a resource for a lesson' })
  createResource(
    @CurrentUser() user: PublicUser,
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
    @Body() dto: CreateResourceDto,
  ) {
    return this.instructorContentService.createResource(user.id, lessonId, dto);
  }

  @Patch('resources/:resourceId')
  @ApiOperation({ summary: 'Update a resource' })
  updateResource(
    @CurrentUser() user: PublicUser,
    @Param('resourceId', new ParseUUIDPipe()) resourceId: string,
    @Body() dto: UpdateResourceDto,
  ) {
    return this.instructorContentService.updateResource(user.id, resourceId, dto);
  }

  @Delete('resources/:resourceId')
  @ApiOperation({ summary: 'Delete a resource' })
  deleteResource(
    @CurrentUser() user: PublicUser,
    @Param('resourceId', new ParseUUIDPipe()) resourceId: string,
  ) {
    return this.instructorContentService.deleteResource(user.id, resourceId);
  }

  @Patch('lessons/:lessonId/resources/reorder')
  @ApiOperation({ summary: 'Reorder resources in a lesson' })
  reorderResources(
    @CurrentUser() user: PublicUser,
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
    @Body() dto: ReorderDto,
  ) {
    return this.instructorContentService.reorderResources(user.id, lessonId, dto);
  }
}
