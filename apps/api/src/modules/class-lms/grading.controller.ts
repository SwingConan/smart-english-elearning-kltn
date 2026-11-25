import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PublicUser } from '../users/user.types';
import { contentDisposition } from '../learning/content-disposition';
import { AssignmentGradingService } from './grading.service';
import {
  AssignmentGradeDto,
  AssignmentRubricDto,
  EditAssignmentGradeDto,
  EditAssignmentRubricDto,
  GradingTransitionDto,
} from './grading.dto';
const uuid = new ParseUUIDPipe(),
  actor = (u: PublicUser, r: Request) => ({ id: u.id, sessionId: r.sessionID });
@Controller('v2/assignment-grading')
export class AssignmentGradingController {
  constructor(private readonly service: AssignmentGradingService) {}
  @Get('checker') @Roles('ACADEMIC_MANAGER') inbox(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
  ) {
    return this.service.inbox(actor(u, r));
  }
  @Get('classes/:classId/gradebook') @Roles('STUDENT') book(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
  ) {
    return this.service.gradebook(actor(u, r), c);
  }
  @Get('classes/:classId/activities/:activityId/queue') @Roles('INSTRUCTOR') queue(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('activityId', uuid) a: string,
  ) {
    return this.service.queue(actor(u, r), c, a);
  }
  @Post('classes/:classId/activities/:activityId/rubrics') @Roles('INSTRUCTOR') rubric(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('activityId', uuid) a: string,
    @Body() b: AssignmentRubricDto,
  ) {
    return this.service.saveRubric(actor(u, r), c, a, b);
  }
  @Put('classes/:classId/activities/:activityId/rubrics/:id') @Roles('INSTRUCTOR') editRubric(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('activityId', uuid) a: string,
    @Param('id', uuid) id: string,
    @Body() b: EditAssignmentRubricDto,
  ) {
    return this.service.saveRubric(actor(u, r), c, a, b, id);
  }
  @Post('classes/:classId/activities/:activityId/rubrics/:id/publish')
  @Roles('ACADEMIC_MANAGER')
  publishRubric(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('activityId', uuid) a: string,
    @Param('id', uuid) id: string,
    @Body() b: GradingTransitionDto,
  ) {
    return this.service.publishRubric(actor(u, r), c, a, id, b);
  }
  @Post('classes/:classId/activities/:activityId/submissions/:sid/grades')
  @Roles('INSTRUCTOR')
  grade(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('activityId', uuid) a: string,
    @Param('sid', uuid) s: string,
    @Body() b: AssignmentGradeDto,
  ) {
    return this.service.saveGrade(actor(u, r), c, a, s, b);
  }
  @Put('classes/:classId/activities/:activityId/submissions/:sid/grades/:id')
  @Roles('INSTRUCTOR')
  editGrade(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('activityId', uuid) a: string,
    @Param('sid', uuid) s: string,
    @Param('id', uuid) id: string,
    @Body() b: EditAssignmentGradeDto,
  ) {
    return this.service.saveGrade(actor(u, r), c, a, s, b, id);
  }
  @Post('classes/:classId/activities/:activityId/grades/:id/final') @Roles('INSTRUCTOR') final(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('activityId', uuid) a: string,
    @Param('id', uuid) id: string,
    @Body() b: GradingTransitionDto,
  ) {
    return this.service.finalize(actor(u, r), c, a, id, b);
  }
  @Post('classes/:classId/activities/:activityId/grades/:id/publish')
  @Roles('ACADEMIC_MANAGER')
  publishGrade(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('activityId', uuid) a: string,
    @Param('id', uuid) id: string,
    @Body() b: GradingTransitionDto,
  ) {
    return this.service.publishGrade(actor(u, r), c, a, id, b);
  }
  @Get('classes/:classId/activities/:activityId/grades/:id/file')
  @Roles('INSTRUCTOR', 'ACADEMIC_MANAGER')
  async file(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('classId', uuid) c: string,
    @Param('activityId', uuid) a: string,
    @Param('id', uuid) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const f = await this.service.file(actor(u, r), c, a, id, u.role === 'INSTRUCTOR');
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Disposition', contentDisposition('attachment', f.fileName));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(f.stream);
  }
}
