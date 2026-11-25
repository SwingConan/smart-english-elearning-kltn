import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AttemptStimuli } from '@/components/assessments/AttemptStimuli';
import { LocalQuizAuthorForm, LocalQuizPanel } from './LocalQuizPanel';
import { groupQuizItems, resolveQuizMediaUrl } from './quiz-media';
import type { LocalQuizWorkspace, QuizMediaItem } from './lms-local-api';

const mock = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...a: unknown[]) => mock.fetch(...a),
  apiUrl: (p: string) => '/api' + p,
}));

const classId = '11111111-1111-4111-8111-111111111111';
const sectionId = '22222222-2222-4222-8222-222222222222';
const activityId = '33333333-3333-4333-8333-333333333333';

describe('LocalQuiz Media, Shared Passage Groups & AttemptStimuli Zoom', () => {
  beforeEach(() => {
    mock.fetch.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('groups consecutive shared-group questions and prevents /api double-prefixing on media URLs', () => {
    expect(resolveQuizMediaUrl(`/api/v2/lms-local/classes/${classId}/quiz-media/m1`)).toBe(
      `/api/v2/lms-local/classes/${classId}/quiz-media/m1`,
    );
    expect(resolveQuizMediaUrl(`/v2/lms-local/classes/${classId}/quiz-media/m1`)).toBe(
      `/api/v2/lms-local/classes/${classId}/quiz-media/m1`,
    );

    const grouped = groupQuizItems([
      { id: 'q1', groupId: null },
      {
        id: 'q2',
        groupId: 'grp-1',
        groupTitle: 'Part 6',
        media: [{ id: 'm1', kind: 'IMAGE', name: 'p6.webp', mimeType: 'image/webp', bytes: 100, url: '/api/v2/m1' }],
      },
      { id: 'q3', groupId: 'grp-1', groupTitle: 'Part 6' },
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0].kind).toBe('single');
    expect(grouped[1].kind).toBe('group');
    if (grouped[1].kind === 'group') {
      expect(grouped[1].items.map((x) => x.item.id)).toEqual(['q2', 'q3']);
      expect(grouped[1].media).toHaveLength(1);
    }
  });

  it('allows teacher to author a shared media group with uploaded image & audio and saves grouped payload', async () => {
    const uploadedImage: QuizMediaItem = {
      id: 'media-img-1',
      kind: 'IMAGE',
      name: 'part6-email.png',
      mimeType: 'image/png',
      bytes: 1200,
      url: `/api/v2/lms-local/classes/${classId}/quiz-media/media-img-1`,
    };
    const uploadedAudio: QuizMediaItem = {
      id: 'media-aud-1',
      kind: 'AUDIO',
      name: 'part3-dialogue.mp3',
      mimeType: 'audio/mpeg',
      bytes: 3400,
      url: `/api/v2/lms-local/classes/${classId}/quiz-media/media-aud-1`,
    };

    mock.fetch
      .mockResolvedValueOnce(uploadedImage)
      .mockResolvedValueOnce(uploadedAudio)
      .mockResolvedValueOnce({ activityId, state: 'PUBLISHED' });

    const onSaved = vi.fn();
    render(
      <MemoryRouter>
        <LocalQuizAuthorForm classId={classId} sectionId={sectionId} onSaved={onSaved} />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText(/Ví dụ: Kiểm tra thường kỳ/i), {
      target: { value: 'Quiz Part 6 & Part 3' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Thêm cụm câu chung tài liệu/i }));
    expect(await screen.findByText(/Cụm câu chung tài liệu · Câu 1–1/i)).toBeInTheDocument();

    fireEvent.change(
      screen.getByPlaceholderText(/Part 6 · Đoạn văn 131–134/i),
      { target: { value: 'Part 6 · Internal Memo' } },
    );

    const fileInputs = Array.from(
      document.querySelectorAll('input[type="file"]'),
    ) as HTMLInputElement[];
    expect(fileInputs.length).toBeGreaterThanOrEqual(2);

    const pngFile = new File(['png'], 'part6-email.png', { type: 'image/png' });
    fireEvent.change(fileInputs[0], { target: { files: [pngFile] } });
    expect(await screen.findByText('part6-email.png')).toBeInTheDocument();

    const mp3File = new File(['mp3'], 'part3-dialogue.mp3', { type: 'audio/mpeg' });
    fireEvent.change(fileInputs[1], { target: { files: [mp3File] } });
    expect(await screen.findByText('part3-dialogue.mp3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /\+ Thêm câu TN vào cụm/i }));
    expect(screen.getByText(/Cụm câu chung tài liệu · Câu 1–2/i)).toBeInTheDocument();

    const promptAreas = screen.getAllByPlaceholderText(/Nhập câu hỏi trắc nghiệm/i);
    fireEvent.change(promptAreas[0], { target: { value: 'Question 131' } });
    fireEvent.change(promptAreas[1], { target: { value: 'Question 132' } });

    const optA = screen.getAllByPlaceholderText('Phương án A');
    const optB = screen.getAllByPlaceholderText('Phương án B');
    fireEvent.change(optA[0], { target: { value: 'notify' } });
    fireEvent.change(optB[0], { target: { value: 'notification' } });
    fireEvent.change(optA[1], { target: { value: 'however' } });
    fireEvent.change(optB[1], { target: { value: 'therefore' } });

    fireEvent.click(screen.getByRole('button', { name: /Lưu và công bố Quiz/i }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(activityId));

    const saveCall = mock.fetch.mock.calls.find(
      (c) => typeof c[0] === 'string' && c[0].includes('/local-quiz'),
    );
    expect(saveCall).toBeTruthy();
    const sentPayload = JSON.parse(saveCall![1].body as string);
    expect(sentPayload.questions).toHaveLength(2);
    expect(sentPayload.questions[0].groupId).toBeTruthy();
    expect(sentPayload.questions[1].groupId).toBe(sentPayload.questions[0].groupId);
    expect(sentPayload.questions[0].groupTitle).toBe('Part 6 · Internal Memo');
    expect(sentPayload.questions[0].media).toHaveLength(2);
    expect(sentPayload.questions[1].media).toHaveLength(2);
  });

  it('renders shared split-screen media & audio for students during Quiz taking and zoom modal works', async () => {
    const sharedMedia: QuizMediaItem[] = [
      {
        id: 'm-img',
        kind: 'IMAGE',
        name: 'passage-part6.webp',
        mimeType: 'image/webp',
        bytes: 4096,
        url: `/api/v2/lms-local/classes/${classId}/quiz-media/m-img`,
      },
      {
        id: 'm-aud',
        kind: 'AUDIO',
        name: 'track-part3.mp3',
        mimeType: 'audio/mpeg',
        bytes: 8192,
        url: `/api/v2/lms-local/classes/${classId}/quiz-media/m-aud`,
      },
    ];

    const studentWs: LocalQuizWorkspace = {
      editable: false,
      serverNow: '2026-11-17T08:00:00.000Z',
      activity: {
        id: activityId,
        sectionId,
        sectionTitle: 'Luyện tập Part 6',
        sectionPublished: true,
        title: 'Quiz có ảnh và audio',
        introduction: 'Đọc đoạn văn và nghe audio',
        state: 'PUBLISHED',
        availableFrom: '2026-11-17T07:00:00.000Z',
        availableUntil: '2026-11-17T12:00:00.000Z',
        revisionNumber: 1,
      },
      config: {
        durationMinutes: 15,
        maxAttempts: 1,
        shuffleQuestions: false,
        autoReleaseObjective: true,
        passScore: 1,
      },
      summary: {
        questionCount: 2,
        mcqCount: 2,
        essayCount: 0,
        totalPoints: 2,
        objectivePoints: 2,
        essayPoints: 0,
      },
      questions: [
        {
          id: 'q1',
          type: 'MCQ',
          prompt: 'Q131 prompt',
          points: 1,
          groupId: 'grp-1',
          groupTitle: 'Part 6 · Đoạn văn 131–132',
          media: sharedMedia,
          options: [
            { id: 'a', text: 'Choice A' },
            { id: 'b', text: 'Choice B' },
          ],
        },
        {
          id: 'q2',
          type: 'MCQ',
          prompt: 'Q132 prompt',
          points: 1,
          groupId: 'grp-1',
          groupTitle: 'Part 6 · Đoạn văn 131–132',
          media: sharedMedia,
          options: [
            { id: 'c', text: 'Choice C' },
            { id: 'd', text: 'Choice D' },
          ],
        },
      ],
      windowStatus: 'OPEN',
      canStartNew: false,
      activeAttempt: {
        id: 'att-1',
        attemptNumber: 1,
        status: 'IN_PROGRESS',
        startedAt: '2026-11-17T08:00:00.000Z',
        deadlineAt: '2026-11-17T08:15:00.000Z',
        submittedAt: null,
        autoScore: 0,
        manualScore: 0,
        totalScore: 0,
        maxScore: 2,
        objectiveMax: 2,
        essayMax: 0,
        hasEssay: false,
        gradingStatus: 'AUTO_GRADED',
        answers: [],
        manualGrades: {},
        teacherFeedback: '',
        gradedAt: null,
      },
      myAttempts: [],
    };

    mock.fetch.mockResolvedValueOnce(studentWs);

    render(
      <MemoryRouter>
        <LocalQuizPanel classId={classId} activityId={activityId} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Part 6 · Đoạn văn 131–132')).toBeInTheDocument();
    expect(screen.getByText('Câu 1–2')).toBeInTheDocument();

    const audioEl = document.querySelector('audio');
    expect(audioEl).toBeTruthy();
    expect(audioEl?.getAttribute('src')).toContain('/quiz-media/m-aud');

    const imgEl = screen.getByAltText('passage-part6.webp');
    expect(imgEl.getAttribute('src')).toContain('/quiz-media/m-img');

    fireEvent.click(screen.getByRole('button', { name: /Phóng to/i }));
    expect(screen.getByRole('dialog', { name: 'passage-part6.webp' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog', { name: 'passage-part6.webp' })).not.toBeInTheDocument();
  });

  it('AttemptStimuli lifts max-h-96 and opens/closes zoom lightbox on image click', () => {
    render(
      <AttemptStimuli
        skill="READING"
        taskCode="PART6_TEXT_COMPLETION"
        stimuli={[
          {
            id: 's-1',
            type: 'IMAGE',
            orderIndex: 1,
            mimeType: 'image/png',
            mediaUrl: '/uploads/part6-sample.png',
            altText: 'Đoạn văn Part 6',
            textContent: null,
          },
        ]}
      />,
    );

    const img = screen.getByAltText('Đoạn văn Part 6');
    expect(img.className).toContain('max-h-[75vh]');
    expect(img.className).not.toContain('max-h-96');

    fireEvent.click(screen.getByRole('button', { name: 'Phóng to' }));
    expect(screen.getByRole('dialog', { name: 'Đoạn văn Part 6' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog', { name: 'Đoạn văn Part 6' })).not.toBeInTheDocument();
  });
});
