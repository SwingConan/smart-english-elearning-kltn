import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { cmsError, CmsRuntimeService } from './cms-runtime.service';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ClassLmsService } from '../class-lms/class-lms.service';
describe('CMS command safety and SQL error boundary', () => {
  it('maps person-level self approval denial to 403 without leaking a SQL payload', () => {
    const error = cmsError({
      meta: { code: '42501', message: 'CMS_AUTHOR_CANNOT_REVIEW_OR_PUBLISH' },
      query: 'private data',
    });
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(JSON.stringify(error)).not.toContain('private data');
  });
  it('reports stale version as a conflict instead of retrying a write silently', () => {
    expect(cmsError({ meta: { code: '40001', message: 'CMS_STALE_REVISION' } })).toBeInstanceOf(
      ConflictException,
    );
  });
  it('does not expose missing content outside authorized scope', () => {
    expect(cmsError({ meta: { code: 'P0002', message: 'CMS_CONTENT_NOT_FOUND' } })).toBeInstanceOf(
      NotFoundException,
    );
  });
  it('keeps a failed database identity unavailable', () => {
    expect(
      cmsError({ meta: { code: '42501', message: 'CMS_TARGET_IDENTITY_REQUIRED' } }),
    ).toBeInstanceOf(ServiceUnavailableException);
  });
  it('does not accept payload replacement inside a review operation', () => {
    const service = new CmsRuntimeService({} as PrismaService, {} as ClassLmsService);
    expect(() =>
      service.command({ id: 'a', sessionId: 's' }, 'id', 'approve', {
        scopeId: 'scope',
        expectedVersion: 1,
        reason: 'Review',
        title: 'Unauthorized edit',
      }),
    ).toThrow(BadRequestException);
  });
  it('requires all content fields when creating a new revision', () => {
    const service = new CmsRuntimeService({} as PrismaService, {} as ClassLmsService);
    expect(() =>
      service.command({ id: 'a', sessionId: 's' }, 'id', 'revise', {
        scopeId: 'scope',
        expectedVersion: 1,
        reason: 'Edit',
      }),
    ).toThrow(BadRequestException);
  });
});
