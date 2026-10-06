import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { UserRole } from '../../generated/prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { PublicUser } from '../users/user.types';
import { AssessmentInstructorService } from './assessment-instructor.service';
import { AssessmentCompatibilityInterceptor } from './assessment-compatibility.interceptor';
import { AddTestQuestionDto } from './dto/add-test-question.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { CreateTestDto } from './dto/create-test.dto';
import { ReorderTestQuestionsDto } from './dto/reorder-test-questions.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { UpdateTestQuestionDto } from './dto/update-test-question.dto';
import { UpdateTestDto } from './dto/update-test.dto';
import { QuestionQueryDto } from './dto/question-query.dto';
import { ConfirmQuestionImportDto } from './dto/confirm-question-import.dto';
import {
  CreateTestGroupDto,
  CreateTextStimulusDto,
  MoveTestQuestionGroupDto,
  ReorderStimuliDto,
  ReorderTestGroupsDto,
  UpdateTestGroupDto,
} from './dto/test-group.dto';

@ApiTags('instructor assessments')
@Roles(UserRole.INSTRUCTOR)
@UseInterceptors(AssessmentCompatibilityInterceptor)
@Controller('instructor')
export class AssessmentInstructorController {
  constructor(private readonly assessmentInstructorService: AssessmentInstructorService) {}

  @Get('rubrics')
  @ApiOperation({ summary: 'List active grading rubrics' })
  listRubrics() {
    return this.assessmentInstructorService.listActiveRubrics();
  }

  @Get('rubrics/:rubricId')
  @ApiOperation({ summary: 'Read an active grading rubric' })
  getRubric(@Param('rubricId', new ParseUUIDPipe()) rubricId: string) {
    return this.assessmentInstructorService.getActiveRubric(rubricId);
  }

  @Get('courses/:courseId/questions')
  @ApiOperation({ summary: 'List questions in an assigned course' })
  listQuestions(
    @CurrentUser() user: PublicUser,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Query() query: QuestionQueryDto,
  ) {
    return this.assessmentInstructorService.listQuestions(user.id, courseId, query);
  }

  @Get('courses/:courseId/questions/import-template')
  @ApiOperation({ summary: 'Download the safe XLSX question import template' })
  async questionImportTemplate(
    @CurrentUser() user: PublicUser,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Res() response: Response,
  ) {
    const file = await this.assessmentInstructorService.questionImportTemplate(user.id, courseId);
    response.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    response.setHeader('Content-Disposition', 'attachment; filename="question-import-template.xlsx"');
    response.send(file);
  }

  @Post('courses/:courseId/questions/import-preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Validate an XLSX question file without writing data' })
  previewQuestionImport(
    @CurrentUser() user: PublicUser,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    return this.assessmentInstructorService.previewQuestionImport(user.id, courseId, file);
  }

  @Post('courses/:courseId/questions/import-confirm')
  @ApiOperation({ summary: 'Confirm one validated XLSX question import batch' })
  confirmQuestionImport(
    @CurrentUser() user: PublicUser,
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Body() dto: ConfirmQuestionImportDto,
  ) {
    return this.assessmentInstructorService.confirmQuestionImport(user.id, courseId, dto);
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

  @Post('tests/:testId/groups')
  createTestGroup(@CurrentUser() user: PublicUser, @Param('testId', new ParseUUIDPipe()) testId: string, @Body() dto: CreateTestGroupDto) {
    return this.assessmentInstructorService.createTestGroup(user.id, testId, dto);
  }

  @Patch('tests/:testId/groups/reorder')
  reorderTestGroups(@CurrentUser() user: PublicUser, @Param('testId', new ParseUUIDPipe()) testId: string, @Body() dto: ReorderTestGroupsDto) {
    return this.assessmentInstructorService.reorderTestGroups(user.id, testId, dto);
  }

  @Patch('tests/:testId/groups/:groupId')
  updateTestGroup(
    @CurrentUser() user: PublicUser,
    @Param('testId', new ParseUUIDPipe()) testId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Body() dto: UpdateTestGroupDto,
  ) {
    return this.assessmentInstructorService.updateTestGroup(user.id, testId, groupId, dto);
  }

  @Delete('tests/:testId/groups/:groupId')
  deleteTestGroup(
    @CurrentUser() user: PublicUser,
    @Param('testId', new ParseUUIDPipe()) testId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
  ) {
    return this.assessmentInstructorService.deleteTestGroup(user.id, testId, groupId);
  }

  @Post('tests/:testId/groups/:groupId/stimuli/text')
  createTextStimulus(
    @CurrentUser() user: PublicUser,
    @Param('testId', new ParseUUIDPipe()) testId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Body() dto: CreateTextStimulusDto,
  ) {
    return this.assessmentInstructorService.createTextStimulus(user.id, testId, groupId, dto);
  }

  @Post('tests/:testId/groups/:groupId/stimuli/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  uploadStimulus(
    @CurrentUser() user: PublicUser,
    @Param('testId', new ParseUUIDPipe()) testId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
    @Body('altText') altText?: string,
  ) {
    if (!file) throw new BadRequestException('Stimulus file is required');
    return this.assessmentInstructorService.uploadStimulus(user.id, testId, groupId, file, altText);
  }

  @Patch('tests/:testId/groups/:groupId/stimuli/reorder')
  reorderStimuli(
    @CurrentUser() user: PublicUser,
    @Param('testId', new ParseUUIDPipe()) testId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Body() dto: ReorderStimuliDto,
  ) {
    return this.assessmentInstructorService.reorderStimuli(user.id, testId, groupId, dto);
  }

  @Delete('tests/:testId/groups/:groupId/stimuli/:stimulusId')
  deleteStimulus(
    @CurrentUser() user: PublicUser,
    @Param('testId', new ParseUUIDPipe()) testId: string,
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Param('stimulusId', new ParseUUIDPipe()) stimulusId: string,
  ) {
    return this.assessmentInstructorService.deleteStimulus(user.id, testId, groupId, stimulusId);
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

  @Patch('tests/:testId/questions/:testQuestionId/group')
  moveTestQuestionGroup(
    @CurrentUser() user: PublicUser,
    @Param('testId', new ParseUUIDPipe()) testId: string,
    @Param('testQuestionId', new ParseUUIDPipe()) testQuestionId: string,
    @Body() dto: MoveTestQuestionGroupDto,
  ) {
    return this.assessmentInstructorService.moveTestQuestionGroup(user.id, testId, testQuestionId, dto.groupId ?? null);
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
