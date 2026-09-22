import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import { AssessmentInstructorService } from './assessment-instructor.service';
import { AddTestQuestionDto } from './dto/add-test-question.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { CreateTestDto } from './dto/create-test.dto';
import { ReorderTestQuestionsDto } from './dto/reorder-test-questions.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { UpdateTestQuestionDto } from './dto/update-test-question.dto';
import { UpdateTestDto } from './dto/update-test.dto';

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

  @Get('courses/:courseId/tests')
  @ApiOperation({ summary: 'List tests in an assigned course' })
  listTests(
    @CurrentUser() user: PublicUser,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
  ) {
    return this.assessmentInstructorService.listTests(user.id, courseId);
  }

  @Post('courses/:courseId/tests')
  @ApiOperation({ summary: 'Create a draft test in an assigned course' })
  createTest(
    @CurrentUser() user: PublicUser,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Body() dto: CreateTestDto,
  ) {
    return this.assessmentInstructorService.createTest(user.id, courseId, dto);
  }

  @Get('tests/:testId')
  @ApiOperation({ summary: 'Get an instructor test' })
  getTest(@CurrentUser() user: PublicUser, @Param('testId', new ParseUUIDPipe()) testId: string) {
    return this.assessmentInstructorService.getTest(user.id, testId);
  }

  @Patch('tests/:testId')
  @ApiOperation({ summary: 'Update an instructor test' })
  updateTest(
    @CurrentUser() user: PublicUser,
    @Param('testId', new ParseUUIDPipe()) testId: string,
    @Body() dto: UpdateTestDto,
  ) {
    return this.assessmentInstructorService.updateTest(user.id, testId, dto);
  }

  @Delete('tests/:testId')
  @ApiOperation({ summary: 'Delete a test without attempts' })
  deleteTest(
    @CurrentUser() user: PublicUser,
    @Param('testId', new ParseUUIDPipe()) testId: string,
  ) {
    return this.assessmentInstructorService.deleteTest(user.id, testId);
  }

  @Patch('tests/:testId/publish')
  @ApiOperation({ summary: 'Publish a valid test' })
  publishTest(
    @CurrentUser() user: PublicUser,
    @Param('testId', new ParseUUIDPipe()) testId: string,
  ) {
    return this.assessmentInstructorService.publishTest(user.id, testId);
  }

  @Patch('tests/:testId/unpublish')
  @ApiOperation({ summary: 'Return a test without attempts to draft' })
  unpublishTest(
    @CurrentUser() user: PublicUser,
    @Param('testId', new ParseUUIDPipe()) testId: string,
  ) {
    return this.assessmentInstructorService.unpublishTest(user.id, testId);
  }

  @Post('tests/:testId/questions')
  @ApiOperation({ summary: 'Append a question to a test' })
  addTestQuestion(
    @CurrentUser() user: PublicUser,
    @Param('testId', new ParseUUIDPipe()) testId: string,
    @Body() dto: AddTestQuestionDto,
  ) {
    return this.assessmentInstructorService.addTestQuestion(user.id, testId, dto);
  }

  @Patch('tests/:testId/questions/reorder')
  @ApiOperation({ summary: 'Reorder all questions in a test' })
  reorderTestQuestions(
    @CurrentUser() user: PublicUser,
    @Param('testId', new ParseUUIDPipe()) testId: string,
    @Body() dto: ReorderTestQuestionsDto,
  ) {
    return this.assessmentInstructorService.reorderTestQuestions(user.id, testId, dto);
  }

  @Patch('tests/:testId/questions/:testQuestionId')
  @ApiOperation({ summary: 'Update points for a test question' })
  updateTestQuestion(
    @CurrentUser() user: PublicUser,
    @Param('testId', new ParseUUIDPipe()) testId: string,
    @Param('testQuestionId', new ParseUUIDPipe()) testQuestionId: string,
    @Body() dto: UpdateTestQuestionDto,
  ) {
    return this.assessmentInstructorService.updateTestQuestion(
      user.id,
      testId,
      testQuestionId,
      dto,
    );
  }

  @Delete('tests/:testId/questions/:testQuestionId')
  @ApiOperation({ summary: 'Remove a question from a test' })
  deleteTestQuestion(
    @CurrentUser() user: PublicUser,
    @Param('testId', new ParseUUIDPipe()) testId: string,
    @Param('testQuestionId', new ParseUUIDPipe()) testQuestionId: string,
  ) {
    return this.assessmentInstructorService.deleteTestQuestion(user.id, testId, testQuestionId);
  }
}
