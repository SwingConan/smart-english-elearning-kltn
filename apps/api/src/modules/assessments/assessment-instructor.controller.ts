import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import { AssessmentInstructorService } from './assessment-instructor.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';

@ApiTags('instructor assessments')
@Roles(UserRole.INSTRUCTOR)
@Controller('instructor')
export class AssessmentInstructorController {
  constructor(private readonly assessmentInstructorService: AssessmentInstructorService) {}

  @Get('courses/:courseId/questions')
  @ApiOperation({ summary: 'List questions in an assigned course' })
  listQuestions(
    @CurrentUser() user: PublicUser,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
  ) {
    return this.assessmentInstructorService.listQuestions(user.id, courseId);
  }

  @Post('courses/:courseId/questions')
  @ApiOperation({ summary: 'Create a question in an assigned course' })
  createQuestion(
    @CurrentUser() user: PublicUser,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.assessmentInstructorService.createQuestion(user.id, courseId, dto);
  }

  @Get('questions/:questionId')
  @ApiOperation({ summary: 'Get an instructor question' })
  getQuestion(
    @CurrentUser() user: PublicUser,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ) {
    return this.assessmentInstructorService.getQuestion(user.id, questionId);
  }

  @Patch('questions/:questionId')
  @ApiOperation({ summary: 'Update an instructor question' })
  updateQuestion(
    @CurrentUser() user: PublicUser,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.assessmentInstructorService.updateQuestion(user.id, questionId, dto);
  }

  @Delete('questions/:questionId')
  @ApiOperation({ summary: 'Delete an unreferenced instructor question' })
  deleteQuestion(
    @CurrentUser() user: PublicUser,
    @Param('questionId', new ParseUUIDPipe()) questionId: string,
  ) {
    return this.assessmentInstructorService.deleteQuestion(user.id, questionId);
  }
}
