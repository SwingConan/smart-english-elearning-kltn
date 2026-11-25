import { BadRequestException, NotFoundException } from '@nestjs/common';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LmsLocalService } from './lms-local.service';
import {
  getQuizWorkspaceInTx,
  saveLocalQuizInTx,
  saveOrSubmitQuizAttemptInTx,
} from './lms-local-qa.helpers';

describe('LocalQuiz Media & Shared Passage Grouping', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'lms-quiz-media-spec-'));
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  function makeService(txOverrides: Record<string, any> = {}) {
    const tx = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      ...txOverrides,
    };
    const prisma = {
      $executeRawUnsafe: jest.fn().mockResolvedValue(1),
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    } as any;
    const lms = {
      run: jest.fn(async (_actor, _classId, fn) =>
        fn(tx, { teacher: true, enrollment: null, now: new Date('2026-11-17T08:00:00Z') }),
      ),
    } as any;
    const svc = new LmsLocalService(prisma, lms);
    (svc as any).localFilesRoot = tempRoot;
    (svc as any).legacyFilesRoot = tempRoot;
    (svc as any).tablesReady = true;
    return { svc, tx, lms };
  }

  it('uploads PNG images and MP3 audio cleanly and opens stored media by id', async () => {
    let insertedRow: any = null;
    const { svc, tx } = makeService({
      $executeRawUnsafe: jest.fn(async (_sql: string, ...params: any[]) => {
        if (params.length >= 8) {
          insertedRow = {
            id: params[0],
            class_offering_id: params[1],
            storage_key: params[2],
            kind: params[3],
            original_file_name: params[4],
            mime_type: params[5],
            file_bytes: params[6],
          };
        }
        return 1;
      }),
    });

    const imgItem = await svc.uploadQuizMedia(
      { id: 'inst-1', sessionId: 'sess-1' },
      'class-1',
      {
        buffer: Buffer.from('fake-png-bytes'),
        mimetype: 'image/png',
        originalname: 'part6-passage.png',
        size: 14,
      },
    );

    expect(imgItem.kind).toBe('IMAGE');
    expect(imgItem.name).toBe('part6-passage.png');
    expect(imgItem.url).toBe(`/api/v2/lms-local/classes/class-1/quiz-media/${imgItem.id}`);

    tx.$queryRawUnsafe.mockResolvedValueOnce([insertedRow]);
    const opened = await svc.openQuizMedia(
      { id: 'stu-1', sessionId: 'sess-2' },
      'class-1',
      imgItem.id,
    );
    expect(opened.fileName).toBe('part6-passage.png');
    expect(opened.mimeType).toBe('image/png');
    expect(opened.path).toContain(insertedRow.storage_key);

    const audioItem = await svc.uploadQuizMedia(
      { id: 'inst-1', sessionId: 'sess-1' },
      'class-1',
      {
        buffer: Buffer.from('fake-mp3-bytes'),
        mimetype: 'audio/mpeg',
        originalname: 'part3-track.mp3',
        size: 14,
      },
    );
    expect(audioItem.kind).toBe('AUDIO');

    await expect(
      svc.uploadQuizMedia(
        { id: 'inst-1', sessionId: 'sess-1' },
        'class-1',
        {
          buffer: Buffer.from('bad'),
          mimetype: 'text/plain',
          originalname: 'notes.txt',
          size: 3,
        },
      ),
    ).rejects.toThrow(BadRequestException);

    tx.$queryRawUnsafe.mockResolvedValueOnce([]);
    await expect(
      svc.openQuizMedia({ id: 'stu-1', sessionId: 'sess-2' }, 'class-1', 'missing-id'),
    ).rejects.toThrow(NotFoundException);
  });

  it('persists groupId, groupTitle, and verified media on save, workspace load, and attempt submit', async () => {
    const classId = '11111111-1111-4111-8111-111111111111';
    const mediaId = '33333333-3333-4333-8333-333333333333';
    const activityId = '44444444-4444-4444-8444-444444444444';

    const storedQuestions: any[] = [];
    const tx = {
      classSection: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'sec-1',
          publishedRevisionId: 'rev-sec-1',
          activities: [],
        }),
      },
      classActivity: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _max: { orderIndex: 0 } }),
        create: jest.fn().mockResolvedValue({
          id: activityId,
          sectionId: 'sec-1',
          title: 'Part 6 Reading Quiz',
          introduction: 'Read passage carefully',
          state: 'PUBLISHED',
          revisionNumber: 1,
          availableFrom: null,
          availableUntil: null,
          section: { id: 'sec-1', title: 'Buổi 1', publishedRevisionId: 'rev-sec-1' },
        }),
        update: jest.fn().mockResolvedValue({
          id: activityId,
          sectionId: 'sec-1',
          title: 'Part 6 Reading Quiz',
          introduction: 'Read passage carefully',
          state: 'PUBLISHED',
          revisionNumber: 1,
          availableFrom: null,
          availableUntil: null,
          section: { id: 'sec-1', title: 'Buổi 1', publishedRevisionId: 'rev-sec-1' },
        }),
        findFirst: jest.fn().mockResolvedValue({
          id: activityId,
          sectionId: 'sec-1',
          title: 'Part 6 Reading Quiz',
          introduction: 'Read passage carefully',
          state: 'PUBLISHED',
          revisionNumber: 1,
          availableFrom: null,
          availableUntil: null,
          section: { id: 'sec-1', title: 'Buổi 1', publishedRevisionId: 'rev-sec-1' },
        }),
      },
      classActivityRevision: {
        create: jest.fn().mockResolvedValue({ id: 'rev-act-1', number: 1 }),
      },
      enrollment: {
        count: jest.fn().mockResolvedValue(1),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 'stu-1', fullName: 'Học viên A', email: 'a@test.com' }]),
      },
      $executeRawUnsafe: jest.fn(async (sql: string, ...params: any[]) => {
        if (sql.includes('INSERT INTO lms_local_quiz_questions')) {
          storedQuestions.push({
            id: params[0],
            activity_id: params[1],
            order_index: params[2],
            q_type: params[3],
            prompt: params[4],
            points: params[5],
            options_json: JSON.parse(params[6]),
            correct_option_id: params[7],
            explanation: params[8],
            group_id: params[9],
            group_title: params[10],
            media_json: JSON.parse(params[11]),
          });
        }
        return 1;
      }),
      $queryRawUnsafe: jest.fn(async (sql: string) => {
        if (sql.includes('FROM lms_local_quiz_media_files')) {
          return [
            {
              id: mediaId,
              kind: 'IMAGE',
              original_file_name: 'passage-p6.webp',
              mime_type: 'image/webp',
              file_bytes: 12345,
            },
          ];
        }
        if (sql.includes('FROM lms_local_activity_kinds')) {
          return [{ kind: 'LOCAL_QUIZ' }];
        }
        if (sql.includes('FROM lms_local_quiz_configs')) {
          return [
            {
              duration_minutes: 15,
              max_attempts: 1,
              shuffle_questions: false,
              auto_release_objective: true,
              pass_score: 1,
              assessment_kind: 'QUIZ',
              release_mode: 'AUTO_ON_SUBMIT',
            },
          ];
        }
        if (sql.includes('FROM lms_local_quiz_questions')) {
          return storedQuestions;
        }
        if (sql.includes('WHERE id = $1 AND activity_id = $2')) {
          return [
            {
              id: 'att-1',
              activity_id: activityId,
              class_offering_id: classId,
              learner_id: 'stu-1',
              enrollment_id: 'enr-1',
              attempt_number: 1,
              status: 'IN_PROGRESS',
              started_at: new Date('2026-11-17T08:00:00Z'),
              deadline_at: new Date('2026-11-17T08:20:00Z'),
            },
          ];
        }
        if (sql.includes('FROM lms_local_quiz_attempts')) {
          return [
            {
              id: 'att-1',
              attempt_number: 1,
              status: 'SUBMITTED',
              started_at: new Date('2026-11-17T08:00:00Z'),
              deadline_at: new Date('2026-11-17T08:20:00Z'),
              submitted_at: new Date('2026-11-17T08:05:00Z'),
              auto_score: 2,
              manual_score: 0,
              total_score: 2,
              max_score: 2,
              objective_max: 2,
              essay_max: 0,
              has_essay: false,
              grading_status: 'AUTO_GRADED',
              grade_published: true,
              answers_json: storedQuestions.map((sq) => ({
                questionId: sq.id,
                type: 'MCQ',
                prompt: sq.prompt,
                points: sq.points,
                groupId: sq.group_id,
                groupTitle: sq.group_title,
                media: sq.media_json,
                selectedOptionId: 'a',
                selectedOptionText: 'Option A',
                correctOptionId: 'a',
                correctOptionText: 'Option A',
                isCorrect: true,
                autoEarned: sq.points,
                explanation: '',
              })),
              manual_grades_json: {},
              teacher_feedback: '',
            },
          ];
        }
        return [];
      }),
    } as any;

    const fakeMedia = {
      id: mediaId,
      kind: 'IMAGE' as const,
      name: 'forged-name-should-be-ignored.png',
      mimeType: 'image/webp',
      bytes: 12345,
      url: 'https://evil.example/ignored',
    };

    const saved = await saveLocalQuizInTx(tx, 'inst-1', classId, 'sec-1', undefined, {
      title: 'Part 6 Reading Quiz',
      publish: true,
      questions: [
        {
          id: 'q1',
          type: 'MCQ',
          prompt: 'Question 131',
          points: 1,
          groupId: 'grp-p6',
          groupTitle: 'Part 6 · Notice',
          media: [fakeMedia],
          options: [
            { id: 'a', text: 'Option A' },
            { id: 'b', text: 'Option B' },
          ],
          correctOptionId: 'a',
        },
        {
          id: 'q2',
          type: 'MCQ',
          prompt: 'Question 132',
          points: 1,
          groupId: 'grp-p6',
          groupTitle: 'Part 6 · Notice',
          media: [fakeMedia],
          options: [
            { id: 'a', text: 'Option A' },
            { id: 'b', text: 'Option B' },
          ],
          correctOptionId: 'a',
        },
      ],
    });

    expect(saved.activityId).toBe(activityId);
    expect(storedQuestions).toHaveLength(2);
    expect(storedQuestions[0].group_id).toBe('grp-p6');
    expect(storedQuestions[0].group_title).toBe('Part 6 · Notice');
    expect(storedQuestions[0].media_json).toEqual([
      {
        id: mediaId,
        kind: 'IMAGE',
        name: 'passage-p6.webp',
        mimeType: 'image/webp',
        bytes: 12345,
        url: `/api/v2/lms-local/classes/${classId}/quiz-media/${mediaId}`,
      },
    ]);

    const teacherWs = await getQuizWorkspaceInTx(
      tx,
      { teacher: true, enrollment: null, now: new Date('2026-11-17T08:00:00Z') } as any,
      classId,
      activityId,
    );
    expect(teacherWs.questions[0].groupId).toBe('grp-p6');
    expect(teacherWs.questions[0].media[0].name).toBe('passage-p6.webp');

    const submitCall = await saveOrSubmitQuizAttemptInTx(
      tx,
      {
        teacher: false,
        enrollment: { id: 'enr-1', learnerId: 'stu-1' },
        now: new Date('2026-11-17T08:05:00Z'),
      } as any,
      classId,
      activityId,
      'att-1',
      {
        submit: true,
        answers: [
          { questionId: 'q1', selectedOptionId: 'a' },
          { questionId: 'q2', selectedOptionId: 'a' },
        ],
      },
    );
    expect(submitCall).toBeTruthy();

    const updateAttemptCall = tx.$executeRawUnsafe.mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].includes('UPDATE lms_local_quiz_attempts'),
    );
    expect(updateAttemptCall).toBeTruthy();
    const persistedAnswers = JSON.parse(updateAttemptCall[9]);
    expect(persistedAnswers[0].groupId).toBe('grp-p6');
    expect(persistedAnswers[0].groupTitle).toBe('Part 6 · Notice');
    expect(persistedAnswers[0].media).toHaveLength(1);
  });
});
