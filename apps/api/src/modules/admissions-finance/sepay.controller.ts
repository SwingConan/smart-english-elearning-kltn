import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { TuitionPaymentService, type CashierResolutionDecision } from '../tuition/tuition-payment.service';
import type { PublicUser } from '../users/user.types';
import { SePayService } from './sepay.service';
import { SePayBankCheckService } from './sepay-bank-check.service';
class BankCheckDto {
  @IsUUID() key!: string;
  @IsIn(['BR136_NON_ACADEMIC_BANK_CHECK_V1']) consentVersion!: string;
}
class SePayOrderDto {
  @IsOptional() @IsUUID() enrollmentId?: string;
  @IsOptional() @IsUUID() obligationId?: string;
  @IsOptional() @IsUUID() key?: string;
  @IsOptional() @IsString() consentVersion?: string;
}
class SePayReconcileDto {
  @IsIn([
    'CONFIRM_MATCH_AND_ACTIVATE',
    'MARK_PARTIAL_KEEP_PENDING',
    'MARK_REFUND_NEEDED',
    'REJECT_UNMATCHED',
    'CONFIRM_RECEIPT',
    'HOLD',
  ])
  decision!:
    | CashierResolutionDecision
    | 'CONFIRM_RECEIPT'
    | 'HOLD';
  @IsOptional() @IsUUID() receivableId?: string;
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(5, 1000)
  reason!: string;
}
const actor = (u: PublicUser, r: Request) => ({ id: u.id, sessionId: r.sessionID });
@Controller('v2/payments/sepay')
export class SePayController {
  constructor(
    private readonly service: SePayService,
    private readonly bankCheck: SePayBankCheckService,
    private readonly tuitionPayment: TuitionPaymentService,
  ) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  @Roles('STUDENT', 'CASHIER', 'SYSTEM_ADMIN')
  overview(@CurrentUser() u: PublicUser) {
    if (u.role === 'CASHIER' || u.role === 'SYSTEM_ADMIN') {
      return this.tuitionPayment.getCashierWorkspace(u.id);
    }
    return this.tuitionPayment.getLearnerFinanceOverview(u.id);
  }
  @Get('bank-checks')
  @Header('Cache-Control', 'private, no-store')
  @Roles('STUDENT', 'CASHIER', 'SYSTEM_ADMIN')
  bankCheckOverview(@CurrentUser() u: PublicUser, @Req() r: Request) {
    return this.bankCheck.overview(actor(u, r));
  }
  @Post('bank-checks') @Roles('STUDENT')
  createBankCheck(@CurrentUser() u: PublicUser, @Req() r: Request, @Body() b: BankCheckDto) {
    return this.bankCheck.create(actor(u, r), b.key);
  }
  @Post('orders') @Roles('STUDENT') order(
    @CurrentUser() u: PublicUser,
    @Req() r: Request,
    @Body() b: SePayOrderDto,
  ) {
    if (b.enrollmentId) {
      return this.tuitionPayment.retryHoldForEnrollment(u.id, b.enrollmentId);
    }
    if (b.obligationId && b.key && b.consentVersion === 'W07_SEPAY_PAYMENT_V1') {
      return this.service.create(actor(u, r), {
        obligationId: b.obligationId,
        key: b.key,
        consentVersion: b.consentVersion,
      });
    }
    throw new BadRequestException('enrollmentId is required to create or resume tuition checkout');
  }
  @Get('orders/:id')
  @Header('Cache-Control', 'private, no-store')
  @Roles('STUDENT', 'CASHIER')
  detail(
    @CurrentUser() u: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.tuitionPayment.getOrderForLearner(u.id, id);
  }
  @Get('cashier')
  @Header('Cache-Control', 'private, no-store')
  @Roles('CASHIER', 'SYSTEM_ADMIN')
  cashier(
    @CurrentUser() u: PublicUser,
    @Query('search') search?: string,
    @Query('state') state?: string,
    @Query('scope') scope?: 'ALL' | 'REAL' | 'TEST',
  ) {
    return this.tuitionPayment.getCashierWorkspace(u.id, { search, state, scope });
  }
  @Get('cashier/financial-report')
  @Header('Cache-Control', 'private, no-store')
  @Roles('CASHIER', 'SYSTEM_ADMIN')
  cashierFinancialReport(
    @CurrentUser() u: PublicUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('preset') preset?: string,
    @Query('classId') classId?: string,
    @Query('method') method?: string,
  ) {
    return this.tuitionPayment.getCashierFinancialReport(u.id, {
      from,
      to,
      preset,
      classId,
      method,
    });
  }
  @Post('transactions/:id/reconcile')
  @Roles('CASHIER')
  reconcile(
    @CurrentUser() u: PublicUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: SePayReconcileDto,
  ) {
    const decision: CashierResolutionDecision =
      b.decision === 'CONFIRM_RECEIPT'
        ? 'CONFIRM_MATCH_AND_ACTIVATE'
        : b.decision === 'HOLD'
          ? 'MARK_REFUND_NEEDED'
          : b.decision;
    return this.tuitionPayment.resolveCashierException(u.id, id, {
      decision,
      receivableId: b.receivableId,
      note: b.reason,
    });
  }
  @Post('webhook')
  @Public()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  webhook(
    @Req() r: RawBodyRequest<Request>,
    @Headers('x-sepay-timestamp') time: unknown,
    @Headers('x-sepay-signature') signature: unknown,
  ) {
    return this.tuitionPayment.reconcileIncomingTransfer({
      rawBody: r.rawBody as Buffer,
      signatureHeader: typeof signature === 'string' ? signature : undefined,
      timestampHeader: typeof time === 'string' ? time : undefined,
      mode: 'LIVE_WEBHOOK',
    });
  }
  @Post('test-harness/simulate-transfer')
  @Roles('STUDENT', 'CASHIER', 'SYSTEM_ADMIN')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  simulateTestTransfer(
    @CurrentUser() u: PublicUser,
    @Req() r: RawBodyRequest<Request>,
  ) {
    const raw =
      r.rawBody && r.rawBody.length > 0
        ? (r.rawBody as Buffer)
        : Buffer.from(JSON.stringify(r.body ?? {}), 'utf8');
    return this.tuitionPayment.reconcileIncomingTransfer({
      rawBody: raw,
      mode: 'DEV_TEST_HARNESS',
      harnessActorUserId: u.id,
    });
  }
  @Post('contract-checks/:runId')
  @Roles('SYSTEM_ADMIN')
  @HttpCode(200)
  check(
    @CurrentUser() u: PublicUser,
    @Req() r: RawBodyRequest<Request>,
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @Headers('x-sepay-timestamp') time: unknown,
    @Headers('x-sepay-signature') signature: unknown,
  ) {
    return this.service.contractCheck(actor(u, r), r.rawBody as Buffer, time, signature, runId);
  }
}
