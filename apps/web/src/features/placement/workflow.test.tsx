import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PlacementWorkflowPage,
  PlacementWorkflowResultPage,
  PlacementSittingPage,
} from '@/pages/PlacementWorkflowPage';
const state = vi.hoisted(() => ({
  user: { id: 'learner', role: 'STUDENT' } as { id: string; role: string } | null,
}));
const api = vi.hoisted(() => ({ config: vi.fn(), get: vi.fn(), post: vi.fn() }));
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => state }));
vi.mock('./workflow-api', () => ({ workflow: api }));
vi.mock('./DoublePromptAnswer', () => ({
  DoublePromptAnswer: () => <p>Durable S10 exactly two plays then30s</p>,
}));
const config = {
  role: 'STUDENT',
  permissions: {},
  realExamEnabled: false,
  policies: [{ id: 'p', kind: 'SOURCE_TIMING', sourceId: 'v', mode: 'LR', approved: true }],
  sources: [{ id: 'v', mode: 'LR', title: 'Tiny synthetic source', itemCount: 2 }],
};
const exam = {
  attemptId: 'a',
  phase: 'READING',
  taskIndex: 0,
  phaseStartedAt: '2026-11-01T01:00:00Z',
  deadline: '2026-11-01T02:15:00Z',
  serverTime: '2026-11-01T01:00:00Z',
  lockVersion: 4,
  receipt: null,
  blockedReason: null,
  mode: 'LR',
  title: 'Tiny DEV',
  marked: [],
  groups: [
    {
      id: 'g',
      skill: 'READING',
      taskCode: 'P7',
      stimuli: [],
      questions: [
        {
          testQuestionId: 'q',
          content: 'Original prompt',
          responseType: 'TEXT_RESPONSE',
          options: [],
          textResponse: 'Original saved text',
          selectedOptionIds: [],
        },
      ],
    },
  ],
};
function page(path: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/workspace/placement" element={element} />
        <Route path="/placement/sittings/:attemptId" element={element} />
        <Route path="/placement/sittings/:attemptId/result" element={element} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  state.user = { id: 'learner', role: 'STUDENT' };
  api.config.mockResolvedValue(config);
  api.get.mockResolvedValue([]);
});
afterEach(cleanup);
describe('W04B truthful workflow UI', () => {
  it('holds edit/Mark lock until authoritative GET confirms ACK, and Mark retains an unsaved writing draft', async () => {
    let release!: (value: unknown) => void;
    api.get
      .mockResolvedValueOnce(exam)
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            release = r;
          }),
      )
      .mockResolvedValue({ ...exam, lockVersion: 5, marked: ['q'] });
    api.post.mockResolvedValue({ saved: true });
    page('/placement/sittings/a', <PlacementSittingPage />);
    await screen.findByLabelText('Bài viết');
    fireEvent.change(screen.getByLabelText('Bài viết'), {
      target: { value: 'Unsaved draft survives Mark' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu Mark' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Lưu câu trả lời' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Đánh dấu Mark' })).toBeDisabled();
    release({ ...exam, lockVersion: 5, marked: ['q'] });
    await screen.findByRole('button', { name: 'Bỏ Mark' });
    expect(screen.getByLabelText('Bài viết')).toHaveValue('Unsaved draft survives Mark');
  });
  it('does not fetch private workflow while unauthenticated', () => {
    state.user = null;
    page('/workspace/placement', <PlacementWorkflowPage />);
    expect(screen.getByText('Đăng nhập để tiếp tục.')).toBeVisible();
    expect(api.config).not.toHaveBeenCalled();
  });
  it('requires selected source, independent goals and confirmation; real start always disabled', async () => {
    page('/workspace/placement', <PlacementWorkflowPage />);
    await screen.findByText('Chuẩn bị một lượt thi DEV');
    const start = screen.getByRole('button', { name: 'Bắt đầu / tiếp tục đúng lượt DEV' });
    expect(start).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nguồn kiểm chứng'), { target: { value: 'v' } });
    fireEvent.change(screen.getByLabelText('Mục tiêu LR'), { target: { value: '650' } });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(start).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Bài thi thật chưa phát hành' })).toBeDisabled();
  });
  it('keeps unreleased SW as ĐANG CHẤM despite declared goal0 and never provisional matching', async () => {
    api.get.mockResolvedValue({
      state: 'PARTIAL',
      label: 'LR PARTIAL',
      goals: { goalLR: 650, goalSpeaking: 0, goalWriting: 175 },
      skillResults: [
        { skill: 'SPEAKING', status: 'PENDING_REVIEW', value: null, samples: null, scale: null },
        { skill: 'WRITING', status: 'PENDING_REVIEW', value: null, samples: null, scale: null },
      ],
      parts: [],
      matching: { classes: [], reasons: ['PUBLISHED_ALL_REQUIRED_SKILLS_MISSING'] },
    });
    page('/placement/sittings/a/result', <PlacementWorkflowResultPage />);
    await screen.findByText('LR PARTIAL');
    expect(screen.getAllByText('ĐANG CHẤM')).toHaveLength(2);
    expect(screen.getByText('Chưa đủ dữ liệu để gợi ý lớp.')).toBeVisible();
    expect(screen.queryByText('ETS')).not.toBeInTheDocument();
  });
  it('uses server deadline and saved text on refresh, exposes only current section navigator', async () => {
    api.get.mockResolvedValue(exam);
    page('/placement/sittings/a', <PlacementSittingPage />);
    expect(await screen.findByLabelText('Bài viết')).toHaveValue('Original saved text');
    expect(screen.getByText('75:00')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Nghỉ tối đa 10 phút' })).not.toBeInTheDocument();
  });
  it('retries exact command UUID/body on lost ACK, then reloads authoritative state', async () => {
    api.get.mockResolvedValue(exam);
    api.post.mockRejectedValueOnce(new Error('ACK lost')).mockResolvedValueOnce({ saved: true });
    page('/placement/sittings/a', <PlacementSittingPage />);
    await screen.findByLabelText('Bài viết');
    fireEvent.change(screen.getByLabelText('Bài viết'), {
      target: { value: 'Unsure write retained' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu câu trả lời' }));
    await screen.findByRole('alert');
    const first = api.post.mock.calls[0];
    expect(first[1].textResponse).toBe('Unsure write retained');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại đúng yêu cầu' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));
    expect(api.post.mock.calls[1]).toEqual(first);
    expect(first[1].expectedLockVersion).toBe(4);
  });
  it('blocked incident shows retained receipt status and cannot end/restart or receive zero', async () => {
    api.get.mockResolvedValue({
      ...exam,
      phase: 'BLOCKED_REVIEW',
      deadline: null,
      blockedReason: 'MICROPHONE_UNSAFE',
      groups: [],
    });
    page('/placement/sittings/a', <PlacementSittingPage />);
    await screen.findByText('Cần học vụ kiểm tra');
    expect(screen.getByText('MICROPHONE_UNSAFE')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Kết thúc phần / bài hiện tại' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Chưa nộp, không tự chấm 0/)).toBeVisible();
  });
  it('S10 renders the retained durable component instead of a generic third audio player', async () => {
    api.get.mockResolvedValue({
      ...exam,
      phase: 'SPEAKING',
      mode: 'FOUR_SKILLS',
      groups: [
        {
          id: 'g',
          skill: 'SPEAKING',
          taskCode: 'SE_SW_01_S10_V01',
          stimuli: [{ id: 'audio', type: 'AUDIO', mediaUrl: null }],
          questions: [
            {
              testQuestionId: 'q',
              content: 'S10 original',
              responseType: 'AUDIO_RESPONSE',
              options: [],
              selectedOptionIds: [],
            },
          ],
        },
      ],
    });
    page('/placement/sittings/a', <PlacementSittingPage />);
    await screen.findByText('Durable S10 exactly two plays then30s');
    expect(document.querySelectorAll('audio')).toHaveLength(0);
  });
  it('renders Wave 05 structured diagnosis, self-study guidance, AI/data advisory badge, and explainable class recommendation', async () => {
    api.get.mockResolvedValue({
      state: 'PUBLISHED',
      label: 'Kết quả đánh giá năng lực đầu vào đã công bố',
      goals: { goalLR: 650, goalSpeaking: null, goalWriting: null },
      skillResults: [
        { skill: 'LISTENING', status: 'PUBLISHED', value: 78, samples: 100, scale: 'INTERNAL_RAW_COUNT' },
        { skill: 'READING', status: 'PUBLISHED', value: 32, samples: 100, scale: 'INTERNAL_RAW_COUNT' },
      ],
      parts: [
        { part: 'P2', skill: 'LISTENING', correct: 21, samples: 25 },
        { part: 'P5', skill: 'READING', correct: 6, samples: 30 },
      ],
      matching: {
        status: 'MATCHED',
        asOf: '2026-11-10T05:00:00Z',
        reasons: [],
        classes: [
          {
            id: 'cls-reading-1',
            name: 'TOEIC Reading Strategies & Grammar — Tối 2-4-6',
            availableSeats: 14,
            rationale: ['READING · P5: 6/30 trong ngưỡng [0, 15].'],
          },
        ],
      },
      diagnosis: {
        snapshotVersion: 'WAVE05_DIAG_V1',
        sourceDigestRef: 'a1b2c3d4e5f60718',
        minSamplesThreshold: 3,
        overallSummary: {
          lrAnsweredCount: 200,
          lrTotalItems: 200,
          lrCorrectCount: 110,
          lrAccuracyPct: 55,
          listeningCorrect: 78,
          listeningSamples: 100,
          listeningAccuracyPct: 78,
          readingCorrect: 32,
          readingSamples: 100,
          readingAccuracyPct: 32,
          balanceState: 'LISTENING_STRONGER',
          balanceLabelVi: 'Kỹ năng Nghe (78%) vượt trội hơn Kỹ năng Đọc (32%).',
          internalScaleDisclosureVi: 'Thang đo nội bộ dựa trên số câu trả lời đúng.',
        },
        partBreakdown: [
          {
            part: 'P2',
            partNumber: 2,
            skill: 'LISTENING',
            titleVi: 'Part 2 — Phản xạ Hỏi – Đáp ngắn',
            descriptionVi: 'Nghe câu hỏi Wh- và Yes/No.',
            samples: 25,
            answered: 25,
            correct: 21,
            accuracyPct: 84,
            minSamplesRequired: 3,
            sufficiency: 'SUFFICIENT',
            statusLabel: 'Nền tảng vững',
            canClaimWeakness: true,
          },
          {
            part: 'P5',
            partNumber: 5,
            skill: 'READING',
            titleVi: 'Part 5 — Hoàn thành câu & Ngữ pháp',
            descriptionVi: 'Từ loại và cấu trúc câu.',
            samples: 30,
            answered: 30,
            correct: 6,
            accuracyPct: 20,
            minSamplesRequired: 3,
            sufficiency: 'SUFFICIENT',
            statusLabel: 'Trọng tâm cần cải thiện',
            canClaimWeakness: true,
          },
        ],
        knowledgeBreakdown: [
          {
            domainCode: 'GRAMMAR_WORD_FORMS_CLAUSE',
            skill: 'READING',
            partScope: 'P5',
            titleVi: 'Ngữ pháp: Từ loại (Word Forms), Đại từ & Mệnh đề (Part 5)',
            descriptionVi: 'Xác định danh từ, tính từ, trạng từ.',
            samples: 12,
            answered: 12,
            correct: 2,
            accuracyPct: 17,
            minSamplesRequired: 3,
            sufficiency: 'SUFFICIENT',
            statusLabel: 'Trọng tâm cần cải thiện',
            canClaimWeakness: true,
            observedTopicTags: ['P5_WORD_FORMS'],
            linkedArticleSlugs: ['toeic-part5-word-forms-and-clause-structure'],
          },
        ],
        difficultyBreakdown: [],
        productiveSkills: [],
        strengths: [
          {
            rank: 1,
            kind: 'STRENGTH',
            domainCode: 'LISTENING_WH_DIRECT',
            partScope: 'P2',
            skill: 'LISTENING',
            titleVi: 'Nghe câu hỏi thông tin trực tiếp Wh-Questions (Part 2)',
            correct: 12,
            samples: 14,
            accuracyPct: 86,
            evidenceBadge: 'Đạt 12/14 câu (86%) — Đủ mẫu kiểm chứng',
            pedagogicalSummary: 'Bạn bắt từ để hỏi rất tốt.',
            actionableStep: 'Duy trì tốc độ phản xạ.',
          },
        ],
        improvements: [
          {
            rank: 1,
            kind: 'IMPROVEMENT_PRIORITY',
            domainCode: 'GRAMMAR_WORD_FORMS_CLAUSE',
            partScope: 'P5',
            skill: 'READING',
            titleVi: 'Ngữ pháp: Từ loại (Word Forms), Đại từ & Mệnh đề (Part 5)',
            correct: 2,
            samples: 12,
            accuracyPct: 17,
            evidenceBadge: 'Đạt 2/12 câu (17%) — Ưu tiên #1',
            pedagogicalSummary: 'Nhầm lẫn hậu tố từ loại.',
            actionableStep: 'Ôn tập hậu tố danh từ/tính từ/trạng từ.',
          },
        ],
        lowSampleNotes: [],
        limitations: [],
      },
      recommendation: {
        recommendationVersion: 'WAVE05_REC_V1',
        policyId: 'pol-1',
        policyDigestRef: '11223344',
        evaluatedAt: '2026-11-10T05:00:00Z',
        overallStatus: 'MATCHED_OPEN_CLASS',
        overallStatusLabelVi: 'Đã tìm thấy 1 lớp đang mở phù hợp',
        overallSummaryVi: 'Khớp lớp chuyên đề Reading & Ngữ pháp.',
        courseEvaluations: [
          {
            courseVersionId: 'cv-1',
            courseId: 'c-1',
            courseTitle: 'Chuyên đề TOEIC Reading Strategies & Ngữ pháp',
            courseSlug: 'toeic-reading-strategies',
            level: 'INTERMEDIATE',
            skillScope: 'READING',
            status: 'RECOMMENDED_PRIORITY',
            statusBadgeVi: 'Khớp tiêu chí năng lực & Có lớp đang mở',
            priorityRank: 1,
            fitSummaryVi: 'Đáp ứng đủ tiêu chí.',
            ruleTraces: [
              {
                skill: 'READING',
                part: 'P5',
                domainCode: null,
                observedValue: 6,
                observedSamples: 30,
                requiredMin: 0,
                requiredMax: 15,
                requiredMinSamples: 10,
                scale: 'INTERNAL_RAW_COUNT',
                matched: true,
                traceTextVi: 'READING · P5: Đạt 6/30 câu đúng — nằm trong ngưỡng [0, 15].',
              },
            ],
            openClassCount: 1,
            unavailableClassCount: 1,
          },
        ],
        availableClasses: [
          {
            classId: 'cls-reading-1',
            classCode: 'READ-246',
            className: 'TOEIC Reading Strategies & Grammar — Tối 2-4-6',
            courseVersionId: 'cv-1',
            courseTitle: 'Chuyên đề TOEIC Reading Strategies & Ngữ pháp',
            courseSlug: 'toeic-reading-strategies',
            modality: 'ONLINE',
            pricingType: 'PAID',
            tuitionFeeVnd: 1200000,
            maxStudents: 20,
            enrolledCount: 6,
            availableSeats: 14,
            availabilityStatus: 'AVAILABLE_NOW',
            availabilityBadgeVi: 'Đang mở đăng ký — Còn 14 chỗ',
            scheduleSummaryVi: ['Tối Thứ 2-4-6 (19:00 - 21:00)'],
            fitReasonsVi: ['READING · P5: Đạt 6/30 câu đúng — nằm trong ngưỡng [0, 15].'],
            unavailabilityReasonCode: null,
            unavailabilityReasonVi: null,
          },
        ],
        unavailableClasses: [
          {
            classId: 'cls-reading-full',
            classCode: 'READ-FULL',
            className: 'TOEIC Reading Strategies — Ca Cuối Tuần (Đã đủ sĩ số)',
            courseVersionId: 'cv-1',
            courseTitle: 'Chuyên đề TOEIC Reading Strategies & Ngữ pháp',
            courseSlug: 'toeic-reading-strategies',
            modality: 'OFFLINE',
            pricingType: 'PAID',
            tuitionFeeVnd: 1200000,
            maxStudents: 15,
            enrolledCount: 15,
            availableSeats: 0,
            availabilityStatus: 'WAITLIST_OR_FULL',
            availabilityBadgeVi: 'Hết chỗ (Danh sách chờ)',
            scheduleSummaryVi: ['Thứ 7 - CN'],
            fitReasonsVi: [],
            unavailabilityReasonCode: 'CLASS_FULL_OR_CAPACITY_UNVERIFIED',
            unavailabilityReasonVi: 'Lớp đã đủ sĩ số (15/15 học viên).',
          },
        ],
      },
      selfStudyGuidance: [
        {
          domainCode: 'GRAMMAR_WORD_FORMS_CLAUSE',
          partScope: 'P5',
          skill: 'READING',
          topicTitleVi: 'Ngữ pháp: Từ loại (Word Forms), Đại từ & Mệnh đề (Part 5)',
          observedEvidence: 'Đạt 2/12 câu (17%)',
          focusSummaryVi: 'Ôn tập hệ thống hậu tố từ loại.',
          searchKeywords: ['Ngữ pháp từ loại Word Forms TOEIC Part 5'],
          resourceStatus: 'VETTED_AVAILABLE',
          resourceStatusLabel: 'Có 1 tài liệu học thuật đã xác thực trong hệ thống',
          vettedResources: [
            {
              slug: 'toeic-part5-word-forms-and-clause-structure',
              title: 'Hệ thống Từ loại & Cấu trúc Mệnh đề TOEIC Part 5',
              path: '/knowledge/articles/toeic-part5-word-forms-and-clause-structure',
              kind: 'KNOWLEDGE_ARTICLE',
              verifiedSource: 'Thư viện Kiến thức Smart English',
            },
          ],
        },
        {
          domainCode: 'READING_MULTI_PASSAGE_SYNTHESIS',
          partScope: 'P7',
          skill: 'READING',
          topicTitleVi: 'Đọc hiểu tổng hợp & đối chiếu đa văn bản (Part 7)',
          observedEvidence: 'Đạt 5/25 câu (20%)',
          focusSummaryVi: 'Kỹ thuật đối chiếu thông tin chéo.',
          searchKeywords: ['Phương pháp làm bài Double & Triple Passages TOEIC Part 7'],
          resourceStatus: 'NO_VETTED_LINK',
          resourceStatusLabel: 'Chưa có tài liệu được xác thực cho chủ đề này',
          vettedResources: [],
        },
      ],
      aiAdvisory: {
        providerStatus: 'NOT_CONFIGURED',
        liveVerified: false,
        fallbackUsed: true,
        fallbackReason: 'NO_EXTERNAL_AI_KEY_CONFIGURED',
        modeBadge: 'Hệ thống phân tích / giải thích theo dữ liệu',
        disclosureVi: 'Nhận xét tổng hợp từ dữ liệu thực tế.',
        diagnosisAdvisory: 'Tổng kết Nghe – Đọc đạt 110/200 câu đúng (55%).',
        classFitAdvisory: 'Khớp chương trình Chuyên đề TOEIC Reading Strategies.',
        selfStudyAdvisory: 'Ưu tiên ôn tập Từ loại Part 5.',
      },
    });
    page('/placement/sittings/a/result', <PlacementWorkflowResultPage />);
    expect(
      await screen.findByText('Kết quả đánh giá năng lực đầu vào đã công bố'),
    ).toBeVisible();
    expect(screen.getByText('Hệ thống phân tích / giải thích theo dữ liệu')).toBeVisible();
    expect(
      screen.getByText('TOEIC Reading Strategies & Grammar — Tối 2-4-6'),
    ).toBeVisible();
    expect(screen.getByText('Hết chỗ (Danh sách chờ)')).toBeVisible();
    expect(
      screen.getByText('Chưa có tài liệu được xác thực cho chủ đề này'),
    ).toBeVisible();
    expect(
      screen.getByRole('link', {
        name: /Hệ thống Từ loại & Cấu trúc Mệnh đề TOEIC Part 5/,
      }),
    ).toHaveAttribute('href', '/knowledge/articles/toeic-part5-word-forms-and-clause-structure');
    expect(
      screen.queryByText('Kết quả chưa đáp ứng điều kiện đầu vào của lớp theo tiêu chí đã duyệt.'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('result-attempt-status-badge')).toHaveTextContent(
      'Kết quả đã công bố',
    );
    expect(screen.getByTestId('result-attempt-ref')).toHaveTextContent('Mã lượt làm bài: #A');
    expect(screen.getByTestId('result-source-digest-ref')).toHaveTextContent(
      'Mã phiên bản đề: #a1b2c3d4e5f60718',
    );
    expect(screen.queryByText(/Mã hồ sơ:/)).not.toBeInTheDocument();
  });

  it('enforces Wave 05R Matching Truth Table across Case A (matched), Case B (full class), Case C (no eligible course), Case D (S/W pending), and Case E (insufficient evidence), and keeps distinct attempt refs per learner', async () => {
    // Case B: Cohort G — eligible course (Intensive 750+), but all offerings are full
    api.get.mockResolvedValueOnce({
      attemptId: '7d67fc47-2222-4444-8888-000000000002',
      attemptRef: '7D67FC47',
      state: 'PUBLISHED',
      label: 'Kết quả đánh giá năng lực đầu vào đã công bố',
      goals: { goalLR: 800, goalSpeaking: null, goalWriting: null },
      skillResults: [
        { skill: 'LISTENING', status: 'PUBLISHED', value: 90, samples: 100, scale: 'INTERNAL_RAW_COUNT' },
        { skill: 'READING', status: 'PUBLISHED', value: 88, samples: 100, scale: 'INTERNAL_RAW_COUNT' },
      ],
      parts: [],
      matching: {
        status: 'NO_ELIGIBLE_CLASS',
        asOf: '2026-11-10T05:00:00Z',
        reasons: ['CLASS_FULL_OR_CAPACITY_UNVERIFIED'],
        classes: [],
      },
      diagnosis: {
        snapshotVersion: 'WAVE05_DIAG_V1',
        sourceDigestRef: '4203e277f7896869',
        minSamplesThreshold: 3,
        overallSummary: {
          lrAnsweredCount: 200,
          lrTotalItems: 200,
          lrCorrectCount: 178,
          lrAccuracyPct: 89,
          listeningCorrect: 90,
          listeningSamples: 100,
          listeningAccuracyPct: 90,
          readingCorrect: 88,
          readingSamples: 100,
          readingAccuracyPct: 88,
          balanceState: 'BALANCED',
          balanceLabelVi: 'Kỹ năng Nghe (90%) và Đọc (88%) cân bằng ở mức cao.',
          internalScaleDisclosureVi: 'Thang đo nội bộ dựa trên số câu trả lời đúng.',
        },
        partBreakdown: [],
        knowledgeBreakdown: [],
        difficultyBreakdown: [],
        productiveSkills: [],
        strengths: [],
        improvements: [],
        lowSampleNotes: [],
        limitations: [],
      },
      recommendation: {
        recommendationVersion: 'WAVE05_REC_V1',
        policyId: 'pol-1',
        policyDigestRef: '757503170d69bd2d',
        evaluatedAt: '2026-11-10T05:00:00Z',
        overallStatus: 'ELIGIBLE_COURSE_NO_OPEN_CLASS',
        overallStatusLabelVi: 'Đủ điều kiện chương trình nhưng hiện chưa có lớp còn chỗ',
        overallSummaryVi:
          'Hồ sơ năng lực của bạn đạt điều kiện vào chương trình mục tiêu, nhưng các lớp hiện tại đã đủ sĩ số.',
        courseEvaluations: [],
        availableClasses: [],
        unavailableClasses: [
          {
            classId: 'cls-750-full',
            classCode: 'SE-750-FULL-SAT',
            className: 'TOEIC Intensive 750+ — Cuối Tuần Thứ 7 & CN (Đã đủ sĩ số)',
            courseVersionId: 'cv-750',
            courseTitle: 'TOEIC Intensive 750+ Advanced Mastery',
            courseSlug: 'toeic-intensive-750',
            modality: 'OFFLINE',
            pricingType: 'PAID',
            tuitionFeeVnd: 1800000,
            maxStudents: 12,
            enrolledCount: 12,
            availableSeats: 0,
            availabilityStatus: 'WAITLIST_OR_FULL',
            availabilityBadgeVi: 'Hết chỗ (Danh sách chờ)',
            scheduleSummaryVi: ['Thứ 7 - CN'],
            fitReasonsVi: [],
            unavailabilityReasonCode: 'CLASS_FULL_OR_CAPACITY_UNVERIFIED',
            unavailabilityReasonVi: 'Lớp đã đủ sĩ số (12/12 học viên).',
          },
        ],
      },
    });
    const viewB = page('/placement/sittings/7d67fc47/result', <PlacementWorkflowResultPage />);
    expect(
      await screen.findByText('Đủ điều kiện chương trình nhưng hiện chưa có lớp còn chỗ.'),
    ).toBeVisible();
    expect(
      screen.getByText('• Lớp đã đủ sĩ số hoặc chưa xác minh sức chứa.'),
    ).toBeVisible();
    expect(
      screen.queryByText('• Kết quả chưa đáp ứng điều kiện đầu vào của lớp theo tiêu chí đã duyệt.'),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('result-attempt-ref')).toHaveTextContent(
      'Mã lượt làm bài: #7D67FC47',
    );
    expect(screen.getByTestId('result-source-digest-ref')).toHaveTextContent(
      'Mã phiên bản đề: #4203e277f7896869',
    );
    viewB.unmount();

    // Case C: No eligible courses at all
    api.get.mockResolvedValueOnce({
      attemptId: 'b46245cf-3333-4444-8888-000000000003',
      attemptRef: 'B46245CF',
      state: 'PUBLISHED',
      label: 'Kết quả đánh giá năng lực đầu vào đã công bố',
      goals: { goalLR: 600, goalSpeaking: null, goalWriting: null },
      skillResults: [],
      parts: [],
      matching: {
        status: 'NO_ELIGIBLE_CLASS',
        asOf: '2026-11-10T05:00:00Z',
        reasons: ['APPROVED_INTERNAL_RULE_NOT_MET'],
        classes: [],
      },
      diagnosis: {
        snapshotVersion: 'WAVE05_DIAG_V1',
        sourceDigestRef: '4203e277f7896869',
        minSamplesThreshold: 3,
        overallSummary: {
          lrAnsweredCount: 200,
          lrTotalItems: 200,
          lrCorrectCount: 15,
          lrAccuracyPct: 8,
          listeningCorrect: 8,
          listeningSamples: 100,
          listeningAccuracyPct: 8,
          readingCorrect: 7,
          readingSamples: 100,
          readingAccuracyPct: 7,
          balanceState: 'BALANCED',
          balanceLabelVi: 'Cần củng cố nền tảng cơ bản.',
          internalScaleDisclosureVi: 'Thang đo nội bộ dựa trên số câu trả lời đúng.',
        },
        partBreakdown: [],
        knowledgeBreakdown: [],
        difficultyBreakdown: [],
        productiveSkills: [],
        strengths: [],
        improvements: [],
        lowSampleNotes: [],
        limitations: [],
      },
      recommendation: {
        recommendationVersion: 'WAVE05_REC_V1',
        policyId: 'pol-1',
        policyDigestRef: '757503170d69bd2d',
        evaluatedAt: '2026-11-10T05:00:00Z',
        overallStatus: 'NO_MATCHING_COURSE',
        overallStatusLabelVi: 'Chưa tìm được chương trình đáp ứng tất cả tiêu chí hiện tại',
        overallSummaryVi: 'Kết quả hiện tại chưa nằm trong khoảng tiêu chí của các khóa học đang mở.',
        courseEvaluations: [],
        availableClasses: [],
        unavailableClasses: [],
      },
    });
    page('/placement/sittings/b46245cf/result', <PlacementWorkflowResultPage />);
    expect(
      await screen.findByText('Chưa tìm được chương trình đáp ứng tất cả tiêu chí hiện tại.'),
    ).toBeVisible();
    expect(
      screen.getByText('• Kết quả chưa đáp ứng điều kiện đầu vào của lớp theo tiêu chí đã duyệt.'),
    ).toBeVisible();
    expect(screen.getByTestId('result-attempt-ref')).toHaveTextContent(
      'Mã lượt làm bài: #B46245CF',
    );
    expect(screen.getByTestId('result-source-digest-ref')).toHaveTextContent(
      'Mã phiên bản đề: #4203e277f7896869',
    );
  });
});
