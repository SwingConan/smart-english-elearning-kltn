import type { Prisma } from '../../generated/prisma/client';

type Tx = Prisma.TransactionClient;

export type SkillBucketKey = 'LISTENING' | 'READING' | 'SPEAKING' | 'WRITING' | 'GENERAL';
export type SkillStrengthStatus =
  | 'STRONG'
  | 'MODERATE'
  | 'NEEDS_IMPROVEMENT'
  | 'INSUFFICIENT_DATA';

export interface ProgressEntryRef {
  activityId: string;
  revisionId: string;
  revisionNumber: number;
  title: string;
  type: string;
  localKind?: string;
  assessmentKind?: string;
  attendanceStatus?: string;
  score?: number | null;
  maxScore?: number | null;
  state: string;
}

export interface ActivityMeta {
  activityId: string;
  sectionId: string;
  sectionTitle: string;
  sectionOrder: number;
  orderIndex: number;
  title: string;
  type: string;
  localKind: string | null;
  assessmentKind: string | null;
  state: string;
  availableFrom: Date | null;
  availableUntil: Date | null;
  isUpcoming: boolean;
  score: number | null;
  maxScore: number | null;
  passScore: number | null;
  passed: boolean | null;
  attendanceStatus: string | null;
  submittedAt: string | null;
  gradedAt: string | null;
  feedback: string;
}

export interface WeaknessEvidenceItem {
  id: string;
  sourceType: 'LOCAL_QUIZ' | 'ASSIGNMENT' | 'FORMAL_TEST';
  activityId: string | null;
  activityTitle: string;
  assessmentKind: string | null;
  gradedAt: string | null;
  skill: SkillBucketKey;
  skillLabel: string;
  topicTag: string;
  prompt: string;
  learnerAnswer: string;
  correctAnswer: string | null;
  earnedPoints: number;
  maxPoints: number;
  explanation: string;
}

export interface RemediationItem {
  id: string;
  kind: 'CLASS_LESSON' | 'CLASS_RESOURCE' | 'KNOWLEDGE_ARTICLE' | 'NEXT_OPEN_ACTIVITY';
  title: string;
  subtitle: string;
  targetSkill: SkillBucketKey | null;
  reason: string;
  href: string;
  accessible: true;
}

const SKILL_LABELS: Record<SkillBucketKey, string> = {
  LISTENING: 'Nghe hiểu (Listening)',
  READING: 'Đọc hiểu & Ngữ pháp (Reading)',
  SPEAKING: 'Nói (Speaking)',
  WRITING: 'Viết (Writing)',
  GENERAL: 'Tổng hợp trên lớp',
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyPromptSkillAndTopic(
  prompt: string,
  qType: string,
  activityTitle: string,
  questionBankSkillMap: Map<string, string>,
): { skill: SkillBucketKey; topicTag: string } {
  const normPrompt = normalizeText(prompt);
  const bankSkill = questionBankSkillMap.get(normPrompt);
  const titleNorm = normalizeText(activityTitle);
  const combined = `${normPrompt} ${titleNorm}`;

  let skill: SkillBucketKey = 'GENERAL';
  if (
    bankSkill === 'LISTENING' ||
    bankSkill === 'READING' ||
    bankSkill === 'SPEAKING' ||
    bankSkill === 'WRITING'
  ) {
    skill = bankSkill;
  } else if (qType === 'ESSAY') {
    skill = 'WRITING';
  } else if (
    /(listen|audio|nghe|part 1|part 2|part 3|part 4|dialogue|conversation|indirect)/.test(combined)
  ) {
    skill = 'LISTENING';
  } else if (
    /(grammar|word form|tense|clause|part 5|part 6|part 7|read|đọc|ngữ pháp|mệnh đề|report yesterday|___)/.test(
      combined,
    )
  ) {
    skill = 'READING';
  } else if (/(speak|nói|pronunci|oral)/.test(combined)) {
    skill = 'SPEAKING';
  } else if (/(write|writing|viết|email|paragraph|essay|confirming an urgent meeting)/.test(combined)) {
    skill = 'WRITING';
  }

  let topicTag = SKILL_LABELS[skill];
  if (skill === 'READING' && /(word form|grammar|tense|yesterday|clause|___)/.test(combined)) {
    topicTag = 'Từ loại, Thì động từ & Cấu trúc câu (TOEIC Part 5–6)';
  } else if (skill === 'READING') {
    topicTag = 'Đọc hiểu thông tin & Suy luận (TOEIC Reading)';
  } else if (skill === 'LISTENING' && /(part 1|part 2|hỏi|đáp|indirect|library|when|how many)/.test(combined)) {
    topicTag = 'Nghe chi tiết & Câu hỏi gián tiếp (TOEIC Part 1–2)';
  } else if (skill === 'LISTENING') {
    topicTag = 'Nghe hiểu hội thoại & Từ khóa (TOEIC Part 3–4)';
  } else if (skill === 'WRITING' || skill === 'SPEAKING') {
    topicTag = 'Diễn đạt câu & Tiêu chí Rubric TOEIC Speaking/Writing';
  }

  return { skill, topicTag };
}

function classifyTextToSkill(text: string): SkillBucketKey | null {
  const norm = normalizeText(text);
  if (/(part 1|part 2|part 3|part 4|listening|nghe)/.test(norm)) return 'LISTENING';
  if (/(part 5|part 6|part 7|grammar|reading|đọc|ngữ pháp|từ loại)/.test(norm)) return 'READING';
  if (/(writing|viết)/.test(norm)) return 'WRITING';
  if (/(speaking|nói)/.test(norm)) return 'SPEAKING';
  return null;
}

function skillStatus(percent: number): SkillStrengthStatus {
  if (percent >= 80) return 'STRONG';
  if (percent >= 60) return 'MODERATE';
  return 'NEEDS_IMPROVEMENT';
}

export async function buildQ04ProgressAnalytics(params: {
  tx: Tx;
  classId: string;
  actorId: string;
  enrollmentId: string;
  now: Date;
  sectionsRaw: any[];
  entries: ProgressEntryRef[];
  localQuizAttemptMap: Map<string, any>;
  localAssignGradeMap: Map<string, any>;
  localQuizConfigMap: Map<string, { assessmentKind: string; passScore: number }>;
  localAttendanceMap: Map<string, any>;
  w06AttendanceSummary?: {
    openedSessions: number;
    attendedSessions: number;
    presentCount: number;
    lateCount: number;
    items: Array<{
      sessionId: string;
      title: string;
      status: string;
      checkedInAt: string | null;
    }>;
  };
  submissions: any[];
  isVisible: (revision: any, now: Date) => boolean;
}) {
  const {
    tx,
    classId,
    actorId,
    enrollmentId,
    now,
    sectionsRaw,
    entries,
    localQuizAttemptMap,
    localAssignGradeMap,
    localQuizConfigMap,
    localAttendanceMap,
    w06AttendanceSummary,
    submissions,
    isVisible,
  } = params;

  const entryMap = new Map(entries.map((e) => [e.revisionId, e]));
  const metas: ActivityMeta[] = [];

  for (const sec of sectionsRaw) {
    const secTitle = String(sec.publishedRevision?.title ?? sec.title ?? 'Học phần');
    const secOrder = Number(sec.orderIndex ?? 0);
    for (const act of sec.activities ?? []) {
      if (act.state !== 'PUBLISHED' || !act.publishedRevision) continue;
      if (!isVisible(act.publishedRevision, now)) continue;
      const rev = act.publishedRevision;
      const entry = entryMap.get(rev.id);
      if (!entry) continue;

      const qCfg = localQuizConfigMap.get(rev.activityId);
      const qa = localQuizAttemptMap.get(rev.activityId);
      const ag = localAssignGradeMap.get(rev.activityId);
      const att = localAttendanceMap.get(rev.activityId);
      const sub = submissions.find((s) => s.revisionId === rev.id);
      const availableFrom = rev.availableFrom ? new Date(rev.availableFrom) : null;
      const availableUntil = rev.availableUntil ? new Date(rev.availableUntil) : null;
      const isUpcoming = Boolean(availableFrom && availableFrom.getTime() > now.getTime());

      const score = entry.score !== undefined ? Number(entry.score) : null;
      const maxScore = entry.maxScore !== undefined ? Number(entry.maxScore) : null;
      const passScore = qCfg ? qCfg.passScore : null;
      const passed =
        score !== null && passScore !== null && entry.state === 'PUBLISHED'
          ? score >= passScore
          : null;

      metas.push({
        activityId: entry.activityId,
        sectionId: String(sec.id ?? sec.publishedRevision?.sectionId ?? `sec-${secOrder}`),
        sectionTitle: secTitle,
        sectionOrder: secOrder,
        orderIndex: Number(act.orderIndex ?? 0),
        title: entry.title,
        type: entry.type,
        localKind: entry.localKind ?? null,
        assessmentKind: entry.assessmentKind ?? null,
        state: entry.state,
        availableFrom,
        availableUntil,
        isUpcoming,
        score,
        maxScore,
        passScore,
        passed,
        attendanceStatus: entry.attendanceStatus ?? (att ? String(att.status) : null),
        submittedAt: qa?.submitted_at
          ? new Date(qa.submitted_at).toISOString()
          : sub?.submittedAt
            ? new Date(sub.submittedAt).toISOString()
            : att?.checked_in_at
              ? new Date(att.checked_in_at).toISOString()
              : null,
        gradedAt: qa?.grade_published_at
          ? new Date(qa.grade_published_at).toISOString()
          : qa?.graded_at
            ? new Date(qa.graded_at).toISOString()
            : ag?.published_at
              ? new Date(ag.published_at).toISOString()
              : null,
        feedback: String(qa?.teacher_feedback ?? ag?.feedback ?? ''),
      });
    }
  }

  const doneStates = new Set([
    'COMPLETED',
    'PUBLISHED',
    'PENDING_REVIEW',
    'PENDING_RELEASE',
    'SUBMITTED',
  ]);
  const openMetas = metas.filter((m) => !m.isUpcoming);
  const upcomingMetas = metas.filter((m) => m.isUpcoming);
  const completedOrSubmittedOpen = openMetas.filter((m) => doneStates.has(m.state)).length;
  const completedOpen = openMetas.filter((m) =>
    ['COMPLETED', 'PUBLISHED'].includes(m.state),
  ).length;
  const pendingOpen = openMetas.filter((m) =>
    ['PENDING_REVIEW', 'PENDING_RELEASE', 'SUBMITTED'].includes(m.state),
  ).length;
  const inProgressOpen = openMetas.filter((m) => m.state === 'IN_PROGRESS').length;
  const notStartedOpen = openMetas.filter((m) => m.state === 'NOT_STARTED').length;

  const sectionBuckets = new Map<
    string,
    {
      sectionId: string;
      title: string;
      orderIndex: number;
      activities: ActivityMeta[];
    }
  >();
  for (const m of metas) {
    if (!sectionBuckets.has(m.sectionId)) {
      sectionBuckets.set(m.sectionId, {
        sectionId: m.sectionId,
        title: m.sectionTitle,
        orderIndex: m.sectionOrder,
        activities: [],
      });
    }
    sectionBuckets.get(m.sectionId)!.activities.push(m);
  }

  const sections = [...sectionBuckets.values()]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((sec) => {
      const secOpen = sec.activities.filter((a) => !a.isUpcoming);
      const secDone = secOpen.filter((a) => doneStates.has(a.state)).length;
      const secPublished = secOpen.filter((a) => a.state === 'PUBLISHED').length;
      const secNotStarted = secOpen.filter((a) => a.state === 'NOT_STARTED').length;
      return {
        sectionId: sec.sectionId,
        title: sec.title,
        orderIndex: sec.orderIndex,
        totalPublishedActivities: sec.activities.length,
        openActivitiesCount: secOpen.length,
        upcomingActivitiesCount: sec.activities.length - secOpen.length,
        completedOrSubmittedCount: secDone,
        publishedGradesCount: secPublished,
        notStartedOpenCount: secNotStarted,
        completionRatioPercent:
          secOpen.length > 0 ? Math.round((secDone / secOpen.length) * 100) : null,
        activities: sec.activities.map((a) => ({
          activityId: a.activityId,
          title: a.title,
          type: a.type,
          localKind: a.localKind,
          assessmentKind: a.assessmentKind,
          state: a.state,
          isUpcoming: a.isUpcoming,
          availableFrom: a.availableFrom ? a.availableFrom.toISOString() : null,
          availableUntil: a.availableUntil ? a.availableUntil.toISOString() : null,
          score: a.score,
          maxScore: a.maxScore,
          passScore: a.passScore,
          passed: a.passed,
          attendanceStatus: a.attendanceStatus,
          submittedAt: a.submittedAt,
          gradedAt: a.gradedAt,
          feedback: a.feedback,
        })),
      };
    });

  const buildBucket = (
    items: ActivityMeta[],
    predicate: (a: ActivityMeta) => boolean,
    label: string,
  ) => {
    const matched = items.filter(predicate);
    const published = matched.filter((a) => a.state === 'PUBLISHED' && a.score !== null);
    const avgPercent =
      published.length > 0
        ? round1(
            published.reduce(
              (acc, cur) =>
                acc + (cur.maxScore && cur.maxScore > 0 ? ((cur.score ?? 0) / cur.maxScore) * 100 : 0),
              0,
            ) / published.length,
          )
        : null;
    return {
      label,
      totalOpen: matched.filter((a) => !a.isUpcoming).length,
      completedOrSubmitted: matched.filter((a) => doneStates.has(a.state)).length,
      publishedCount: published.length,
      pendingCount: matched.filter((a) =>
        ['PENDING_REVIEW', 'PENDING_RELEASE', 'SUBMITTED'].includes(a.state),
      ).length,
      averagePercent: avgPercent,
      insufficientData: published.length === 0,
      items: matched.map((a) => ({
        activityId: a.activityId,
        title: a.title,
        state: a.state,
        score: a.score,
        maxScore: a.maxScore,
        passed: a.passed,
        gradedAt: a.gradedAt,
        feedback: a.feedback,
      })),
    };
  };

  const lessonsResources = metas.filter(
    (a) => (a.type === 'LESSON' || a.type === 'RESOURCE') && !a.localKind,
  );
  const attendanceMetas = metas.filter((a) => a.localKind === 'LOCAL_ATTENDANCE');

  const assessmentSummary = {
    lessonsAndResources: {
      label: 'Bài học & Tài liệu',
      totalOpen: lessonsResources.filter((a) => !a.isUpcoming).length,
      completed: lessonsResources.filter((a) => a.state === 'COMPLETED').length,
      inProgress: lessonsResources.filter((a) => a.state === 'IN_PROGRESS').length,
      notStarted: lessonsResources.filter((a) => !a.isUpcoming && a.state === 'NOT_STARTED').length,
    },
    assignments: buildBucket(
      metas,
      (a) => a.type === 'ASSIGNMENT' && !a.localKind,
      'Bài tập (Assignment)',
    ),
    quizzes: buildBucket(
      metas,
      (a) => a.localKind === 'LOCAL_QUIZ' && (a.assessmentKind ?? 'QUIZ') === 'QUIZ',
      'Quiz luyện tập',
    ),
    regularExams: buildBucket(
      metas,
      (a) => a.localKind === 'LOCAL_QUIZ' && a.assessmentKind === 'REGULAR',
      'Kiểm tra thường kỳ',
    ),
    midtermExams: buildBucket(
      metas,
      (a) => a.localKind === 'LOCAL_QUIZ' && a.assessmentKind === 'MIDTERM',
      'Kiểm tra giữa kỳ',
    ),
    finalExams: buildBucket(
      metas,
      (a) => a.localKind === 'LOCAL_QUIZ' && a.assessmentKind === 'FINAL',
      'Kiểm tra cuối kỳ',
    ),
    attendance: (() => {
      const w06 = w06AttendanceSummary ?? {
        openedSessions: 0,
        attendedSessions: 0,
        presentCount: 0,
        lateCount: 0,
        items: [],
      };
      const localTotalOpen = attendanceMetas.filter((a) => !a.isUpcoming).length;
      const localChecked = attendanceMetas.filter((a) => a.state === 'COMPLETED').length;
      const localPresent = attendanceMetas.filter((a) => a.attendanceStatus === 'PRESENT').length;
      const localLate = attendanceMetas.filter((a) => a.attendanceStatus === 'LATE').length;
      const w06Items = w06.items.map((w) => ({
        activityId: `w06:${w.sessionId}`,
        title: w.title,
        state: ['PRESENT', 'LATE', 'EXCUSED'].includes(w.status) ? 'COMPLETED' : 'ABSENT',
        attendanceStatus: w.status,
        checkedInAt: w.checkedInAt,
      }));
      const localItems = attendanceMetas.map((a) => ({
        activityId: a.activityId,
        title: a.title,
        state: a.state,
        attendanceStatus: a.attendanceStatus,
        checkedInAt: a.submittedAt,
      }));
      const totalOpen = localTotalOpen + w06.openedSessions;
      const checkedCount = localChecked + w06.attendedSessions;
      return {
        label: 'Điểm danh lớp học',
        totalOpen,
        checkedCount,
        presentCount: localPresent + w06.presentCount,
        lateCount: localLate + w06.lateCount,
        insufficientData: totalOpen === 0 && localItems.length === 0 && w06Items.length === 0,
        items: [...localItems, ...w06Items],
      };
    })(),
  };

  // Query extended analytics only when running against real Postgres tx ($queryRawUnsafe available)
  const questionBankSkillMap = new Map<string, string>();
  const questionOptionsMap = new Map<string, Map<string, string>>();
  let publishedQuizRows: any[] = [];
  let publishedAssignRows: any[] = [];
  let formalInClassAttempts: any[] = [];
  let placementRows: any[] = [];
  let publishedKnowledgeArticles: any[] = [];

  if (typeof (tx as any).$queryRawUnsafe === 'function') {
    const raw = (sql: string, ...args: unknown[]) =>
      (tx as any).$queryRawUnsafe(sql, ...args) as Promise<any[]>;

    const [qBankRows, quizAttRows, quizQRows, assignRows, formalRows, placeRows, knowledgeRows] =
      await Promise.all([
        raw(
          `SELECT q.content, q."toeicSkill"
             FROM questions q
             JOIN class_offerings c ON c."courseId" = q."courseId"
            WHERE c.id::text = $1`,
          classId,
        ).catch(() => []),
        raw(
          `SELECT att.id, att.activity_id, r.title AS activity_title, cfg.assessment_kind,
                  att.total_score, att.max_score, att.answers_json, att.manual_grades_json, att.teacher_feedback,
                  COALESCE(att.grade_published_at, att.graded_at, att.submitted_at) AS evaluated_at
             FROM lms_local_quiz_attempts att
             JOIN lms_local_quiz_configs cfg ON cfg.activity_id = att.activity_id
             JOIN class_activities ca ON ca.id::text = att.activity_id
             JOIN class_activity_revisions r ON r.id = ca."publishedRevisionId"
            WHERE att.class_offering_id = $1
              AND att.enrollment_id = $2
              AND ca.state = 'PUBLISHED'
              AND att.status = 'SUBMITTED'
              AND att.grade_published = true
              AND att.grading_status <> 'PENDING_MANUAL_GRADE'
            ORDER BY COALESCE(att.grade_published_at, att.graded_at, att.submitted_at) ASC`,
          classId,
          enrollmentId,
        ).catch(() => []),
        raw(
          `SELECT qq.id, qq.options_json
             FROM lms_local_quiz_questions qq
             JOIN class_activities ca ON ca.id::text = qq.activity_id
             JOIN class_sections cs ON cs.id = ca."sectionId"
            WHERE cs."classOfferingId"::text = $1`,
          classId,
        ).catch(() => []),
        raw(
          `SELECT ag.submission_id, ag.activity_id, r.title AS activity_title,
                  ag.score, ag.max_score, ag.feedback, ag.published_at
             FROM lms_local_assignment_grades ag
             JOIN class_assignment_submissions s ON s.id::text = ag.submission_id
             JOIN class_activities ca ON ca.id::text = ag.activity_id
             JOIN class_activity_revisions r ON r.id = ca."publishedRevisionId"
            WHERE ag.class_offering_id = $1
              AND s."enrollmentId"::text = $2
              AND ag.state = 'PUBLISHED'
            ORDER BY ag.published_at ASC`,
          classId,
          enrollmentId,
        ).catch(() => []),
        raw(
          `SELECT ta.id, t.title, ta."submittedAt",
                  ass.skill, ass."rawScore", ass."maxRawScore", ass."normalizedScore", ass.status AS skill_status
             FROM test_attempts ta
             JOIN tests t ON t.id = ta."testId"
             JOIN attempt_skill_scores ass ON ass."attemptId" = ta.id
            WHERE ta."enrollmentId"::text = $1
              AND t.purpose = 'IN_CLASS'
              AND ta.status = 'SUBMITTED'
              AND ass.status = 'FINAL'
            ORDER BY ta."submittedAt" ASC`,
          enrollmentId,
        ).catch(() => []),
        raw(
          `SELECT ta.id, t.title, ta.status, ta.score, ta."maxScore", ta."submittedAt"
             FROM test_attempts ta
             JOIN tests t ON t.id = ta."testId"
            WHERE ta."learnerId"::text = $1
              AND t.purpose = 'PLACEMENT'
              AND ta.status = 'SUBMITTED'
            ORDER BY ta."submittedAt" DESC NULLS LAST
            LIMIT 1`,
          actorId,
        ).catch(() => []),
        raw(
          `SELECT e.id, e.slug, r.title, r.skills, r.part
             FROM knowledge_entries e
             JOIN knowledge_revisions r ON r.id = e."publishedRevisionId"
            WHERE e.visibility = 'LIVE'
              AND e.kind = 'ARTICLE'
              AND r.state = 'PUBLISHED'
            ORDER BY r."publishedAt" ASC NULLS LAST`,
        ),
      ]);

    for (const q of qBankRows) {
      questionBankSkillMap.set(normalizeText(q.content), String(q.toeicSkill));
    }
    for (const qq of quizQRows) {
      const optMap = new Map<string, string>();
      const opts = Array.isArray(qq.options_json) ? qq.options_json : [];
      for (const opt of opts) {
        if (opt?.id) optMap.set(String(opt.id), String(opt.text ?? opt.id));
      }
      questionOptionsMap.set(String(qq.id), optMap);
    }
    publishedQuizRows = quizAttRows;
    publishedAssignRows = assignRows;
    formalInClassAttempts = formalRows;
    placementRows = placeRows;
    publishedKnowledgeArticles = knowledgeRows;
  }

  const skillTotals = new Map<
    SkillBucketKey,
    { earned: number; max: number; correct: number; total: number }
  >();
  const ensureSkill = (k: SkillBucketKey) => {
    if (!skillTotals.has(k)) {
      skillTotals.set(k, { earned: 0, max: 0, correct: 0, total: 0 });
    }
    return skillTotals.get(k)!;
  };

  const weaknessEvidence: WeaknessEvidenceItem[] = [];
  const timelineSamples: Array<{ label: string; at: string; percent: number }> = [];

  for (const row of publishedQuizRows) {
    const evaluatedAt = row.evaluated_at ? new Date(row.evaluated_at).toISOString() : null;
    const maxScore = Number(row.max_score ?? 0);
    const totalScore = Number(row.total_score ?? 0);
    if (maxScore > 0 && evaluatedAt) {
      timelineSamples.push({
        label: String(row.activity_title),
        at: evaluatedAt,
        percent: round1((totalScore / maxScore) * 100),
      });
    }

    const answers = Array.isArray(row.answers_json) ? row.answers_json : [];
    const manualGrades =
      row.manual_grades_json && typeof row.manual_grades_json === 'object'
        ? (row.manual_grades_json as Record<string, any>)
        : {};
    for (const ans of answers) {
      const qId = String(ans?.questionId ?? '');
      const manualEntry = manualGrades[qId];
      const prompt = String(ans?.prompt ?? '');
      const qType = String(ans?.type ?? 'MCQ');
      const maxPoints = Number(ans?.points ?? 1);
      const earnedPoints =
        qType === 'ESSAY'
          ? Number(manualEntry?.score ?? ans?.manualScore ?? 0)
          : Number(ans?.autoEarned ?? 0);
      const { skill, topicTag } = classifyPromptSkillAndTopic(
        prompt,
        qType,
        String(row.activity_title ?? ''),
        questionBankSkillMap,
      );

      const agg = ensureSkill(skill);
      agg.earned += earnedPoints;
      agg.max += maxPoints;
      agg.total += 1;
      const isStrongItem = qType === 'ESSAY' ? earnedPoints >= maxPoints * 0.7 : Boolean(ans?.isCorrect);
      if (isStrongItem) agg.correct += 1;

      if (!isStrongItem) {
        const optMap = questionOptionsMap.get(String(ans?.questionId ?? ''));
        const selectedId = ans?.selectedOptionId ? String(ans.selectedOptionId) : null;
        const correctId = ans?.correctOptionId ? String(ans.correctOptionId) : null;
        const learnerAnswer =
          qType === 'ESSAY'
            ? String(ans?.textAnswer ?? '').trim() || '(Chưa nhập câu trả lời)'
            : (selectedId ? optMap?.get(selectedId) ?? selectedId : '(Bỏ trống)');
        const correctAnswer =
          qType === 'ESSAY'
            ? null
            : (correctId ? optMap?.get(correctId) ?? correctId : null);

        weaknessEvidence.push({
          id: `${row.id}:${ans?.questionId ?? prompt.slice(0, 20)}`,
          sourceType: 'LOCAL_QUIZ',
          activityId: String(row.activity_id),
          activityTitle: String(row.activity_title),
          assessmentKind: String(row.assessment_kind ?? 'QUIZ'),
          gradedAt: evaluatedAt,
          skill,
          skillLabel: SKILL_LABELS[skill],
          topicTag,
          prompt,
          learnerAnswer,
          correctAnswer,
          earnedPoints: round2(earnedPoints),
          maxPoints: round2(maxPoints),
          explanation: String(manualEntry?.comment ?? ans?.explanation ?? row.teacher_feedback ?? ''),
        });
      }
    }
  }

  for (const fa of formalInClassAttempts) {
    const skill = (['LISTENING', 'READING', 'SPEAKING', 'WRITING'].includes(String(fa.skill))
      ? String(fa.skill)
      : 'GENERAL') as SkillBucketKey;
    const rawScore = fa.rawScore !== null ? Number(fa.rawScore) : null;
    const maxRaw = fa.maxRawScore !== null ? Number(fa.maxRawScore) : null;
    const norm = fa.normalizedScore !== null ? Number(fa.normalizedScore) : null;
    if (rawScore !== null && maxRaw !== null && maxRaw > 0) {
      const agg = ensureSkill(skill);
      agg.earned += rawScore;
      agg.max += maxRaw;
      agg.total += 1;
      if (rawScore >= maxRaw * 0.8) agg.correct += 1;
    } else if (norm !== null) {
      const agg = ensureSkill(skill);
      agg.earned += norm;
      agg.max += 100;
      agg.total += 1;
      if (norm >= 80) agg.correct += 1;
    }
  }

  for (const ag of publishedAssignRows) {
    const score = Number(ag.score ?? 0);
    const maxScore = Number(ag.max_score ?? 10);
    const publishedAt = ag.published_at ? new Date(ag.published_at).toISOString() : null;
    if (maxScore > 0 && publishedAt) {
      timelineSamples.push({
        label: String(ag.activity_title),
        at: publishedAt,
        percent: round1((score / maxScore) * 100),
      });
    }
    const inferredSkill = classifyTextToSkill(String(ag.activity_title ?? '')) ?? 'WRITING';
    const agg = ensureSkill(inferredSkill);
    agg.earned += score;
    agg.max += maxScore;
    agg.total += 1;
    if (maxScore > 0 && score / maxScore >= 0.8) agg.correct += 1;
    if (maxScore > 0 && score / maxScore < 0.7) {
      weaknessEvidence.push({
        id: `assign:${ag.submission_id}`,
        sourceType: 'ASSIGNMENT',
        activityId: String(ag.activity_id),
        activityTitle: String(ag.activity_title),
        assessmentKind: 'ASSIGNMENT',
        gradedAt: publishedAt,
        skill: inferredSkill,
        skillLabel: SKILL_LABELS[inferredSkill],
        topicTag: 'Bài tập thực hành',
        prompt: String(ag.activity_title),
        learnerAnswer: `Điểm đạt ${round2(score)}/${round2(maxScore)}`,
        correctAnswer: null,
        earnedPoints: round2(score),
        maxPoints: round2(maxScore),
        explanation: String(ag.feedback ?? ''),
      });
    }
  }

  const skillBreakdown = (['LISTENING', 'READING', 'SPEAKING', 'WRITING', 'GENERAL'] as SkillBucketKey[])
    .map((key) => {
      const row = skillTotals.get(key);
      if (!row || row.max <= 0) {
        if (key === 'GENERAL') return null;
        return {
          skill: key,
          label: SKILL_LABELS[key],
          status: 'INSUFFICIENT_DATA' as SkillStrengthStatus,
          percentage: null,
          earnedPoints: 0,
          maxPoints: 0,
          correctItems: 0,
          totalItems: 0,
        };
      }
      const pct = round1((row.earned / row.max) * 100);
      return {
        skill: key,
        label: SKILL_LABELS[key],
        status: skillStatus(pct),
        percentage: pct,
        earnedPoints: round2(row.earned),
        maxPoints: round2(row.max),
        correctItems: row.correct,
        totalItems: row.total,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const evaluatedSkills = skillBreakdown.filter((s) => s.status !== 'INSUFFICIENT_DATA');
  const strengths = evaluatedSkills
    .filter((s) => s.status === 'STRONG' || (evaluatedSkills.length > 0 && (s.percentage ?? 0) >= 80))
    .map((s) => ({
      skill: s.skill,
      label: s.label,
      percentage: s.percentage!,
      evidenceSummary: `Đạt ${s.earnedPoints}/${s.maxPoints} điểm (${s.correctItems}/${s.totalItems} mục đạt) từ các bài đã công bố trong lớp.`,
    }));

  const weaknesses = evaluatedSkills
    .filter((s) => s.status === 'NEEDS_IMPROVEMENT' || s.status === 'MODERATE')
    .sort((a, b) => (a.percentage ?? 100) - (b.percentage ?? 100))
    .map((s) => ({
      skill: s.skill,
      label: s.label,
      percentage: s.percentage!,
      status: s.status,
      evidenceCount: weaknessEvidence.filter((w) => w.skill === s.skill).length,
      evidenceSummary:
        s.status === 'NEEDS_IMPROVEMENT'
          ? `Đạt ${s.earnedPoints}/${s.maxPoints} điểm (${s.percentage}%) — dưới ngưỡng 60%, cần ôn tập lại kiến thức nền.`
          : `Đạt ${s.earnedPoints}/${s.maxPoints} điểm (${s.percentage}%) — mức trung bình khá (60–79%), nên củng cố thêm các câu sai.`,
    }));

  // Chronological trend (requires >= 2 timestamped published results)
  timelineSamples.sort((a, b) => a.at.localeCompare(b.at));
  let trendAnalysis: {
    status: 'IMPROVING' | 'DECLINING' | 'STABLE' | 'INSUFFICIENT_DATA';
    sampleCount: number;
    deltaPercent: number | null;
    message: string;
    samples: Array<{ label: string; at: string; percent: number }>;
  };
  if (timelineSamples.length < 2) {
    trendAnalysis = {
      status: 'INSUFFICIENT_DATA',
      sampleCount: timelineSamples.length,
      deltaPercent: null,
      message:
        'Chưa đủ dữ liệu tối thiểu 2 bài đánh giá đã công bố theo mốc thời gian để kết luận mức độ tiến bộ.',
      samples: timelineSamples,
    };
  } else {
    const first = timelineSamples[0];
    const latest = timelineSamples[timelineSamples.length - 1];
    const delta = round1(latest.percent - first.percent);
    const status = delta >= 5 ? 'IMPROVING' : delta <= -5 ? 'DECLINING' : 'STABLE';
    trendAnalysis = {
      status,
      sampleCount: timelineSamples.length,
      deltaPercent: delta,
      message:
        status === 'IMPROVING'
          ? `Điểm bài đã công bố tăng ${delta}% từ "${first.label}" (${first.percent}%) lên "${latest.label}" (${latest.percent}%).`
          : status === 'DECLINING'
            ? `Điểm bài đã công bố giảm ${Math.abs(delta)}% từ "${first.label}" (${first.percent}%) xuống "${latest.label}" (${latest.percent}%).`
            : `Điểm bài đã công bố ổn định quanh mức ${latest.percent}% qua ${timelineSamples.length} bài (chênh lệch ${delta}%).`,
      samples: timelineSamples,
    };
  }

  // Real accessible remediation recommendations only (published class activities + LIVE/PUBLISHED knowledge articles)
  const recommendations: RemediationItem[] = [];
  const usedIds = new Set<string>();
  const weakSkillsToTarget = new Set<SkillBucketKey>([
    ...weaknessEvidence.map((w) => w.skill),
    ...weaknesses.map((w) => w.skill),
  ]);

  const classStudyTargets = metas.filter(
    (m) => !m.isUpcoming && (m.type === 'LESSON' || m.type === 'RESOURCE') && !m.localKind,
  );
  for (const targetSkill of weakSkillsToTarget) {
    let classAddedForSkill = 0;
    for (const act of classStudyTargets) {
      if (classAddedForSkill >= 2 || recommendations.length >= 8) break;
      if (usedIds.has(`act:${act.activityId}`)) continue;
      const actSkill = classifyTextToSkill(act.title) ?? classifyTextToSkill(act.sectionTitle);
      if (actSkill !== targetSkill && !(targetSkill === 'WRITING' && /viết|speaking|writing|sửa lỗi/i.test(act.title))) {
        continue;
      }
      usedIds.add(`act:${act.activityId}`);
      classAddedForSkill += 1;
      recommendations.push({
        id: `act:${act.activityId}`,
        kind: act.type === 'RESOURCE' ? 'CLASS_RESOURCE' : 'CLASS_LESSON',
        title: act.title,
        subtitle: `${act.sectionTitle} · Hoạt động trong lớp`,
        targetSkill,
        reason: `Ôn tập trực tiếp kỹ năng ${SKILL_LABELS[targetSkill]} dựa trên kết quả chưa đạt trọn điểm trong lớp.`,
        href: `/classroom/${classId}/activities/${act.activityId}`,
        accessible: true,
      });
    }
    let kbAddedForSkill = 0;
    for (const art of publishedKnowledgeArticles) {
      if (kbAddedForSkill >= 2 || recommendations.length >= 8) break;
      if (usedIds.has(`kb:${art.slug}`)) continue;
      const artSkill = classifyTextToSkill(`${art.title} ${art.slug} ${JSON.stringify(art.skills ?? '')}`);
      if (artSkill !== targetSkill && targetSkill !== 'GENERAL') continue;
      usedIds.add(`kb:${art.slug}`);
      kbAddedForSkill += 1;
      recommendations.push({
        id: `kb:${art.slug}`,
        kind: 'KNOWLEDGE_ARTICLE',
        title: String(art.title),
        subtitle: 'Thư viện kiến thức chính thức (Đã xuất bản)',
        targetSkill,
        reason: `Củng cố lý thuyết và chiến thuật cho kỹ năng ${SKILL_LABELS[targetSkill]}.`,
        href: `/knowledge/articles/${encodeURIComponent(String(art.slug))}`,
        accessible: true,
      });
    }
  }

  // Fallback: if no specific weak topic match or student hasn't completed open lessons yet, suggest real unstarted open study activities in class
  if (recommendations.length === 0) {
    const nextOpen = openMetas
      .filter(
        (m) =>
          m.localKind !== 'LOCAL_ATTENDANCE' &&
          (m.state === 'NOT_STARTED' || m.state === 'IN_PROGRESS'),
      )
      .sort((a, b) => {
        const rank = (m: ActivityMeta) =>
          m.type === 'LESSON' || m.type === 'RESOURCE' ? 0 : m.type === 'ASSIGNMENT' ? 1 : 2;
        return rank(a) - rank(b);
      })
      .slice(0, 3);
    for (const act of nextOpen) {
      recommendations.push({
        id: `next:${act.activityId}`,
        kind: 'NEXT_OPEN_ACTIVITY',
        title: act.title,
        subtitle: `${act.sectionTitle} · Chưa hoàn thành`,
        targetSkill: null,
        reason:
          evaluatedSkills.length === 0
            ? 'Chưa có bài kiểm tra nào được công bố điểm; hãy hoàn thành hoạt động đang mở này để hệ thống có dữ liệu phân tích.'
            : 'Tiếp tục hoàn thành hoạt động đang mở tiếp theo trong lộ trình lớp.',
        href: `/classroom/${classId}/activities/${act.activityId}`,
        accessible: true,
      });
    }
  }

  const latestPlacement = placementRows[0] ?? null;

  return {
    activityProgress: {
      totalPublishedActivities: metas.length,
      openActivitiesCount: openMetas.length,
      upcomingActivitiesCount: upcomingMetas.length,
      completedOrSubmittedCount: completedOrSubmittedOpen,
      completedCount: completedOpen,
      pendingGradingOrReleaseCount: pendingOpen,
      inProgressCount: inProgressOpen,
      notStartedOpenCount: notStartedOpen,
      completionRatioPercent:
        openMetas.length > 0 ? Math.round((completedOrSubmittedOpen / openMetas.length) * 100) : null,
      formulaLabel: 'Hoạt động đã hoàn thành hoặc nộp / Tổng hoạt động đang mở',
      policyStatus: 'CHUA_CHOT_TRONG_SO_VA_DIEU_KIEN_DAT' as const,
      policyNote:
        'Thống kê dựa trên tỷ lệ hoàn thành các hoạt động đang mở và điểm số thực tế đã công bố trong lớp. Điều kiện xét hoàn thành và chứng chỉ được theo dõi theo chính sách của khóa học.',
    },
    sections,
    assessmentSummary,
    competencyAnalysis: {
      evaluatedAssessmentsCount: timelineSamples.length + formalInClassAttempts.length,
      pendingResultsCount: pendingOpen,
      hasEnoughData: evaluatedSkills.length > 0,
      insufficientDataReason:
        evaluatedSkills.length === 0
          ? pendingOpen > 0
            ? 'Đã có bài nộp đang chờ giảng viên chấm/công bố điểm. Hệ thống chưa kết luận năng lực từ bài chưa công bố.'
            : 'Chưa đủ dữ liệu: học viên chưa có bài Quiz, Kiểm tra hoặc Bài tập nào được công bố điểm trong lớp.'
          : null,
      skillBreakdown,
      strengths,
      weaknesses,
      weaknessEvidence,
      trendAnalysis,
    },
    recommendations,
    placementReference: {
      hasPlacementAttempt: Boolean(latestPlacement),
      blendedIntoClassMetrics: false as const,
      separationNotice:
        'Kết quả đánh giá đầu vào (Placement) tách biệt hoàn toàn với tiến độ và điểm quá trình LMS trong lớp.',
      latestAttempt: latestPlacement
        ? {
            attemptId: String(latestPlacement.id),
            title: String(latestPlacement.title),
            submittedAt: latestPlacement.submittedAt
              ? new Date(latestPlacement.submittedAt).toISOString()
              : null,
            score:
              latestPlacement.score !== null && latestPlacement.score !== undefined
                ? Number(latestPlacement.score)
                : null,
            maxScore:
              latestPlacement.maxScore !== null && latestPlacement.maxScore !== undefined
                ? Number(latestPlacement.maxScore)
                : null,
          }
        : null,
    },
    analysisMeta: {
      mode: 'RULE_BASED' as const,
      generatedFrom: [
        'Q03_UNIFIED_LMS_ACTIVITIES',
        'PUBLISHED_QUIZ_ATTEMPTS',
        'PUBLISHED_ASSIGNMENT_GRADES',
        'LOCAL_ATTENDANCE',
      ],
      thresholdsNote:
        'Phân loại theo quy tắc từ các bài đã công bố điểm (>=80% Vững, 60–79% Trung bình khá, <60% Cần củng cố).',
    },
    aiAdvisory: {
      status: 'DISABLED' as const,
      provider: process.env.PLACEMENT_AI_ADVISORY_PROVIDER || 'NONE',
      reason:
        'Nhận xét và gợi ý ôn tập được tổng hợp trực tiếp từ dữ liệu học tập và các câu trả lời đã công bố của bạn.',
    },
  };
}
