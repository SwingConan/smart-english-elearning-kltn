import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PublicUser } from '../users/user.types';
import { LmsLocalService } from './lms-local.service';
import type {
  QuizAnswerSubmission,
  SaveLocalAttendancePayload,
  SaveLocalQuizPayload,
} from './lms-local-qa.helpers';

const uuid = new ParseUUIDPipe();
const actor = (u: PublicUser, r: Request) => ({ id: u.id, sessionId: r.sessionID });

function buildDisposition(fileName: string): string {
  const asciiFallback =
    fileName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w.\-() ]+/g, '_') || 'download';
  const encoded = encodeURIComponent(fileName).replace(/['()]/g, (c) =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

@Controller('v2/lms-local')
@Roles('STUDENT', 'INSTRUCTOR', 'ACADEMIC_MANAGER')
export class LmsLocalController {
  constructor(private readonly service: LmsLocalService) {}

  @Get('classes/:classId/activities/:activityId/assignment')
  getAssignment(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Param('activityId', uuid) activityId: string,
  ) {
    return this.service.getAssignmentWorkspace(actor(u, r), classId, activityId);
  }

  @Put('classes/:classId/activities/:activityId/assignment/config')
  @Roles('INSTRUCTOR')
  updateConfig(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Param('activityId', uuid) activityId: string,
    @Body()
    body: {
      maxFiles?: number;
      maxFileSizeMb?: number;
      allowFile?: boolean;
      allowText?: boolean;
      allowAudio?: boolean;
      allowLate?: boolean;
      allowResubmit?: boolean;
      acceptedExtensions?: string;
      promptUrl?: string | null;
      maxScore?: number;
      availableFrom?: string | null;
      availableUntil?: string | null;
      syncPublishedDates?: boolean;
    },
  ) {
    return this.service.updateAssignmentConfig(actor(u, r), classId, activityId, body);
  }

  @Post('classes/:classId/activities/:activityId/prompt-files')
  @Roles('INSTRUCTOR')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }),
  )
  uploadPromptFile(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Param('activityId', uuid) activityId: string,
    @UploadedFile()
    file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    return this.service.uploadPromptFile(actor(u, r), classId, activityId, file);
  }

  @Delete('classes/:classId/activities/:activityId/prompt-files/:fileId')
  @Roles('INSTRUCTOR')
  deletePromptFile(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Param('activityId', uuid) activityId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.service.deletePromptFile(actor(u, r), classId, activityId, fileId);
  }

  @Get('classes/:classId/activities/:activityId/prompt-files/:fileId')
  async downloadPromptFile(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Param('activityId', uuid) activityId: string,
    @Param('fileId') fileId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const f = await this.service.downloadPromptFile(actor(u, r), classId, activityId, fileId);
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Disposition', buildDisposition(f.fileName));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(f.stream);
  }

  @Post('classes/:classId/activities/:activityId/submissions/mine')
  @Roles('STUDENT')
  @UseInterceptors(
    FilesInterceptor('files', 50, { limits: { fileSize: 55 * 1024 * 1024, files: 50 } }),
  )
  saveSubmission(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Param('activityId', uuid) activityId: string,
    @Body() body: { text?: string; mode?: string; removeFileIds?: string | string[] },
    @UploadedFiles()
    files?: Array<{ buffer: Buffer; mimetype: string; originalname: string; size: number }>,
  ) {
    let removeFileIds: string[] = [];
    if (Array.isArray(body?.removeFileIds)) {
      removeFileIds = body.removeFileIds.map(String);
    } else if (typeof body?.removeFileIds === 'string' && body.removeFileIds.trim()) {
      try {
        const parsed = JSON.parse(body.removeFileIds);
        removeFileIds = Array.isArray(parsed) ? parsed.map(String) : [body.removeFileIds];
      } catch {
        removeFileIds = body.removeFileIds.split(',').map((s) => s.trim()).filter(Boolean);
      }
    }
    return this.service.saveStudentSubmission(
      actor(u, r),
      classId,
      activityId,
      {
        text: body?.text,
        mode: body?.mode === 'DRAFT' ? 'DRAFT' : 'SUBMIT',
        removeFileIds,
      },
      files ?? [],
    );
  }

  @Get('classes/:classId/activities/:activityId/files/:fileId')
  async downloadSubmissionFile(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Param('activityId', uuid) activityId: string,
    @Param('fileId') fileId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const f = await this.service.downloadSubmissionFile(actor(u, r), classId, activityId, fileId);
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Disposition', buildDisposition(f.fileName));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(f.stream);
  }

  @Get('classes/:classId/activities/:activityId/submissions/zip')
  @Roles('INSTRUCTOR')
  async downloadAllZip(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Param('activityId', uuid) activityId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const zip = await this.service.downloadAllSubmissionsZip(actor(u, r), classId, activityId);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', buildDisposition(zip.fileName));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(zip.buffer);
  }

  @Post('classes/:classId/activities/:activityId/submissions/:submissionId/grade')
  @Roles('INSTRUCTOR')
  gradeSubmission(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Param('activityId', uuid) activityId: string,
    @Param('submissionId', uuid) submissionId: string,
    @Body() body: { score?: number | null; feedback?: string; publish?: boolean },
  ) {
    return this.service.gradeSubmission(actor(u, r), classId, activityId, submissionId, body);
  }

  @Get('classes/:classId/activity-kinds')
  getActivityKinds(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
  ) {
    return this.service.getClassActivityKinds(actor(u, r), classId);
  }

  @Post('classes/:classId/quiz-media')
  @Roles('INSTRUCTOR')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }),
  )
  uploadQuizMedia(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    return this.service.uploadQuizMedia(actor(u, r), classId, file);
  }

  @Get('classes/:classId/quiz-media/:mediaId')
  async downloadQuizMedia(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Param('mediaId', uuid) mediaId: string,
    @Res() res: Response,
  ) {
    const media = await this.service.openQuizMedia(actor(u, r), classId, mediaId);
    res.setHeader('Content-Type', media.mimeType);
    res.setHeader('Content-Disposition', buildDisposition(media.fileName).replace(/^attachment;/, 'inline;'));
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(media.path, { dotfiles: 'allow' });
  }

  @Post('classes/:classId/sections/:sectionId/local-quiz')
  @Roles('INSTRUCTOR')
  createLocalQuiz(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Param('sectionId', uuid) sectionId: string,
    @Body() body: SaveLocalQuizPayload,
  ) {
    return this.service.createLocalQuiz(actor(u, r), classId, sectionId, body);
  }

  @Put('classes/:classId/activities/:activityId/local-quiz')
  @Roles('INSTRUCTOR')
  updateLocalQuiz(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Param('activityId', uuid) activityId: string,
    @Body() body: SaveLocalQuizPayload,
  ) {
    return this.service.updateLocalQuiz(actor(u, r), classId, activityId, body);
  }

  @Get('classes/:classId/activities/:activityId/local-quiz')
  getLocalQuizWorkspace(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Param('activityId', uuid) activityId: string,
  ) {
    return this.service.getQuizWorkspace(actor(u, r), classId, activityId);
  }

  @Post('classes/:classId/activities/:activityId/local-quiz/start')
  @Roles('STUDENT')
  startLocalQuizAttempt(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Param('activityId', uuid) activityId: string,
  ) {
    return this.service.startQuizAttempt(actor(u, r), classId, activityId);
  }

  @Post('classes/:classId/activities/:activityId/local-quiz/attempts/:attemptId/submit')
  @Roles('STUDENT')
  submitLocalQuizAttempt(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Param('activityId', uuid) activityId: string,
    @Param('attemptId', uuid) attemptId: string,
    @Body() body: { answers?: QuizAnswerSubmission[]; submit?: boolean },
  ) {
    return this.service.saveOrSubmitQuizAttempt(actor(u, r), classId, activityId, attemptId, body);
  }

  @Post('classes/:classId/activities/:activityId/local-quiz/attempts/:attemptId/grade')
  @Roles('INSTRUCTOR')
  gradeLocalQuizEssay(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Param('activityId', uuid) activityId: string,
    @Param('attemptId', uuid) attemptId: string,
    @Body()
    body: {
      scoresByQuestionId?: Record<string, { score: number; comment?: string }>;
      teacherFeedback?: string;
      publishGrade?: boolean;
    },
  ) {
    return this.service.gradeQuizEssayAttempt(actor(u, r), classId, activityId, attemptId, body);
  }

  @Post('classes/:classId/sections/:sectionId/local-attendance')
  @Roles('INSTRUCTOR')
  createLocalAttendance(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Param('sectionId', uuid) sectionId: string,
    @Body() body: SaveLocalAttendancePayload,
  ) {
    return this.service.createLocalAttendance(actor(u, r), classId, sectionId, body);
  }

  @Put('classes/:classId/activities/:activityId/local-attendance')
  @Roles('INSTRUCTOR')
  updateLocalAttendance(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Param('activityId', uuid) activityId: string,
    @Body() body: SaveLocalAttendancePayload,
  ) {
    return this.service.updateLocalAttendance(actor(u, r), classId, activityId, body);
  }

  @Get('classes/:classId/activities/:activityId/local-attendance')
  getLocalAttendanceWorkspace(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Param('activityId', uuid) activityId: string,
  ) {
    return this.service.getAttendanceWorkspace(actor(u, r), classId, activityId);
  }

  @Get('classes/:classId/question-bank')
  @Roles('INSTRUCTOR')
  getQuestionBank(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Query('search') search?: string,
    @Query('type') type?: 'ALL' | 'MCQ' | 'ESSAY',
    @Query('skill') skill?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getQuestionBank(actor(u, r), classId, {
      search,
      responseType: type,
      skill,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('classes/:classId/unified-results')
  getUnifiedClassResults(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
  ) {
    return this.service.getUnifiedResults(actor(u, r), classId);
  }

  @Post('classes/:classId/activities/:activityId/local-attendance/check-in')
  @Roles('STUDENT')
  checkInLocalAttendance(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Param('activityId', uuid) activityId: string,
    @Body() body: { code?: string; note?: string },
  ) {
    return this.service.studentAttendanceCheckIn(actor(u, r), classId, activityId, body);
  }

  @Post('classes/:classId/activities/:activityId/local-attendance/mark')
  @Roles('INSTRUCTOR')
  markLocalAttendance(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) classId: string,
    @Param('activityId', uuid) activityId: string,
    @Body() body: { enrollmentId: string; status: 'PRESENT' | 'LATE' | 'NOT_RECORDED'; note?: string },
  ) {
    return this.service.teacherMarkAttendance(actor(u, r), classId, activityId, body);
  }
}
