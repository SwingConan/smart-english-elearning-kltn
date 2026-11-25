import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthorityActor } from '../authorization/authorization.service';
import { ClassLmsService } from '../class-lms/class-lms.service';
import { verifyUnifiedTarget } from './unified-runtime.guard';
import type { CmsDraftDto, CmsRevisionCommandDto } from './cms-runtime.dto';
type Tx = Prisma.TransactionClient;
export const CMS_ACTIONS = {
  create: 'cms.draft',
  edit: 'cms.draft',
  revise: 'cms.draft',
  submit: 'cms.draft',
  approve: 'cms.review',
  reject: 'cms.review',
  publish: 'cms.publish',
  withdraw: 'cms.publish',
} as const;
export type CmsAction = keyof typeof CMS_ACTIONS;
type Context = { id: string; role: string; personId: string };
type DetailRow = {
  id: string;
  contentId: string;
  scopeId: string;
  slug: string;
  number: number;
  title: string;
  body: string;
  sourceReference: string;
  policyRef: string;
  bodySha256: string;
  authorUser: string;
  authorPerson: string;
  createdAt: Date;
  state: string;
  stateAt: Date;
  lockVersion: number;
  headRevision: string;
  publishedRevisionId: string | null;
  authors: string[];
  canDraft: boolean;
  canReview: boolean;
  canPublish: boolean;
  canAudit: boolean;
};
export function cmsError(error: unknown): Error {
  if (error instanceof HttpException) return error;
  const text = String(error) + JSON.stringify(error),
    code = /CMS_[A-Z_]+/.exec(text)?.[0];
  if (code === 'CMS_STALE_REVISION' || /23505/.test(text))
    return new ConflictException({
      code: code ?? 'CMS_SLUG_CONFLICT',
      message: 'Nội dung đã thay đổi hoặc đường dẫn bị trùng. Đọc lại trước khi thử lại.',
    });
  if (code === 'CMS_CONTENT_NOT_FOUND')
    return new NotFoundException('Nội dung không khả dụng trong phạm vi hiện hành.');
  if (code === 'CMS_TARGET_IDENTITY_REQUIRED' || /3F000|42883/.test(text))
    return new ServiceUnavailableException({
      code: 'CMS_TARGET_OR_SCHEMA_UNAVAILABLE',
      message: 'Nguồn CMS được xác minh chưa khả dụng.',
    });
  if (/42501/.test(text))
    return new ForbiddenException({
      code: code ?? 'CMS_PERMISSION_DENIED',
      message:
        code === 'CMS_AUTHOR_CANNOT_REVIEW_OR_PUBLISH'
          ? 'Người tham gia tạo revision không được tự duyệt, từ chối hoặc công bố revision đó.'
          : 'Không có quyền CMS hiện hành trong phạm vi này.',
    });
  if (/23514/.test(text))
    return new ConflictException({
      code: code ?? 'CMS_VALIDATION_CONFLICT',
      message: 'Nội dung hoặc trạng thái không phù hợp với thao tác. Đọc lại revision hiện hành.',
    });
  return new ServiceUnavailableException({
    code: 'CMS_OPERATION_UNAVAILABLE',
    message: 'CMS chưa xử lý được yêu cầu. Đọc lại nội dung trước khi thử lại.',
  });
}
@Injectable()
export class CmsRuntimeService {
  constructor(
    private readonly db: PrismaService,
    private readonly lms: ClassLmsService,
  ) {}
  private async guard(tx: Tx) {
    const raw = process.env.E2E_DATABASE_URL;
    if (
      process.env.W10_CMS_ENABLED !== 'DEV_DEC070' ||
      process.env.NODE_ENV === 'production' ||
      !raw ||
      raw !== process.env.DATABASE_URL
    )
      throw new ServiceUnavailableException('CMS_VERIFIED_QA_CONFIGURATION_REQUIRED');
    const url = new URL(raw);
    const integrated = process.env.V2_UNIFIED_RUNTIME === 'DEV_UNIFIED_01';
    if (
      url.hostname !== '127.0.0.1' ||
      url.port !== '55401' ||
      url.username !== 'wave01' ||
      (!/^\/v2_wave01_dev_test_w10_cms_complete02_[a-z0-9_]+$/.test(url.pathname) &&
        !(
          integrated &&
          /^\/v2_wave01_dev_test_w04b_unified_runtime01_[a-z0-9_]+$/.test(url.pathname)
        )) ||
      url.pathname.slice(1) !== process.env.W10_CMS_EXPECTED_DATABASE
    )
      throw new ServiceUnavailableException('CMS_VERIFIED_QA_CONFIGURATION_REQUIRED');
    if (integrated) await verifyUnifiedTarget(tx);
    await tx.$queryRaw`SELECT 1 FROM cms_v2.assert_target()`;
    const [identity] = await tx.$queryRaw<
      { oid: string; physical: string }[]
    >`SELECT oid::text AS oid,(SELECT system_identifier::text FROM pg_control_system()) AS physical FROM pg_database WHERE datname=current_database()`;
    if (
      identity?.oid !== process.env.W10_CMS_VERIFIED_OID ||
      identity.physical !== process.env.W10_CMS_PHYSICAL_ID
    )
      throw new ServiceUnavailableException('CMS_TARGET_IDENTITY_REQUIRED');
  }
  private async run<T>(
    actor: AuthorityActor | null,
    write: boolean,
    work: (tx: Tx, context: Context | null) => Promise<T>,
  ) {
    try {
      return await this.db.$transaction(
        async (tx) => {
          if (!write) await tx.$executeRaw`SET TRANSACTION READ ONLY`;
          await tx.$queryRaw`SELECT set_config('TimeZone','UTC',true)`;
          await this.guard(tx);
          let context: Context | null = null;
          if (actor) {
            await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(842030)`;
            const user = await this.lms.context(tx, actor);
            await tx.$queryRaw`SELECT set_config('cms_v2.actor',${user.id},true),set_config('cms_v2.session',${actor.sessionId},true)`;
            const [identity] = await tx.$queryRaw<
              { personId: string }[]
            >`SELECT person_id::text AS "personId" FROM cms_v2.identities WHERE user_id=${user.id}::uuid AND cms_v2.actor()=${user.id}::uuid`;
            if (!identity || !['COUNSELOR', 'ACADEMIC_MANAGER'].includes(user.role))
              throw new ForbiddenException('CMS_CURRENT_RESOURCE_IDENTITY_REQUIRED');
            context = { id: user.id, role: user.role, personId: identity.personId };
          }
          return work(tx, context);
        },
        {
          maxWait: 10000,
          timeout: 30000,
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        },
      );
    } catch (error) {
      throw cmsError(error);
    }
  }
  readiness(actor: AuthorityActor) {
    return this.run(actor, false, async (tx, context) => {
      const user = context!;
      const scopes = await tx.$queryRaw<
        { id: string; name: string; policyRef: string; canCreate: boolean }[]
      >`SELECT id,name,policy_ref AS "policyRef",cms_v2.permits(${user.id}::uuid,id,'cms.draft') AS "canCreate" FROM cms_v2.scopes WHERE cms_v2.permits(${user.id}::uuid,id,'cms.read') ORDER BY name`;
      if (!scopes.length) throw new ForbiddenException('CMS_RESOURCE_PERMISSION_REQUIRED');
      const contents = await tx.$queryRaw<
        {
          id: string;
          scopeId: string;
          slug: string;
          headRevision: string;
          lockVersion: number;
          number: number;
          title: string;
          state: string;
          publishedRevisionId: string | null;
        }[]
      >`SELECT c.id,c.scope_id AS "scopeId",c.slug,c.head_revision AS "headRevision",c.lock_version AS "lockVersion",r.number,r.title,r.state,p.revision_id AS "publishedRevisionId" FROM cms_v2.contents c JOIN cms_v2.current_revisions r ON r.id=c.head_revision LEFT JOIN cms_v2.publications p ON p.id=c.current_publication WHERE cms_v2.permits(${user.id}::uuid,c.scope_id,'cms.read') ORDER BY c.created_at DESC,c.id LIMIT 101`;
      return {
        viewerId: user.id,
        viewerPersonId: user.personId,
        role: user.role,
        checkedAt: (await this.lms.now(tx)).toISOString(),
        state: 'READY',
        workflowAvailable: true,
        scopes,
        contents: contents.slice(0, 100),
        truncated: contents.length > 100,
        policy: 'V2-DEC-070/BR-V2-112:ORIGINAL_TEAM_TEXT',
      };
    });
  }
  private async readRevision(tx: Tx, user: Context, id: string) {
    const [r] = await tx.$queryRaw<
      DetailRow[]
    >`SELECT r.id,r.content_id AS "contentId",c.scope_id AS "scopeId",c.slug,r.number,r.title,r.body,r.source_reference AS "sourceReference",r.policy_ref AS "policyRef",r.body_sha256 AS "bodySha256",r.author_user AS "authorUser",r.author_person AS "authorPerson",r.created_at AS "createdAt",r.state,r.state_at AS "stateAt",c.lock_version AS "lockVersion",c.head_revision AS "headRevision",p.revision_id AS "publishedRevisionId",ARRAY(SELECT person_id::text FROM cms_v2.revision_authors a WHERE a.revision_id=r.id) AS authors,cms_v2.permits(${user.id}::uuid,c.scope_id,'cms.draft') AS "canDraft",cms_v2.permits(${user.id}::uuid,c.scope_id,'cms.review') AS "canReview",cms_v2.permits(${user.id}::uuid,c.scope_id,'cms.publish') AS "canPublish",cms_v2.permits(${user.id}::uuid,c.scope_id,'cms.audit') AS "canAudit" FROM cms_v2.current_revisions r JOIN cms_v2.contents c ON c.id=r.content_id LEFT JOIN cms_v2.publications p ON p.id=c.current_publication WHERE r.id=${id}::uuid AND cms_v2.permits(${user.id}::uuid,c.scope_id,'cms.read')`;
    if (!r) throw new NotFoundException('Nội dung không khả dụng trong phạm vi hiện hành.');
    const head = r.id === r.headRevision,
      independent = !r.authors.includes(user.personId);
    const allowedActions: CmsAction[] = [];
    if (r.canDraft && head) {
      if (r.state === 'DRAFT') allowedActions.push('edit', 'submit');
      if (['PUBLISHED', 'REJECTED', 'WITHDRAWN', 'APPROVED'].includes(r.state))
        allowedActions.push('revise');
    }
    if (head && r.canReview && independent && r.state === 'IN_REVIEW')
      allowedActions.push('approve', 'reject');
    if (head && r.canPublish && independent && r.state === 'APPROVED')
      allowedActions.push('publish');
    if (r.canPublish && r.publishedRevisionId === r.id && r.state === 'PUBLISHED')
      allowedActions.push('withdraw');
    const history = await tx.$queryRaw<
      { id: string; number: number; title: string; state: string; createdAt: Date }[]
    >`SELECT id,number,title,state,created_at AS "createdAt" FROM cms_v2.current_revisions WHERE content_id=${r.contentId}::uuid ORDER BY number DESC`;
    const events = await tx.$queryRaw<
      {
        id: string;
        number: number;
        state: string;
        actorUser: string;
        actorPerson: string;
        reason: string;
        at: Date;
      }[]
    >`SELECT e.id,e.number,e.state,e.actor_user AS "actorUser",e.actor_person AS "actorPerson",e.reason,e.at FROM cms_v2.revision_events e WHERE e.revision_id=${r.id}::uuid ORDER BY e.number`;
    const audit = r.canAudit
      ? await tx.$queryRaw<
          {
            id: string;
            action: string;
            revisionId: string;
            actorUser: string;
            actorPerson: string;
            reason: string;
            at: Date;
          }[]
        >`SELECT id::text,action,revision_id AS "revisionId",actor_user AS "actorUser",actor_person AS "actorPerson",reason,at FROM cms_v2.audit_events WHERE content_id=${r.contentId}::uuid ORDER BY id`
      : null;
    return {
      ...r,
      viewerId: user.id,
      viewerPersonId: user.personId,
      isAuthor: !independent,
      allowedActions,
      history,
      events,
      audit,
    };
  }
  revision(actor: AuthorityActor, id: string) {
    return this.run(actor, false, (tx, user) => this.readRevision(tx, user!, id));
  }
  create(actor: AuthorityActor, input: CmsDraftDto) {
    return this.run(actor, true, async (tx, user) => {
      const [permission] = await tx.$queryRaw<
        { allowed: boolean }[]
      >`SELECT cms_v2.permits(${user!.id}::uuid,${input.scopeId}::uuid,'cms.draft') AS allowed`;
      if (!permission?.allowed) throw new ForbiddenException('CMS_RESOURCE_PERMISSION_REQUIRED');
      const payload = { ...input, reason: 'Tạo văn bản gốc do nhóm tự biên soạn trên QA.' };
      const [created] = await tx.$queryRaw<
        { id: string }[]
      >`SELECT cms_v2.command('create',${input.scopeId}::uuid,NULL,0,${JSON.stringify(payload)}::jsonb)::text AS id`;
      return this.readRevision(tx, user!, created.id);
    });
  }
  command(actor: AuthorityActor, id: string, action: CmsAction, input: CmsRevisionCommandDto) {
    if (action === 'create') throw new BadRequestException('Dùng endpoint tạo nội dung.');
    if (['edit', 'revise'].includes(action)) {
      if (!input.title?.trim() || !input.body?.trim() || !input.sourceReference?.trim())
        throw new BadRequestException('Cần tiêu đề, nội dung gốc và nguồn biên soạn.');
    } else if (
      input.title !== undefined ||
      input.body !== undefined ||
      input.sourceReference !== undefined
    )
      throw new BadRequestException('Thao tác duyệt không được sửa payload của revision.');
    return this.run(actor, true, async (tx, user) => {
      const [permission] = await tx.$queryRaw<
        { allowed: boolean }[]
      >`SELECT cms_v2.permits(${user!.id}::uuid,${input.scopeId}::uuid,${CMS_ACTIONS[action]}) AS allowed`;
      if (!permission?.allowed) throw new ForbiddenException('CMS_RESOURCE_PERMISSION_REQUIRED');
      const [changed] = await tx.$queryRaw<
        { id: string }[]
      >`SELECT cms_v2.command(${action},${input.scopeId}::uuid,${id}::uuid,${input.expectedVersion},${JSON.stringify(input)}::jsonb)::text AS id`;
      return this.readRevision(tx, user!, changed.id);
    });
  }
  publications(slug?: string) {
    return this.run(null, false, async (tx) => {
      const items = await tx.$queryRaw<
        {
          slug: string;
          revisionId: string;
          revision: number;
          title: string;
          body: string;
          sourceReference: string;
          policyRef: string;
          bodySha256: string;
          publishedAt: Date;
        }[]
      >(
        Prisma.sql`SELECT slug,revision_id AS "revisionId",revision,title,body,source_reference AS "sourceReference",policy_ref AS "policyRef",body_sha256 AS "bodySha256",published_at AS "publishedAt" FROM cms_v2.public_content ${slug ? Prisma.sql`WHERE slug=${slug}` : Prisma.empty} ORDER BY published_at DESC,slug LIMIT 101`,
      );
      if (slug && !items.length) throw new NotFoundException('Nội dung công khai không khả dụng.');
      return {
        state: 'AVAILABLE',
        items: items.slice(0, 100),
        truncated: items.length > 100,
        checkedAt: new Date().toISOString(),
      };
    });
  }
}
