import {
  buildUnifiedClassResults,
  listClassQuestionBank,
  normalizeAssessmentKind,
  normalizeReleaseMode,
} from './lms-unified-results.helpers';
import { saveOrSubmitQuizAttemptInTx } from './lms-local-qa.helpers';

describe('Q03 LMS Unified Results & Policy Guards', () => {
  it('normalizes assessmentKind and releaseMode uniformly across QUIZ, REGULAR, MIDTERM and FINAL', () => {
    expect(normalizeAssessmentKind('REGULAR')).toBe('REGULAR');
    expect(normalizeAssessmentKind('MIDTERM')).toBe('MIDTERM');
    expect(normalizeAssessmentKind('FINAL')).toBe('FINAL');
    expect(normalizeAssessmentKind('UNKNOWN')).toBe('QUIZ');

    expect(normalizeReleaseMode('AUTO_ON_SUBMIT', 'MIDTERM', true)).toBe('AUTO_ON_SUBMIT');
    expect(normalizeReleaseMode('INSTRUCTOR_PUBLISH', 'FINAL', true)).toBe('INSTRUCTOR_PUBLISH');
    expect(normalizeReleaseMode('ACADEMIC_APPROVAL_REQUIRED', 'MIDTERM', false)).toBe(
      'INSTRUCTOR_PUBLISH',
    );
    expect(normalizeReleaseMode(undefined, 'REGULAR', false)).toBe('INSTRUCTOR_PUBLISH');
    expect(normalizeReleaseMode(undefined, 'QUIZ', true)).toBe('AUTO_ON_SUBMIT');
  });

  it('deduplicates course bank and class reusable questions in listClassQuestionBank', async () => {
    const fakeTx = {
      classOffering: {
        findUnique: jest.fn().mockResolvedValue({ id: 'class-1', courseId: 'course-1' }),
      },
      question: {
        count: jest.fn().mockResolvedValue(46),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'q-bank-1',
            responseType: 'SINGLE_CHOICE',
            toeicSkill: 'READING',
            difficulty: 'MEDIUM',
            content: 'Choose the best answer.',
            explanation: 'Simple present tense.',
            options: [
              { id: 'o1', content: 'goes', isCorrect: true },
              { id: 'o2', content: 'go', isCorrect: false },
            ],
          },
        ]),
      },
      $queryRawUnsafe: jest.fn().mockResolvedValue([
        {
          id: 'lq-dup',
          q_type: 'MCQ',
          prompt: 'Choose the best answer.',
          points: 1,
          options_json: [],
          correct_option_id: null,
          explanation: '',
          activity_title: 'Quiz 1',
        },
        {
          id: 'lq-2',
          q_type: 'ESSAY',
          prompt: 'Write a short email.',
          points: 5,
          options_json: [],
          correct_option_id: null,
          explanation: '',
          activity_title: 'Kiểm tra thường kỳ 1',
        },
      ]),
    } as any;

    const bank = await listClassQuestionBank(fakeTx, 'class-1', { responseType: 'ALL' });
    expect(bank.totalCourseQuestions).toBe(46);
    expect(bank.items).toHaveLength(2);
    expect(bank.items[0].source).toBe('COURSE_BANK');
    expect(bank.items[1].source).toBe('CLASS_QUIZ');
  });

  it('builds unified class results without double-counting assignments and hides unpublished quiz scores from students', async () => {
    const fakeTx = {
      classOffering: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'class-1',
          code: 'W01-1',
          name: 'TOEIC',
          courseId: 'course-1',
          course: { title: 'TOEIC 500+' },
        }),
      },
      classSection: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sec-1',
            title: 'Tuần 1',
            orderIndex: 0,
            publishedRevision: { title: 'Tuần 1' },
            publishedRevisionId: 'rev-sec-1',
            activities: [
              {
                id: 'act-assign',
                type: 'ASSIGNMENT',
                title: 'Bài tập 1',
                state: 'PUBLISHED',
                orderIndex: 0,
                availableFrom: null,
                availableUntil: null,
                publishedRevision: {
                  id: 'rev-assign',
                  type: 'ASSIGNMENT',
                  title: 'Bài tập 1',
                  availableFrom: null,
                  availableUntil: null,
                  quizTest: null,
                },
              },
              {
                id: 'act-quiz',
                type: 'LESSON',
                title: 'Kiểm tra thường kỳ 1',
                state: 'PUBLISHED',
                orderIndex: 1,
                availableFrom: null,
                availableUntil: null,
                publishedRevision: {
                  id: 'rev-quiz',
                  type: 'LESSON',
                  title: 'Kiểm tra thường kỳ 1',
                  availableFrom: null,
                  availableUntil: null,
                  quizTest: null,
                },
              },
              {
                id: 'act-att',
                type: 'LESSON',
                title: 'Điểm danh Buổi 1',
                state: 'PUBLISHED',
                orderIndex: 2,
                availableFrom: null,
                availableUntil: null,
                publishedRevision: {
                  id: 'rev-att',
                  type: 'LESSON',
                  title: 'Điểm danh Buổi 1',
                  availableFrom: null,
                  availableUntil: null,
                  quizTest: null,
                },
              },
              {
                id: 'act-core-draft',
                type: 'QUIZ',
                title: 'Core Draft Quiz',
                state: 'DRAFT',
                orderIndex: 3,
                availableFrom: null,
                availableUntil: null,
                publishedRevision: null,
              },
            ],
          },
        ]),
      },
      enrollment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'enr-1',
            learner: { id: 'stu-1', fullName: 'Nguyễn Văn A', email: 'student@gmail.com' },
          },
        ]),
      },
      classAssignmentSubmission: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sub-1',
            activityId: 'act-assign',
            enrollmentId: 'enr-1',
            state: 'SUBMITTED',
            submittedAt: new Date('2026-11-14T08:00:00Z'),
            gradeVersions: [],
          },
        ]),
      },
      classActivityProgress: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      classAssessment: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $queryRawUnsafe: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('lms_local_activity_kinds')) {
          return Promise.resolve([
            { activity_id: 'act-quiz', kind: 'LOCAL_QUIZ' },
            { activity_id: 'act-att', kind: 'LOCAL_ATTENDANCE' },
          ]);
        }
        if (sql.includes('lms_local_quiz_configs')) {
          return Promise.resolve([
            {
              activity_id: 'act-quiz',
              auto_release_objective: false,
              pass_score: 5,
              assessment_kind: 'REGULAR',
              release_mode: 'INSTRUCTOR_PUBLISH',
            },
          ]);
        }
        if (sql.includes('lms_local_quiz_questions')) {
          return Promise.resolve([{ activity_id: 'act-quiz', total_points: 10 }]);
        }
        if (sql.includes('lms_local_assignment_configs')) {
          return Promise.resolve([{ activity_id: 'act-assign', max_score: 10 }]);
        }
        if (sql.includes('lms_local_assignment_grades')) {
          return Promise.resolve([
            {
              submission_id: 'sub-1',
              activity_id: 'act-assign',
              score: 8.5,
              max_score: 10,
              feedback: 'Good work',
              state: 'PUBLISHED',
              graded_at: '2026-11-14T09:00:00Z',
              published_at: '2026-11-14T09:00:00Z',
            },
          ]);
        }
        if (sql.includes('lms_local_quiz_attempts')) {
          return Promise.resolve([
            {
              id: 'qa-1',
              activity_id: 'act-quiz',
              enrollment_id: 'enr-1',
              learner_id: 'stu-1',
              attempt_number: 1,
              status: 'SUBMITTED',
              submitted_at: '2026-11-14T09:30:00Z',
              auto_score: 4,
              manual_score: 0,
              total_score: 4,
              max_score: 10,
              grading_status: 'PENDING_MANUAL_GRADE',
              teacher_feedback: 'Private draft note',
              graded_at: null,
              grade_published: false,
            },
          ]);
        }
        if (sql.includes('lms_local_attendance_records')) {
          return Promise.resolve([
            {
              activity_id: 'act-att',
              enrollment_id: 'enr-1',
              status: 'PRESENT',
              checked_in_at: '2026-11-14T07:05:00Z',
              note: 'On time',
            },
          ]);
        }
        return Promise.resolve([]);
      }),
    } as any;

    const studentRes = await buildUnifiedClassResults(fakeTx, 'class-1', {
      editable: false,
      studentEnrollmentId: 'enr-1',
      studentUserId: 'stu-1',
    });

    expect(studentRes.studentRows).toHaveLength(1);
    const row = studentRes.studentRows[0];
    // Local assignment direct grade exposed cleanly
    expect(row.assignments['act-assign'].score).toBe(8.5);
    expect(row.assignments['act-assign'].gradeSource).toBe('LOCAL_DIRECT');
    // Pending manual quiz score hidden from student until published
    expect(row.quizzes['act-quiz'].gradePublished).toBe(false);
    expect(row.quizzes['act-quiz'].score).toBeNull();
    expect(row.quizzes['act-quiz'].teacherFeedback).toBe('');
    // Real attendance preserved
    expect(row.attendance['act-att'].status).toBe('PRESENT');
    expect(studentRes.summary.regularExamCount).toBe(1);
    expect(studentRes.summary.awaitingManualQuizGrades).toBe(1);
    expect(studentRes.summary.attendanceCount).toBe(1);
  });
});

// Prevent unused warning on imported symbol referenced for TS signature compatibility
void saveOrSubmitQuizAttemptInTx;
