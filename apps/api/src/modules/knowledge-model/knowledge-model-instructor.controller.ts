import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import { CreateSkillDto } from './dto/create-skill.dto';
import { ReplacePrerequisitesDto } from './dto/replace-prerequisites.dto';
import { ReplaceSkillMappingsDto } from './dto/replace-skill-mappings.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { KnowledgeModelInstructorService } from './knowledge-model-instructor.service';

@ApiTags('instructor knowledge model')
@Roles(UserRole.INSTRUCTOR)
@Controller('instructor')
export class KnowledgeModelInstructorController {
  constructor(private readonly knowledgeModel: KnowledgeModelInstructorService) {}

  @Get('courses/:courseId/skills')
  @ApiOperation({ summary: 'List Skills in an assigned Course' })
  listSkills(
    @CurrentUser() user: PublicUser,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
  ) {
    return this.knowledgeModel.listSkills(user.id, courseId);
  }

  @Post('courses/:courseId/skills')
  @ApiOperation({ summary: 'Create a Skill in an assigned Course' })
  createSkill(
    @CurrentUser() user: PublicUser,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Body() dto: CreateSkillDto,
  ) {
    return this.knowledgeModel.createSkill(user.id, courseId, dto);
  }

  @Patch('skills/:skillId')
  @ApiOperation({ summary: 'Update an Instructor Skill' })
  updateSkill(
    @CurrentUser() user: PublicUser,
    @Param('skillId', new ParseUUIDPipe()) skillId: string,
    @Body() dto: UpdateSkillDto,
  ) {
    return this.knowledgeModel.updateSkill(user.id, skillId, dto);
  }

  @Delete('skills/:skillId')
  @ApiOperation({ summary: 'Delete an unreferenced Instructor Skill' })
  deleteSkill(
    @CurrentUser() user: PublicUser,
    @Param('skillId', new ParseUUIDPipe()) skillId: string,
  ) {
    return this.knowledgeModel.deleteSkill(user.id, skillId);
  }

  @Get('skills/:skillId/prerequisites')
  @ApiOperation({ summary: 'List direct prerequisites of a Skill' })
  listPrerequisites(
    @CurrentUser() user: PublicUser,
    @Param('skillId', new ParseUUIDPipe()) skillId: string,
  ) {
    return this.knowledgeModel.listPrerequisites(user.id, skillId);
  }

  @Put('skills/:skillId/prerequisites')
  @ApiOperation({ summary: 'Replace the direct prerequisites of a Skill' })
  replacePrerequisites(
    @CurrentUser() user: PublicUser,
    @Param('skillId', new ParseUUIDPipe()) skillId: string,
    @Body() dto: ReplacePrerequisitesDto,
  ) {
    return this.knowledgeModel.replacePrerequisites(user.id, skillId, dto);
  }

  @Get('questions/:questionId/skills')
  @ApiOperation({ summary: 'List Skills mapped to a Question' })
  listQuestionSkills(
    @CurrentUser() user: PublicUser,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ) {
    return this.knowledgeModel.listQuestionSkills(user.id, questionId);
  }

  @Put('questions/:questionId/skills')
  @ApiOperation({ summary: 'Replace Skills mapped to a Question' })
  replaceQuestionSkills(
    @CurrentUser() user: PublicUser,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() dto: ReplaceSkillMappingsDto,
  ) {
    return this.knowledgeModel.replaceQuestionSkills(user.id, questionId, dto);
  }

  @Get('lessons/:lessonId/skills')
  @ApiOperation({ summary: 'List Skills mapped to a Lesson' })
  listLessonSkills(
    @CurrentUser() user: PublicUser,
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
  ) {
    return this.knowledgeModel.listLessonSkills(user.id, lessonId);
  }

  @Put('lessons/:lessonId/skills')
  @ApiOperation({ summary: 'Replace Skills mapped to a Lesson' })
  replaceLessonSkills(
    @CurrentUser() user: PublicUser,
    @Param('lessonId', new ParseUUIDPipe()) lessonId: string,
    @Body() dto: ReplaceSkillMappingsDto,
  ) {
    return this.knowledgeModel.replaceLessonSkills(user.id, lessonId, dto);
  }
}
