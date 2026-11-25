// DEC-046: entirely synthetic gradebook fixture, never a general seed.
const { createHash } = require('node:crypto');
const version = 'DEC046-M07-SYNTHETIC-v1';
const tag = 'SYNTHETIC_TEST_ONLY';
const database = 'v2_wave01_dev_test_m07_synthetic_dec046_20261102_a1';
const restoreDatabase = 'v2_wave01_dev_test_m07_synthetic_dec046_20261102_restore_a1';
const time = '2026-11-02T00:00:00.000Z';
const id = (key) => {
  const h = createHash('sha256')
    .update(version + ':' + key)
    .digest('hex');
  return (
    h.slice(0, 8) +
    '-' +
    h.slice(8, 12) +
    '-4' +
    h.slice(13, 16) +
    '-8' +
    h.slice(17, 20) +
    '-' +
    h.slice(20, 32)
  );
};
function manifest() {
  const operations = [];
  const add = (table, key, data) => {
    const row = { id: id(key), ...data };
    operations.push({ table, key, classification: tag, row });
    return row.id;
  };
  const instructor = add('users', 'instructor', {
    email: 'instructor.demo@smart-elearning.local',
    fullName: tag + ' Instructor M07',
    role: 'INSTRUCTOR',
    status: 'ACTIVE',
    passwordHash: '!SYNTHETIC_TEST_ONLY_NO_LOGIN',
  });
  const learners = Array.from({ length: 11 }, (_, i) =>
    add('users', 'learner' + i, {
      email:
        i === 0
          ? 'student.demo@smart-elearning.local'
          : `synthetic-m07-learner${i}@example.invalid`,
      fullName: i === 0 ? 'Nguyễn Minh Anh' : tag + ' Learner ' + i,
      role: 'STUDENT',
      status: 'ACTIVE',
      passwordHash: '!SYNTHETIC_TEST_ONLY_NO_LOGIN',
    }),
  );
  const staff = ['maker', 'reviewer', 'grant-requester', 'grant-approver'].map((k, i) =>
    add('users', k, {
      email: `synthetic-m07-${k}@example.invalid`,
      fullName: tag + ' ' + k,
      role: i < 2 ? 'ACADEMIC_MANAGER' : 'SYSTEM_ADMIN',
      status: 'ACTIVE',
      passwordHash: '!SYNTHETIC_TEST_ONLY_NO_LOGIN',
    }),
  );
  const courses = [],
    versions = [];
  for (let i = 0; i < 5; i++) {
    const title = i === 0 ? 'TOEIC Workplace Foundations' : tag + ' TOEIC program ' + i;
    const description =
      tag + ' self-authored metadata; fixture gradebook only; not an academic release.';
    const c = add('courses', 'course' + i, {
      title,
      slug: 'synthetic-test-only-m07-course-' + i,
      description,
      level: 'A2',
      skillScope: 'FOUR_SKILLS',
      isPublished: false,
      createdById: staff[0],
    });
    courses.push(c);
    add('permission_grants', 'grant' + i, {
      userId: staff[1],
      capability: 'academic.program.approve',
      scopeType: 'COURSE',
      scopeId: c,
      requestedBy: staff[2],
      approvedBy: staff[3],
      approvedAt: '2026-01-02T00:00:00Z',
      effectiveAt: '2026-01-01T00:00:00Z',
      expiresAt: '2027-12-31T00:00:00Z',
      reason: tag + ' course-version simulation only',
    });
    const v = add('course_versions', 'version' + i, {
      courseId: c,
      number: 1,
      title,
      description,
      level: 'A2',
      skillScope: 'FOUR_SKILLS',
      standardPricingType: 'FREE',
      standardTuitionFeeVnd: 0,
      effectiveFrom: '2026-09-01T00:00:00Z',
      state: 'DRAFT',
      proposedBy: staff[0],
      reason: tag + ' metadata version simulation',
    });
    versions.push(v);
    operations.push({
      table: 'course_versions',
      key: 'submit-version' + i,
      classification: tag,
      transition: { id: v, state: 'PENDING_APPROVAL', submittedAt: time, lockVersion: 1 },
    });
    operations.push({
      table: 'course_versions',
      key: 'publish-version' + i,
      classification: tag,
      transition: {
        id: v,
        state: 'PUBLISHED',
        approvedBy: staff[1],
        approvedAt: time,
        decisionReason: tag + ' independent synthetic approval, no release signoff',
        lockVersion: 2,
      },
    });
  }
  const classes = [];
  for (let i = 0; i < 10; i++) {
    const n = Math.floor(i / 2),
      course = operations.find((x) => x.key === 'course' + n).row;
    classes.push(
      add('class_offerings', 'class' + i, {
        courseId: courses[n],
        instructorId: instructor,
        code: i === 0 ? 'TOEIC-LR-2609-EVE' : 'SYNTHETIC-M07-CLASS-' + i,
        name: i === 0 ? 'TOEIC L&R Foundation — Tối T3/T5' : tag + ' Class ' + i,
        status: ['IN_PROGRESS', 'OPEN', 'COMPLETED', 'CANCELLED', 'DRAFT'][i % 5],
        modality: 'ONLINE',
        pricingType: 'FREE',
        tuitionFeeVnd: 0,
        maxStudents: 20,
        totalSessions: 2,
        classStart: '2026-09-01T00:00:00Z',
        classEnd: '2026-12-31T23:59:00Z',
        versionId: versions[n],
        termsTitle: course.title,
        termsDescription: course.description,
        termsLevel: 'A2',
        termsSkillScope: 'FOUR_SKILLS',
        approvedPricingType: 'FREE',
        approvedTuitionFeeVnd: 0,
        termsApprovedAt: time,
      }),
    );
  }
  const assignment = add('class_instructor_assignments', 'assignment', {
    classOfferingId: classes[0],
    instructorId: instructor,
    effectiveFrom: '2026-11-05T00:00:00Z',
    effectiveTo: '2026-12-31T23:59:00Z',
    reservedUntil: '2026-12-31T23:59:00Z',
    state: 'DRAFT',
    proposedBy: staff[0],
    eligibilityConfirmed: false,
    reason: tag + ' draft only, not a published timetable',
  });
  for (let i = 0; i < 2; i++)
    add('teaching_sessions', 'session' + i, {
      occurrenceId: id('occurrence' + i),
      revision: 1,
      classOfferingId: classes[0],
      startsAt: `2026-11-${10 + i * 2}T11:00:00Z`,
      endsAt: `2026-11-${10 + i * 2}T12:30:00Z`,
      timezone: 'Asia/Ho_Chi_Minh',
      modality: 'ONLINE',
      instructorId: instructor,
      assignmentId: assignment,
      requiredCapabilities: [],
      state: 'DRAFT',
      intent: 'PUBLISH',
      proposedBy: staff[0],
      reason: tag + ' explicit draft, no weekly auto-publication',
    });
  const modules = Array.from({ length: 3 }, (_, i) =>
    add('modules', 'module' + i, {
      courseId: courses[0],
      title: tag + ' TOEIC module ' + i,
      description: tag,
      orderIndex: i,
    }),
  );
  const lessons = Array.from({ length: 8 }, (_, i) =>
    add('lessons', 'lesson' + i, {
      moduleId: modules[Math.floor(i / 3)],
      title: tag + ' lesson ' + i,
      description: tag,
      orderIndex: i % 3,
      contentMarkdown: tag + ' original practice explanation ' + i,
      focusSkills: ['LISTENING', 'READING'],
      learningObjectives: [tag + ' practice'],
      focusTaskCodes: [],
      estimatedMinutes: 20,
    }),
  );
  const enrollment = learners.map((learnerId, i) =>
    add('enrollments', 'enrollment' + i, {
      learnerId,
      classOfferingId: classes[0],
      status: 'ACTIVE',
      enrolledAt: '2026-09-01T00:00:00Z',
    }),
  );
  const completed = [4, 2, 6, 8, 5, 3, 7, 1, 5, 8, 0];
  enrollment.forEach((enrollmentId, i) =>
    lessons.forEach((lessonId, j) => {
      const at = i < 3 ? '2026-09-29T00:00:00Z' : '2026-10-07T00:00:00Z';
      add('lesson_progress', `progress${i}-${j}`, {
        enrollmentId,
        lessonId,
        status: j < completed[i] ? 'COMPLETED' : 'NOT_STARTED',
        lastAccessedAt: at,
        completedAt: j < completed[i] ? at : null,
      });
    }),
  );
  const documentKey = 'synthetic_test_only/dec046-m07-v1/learner-guide.txt';
  add('learning_resources', 'document', {
    lessonId: lessons[0],
    title: 'Cẩm nang học tập của lớp',
    type: 'DOCUMENT',
    storageKey: documentKey,
    originalFileName: 'SYNTHETIC_TEST_ONLY-guide.txt',
    mimeType: 'text/plain',
    isDownloadable: true,
    orderIndex: 0,
  });
  add('learning_resources', 'video', {
    lessonId: lessons[0],
    title: 'Trải nghiệm bài thi TOEIC Listening & Reading',
    type: 'VIDEO',
    url: 'https://www.youtube.com/watch?v=SYNTHETIC_TEST_ONLY',
    isDownloadable: false,
    orderIndex: 1,
  });
  add('learning_resources', 'link', {
    lessonId: lessons[0],
    title: 'Tài nguyên TOEIC tham khảo',
    type: 'LINK',
    url: 'https://example.invalid/synthetic-test-only/m07',
    isDownloadable: false,
    orderIndex: 2,
  });
  const rubric = add('rubrics', 'rubric', {
    name: tag + ' simulation rubric',
    description: tag + ' Not faculty calibration or actual academic approval',
    isActive: true,
  });
  const criterion = add('rubric_criteria', 'criterion', {
    rubricId: rubric,
    code: 'SYNTHETIC_COMMUNICATION',
    name: tag + ' communication',
    description: tag,
    maxScore: '100',
    weight: '1',
    orderIndex: 0,
  });
  const questions = {};
  for (const [skill, letter, count, type] of [
    ['LISTENING', 'L', 24, 'SINGLE_CHOICE'],
    ['READING', 'R', 24, 'SINGLE_CHOICE'],
    ['SPEAKING', 'S', 16, 'AUDIO_RESPONSE'],
    ['WRITING', 'W', 16, 'TEXT_RESPONSE'],
  ]) {
    questions[skill] = [];
    for (let i = 1; i <= count; i++) {
      const label = `M07-VG-${letter}-${String(i).padStart(2, '0')}`;
      const prompt =
        skill === 'LISTENING'
          ? 'Synthetic announcement: the desk closes at 5:30 p.m. When does it close?'
          : skill === 'READING'
            ? "Synthetic invitation: please confirm Friday's project meeting at 2:00 p.m. Which response confirms attendance?"
            : skill === 'SPEAKING'
              ? 'Describe a fictional study plan; synthetic transcript fixture only.'
              : 'Write a fictional study plan; synthetic fixture only.';
      const q = add('questions', 'question-' + letter + i, {
        courseId: courses[0],
        responseType: type,
        difficulty: 'EASY',
        toeicSkill: skill,
        content: label + ' ' + tag + ' ' + prompt,
        explanation: tag + ' self-authored from checker requirements',
        ...(type === 'SINGLE_CHOICE' ? {} : { rubricId: rubric }),
      });
      questions[skill].push(q);
      if (type === 'SINGLE_CHOICE') {
        const correct =
          skill === 'LISTENING'
            ? 'The desk closes at 5:30 p.m.'
            : "Yes, I will attend Friday's project meeting at 2:00 p.m.";
        [
          correct,
          'It closes on a different day.',
          'No attendance is confirmed.',
          'The notice does not give that information.',
        ].forEach((content, j) =>
          add('question_options', `option-${letter}${i}-${j}`, {
            questionId: q,
            content,
            isCorrect: j === 0,
            orderIndex: j,
          }),
        );
      }
    }
  }
  const skills = ['LISTENING', 'READING', 'SPEAKING', 'WRITING'],
    tests = {},
    links = {};
  for (const [key, title] of [
    ['draft', 'VG-R3 — Đề demo hướng dẫn'],
    ['periodic', 'Kiểm tra thường kỳ 01'],
    ['midterm', 'Kiểm tra giữa kỳ'],
    ['final', 'Kiểm tra cuối kỳ'],
  ]) {
    tests[key] = add('tests', 'test-' + key, {
      courseId: courses[0],
      purpose: 'IN_CLASS',
      title,
      description: tag + ' simulated gradebook, no Placement/media release',
      status: 'DRAFT',
      maxAttempts: 2,
      showResultAfterSubmit: false,
    });
    links[key] = {};
    skills.forEach((skill, i) => {
      const groupId = add('test_question_groups', `group-${key}-${skill}`, {
        testId: tests[key],
        skill,
        orderIndex: i,
        title: tag + ' ' + skill,
        instructions: tag + ' not real examination',
      });
      links[key][skill] = add('test_questions', `link-${key}-${skill}`, {
        testId: tests[key],
        questionId: questions[skill][0],
        groupId,
        orderIndex: i,
        points: 100,
      });
      if (key === 'draft' && i === 0)
        add('assessment_stimuli', 'stimulus', {
          groupId,
          type: 'TEXT',
          orderIndex: 0,
          textContent: tag + ' original textual stimulus',
          isProtected: true,
        });
    });
  }
  const assessments = {};
  for (const [key, stage, openAt, closeAt] of [
    ['periodic', 'PERIODIC', '2026-09-15T00:00:00Z', '2026-10-05T00:00:00Z'],
    ['midterm', 'MIDTERM', '2026-10-06T00:00:00Z', '2026-10-31T00:00:00Z'],
    ['final', 'FINAL', '2026-12-01T00:00:00Z', '2026-12-31T00:00:00Z'],
  ])
    assessments[key] = add('class_assessments', 'assessment-' + key, {
      classOfferingId: classes[0],
      testId: tests[key],
      stage,
      openAt,
      closeAt,
      isActive: false,
      maxAttemptsOverride: 2,
    });
  function attempt(key, i, number, state, scores) {
    const a = add('test_attempts', `attempt-${key}-${i}-${number}`, {
      testId: tests[key],
      learnerId: learners[i],
      enrollmentId: enrollment[i],
      classAssessmentId: assessments[key],
      attemptNumber: number,
      status: 'SUBMITTED',
      startedAt: key === 'periodic' ? '2026-09-20T10:00:00Z' : '2026-10-10T10:00:00Z',
      submittedAt: key === 'periodic' ? '2026-09-20T11:00:00Z' : '2026-10-10T11:00:00Z',
      s10ProtocolVersion: 1,
    });
    skills.forEach((skill, j) => {
      const productive = j >= 2;
      const answer = add('test_answers', `answer-${key}-${i}-${number}-${skill}`, {
        attemptId: a,
        testQuestionId: links[key][skill],
        selectedOptionIds: productive ? [] : [id('option-' + (j === 0 ? 'L' : 'R') + '1-0')],
        textResponse: productive
          ? tag + ' simulated ' + skill + ' response; not actual captured speech'
          : null,
        isCorrect: productive ? null : true,
        pointsAwarded: productive ? null : '100',
      });
      if (productive && (state === 'FINAL' || (state === 'PARTIAL' && skill === 'SPEAKING'))) {
        const e = add('answer_evaluations', `evaluation-${key}-${i}-${number}-${skill}`, {
          testAnswerId: answer,
          source: 'INSTRUCTOR',
          status: 'REVIEWED_FINAL',
          evaluatorId: instructor,
          totalScore: String(scores[skill] ?? 75),
          feedback: tag + ' simulated gradebook state, no real speech assessment',
        });
        add('rubric_criterion_scores', `criterion-score-${key}-${i}-${number}-${skill}`, {
          answerEvaluationId: e,
          rubricCriterionId: criterion,
          score: String(scores[skill] ?? 75),
          feedback: tag,
        });
      }
      if (!productive || state === 'FINAL')
        add('attempt_skill_scores', `skillscore-${key}-${i}-${number}-${skill}`, {
          attemptId: a,
          skill,
          rawScore: String(scores[skill] ?? 75),
          maxRawScore: '100',
          normalizedScore: String(scores[skill] ?? 75),
          status: 'FINAL',
          source: productive ? 'INSTRUCTOR_CONFIRMED' : 'OBJECTIVE_AUTO',
        });
    });
  }
  const periodicScores = { LISTENING: 84, READING: 78, SPEAKING: 74, WRITING: 70 },
    midScores = { LISTENING: 88, READING: 82, SPEAKING: 78, WRITING: 76 };
  for (let i = 0; i < 8; i++)
    attempt(
      'periodic',
      i,
      1,
      i < 6 ? 'FINAL' : i === 6 ? 'PARTIAL' : 'WAITING',
      i === 0 ? periodicScores : {},
    );
  attempt('midterm', 0, 1, 'WAITING', {});
  for (let i = 0; i < 7; i++)
    attempt(
      'midterm',
      i,
      i === 0 ? 2 : 1,
      i < 5 ? 'FINAL' : i === 5 ? 'PARTIAL' : 'WAITING',
      i === 0 ? midScores : {},
    );
  // r02: reconcile synthetic lifecycle and objective scores with actual answers.
  // Bootstrap r01 evidence remains retained; no checker condition changes.
  const rowsById = new Map(operations.filter((x) => x.row).map((x) => [x.row.id, x.row]));
  for (const key of ['periodic', 'midterm', 'final']) {
    rowsById.get(tests[key]).status = 'PUBLISHED';
    for (const [skill, letter] of [
      ['LISTENING', 'L'],
      ['READING', 'R'],
    ]) {
      const first =
        key === 'periodic'
          ? skill === 'LISTENING'
            ? 84
            : 78
          : key === 'midterm'
            ? skill === 'LISTENING'
              ? 88
              : 82
            : 50;
      rowsById.get(links[key][skill]).points = first;
      const extra = add('test_questions', `extra-link-${key}-${skill}`, {
        testId: tests[key],
        questionId: questions[skill][1],
        groupId: rowsById.get(links[key][skill]).groupId,
        orderIndex: skill === 'LISTENING' ? 4 : 5,
        points: 100 - first,
      });
      for (const attemptOp of operations.filter(
        (x) => x.table === 'test_attempts' && x.row.testId === tests[key],
      )) {
        const a = attemptOp.row,
          primary = a.learnerId === learners[0];
        const original = operations.find(
          (x) =>
            x.table === 'test_answers' &&
            x.row.attemptId === a.id &&
            x.row.testQuestionId === links[key][skill],
        ).row;
        original.pointsAwarded = String(first);
        add('test_answers', `extra-answer-${key}-${a.id}-${skill}`, {
          attemptId: a.id,
          testQuestionId: extra,
          selectedOptionIds: [id(`option-${letter}2-${primary ? 1 : 0}`)],
          textResponse: null,
          isCorrect: !primary,
          pointsAwarded: String(primary ? 0 : 100 - first),
        });
        const score = operations.find(
          (x) =>
            x.table === 'attempt_skill_scores' && x.row.attemptId === a.id && x.row.skill === skill,
        ).row;
        score.rawScore = String(primary ? first : 100);
        score.normalizedScore = score.rawScore;
      }
    }
  }
  const byTable = {};
  for (const op of operations) if (op.row) byTable[op.table] = (byTable[op.table] ?? 0) + 1;
  return {
    version,
    manifestRevision: 'r02',
    bootstrapManifestSha256: 'bd2f3b69de136824bdf6b4c033000ba93acf00293cd9ce5132ffd44e442a77aa',
    classification: tag,
    database,
    restoreDatabase,
    time,
    operations,
    byTable,
    identities: { instructor, learners, staff },
    requirements: {
      legacyCompatibilityLabels: [
        'instructor.demo@smart-elearning.local',
        'student.demo@smart-elearning.local',
        'Nguyễn Minh Anh',
        'TOEIC-LR-2609-EVE',
      ],
      courses: 5,
      classes: 10,
      modules: 3,
      lessons: 8,
      learners: 11,
      completed,
      completedTotal: 49,
      buckets: [2, 2, 3, 2, 2],
      stale: 3,
      recent: 8,
      bank: { LISTENING: 24, READING: 24, SPEAKING: 16, WRITING: 16 },
      periodic: [8, 6, 1, 1],
      midtermLatest: [7, 5, 1, 1],
      primaryPeriodic: periodicScores,
      primaryLatestMidterm: midScores,
      simulatedGradesNotAcademicApproval: true,
      noActualMicrophoneOrOriginalMediaClaim: true,
    },
    files: [
      {
        relativeRoot: 'apps/api/.local-storage/learning-resources',
        key: documentKey,
        body:
          tag +
          '\nDEC046 M07 fixture learner guide. All records are fictional. No real academic or media publication.\n',
      },
    ],
  };
}
module.exports = { manifest, id, version, tag, database, restoreDatabase };
