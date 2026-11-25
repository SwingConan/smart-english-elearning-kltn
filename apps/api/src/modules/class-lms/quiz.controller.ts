import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PublicUser } from '../users/user.types';
import { ClassQuizService } from './quiz.service';
import { QuizSaveDto, QuizSourceDto, QuizStartDto, QuizTransitionDto } from './quiz.dto';
const uuid = new ParseUUIDPipe(),
  actor = (u: PublicUser, r: Request) => ({ id: u.id, sessionId: r.sessionID });
@Controller('v2/class-quiz')
export class ClassQuizController {
  constructor(private readonly service: ClassQuizService) {}
  @Get('checker') @Roles('ACADEMIC_MANAGER') inbox(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
  ) {
    return this.service.inbox(actor(u, r));
  }
  @Get('classes/:c/gradebook') @Roles('STUDENT') book(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('c', uuid) c: string,
  ) {
    return this.service.gradebook(actor(u, r), c);
  }
  @Get('classes/:c/activities/:a/author') @Roles('INSTRUCTOR') author(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('c', uuid) c: string,
    @Param('a', uuid) a: string,
  ) {
    return this.service.author(actor(u, r), c, a);
  }
  @Post('classes/:c/activities/:a/sources') @Roles('INSTRUCTOR') create(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('c', uuid) c: string,
    @Param('a', uuid) a: string,
    @Body() b: QuizSourceDto,
  ) {
    return this.service.saveSource(actor(u, r), c, a, b);
  }
  @Put('classes/:c/activities/:a/sources/:id') @Roles('INSTRUCTOR') edit(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('c', uuid) c: string,
    @Param('a', uuid) a: string,
    @Param('id', uuid) id: string,
    @Body() b: QuizSourceDto,
  ) {
    return this.service.saveSource(actor(u, r), c, a, b, id);
  }
  @Post('classes/:c/activities/:a/sources/:id/approve') @Roles('ACADEMIC_MANAGER') approve(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('c', uuid) c: string,
    @Param('a', uuid) a: string,
    @Param('id', uuid) id: string,
    @Body() b: QuizTransitionDto,
  ) {
    return this.service.approve(actor(u, r), c, a, id, b);
  }
  @Get('classes/:c/activities/:a/launch') @Roles('STUDENT') launch(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('c', uuid) c: string,
    @Param('a', uuid) a: string,
  ) {
    return this.service.launch(actor(u, r), c, a);
  }
  @Post('classes/:c/activities/:a/start') @Roles('STUDENT') start(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('c', uuid) c: string,
    @Param('a', uuid) a: string,
    @Body() b: QuizStartDto,
  ) {
    return this.service.start(actor(u, r), c, a, b);
  }
  @Get('classes/:c/attempts/:id') @Roles('STUDENT') resume(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('c', uuid) c: string,
    @Param('id', uuid) id: string,
  ) {
    return this.service.resume(actor(u, r), c, id);
  }
  @Put('classes/:c/attempts/:id/answers') @Roles('STUDENT') save(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('c', uuid) c: string,
    @Param('id', uuid) id: string,
    @Body() b: QuizSaveDto,
  ) {
    return this.service.save(actor(u, r), c, id, b);
  }
  @Post('classes/:c/attempts/:id/submit') @Roles('STUDENT') submit(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('c', uuid) c: string,
    @Param('id', uuid) id: string,
    @Body() b: QuizTransitionDto,
  ) {
    return this.service.submit(actor(u, r), c, id, b);
  }
  @Post('classes/:c/attempts/:id/publish') @Roles('ACADEMIC_MANAGER') publish(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('c', uuid) c: string,
    @Param('id', uuid) id: string,
    @Body() b: QuizTransitionDto,
  ) {
    return this.service.publish(actor(u, r), c, id, b);
  }
}
