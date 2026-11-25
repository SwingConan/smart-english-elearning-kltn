import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PublicUser } from '../users/user.types';
import {
  CertificatesWorkspaceService,
  type CreateCompletionPolicyInput,
  type IssueCertificateInput,
  type ReviewCompletionPolicyInput,
  type RevokeCertificateInput,
  type SubmitCertificateReviewInput,
  type UpdateDraftPolicyInput,
} from './certificates-workspace.service';

@Controller('v2/certificates')
export class CertificatesWorkspaceController {
  constructor(private readonly service: CertificatesWorkspaceService) {}

  @Get('workspace')
  @Roles('ACADEMIC_MANAGER')
  getWorkspace(@CurrentUser() user: PublicUser) {
    return this.service.getWorkspace(user.id);
  }

  @Post('policies')
  @Roles('ACADEMIC_MANAGER')
  createPolicy(@CurrentUser() user: PublicUser, @Body() body: CreateCompletionPolicyInput) {
    return this.service.createPolicy(user.id, body);
  }

  @Patch('policies/:policyId')
  @Roles('ACADEMIC_MANAGER')
  updateDraftPolicy(
    @CurrentUser() user: PublicUser,
    @Param('policyId') policyId: string,
    @Body() body: UpdateDraftPolicyInput,
  ) {
    return this.service.updateDraftPolicy(user.id, policyId, body);
  }

  @Get('policies/:policyId/preview')
  @Roles('ACADEMIC_MANAGER')
  previewPolicy(@CurrentUser() user: PublicUser, @Param('policyId') policyId: string) {
    return this.service.previewPolicy(user.id, policyId);
  }

  @Post('policies/:policyId/review')
  @Roles('ACADEMIC_MANAGER')
  reviewPolicy(
    @CurrentUser() user: PublicUser,
    @Param('policyId') policyId: string,
    @Body() body: ReviewCompletionPolicyInput,
  ) {
    return this.service.reviewPolicy(user.id, policyId, body);
  }

  @Get('enrollments/:enrollmentId/evaluate')
  @Roles('ACADEMIC_MANAGER', 'STUDENT')
  evaluateEnrollment(
    @CurrentUser() user: PublicUser,
    @Param('enrollmentId') enrollmentId: string,
    @Query('policyId') policyId?: string,
  ) {
    return this.service.evaluateEnrollmentForActor(user.id, enrollmentId, policyId);
  }

  @Post('reviews')
  @Roles('ACADEMIC_MANAGER')
  submitReview(@CurrentUser() user: PublicUser, @Body() body: SubmitCertificateReviewInput) {
    return this.service.submitReview(user.id, body);
  }

  @Post('issue')
  @Roles('ACADEMIC_MANAGER')
  issueCertificate(@CurrentUser() user: PublicUser, @Body() body: IssueCertificateInput) {
    return this.service.issueCertificate(user.id, body);
  }

  @Post(':certificateId/revoke')
  @Roles('ACADEMIC_MANAGER')
  revokeCertificate(
    @CurrentUser() user: PublicUser,
    @Param('certificateId') certificateId: string,
    @Body() body: RevokeCertificateInput,
  ) {
    return this.service.revokeCertificate(user.id, certificateId, body);
  }

  @Get('lookup/:code')
  @Public()
  lookupByCode(@Param('code') code: string) {
    return this.service.lookupByCode(code);
  }
}
