import {
  Body,
  CallHandler,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  NestInterceptor,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PublicUser } from '../users/user.types';
import { contentDisposition } from '../learning/content-disposition';
import { AdmissionsFinanceService } from './admissions-finance.service';
import {
  W07AcademicDto,
  W07AdjustmentDecisionDto,
  W07AdjustmentDto,
  W07ApplyDto,
  W07CaseDto,
  W07Key,
  W07Reason,
  W07UploadDto,
  W07VerifyDto,
} from './admissions-finance.dto';
const uuid = new ParseUUIDPipe(),
  actor = (u: PublicUser, r: Request) => ({ id: u.id, sessionId: r.sessionID });
@Injectable()
class W07Headers implements NestInterceptor {
  intercept(c: ExecutionContext, next: CallHandler) {
    const r = c.switchToHttp().getResponse<Response>();
    r.setHeader('Cache-Control', 'private, no-store');
    r.setHeader('X-Content-Type-Options', 'nosniff');
    r.setHeader('Referrer-Policy', 'no-referrer');
    return next.handle();
  }
}
@Controller('v2/admissions-finance')
@Roles('STUDENT', 'ACADEMIC_MANAGER', 'CASHIER')
@UseInterceptors(W07Headers)
export class AdmissionsFinanceController {
  constructor(private readonly s: AdmissionsFinanceService) {}
  @Get('configuration') configuration(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.s.configuration(actor(u, r));
  }
  @Post('applications/:id/payment-source') source(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: W07Reason,
  ) {
    return this.s.authorizePaymentSource(actor(u, r), id, b);
  }
  @Get('offers') offers(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.s.offers(actor(u, r));
  }
  @Get('staff/classes') classes(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.s.staffClasses(actor(u, r));
  }
  @Post('classes/:id/enable') enable(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: W07Reason,
  ) {
    return this.s.enable(actor(u, r), id, b);
  }
  @Get('referrals') refs(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.s.referrals(actor(u, r));
  }
  @Post('applications') apply(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Body() b: W07ApplyDto,
  ) {
    return this.s.apply(actor(u, r), b);
  }
  @Get('applications/mine') mine(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.s.mine(actor(u, r));
  }
  @Get('workspace') workspace(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.s.workspace(actor(u, r));
  }
  @Get('applications/:id') detail(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
  ) {
    return this.s.detail(actor(u, r), id);
  }
  @Post('applications/:id/academic-decisions') academic(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: W07AcademicDto,
  ) {
    return this.s.academic(actor(u, r), id, b);
  }
  @Post('applications/:id/activate') activate(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: W07Key,
  ) {
    return this.s.activate(actor(u, r), id, b);
  }
  @Post('applications/:id/cases') cases(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: W07CaseDto,
  ) {
    return this.s.caseRequest(actor(u, r), id, b);
  }
  @Get('obligations/:id/evidence/receipts/:key')
  receipt(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('key', new ParseUUIDPipe()) key: string,
  ) {
    return this.s.paymentReceipt(actor(u, r), id, key);
  }
  @Post('obligations/:id/evidence')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 } }),
  )
  upload(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: W07UploadDto,
    @UploadedFile() f: { buffer: Buffer; size: number; mimetype: string; originalname: string },
  ) {
    return this.s.upload(actor(u, r), id, b, f);
  }
  @Get('evidence/:id/file') async file(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const f = await this.s.proof(actor(u, r), id);
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Disposition', contentDisposition('attachment', f.fileName));
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.setHeader('X-Synthetic-Test', 'true');
    return new StreamableFile(f.body);
  }
  @Post('evidence/:id/review') verify(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: W07VerifyDto,
  ) {
    return this.s.verify(actor(u, r), id, b);
  }
  @Post('events/:id/adjustments') adjustment(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: W07AdjustmentDto,
  ) {
    return this.s.adjustment(actor(u, r), id, b);
  }
  @Post('adjustments/:id/decision') decide(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Param('id', uuid) id: string,
    @Body() b: W07AdjustmentDecisionDto,
  ) {
    return this.s.adjustmentDecision(actor(u, r), id, b);
  }
  @Get('notifications') notifications(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.s.notifications(actor(u, r));
  }
}
