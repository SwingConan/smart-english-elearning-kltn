import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { ClassAssignmentSubmission, Prisma } from '../../generated/prisma/client';
import type { AuthorityActor } from '../authorization/authorization.service';
import { AuthorizationService } from '../authorization/authorization.service';
import { LearningResourceStorage } from '../learning/learning-resource.storage';
import { ClassLmsService } from './class-lms.service';
import { AssignmentDraftDto, AssignmentSubmitDto } from './assignment.dto';
type Tx = Prisma.TransactionClient;
const missing = () => new NotFoundException('Assignment or submission not available');
const conflict = () =>
  new ConflictException('Draft or published source changed; reload and review before retry');
@Injectable()
export class AssignmentService {
  constructor(
    private readonly lms: ClassLmsService,
    private readonly audit: AuthorizationService,
    private readonly storage: LearningResourceStorage,
  ) {}
  private async source(
    tx: Tx,
    classId: string,
    id: string,
    learner: boolean,
    now: Date,
    readOnly = false,
  ) {
    const a = await this.lms.activity(tx, classId, id);
    if (
      a.type !== 'ASSIGNMENT' ||
      (learner &&
        (!a.section.publishedRevisionId ||
          a.state !== 'PUBLISHED' ||
          !a.publishedRevision ||
          !(readOnly
            ? this.lms.readable(a.publishedRevision, now)
            : this.lms.visible(a.publishedRevision, now))))
    )
      throw missing();
    return a;
  }
  private project(row: ClassAssignmentSubmission | null) {
    if (!row) return null;
    return {
      id: row.id,
      activityId: row.activityId,
      revisionId: row.revisionId,
      state: row.state,
      text: row.text,
      lockVersion: row.lockVersion,
      file: row.storageKey
        ? {
            name: row.originalFileName,
            mimeType: row.mimeType,
            bytes: row.fileBytes,
            sha256: row.fileSha256,
          }
        : null,
      submittedAt: row.submittedAt,
      updatedAt: row.updatedAt,
      receipt:
        row.state === 'SUBMITTED'
          ? { id: row.id, revisionId: row.revisionId, submittedAt: row.submittedAt }
          : null,
      grade: null,
      gradingState: 'NOT_GRADED' as const,
    };
  }
  private async own(tx: Tx, activityId: string, enrollmentId: string) {
    return tx.classAssignmentSubmission.findUnique({
      where: { activityId_enrollmentId: { activityId, enrollmentId } },
    });
  }
  status(actor: AuthorityActor, classId: string, id: string) {
    return this.lms.run(actor, classId, async (tx, s) => {
      if (!s.enrollment) throw missing();
      const a = await this.source(tx, classId, id, true, s.now, true);
      const row = await this.own(tx, id, s.enrollment.id);
      const states = row
        ? await tx.assignmentGrade.findMany({
            where: { submissionId: row.id },
            select: { state: true },
          })
        : [];
      return {
        publishedRevisionId: a.publishedRevisionId,
        submission: row
          ? {
              ...this.project(row),
              gradingState: states.some((g) => g.state === 'PUBLISHED')
                ? 'PUBLISHED'
                : states.some((g) => g.state === 'REVIEWED_FINAL')
                  ? 'PENDING_PUBLICATION'
                  : states.length
                    ? 'GRADING_IN_PROGRESS'
                    : 'NOT_GRADED',
            }
          : null,
      };
    });
  }
  async save(
    actor: AuthorityActor,
    classId: string,
    id: string,
    b: AssignmentDraftDto,
    file?: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    let createdKey: string | undefined;
    try {
      return await this.lms.run(actor, classId, async (tx, s) => {
        if (!s.enrollment) throw missing();
        const a = await this.source(tx, classId, id, true, s.now),
          old = await this.own(tx, id, s.enrollment.id);
        if (
          a.publishedRevisionId !== b.revisionId ||
          (old?.lockVersion ?? 0) !== b.expectedLockVersion ||
          old?.state === 'SUBMITTED'
        )
          throw conflict();
        let attachment = {
          storageKey: old?.storageKey ?? null,
          originalFileName: old?.originalFileName ?? null,
          mimeType: old?.mimeType ?? null,
          fileBytes: old?.fileBytes ?? null,
          fileSha256: old?.fileSha256 ?? null,
        };
        if (file) {
          const f = await this.storage.put(file);
          createdKey = f.key;
          attachment = {
            storageKey: f.key,
            originalFileName: f.originalFileName,
            mimeType: f.mimeType,
            fileBytes: f.bytes,
            fileSha256: createHash('sha256').update(file.buffer).digest('hex'),
          };
        }
        const data = { revisionId: b.revisionId, text: b.text, ...attachment };
        const row = old
          ? await tx.classAssignmentSubmission.update({
              where: { id: old.id },
              data: { ...data, lockVersion: { increment: 1 } },
            })
          : await tx.classAssignmentSubmission.create({
              data: {
                ...data,
                activityId: id,
                enrollmentId: s.enrollment.id,
                learnerId: actor.id,
                classOfferingId: classId,
              },
            });
        await this.audit.audit(
          tx,
          actor.id,
          'W03B_SUBMISSION_DRAFT',
          'CLASS_ASSIGNMENT_SUBMISSION',
          row.id,
          'Private learner draft; not submitted or graded',
        );
        return this.project(row);
      });
    } catch (e) {
      if (createdKey) await this.storage.delete(createdKey);
      throw e;
    }
  }
  submit(actor: AuthorityActor, classId: string, id: string, b: AssignmentSubmitDto) {
    return this.lms.run(actor, classId, async (tx, s) => {
      if (!s.enrollment) throw missing();
      const a = await this.source(tx, classId, id, true, s.now, true),
        old = await this.own(tx, id, s.enrollment.id);
      const hash = createHash('sha256')
        .update(
          JSON.stringify({ revisionId: b.revisionId, expectedLockVersion: b.expectedLockVersion }),
        )
        .digest('hex');
      if (old?.state === 'SUBMITTED') {
        if (old.idempotencyKey === b.idempotencyKey.toLowerCase() && old.requestHash === hash)
          return this.project(old);
        throw new ConflictException('Already submitted; business resubmission is not enabled');
      }
      if (!this.lms.visible(a.publishedRevision!, s.now))
        throw new BadRequestException('Assignment submission window is closed');
      if (
        !old ||
        old.lockVersion !== b.expectedLockVersion ||
        old.revisionId !== b.revisionId ||
        a.publishedRevisionId !== b.revisionId
      )
        throw conflict();
      if (!old.text.trim() && !old.storageKey)
        throw new BadRequestException('Text or an authorized attachment required');
      if (old.storageKey) await this.checkFile(old);
      const row = await tx.classAssignmentSubmission.update({
        where: { id: old.id },
        data: {
          state: 'SUBMITTED',
          lockVersion: { increment: 1 },
          idempotencyKey: b.idempotencyKey.toLowerCase(),
          requestHash: hash,
          submittedAt: await this.lms.now(tx),
        },
      });
      await this.audit.audit(
        tx,
        actor.id,
        'W03B_SUBMIT',
        'CLASS_ASSIGNMENT_SUBMISSION',
        row.id,
        'First immutable submission; no score or academic finalization',
      );
      return this.project(row);
    });
  }
  list(actor: AuthorityActor, classId: string, id: string) {
    return this.lms.run(
      actor,
      classId,
      async (tx, s) => {
        await this.source(tx, classId, id, false, s.now);
        const rows = await tx.classAssignmentSubmission.findMany({
          where: { activityId: id, classOfferingId: classId, state: 'SUBMITTED' },
          orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
          include: {
            learner: { select: { id: true, fullName: true } },
            revision: {
              select: { number: true, title: true, contentMarkdown: true, introduction: true },
            },
          },
        });
        // Drafts and their existence are private to each learner, including from the assigned teacher.
        const gradeStates = await tx.assignmentGrade.findMany({
          where: { submissionId: { in: rows.map((r) => r.id) } },
          select: { submissionId: true, state: true },
        });
        return {
          submissions: rows.map((r) => ({
            ...this.project(r),
            gradingState: gradeStates.some(
              (g) => g.submissionId === r.id && g.state === 'PUBLISHED',
            )
              ? 'PUBLISHED'
              : gradeStates.some((g) => g.submissionId === r.id && g.state === 'REVIEWED_FINAL')
                ? 'PENDING_PUBLICATION'
                : gradeStates.some((g) => g.submissionId === r.id)
                  ? 'GRADING_IN_PROGRESS'
                  : 'NOT_GRADED',
            learner: r.learner,
            source: r.revision,
          })),
        };
      },
      true,
    );
  }
  async checkFile(row: ClassAssignmentSubmission) {
    try {
      const meta = await this.storage.stat(row.storageKey!);
      if (meta.sizeBytes !== row.fileBytes) throw Error('size');
      const h = createHash('sha256');
      let bytes = 0;
      for await (const c of this.storage.open(row.storageKey!)) {
        bytes += c.length;
        if (bytes > 20 * 1024 * 1024) throw Error('size');
        h.update(c);
      }
      if (bytes !== row.fileBytes || h.digest('hex') !== row.fileSha256) throw Error('hash');
    } catch {
      throw new ServiceUnavailableException(
        'Attachment unavailable or integrity check failed; draft retained, retry later',
      );
    }
  }
  download(actor: AuthorityActor, classId: string, id: string, submissionId: string) {
    return this.lms.run(actor, classId, async (tx, s) => {
      await this.source(tx, classId, id, !s.teacher, s.now, true);
      const row = await tx.classAssignmentSubmission.findFirst({
        where: {
          id: submissionId,
          activityId: id,
          classOfferingId: classId,
          ...(s.teacher
            ? { state: 'SUBMITTED' }
            : { enrollmentId: s.enrollment!.id, learnerId: actor.id }),
        },
      });
      if (!row?.storageKey) throw missing();
      await this.checkFile(row);
      return {
        stream: this.storage.open(row.storageKey),
        mimeType: row.mimeType!,
        fileName: row.originalFileName!,
      };
    });
  }
}
