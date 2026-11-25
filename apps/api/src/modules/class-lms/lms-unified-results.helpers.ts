import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client';

type Tx = Prisma.TransactionClient;

export type AssessmentKind = 'QUIZ' | 'REGULAR' | 'MIDTERM' | 'FINAL';
export type QuizReleaseMode =
  | 'AUTO_ON_SUBMIT'
  | 'INSTRUCTOR_PUBLISH'
  | 'ACADEMIC_APPROVAL_REQUIRED';

export const ASSESSMENT_KIND_LABELS: Record<AssessmentKind, string> = {
  QUIZ: 'Quiz luyện tập',
  REGULAR: 'Kiểm tra thường kỳ',
  MIDTERM: 'Kiểm tra giữa kỳ',
  FINAL: 'Kiểm tra cuối kỳ',
};

export interface QuestionBankQuery {
  search?: string;
  responseType?: 'ALL' | 'MCQ' | 'ESSAY';
  skill?: string;
  limit?: number;
}

export interface QuestionBankItem {
  id: string;
  source: 'COURSE_BANK' | 'CLASS_QUIZ';
  sourceLabel: string;
  type: 'MCQ' | 'ESSAY';
  toeicSkill: string;
  difficulty: string;
  prompt: string;
  explanation: string;
  points: number;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string | null;
}

export interface UnifiedActivityColumn {
  activityId: string;
  sectionId: string;
  sectionTitle: string;
  sectionOrder: number;
  orderIndex: number;
  title: string;
  baseType: string;
  localKind: string | null;
  assessmentKind: AssessmentKind | null;
  kindLabel: string;
  state: string;
  availableFrom: string | null;
  availableUntil: string | null;
  maxScore: number | null;
  passScore: number | null;
  releaseMode: QuizReleaseMode | null;
}

export interface UnifiedAssignmentCell {
  activityId: string;
  submissionId: string | null;
  submissionState: 'NOT_SUBMITTED' | 'DRAFT' | 'SUBMITTED';
  submittedAt: string | null;
  score: number | null;
  maxScore: number;
  gradeState: 'NOT_GRADED' | 'DRAFT' | 'PENDING_PUBLICATION' | 'PUBLISHED';
  gradeSource: 'LOCAL_DIRECT' | 'CORE_RUBRIC' | null;
  feedback: string;
  gradedAt: string | null;
}

export interface UnifiedQuizCell {
  activityId: string;
  assessmentKind: AssessmentKind;
  attemptCount: number;
  latestAttemptId: string | null;
  attemptStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'SUBMITTED';
  submittedAt: string | null;
  gradingStatus: 'NOT_SUBMITTED' | 'AUTO_GRADED' | 'PENDING_MANUAL_GRADE' | 'GRADED';
  gradePublished: boolean;
  score: number | null;
  maxScore: number | null;
  passScore: number | null;
  passed: boolean | null;
  teacherFeedback: string;
  gradedAt: string | null;
}

export interface UnifiedAttendanceCell {
  activityId: string;
  status: 'PRESENT' | 'LATE' | 'NOT_RECORDED';
  checkedInAt: string | null;
  note: string;
}

export interface UnifiedStudentRow {
  enrollmentId: string;
  learnerId: string;
  fullName: string;
  email: string;
  assignments: Record<string, UnifiedAssignmentCell>;
  quizzes: Record<string, UnifiedQuizCell>;
  attendance: Record<string, UnifiedAttendanceCell>;
  stats: {
    submittedAssignments: number;
    publishedAssignmentGrades: number;
    submittedQuizzes: number;
    publishedQuizGrades: number;
    attendancePresentCount: number;
    attendanceLateCount: number;
    attendanceTotalCount: number;
    completedActivitiesCount: number;
  };
}

export interface UnifiedFormalAssessmentItem {
  id: string;
  testId: string;
  title: string;
  stage: string;
  quizState: string | null;
  isActive: boolean;
  openAt: string | null;
  closeAt: string | null;
  submittedAttempts: number;
  myLatestAttempt?: {
    id: string;
    status: string;
    submittedAt: string | null;
    totalScore: number | null;
    gradingState: string | null;
  } | null;
}

export interface UnifiedClassResults {
  class: {
    id: string;
    code: string;
    name: string;
    courseId: string;
    courseTitle: string;
  };
  editable: boolean;
  activityColumns: UnifiedActivityColumn[];
  studentRows: UnifiedStudentRow[];
  formalAssessments: UnifiedFormalAssessmentItem[];
  draftCoreQuizCount: number;
  summary: {
    totalActivities: number;
    publishedActivities: number;
    assignmentsCount: number;
    quizzesCount: number;
    regularExamCount: number;
    midtermCount: number;
    finalCount: number;
    attendanceCount: number;
    awaitingAssignmentGrades: number;
    awaitingManualQuizGrades: number;
    formalAssessmentCount: number;
    draftCoreQuizCount: number;
  };
  policyNotes: string[];
}

export function normalizeAssessmentKind(value: unknown): AssessmentKind {
  if (value === 'REGULAR' || value === 'MIDTERM' || value === 'FINAL') return value;
  return 'QUIZ';
}

export function normalizeReleaseMode(
  value: unknown,
  _assessmentKind: AssessmentKind,
  autoReleaseObjective: boolean,
): QuizReleaseMode {
  if (value === 'INSTRUCTOR_PUBLISH' || value === 'ACADEMIC_APPROVAL_REQUIRED') {
    return 'INSTRUCTOR_PUBLISH';
  }
  if (value === 'AUTO_ON_SUBMIT') return 'AUTO_ON_SUBMIT';
  return autoReleaseObjective ? 'AUTO_ON_SUBMIT' : 'INSTRUCTOR_PUBLISH';
}

function resolveColumnMeta(
  activity: {
    id: string;
    type: string;
    title: string;
    state: string;
    availableFrom: Date | null;
    availableUntil: Date | null;
    publishedRevision: {
      type: string;
      title: string;
      availableFrom: Date | null;
      availableUntil: Date | null;
    } | null;
  },
  section: { id: string; title: string; orderIndex: number; publishedRevision?: { title: string } | null },
  orderIndex: number,
  localKind: string | null,
  quizConfig: { assessmentKind: AssessmentKind; releaseMode: QuizReleaseMode; passScore: number; totalPoints: number } | undefined,
  assignmentMaxScore: number,
  editable: boolean,
): UnifiedActivityColumn {
  const source = editable ? (activity.publishedRevision ?? activity) : activity.publishedRevision!;
  const baseType = source.type;
  let kindLabel = 'Hoạt động';
  let assessmentKind: AssessmentKind | null = null;
  let maxScore: number | null = null;
  let passScore: number | null = null;
  let releaseMode: QuizReleaseMode | null = null;

  if (localKind === 'LOCAL_ATTENDANCE') {
    kindLabel = 'Điểm danh buổi học';
  } else if (localKind === 'LOCAL_QUIZ') {
    assessmentKind = quizConfig?.assessmentKind ?? 'QUIZ';
    kindLabel = ASSESSMENT_KIND_LABELS[assessmentKind];
    maxScore = quizConfig?.totalPoints ?? null;
    passScore = quizConfig?.passScore ?? null;
    releaseMode = quizConfig?.releaseMode ?? 'AUTO_ON_SUBMIT';
  } else if (baseType === 'ASSIGNMENT') {
    kindLabel = 'Bài tập';
    maxScore = assignmentMaxScore;
  } else if (baseType === 'QUIZ') {
    kindLabel = 'Quiz hệ thống (Core)';
  } else if (baseType === 'LESSON') {
    kindLabel = 'Bài học';
  } else if (baseType === 'RESOURCE') {
    kindLabel = 'Tài liệu';
  }

  return {
    activityId: activity.id,
    sectionId: section.id,
    sectionTitle: editable ? section.title : (section.publishedRevision?.title ?? section.title),
    sectionOrder: section.orderIndex,
    orderIndex,
    title: source.title,
    baseType,
    localKind,
    assessmentKind,
    kindLabel,
    state: activity.state,
    availableFrom: source.availableFrom ? source.availableFrom.toISOString() : null,
    availableUntil: source.availableUntil ? source.availableUntil.toISOString() : null,
    maxScore,
    passScore,
    releaseMode,
  };
}

export async function listClassQuestionBank(
  tx: Tx,
  classId: string,
  query: QuestionBankQuery,
): Promise<{ totalCourseQuestions: number; items: QuestionBankItem[] }> {
  const klass = await tx.classOffering.findUnique({
    where: { id: classId },
    select: { id: true, courseId: true },
  });
  if (!klass) {
    throw new NotFoundException('Không tìm thấy lớp học.');
  }

  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 100);
  const search = String(query.search ?? '').trim();
  const typeFilter = query.responseType ?? 'ALL';
  const skillFilter = query.skill && query.skill !== 'ALL' ? query.skill.toUpperCase() : undefined;

  const responseTypes =
    typeFilter === 'MCQ'
      ? (['SINGLE_CHOICE'] as const)
      : typeFilter === 'ESSAY'
        ? (['TEXT_RESPONSE', 'AUDIO_RESPONSE'] as const)
        : (['SINGLE_CHOICE', 'TEXT_RESPONSE', 'AUDIO_RESPONSE'] as const);

  const [totalCourseQuestions, bankRows] = await Promise.all([
    tx.question.count({ where: { courseId: klass.courseId } }),
    tx.question.findMany({
      where: {
        courseId: klass.courseId,
        responseType: { in: [...responseTypes] },
        ...(skillFilter ? { toeicSkill: skillFilter as any } : {}),
        ...(search ? { content: { contains: search, mode: 'insensitive' } } : {}),
      },
      include: {
        options: {
          orderBy: { orderIndex: 'asc' },
          select: { id: true, content: true, isCorrect: true },
        },
      },
      orderBy: [{ toeicSkill: 'asc' }, { difficulty: 'asc' }, { id: 'asc' }],
      take: limit,
    }),
  ]);

  const items: QuestionBankItem[] = bankRows.map((q) => {
    const isMcq = q.responseType === 'SINGLE_CHOICE';
    const mappedOptions = isMcq
      ? q.options.map((o) => ({ id: o.id, text: o.content }))
      : [];
    const correctOption = isMcq ? q.options.find((o) => o.isCorrect) : null;
    return {
      id: q.id,
      source: 'COURSE_BANK',
      sourceLabel: 'Ngân hàng đề khóa học',
      type: isMcq ? 'MCQ' : 'ESSAY',
      toeicSkill: q.toeicSkill,
      difficulty: q.difficulty,
      prompt: q.content,
      explanation: q.explanation ?? '',
      points: 1,
      options: mappedOptions,
      correctOptionId: correctOption?.id ?? mappedOptions[0]?.id ?? null,
    };
  });

  if (!skillFilter) {
    const classReusableRows = (await tx.$queryRawUnsafe(
      `SELECT q.id, q.q_type, q.prompt, q.points, q.options_json, q.correct_option_id, q.explanation,
              COALESCE(a.title, 'Quiz trong lớp') AS activity_title
         FROM lms_local_quiz_questions q
         JOIN class_activities a ON a.id::text = q.activity_id
         JOIN class_sections s ON s.id = a."sectionId"
        WHERE s."classOfferingId"::text = $1
        ORDER BY q.created_at DESC
        LIMIT 40`,
      classId,
    )) as any[];

    const seenPrompts = new Set(items.map((item) => `${item.type}::${item.prompt.trim().toLowerCase()}`));
    for (const row of classReusableRows) {
      const qType: 'MCQ' | 'ESSAY' = row.q_type === 'ESSAY' ? 'ESSAY' : 'MCQ';
      if (typeFilter !== 'ALL' && qType !== typeFilter) continue;
      const prompt = String(row.prompt ?? '');
      if (search && !prompt.toLowerCase().includes(search.toLowerCase())) continue;
      const dedupeKey = `${qType}::${prompt.trim().toLowerCase()}`;
      if (seenPrompts.has(dedupeKey)) continue;
      seenPrompts.add(dedupeKey);
      const opts = Array.isArray(row.options_json)
        ? row.options_json.map((o: any, idx: number) => ({
            id: String(o.id || `opt_${idx}`),
            text: String(o.text ?? ''),
          }))
        : [];
      items.push({
        id: String(row.id),
        source: 'CLASS_QUIZ',
        sourceLabel: `Tái sử dụng (${String(row.activity_title)})`,
        type: qType,
        toeicSkill: 'GENERAL',
        difficulty: 'CLASS',
        prompt,
        explanation: String(row.explanation ?? ''),
        points: Number(row.points ?? 1),
        options: opts,
        correctOptionId: row.correct_option_id ? String(row.correct_option_id) : null,
      });
    }
  }

  return { totalCourseQuestions, items: items.slice(0, limit) };
}

export async function buildUnifiedClassResults(
  tx: Tx,
  classId: string,
  scope: {
    editable: boolean;
    studentEnrollmentId: string | null;
    studentUserId: string | null;
  },
): Promise<UnifiedClassResults> {
  const klass = await tx.classOffering.findUnique({
    where: { id: classId },
    select: {
      id: true,
      code: true,
      name: true,
      courseId: true,
      course: { select: { title: true } },
    },
  });
  if (!klass) {
    throw new NotFoundException('Không tìm thấy lớp học.');
  }

  const sections = await tx.classSection.findMany({
    where: { classOfferingId: classId },
    orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
    include: {
      publishedRevision: { select: { title: true } },
      activities: {
        orderBy: [{ orderIndex: 'asc' }, { id: 'asc' }],
        include: {
          publishedRevision: {
            select: {
              id: true,
              type: true,
              title: true,
              availableFrom: true,
              availableUntil: true,
              quizTest: { select: { id: true, quizState: true, title: true } },
            },
          },
        },
      },
    },
  });

  const [
    kindRows,
    archivedRows,
    quizConfigRows,
    quizPointRows,
    assignmentConfigRows,
    localGradesRows,
    submissionMetaRows,
    quizAttemptRows,
    attendanceRecordRows,
    enrollments,
    coreSubmissions,
    coreProgressRows,
    formalAssessmentRows,
  ] = await Promise.all([
    tx.$queryRawUnsafe(
      `SELECT activity_id, kind FROM lms_local_activity_kinds WHERE class_offering_id = $1`,
      classId,
    ) as Promise<any[]>,
    tx.$queryRawUnsafe(
      `SELECT entity_id, entity_type FROM lms_local_archived_content WHERE class_offering_id = $1`,
      classId,
    ).catch(() => []) as Promise<any[]>,
    tx.$queryRawUnsafe(
      `SELECT c.activity_id, c.auto_release_objective, c.pass_score, c.assessment_kind, c.release_mode
         FROM lms_local_quiz_configs c
         JOIN class_activities a ON a.id::text = c.activity_id
         JOIN class_sections s ON s.id = a."sectionId"
        WHERE s."classOfferingId"::text = $1`,
      classId,
    ) as Promise<any[]>,
    tx.$queryRawUnsafe(
      `SELECT q.activity_id, COALESCE(SUM(q.points), 0) AS total_points
         FROM lms_local_quiz_questions q
         JOIN class_activities a ON a.id::text = q.activity_id
         JOIN class_sections s ON s.id = a."sectionId"
        WHERE s."classOfferingId"::text = $1
        GROUP BY q.activity_id`,
      classId,
    ) as Promise<any[]>,
    tx.$queryRawUnsafe(
      `SELECT ac.activity_id, ac.max_score
         FROM lms_local_assignment_configs ac
         JOIN class_activities a ON a.id::text = ac.activity_id
         JOIN class_sections s ON s.id = a."sectionId"
        WHERE s."classOfferingId"::text = $1`,
      classId,
    ) as Promise<any[]>,
    tx.$queryRawUnsafe(
      `SELECT submission_id, activity_id, score, max_score, feedback, state, graded_at, published_at
         FROM lms_local_assignment_grades
        WHERE class_offering_id = $1`,
      classId,
    ) as Promise<any[]>,
    tx.$queryRawUnsafe(
      `SELECT m.activity_id, m.enrollment_id, m.updated_at
         FROM lms_local_assignment_submission_meta m
         JOIN class_activities a ON a.id::text = m.activity_id
         JOIN class_sections s ON s.id = a."sectionId"
        WHERE s."classOfferingId"::text = $1`,
      classId,
    ) as Promise<any[]>,
    tx.$queryRawUnsafe(
      `SELECT id, activity_id, enrollment_id, learner_id, attempt_number, status, submitted_at,
              auto_score, manual_score, total_score, max_score, grading_status,
              teacher_feedback, graded_at, grade_published
         FROM lms_local_quiz_attempts
        WHERE class_offering_id = $1
        ORDER BY attempt_number DESC`,
      classId,
    ) as Promise<any[]>,
    tx.$queryRawUnsafe(
      `SELECT activity_id, enrollment_id, status, checked_in_at, note
         FROM lms_local_attendance_records
        WHERE class_offering_id = $1`,
      classId,
    ) as Promise<any[]>,
    tx.enrollment.findMany({
      where: {
        classOfferingId: classId,
        status: 'ACTIVE',
        ...(scope.studentEnrollmentId ? { id: scope.studentEnrollmentId } : {}),
      },
      orderBy: [{ enrolledAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        learner: { select: { id: true, fullName: true, email: true } },
      },
    }),
    tx.classAssignmentSubmission.findMany({
      where: {
        classOfferingId: classId,
        ...(scope.studentEnrollmentId ? { enrollmentId: scope.studentEnrollmentId } : {}),
      },
      select: {
        id: true,
        activityId: true,
        enrollmentId: true,
        state: true,
        submittedAt: true,
        gradeVersions: {
          orderBy: { number: 'desc' },
          select: {
            id: true,
            state: true,
            feedback: true,
            confirmedAt: true,
            publishedAt: true,
            criterionScores: { select: { score: true } },
          },
        },
      },
    }),
    tx.classActivityProgress.findMany({
      where: {
        ...(scope.studentEnrollmentId
          ? { enrollmentId: scope.studentEnrollmentId }
          : { enrollment: { classOfferingId: classId } }),
        status: 'COMPLETED',
      },
      select: { enrollmentId: true, revisionId: true },
    }),
    tx.classAssessment.findMany({
      where: { classOfferingId: classId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        testId: true,
        stage: true,
        isActive: true,
        openAt: true,
        closeAt: true,
        test: { select: { title: true, quizState: true } },
        attempts: {
          where: scope.studentEnrollmentId ? { enrollmentId: scope.studentEnrollmentId } : undefined,
          orderBy: [{ attemptNumber: 'desc' }],
          select: {
            id: true,
            status: true,
            submittedAt: true,
            score: true,
            maxScore: true,
            skillScores: { select: { status: true } },
          },
        },
      },
    }),
  ]);

  const localKindMap = new Map<string, string>(
    kindRows.map((row) => [String(row.activity_id), String(row.kind)]),
  );
  const quizPointMap = new Map<string, number>(
    quizPointRows.map((row) => [String(row.activity_id), Number(row.total_points ?? 0)]),
  );
  const quizConfigMap = new Map<
    string,
    { assessmentKind: AssessmentKind; releaseMode: QuizReleaseMode; passScore: number; totalPoints: number }
  >(
    quizConfigRows.map((row) => {
      const assessmentKind = normalizeAssessmentKind(row.assessment_kind);
      const releaseMode = normalizeReleaseMode(
        row.release_mode,
        assessmentKind,
        Boolean(row.auto_release_objective),
      );
      return [
        String(row.activity_id),
        {
          assessmentKind,
          releaseMode,
          passScore: Number(row.pass_score ?? 5),
          totalPoints: quizPointMap.get(String(row.activity_id)) ?? 0,
        },
      ];
    }),
  );
  const assignmentMaxMap = new Map<string, number>(
    assignmentConfigRows.map((row) => [String(row.activity_id), Number(row.max_score ?? 10)]),
  );
  const localGradeBySubmissionId = new Map<string, any>(
    localGradesRows.map((row) => [String(row.submission_id), row]),
  );
  const subMetaMap = new Map<string, any>(
    submissionMetaRows.map((row) => [`${row.activity_id}:${row.enrollment_id}`, row]),
  );

  const columnList: UnifiedActivityColumn[] = [];
  let draftCoreQuizCount = 0;
  const archivedSections = new Set<string>(
    archivedRows.filter((r) => r.entity_type === 'SECTION').map((r) => String(r.entity_id)),
  );
  const archivedActivities = new Set<string>(
    archivedRows.filter((r) => r.entity_type === 'ACTIVITY').map((r) => String(r.entity_id)),
  );

  for (const section of sections) {
    if (archivedSections.has(section.id)) continue;
    if (!scope.editable && !section.publishedRevisionId) continue;
    for (const activity of section.activities) {
      if (archivedActivities.has(activity.id)) continue;
      const localKind = localKindMap.get(activity.id) ?? null;
      if (
        activity.type === 'QUIZ' &&
        !localKind &&
        (activity.publishedRevision?.quizTest?.quizState === 'DRAFT' || activity.state === 'DRAFT')
      ) {
        draftCoreQuizCount += 1;
      }
      if (!scope.editable && (activity.state !== 'PUBLISHED' || !activity.publishedRevision)) {
        continue;
      }
      columnList.push(
        resolveColumnMeta(
          activity,
          section,
          activity.orderIndex,
          localKind,
          quizConfigMap.get(activity.id),
          assignmentMaxMap.get(activity.id) ?? 10,
          scope.editable,
        ),
      );
    }
  }

  // Filter out empty unpublished draft Core QUIZ shells if student shouldn't see them
  const visibleColumns = scope.editable
    ? columnList
    : columnList.filter(
        (col) => !(col.baseType === 'QUIZ' && col.localKind === null),
      );

  const assignmentCols = visibleColumns.filter((c) => c.baseType === 'ASSIGNMENT' && !c.localKind);
  const localQuizCols = visibleColumns.filter((c) => c.localKind === 'LOCAL_QUIZ');
  const attendanceCols = visibleColumns.filter((c) => c.localKind === 'LOCAL_ATTENDANCE');

  const submissionByKey = new Map<string, (typeof coreSubmissions)[number]>(
    coreSubmissions.map((sub) => [`${sub.activityId}:${sub.enrollmentId}`, sub]),
  );

  const attemptsByKey = new Map<string, any[]>();
  for (const att of quizAttemptRows) {
    const key = `${att.activity_id}:${att.enrollment_id}`;
    const list = attemptsByKey.get(key) ?? [];
    list.push(att);
    attemptsByKey.set(key, list);
  }

  const attendanceByKey = new Map<string, any>(
    attendanceRecordRows.map((rec) => [`${rec.activity_id}:${rec.enrollment_id}`, rec]),
  );

  const completedByEnrollment = new Map<string, number>();
  for (const prog of coreProgressRows) {
    completedByEnrollment.set(
      prog.enrollmentId,
      (completedByEnrollment.get(prog.enrollmentId) ?? 0) + 1,
    );
  }

  let awaitingAssignmentGrades = 0;
  let awaitingManualQuizGrades = 0;

  const studentRows: UnifiedStudentRow[] = enrollments.map((enr) => {
    const assignments: Record<string, UnifiedAssignmentCell> = {};
    const quizzes: Record<string, UnifiedQuizCell> = {};
    const attendance: Record<string, UnifiedAttendanceCell> = {};

    let submittedAssignments = 0;
    let publishedAssignmentGrades = 0;
    let submittedQuizzes = 0;
    let publishedQuizGrades = 0;
    let attendancePresentCount = 0;
    let attendanceLateCount = 0;

    for (const col of assignmentCols) {
      const key = `${col.activityId}:${enr.id}`;
      const sub = submissionByKey.get(key);
      const localGrade = sub ? localGradeBySubmissionId.get(sub.id) : null;
      const publishedRubric = sub?.gradeVersions.find((g) => g.state === 'PUBLISHED') ?? null;
      const finalRubric = sub?.gradeVersions.find((g) => g.state === 'REVIEWED_FINAL') ?? null;
      const subMeta = subMetaMap.get(key);

      let score: number | null = null;
      let maxScore = col.maxScore ?? 10;
      let gradeState: UnifiedAssignmentCell['gradeState'] = 'NOT_GRADED';
      let gradeSource: UnifiedAssignmentCell['gradeSource'] = null;
      let feedback = '';
      let gradedAt: string | null = null;

      if (localGrade) {
        const localPublished = localGrade.state === 'PUBLISHED';
        if (localPublished || scope.editable) {
          score = localGrade.score !== null ? Number(localGrade.score) : null;
          maxScore = Number(localGrade.max_score ?? maxScore);
          feedback = String(localGrade.feedback ?? '');
          gradedAt = localGrade.graded_at ? new Date(localGrade.graded_at).toISOString() : null;
        }
        gradeState = localPublished ? 'PUBLISHED' : 'DRAFT';
        gradeSource = 'LOCAL_DIRECT';
      } else if (publishedRubric) {
        score = publishedRubric.criterionScores.reduce((acc, c) => acc + Number(c.score), 0);
        gradeState = 'PUBLISHED';
        gradeSource = 'CORE_RUBRIC';
        feedback = publishedRubric.feedback ?? '';
        gradedAt = publishedRubric.publishedAt
          ? publishedRubric.publishedAt.toISOString()
          : publishedRubric.confirmedAt?.toISOString() ?? null;
      } else if (finalRubric) {
        gradeState = 'PENDING_PUBLICATION';
        gradeSource = 'CORE_RUBRIC';
      }

      const submissionState: UnifiedAssignmentCell['submissionState'] =
        sub?.state === 'SUBMITTED' ? 'SUBMITTED' : sub?.state === 'DRAFT' ? 'DRAFT' : 'NOT_SUBMITTED';
      if (submissionState === 'SUBMITTED') {
        submittedAssignments += 1;
        if (gradeState !== 'PUBLISHED') {
          awaitingAssignmentGrades += 1;
        }
      }
      if (gradeState === 'PUBLISHED') {
        publishedAssignmentGrades += 1;
      }

      assignments[col.activityId] = {
        activityId: col.activityId,
        submissionId: sub?.id ?? null,
        submissionState,
        submittedAt: sub?.submittedAt
          ? sub.submittedAt.toISOString()
          : subMeta?.updated_at && submissionState === 'SUBMITTED'
            ? new Date(subMeta.updated_at).toISOString()
            : null,
        score,
        maxScore,
        gradeState,
        gradeSource,
        feedback,
        gradedAt,
      };
    }

    for (const col of localQuizCols) {
      const attempts = attemptsByKey.get(`${col.activityId}:${enr.id}`) ?? [];
      const submittedAttempts = attempts.filter((a) => a.status === 'SUBMITTED');
      const latest = submittedAttempts[0] ?? attempts[0] ?? null;
      const assessmentKind = col.assessmentKind ?? 'QUIZ';

      if (!latest) {
        quizzes[col.activityId] = {
          activityId: col.activityId,
          assessmentKind,
          attemptCount: 0,
          latestAttemptId: null,
          attemptStatus: 'NOT_STARTED',
          submittedAt: null,
          gradingStatus: 'NOT_SUBMITTED',
          gradePublished: false,
          score: null,
          maxScore: col.maxScore,
          passScore: col.passScore,
          passed: null,
          teacherFeedback: '',
          gradedAt: null,
        };
        continue;
      }

      const attemptStatus: UnifiedQuizCell['attemptStatus'] =
        latest.status === 'SUBMITTED' ? 'SUBMITTED' : 'IN_PROGRESS';
      const gradingStatus = (latest.grading_status || 'AUTO_GRADED') as UnifiedQuizCell['gradingStatus'];
      const isPendingManual = gradingStatus === 'PENDING_MANUAL_GRADE';
      const gradePublished = Boolean(latest.grade_published) && !isPendingManual;

      if (attemptStatus === 'SUBMITTED') {
        submittedQuizzes += 1;
        if (isPendingManual) {
          awaitingManualQuizGrades += 1;
        }
      }
      if (attemptStatus === 'SUBMITTED' && gradePublished) {
        publishedQuizGrades += 1;
      }

      const canExposeScore = scope.editable || gradePublished;
      const score = canExposeScore && latest.total_score !== null ? Number(latest.total_score) : null;
      const maxScore = latest.max_score !== null ? Number(latest.max_score) : col.maxScore;
      const passScore = col.passScore ?? 5;

      quizzes[col.activityId] = {
        activityId: col.activityId,
        assessmentKind,
        attemptCount: attempts.length,
        latestAttemptId: String(latest.id),
        attemptStatus,
        submittedAt: latest.submitted_at ? new Date(latest.submitted_at).toISOString() : null,
        gradingStatus,
        gradePublished,
        score,
        maxScore,
        passScore,
        passed: score !== null && attemptStatus === 'SUBMITTED' ? score >= passScore : null,
        teacherFeedback: canExposeScore ? String(latest.teacher_feedback ?? '') : '',
        gradedAt: latest.graded_at ? new Date(latest.graded_at).toISOString() : null,
      };
    }

    for (const col of attendanceCols) {
      const rec = attendanceByKey.get(`${col.activityId}:${enr.id}`);
      const status: UnifiedAttendanceCell['status'] =
        rec?.status === 'PRESENT' ? 'PRESENT' : rec?.status === 'LATE' ? 'LATE' : 'NOT_RECORDED';
      if (status === 'PRESENT') attendancePresentCount += 1;
      if (status === 'LATE') attendanceLateCount += 1;

      attendance[col.activityId] = {
        activityId: col.activityId,
        status,
        checkedInAt: rec?.checked_in_at ? new Date(rec.checked_in_at).toISOString() : null,
        note: String(rec?.note ?? ''),
      };
    }

    const completedFromSubmissions = submittedAssignments + submittedQuizzes + attendancePresentCount + attendanceLateCount;
    const completedActivitiesCount = Math.max(
      completedByEnrollment.get(enr.id) ?? 0,
      completedFromSubmissions,
    );

    return {
      enrollmentId: enr.id,
      learnerId: enr.learner.id,
      fullName: enr.learner.fullName,
      email: enr.learner.email,
      assignments,
      quizzes,
      attendance,
      stats: {
        submittedAssignments,
        publishedAssignmentGrades,
        submittedQuizzes,
        publishedQuizGrades,
        attendancePresentCount,
        attendanceLateCount,
        attendanceTotalCount: attendanceCols.length,
        completedActivitiesCount,
      },
    };
  });

  const formalAssessments: UnifiedFormalAssessmentItem[] = formalAssessmentRows.map((fa) => {
    const submitted = fa.attempts.filter((a) => a.status === 'SUBMITTED');
    const latest = fa.attempts[0] ?? null;
    return {
      id: fa.id,
      testId: fa.testId,
      title: fa.test.title,
      stage: fa.stage,
      quizState: fa.test.quizState ?? null,
      isActive: fa.isActive,
      openAt: fa.openAt ? fa.openAt.toISOString() : null,
      closeAt: fa.closeAt ? fa.closeAt.toISOString() : null,
      submittedAttempts: submitted.length,
      ...(scope.studentEnrollmentId
        ? {
            myLatestAttempt: latest
              ? {
                  id: latest.id,
                  status: latest.status,
                  submittedAt: latest.submittedAt ? latest.submittedAt.toISOString() : null,
                  totalScore:
                    latest.score !== null && latest.maxScore
                      ? Number(latest.score)
                      : null,
                  gradingState:
                    latest.skillScores.some((s) => s.status !== 'FINAL')
                      ? 'PENDING_MANUAL_REVIEW'
                      : latest.status === 'SUBMITTED'
                        ? 'GRADED'
                        : 'IN_PROGRESS',
                }
              : null,
          }
        : {}),
    };
  });

  const publishedActivities = visibleColumns.filter((c) => c.state === 'PUBLISHED').length;

  return {
    class: {
      id: klass.id,
      code: klass.code,
      name: klass.name,
      courseId: klass.courseId,
      courseTitle: klass.course.title,
    },
    editable: scope.editable,
    activityColumns: visibleColumns,
    studentRows,
    formalAssessments,
    draftCoreQuizCount,
    summary: {
      totalActivities: visibleColumns.length,
      publishedActivities,
      assignmentsCount: assignmentCols.length,
      quizzesCount: localQuizCols.filter((c) => c.assessmentKind === 'QUIZ').length,
      regularExamCount: localQuizCols.filter((c) => c.assessmentKind === 'REGULAR').length,
      midtermCount: localQuizCols.filter((c) => c.assessmentKind === 'MIDTERM').length,
      finalCount: localQuizCols.filter((c) => c.assessmentKind === 'FINAL').length,
      attendanceCount: attendanceCols.length,
      awaitingAssignmentGrades,
      awaitingManualQuizGrades,
      formalAssessmentCount: formalAssessments.length,
      draftCoreQuizCount,
    },
    policyNotes: [
      'Giảng viên trực tiếp thiết lập thời gian mở/đóng và công bố đề Giữa kỳ / Cuối kỳ (MIDTERM / FINAL) trong Học phần lớp.',
      'Điểm tổng hợp Q03 đọc chung một nguồn dữ liệu Section → Activity, không nhân đôi điểm giữa các bảng.',
    ],
  };
}
