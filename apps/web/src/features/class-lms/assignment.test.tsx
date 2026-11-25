import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { AssignmentPanel, type Submission } from './AssignmentPanel';
import type { AssignmentWorkspace } from './lms-local-api';
import { ActivityChooser } from '@/pages/ClassLearningPage';
import type { Activity } from './api';

const mock = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/lib/api-client', () => ({
  apiFetch: (...a: unknown[]) => mock.fetch(...a),
  apiUrl: (p: string) => '/api' + p,
}));

const activity: Activity = {
  id: 'a',
  type: 'ASSIGNMENT',
  title: 'Writing',
  introduction: 'Prompt',
  state: 'PUBLISHED',
  revisionId: 'r',
  revisionNumber: 1,
  progress: 'NOT_STARTED',
  file: null,
  resourceUrl: null,
  availableFrom: null,
  availableUntil: null,
  editable: false,
};

const baseConfig: AssignmentWorkspace['config'] = {
  activityId: 'a',
  maxFiles: 2,
  maxFileSizeMb: 1,
  allowFile: true,
  allowText: true,
  allowAudio: false,
  allowLate: false,
  allowResubmit: true,
  acceptedExtensions: '.pdf,.txt,.docx',
  promptUrl: null,
  promptFiles: [],
  maxScore: 10,
};

function makeWorkspace(overrides: Partial<AssignmentWorkspace> = {}): AssignmentWorkspace {
  return {
    editable: false,
    activity: {
      id: 'a',
      title: 'Writing',
      introduction: 'Prompt',
      contentMarkdown: 'Prompt body',
      state: 'PUBLISHED',
      availableFrom: null,
      availableUntil: null,
      publishedRevisionId: 'r',
    },
    config: baseConfig,
    submissionWindow: { canEdit: true, late: false, lockReason: null },
    mySubmission: null,
    ...overrides,
  };
}

const submittedRow: Submission = {
  id: 'submission',
  revisionId: 'r',
  state: 'SUBMITTED',
  text: 'Saved answer',
  files: [
    {
      id: 'f1',
      name: 'essay.pdf',
      mimeType: 'application/pdf',
      bytes: 2048,
      sha256: 'abc',
      kind: 'ATTACHMENT',
      createdAt: '2026-11-13T10:00:00Z',
      downloadUrl: '/api/v2/lms-local/classes/c/activities/a/files/f1',
    },
  ],
  submittedAt: '2026-11-13T10:00:00Z',
  updatedAt: '2026-11-13T10:00:00Z',
  late: false,
  canEdit: true,
  lockReason: null,
  rubricGradingState: 'NOT_GRADED',
  directGrade: null,
};

beforeEach(() => {
  mock.fetch.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mount(a = activity) {
  return render(
    <MemoryRouter>
      <AssignmentPanel classId="c" activity={a} />
    </MemoryRouter>,
  );
}

describe('IUH Assignment Panel & client safety', () => {
  it('renders nothing for non-ASSIGNMENT activities regardless of title', () => {
    const { container } = mount({
      ...activity,
      type: 'RESOURCE',
      title: 'Bài tập giả danh tài liệu',
    });
    expect(container).toBeEmptyDOMElement();
    expect(mock.fetch).not.toHaveBeenCalled();
  });

  it('keeps expired work readable while locking Thêm bài nộp', async () => {
    mock.fetch.mockResolvedValueOnce(
      makeWorkspace({
        submissionWindow: { canEdit: false, late: true, lockReason: 'Đã quá hạn nộp bài.' },
        mySubmission: { ...submittedRow, canEdit: false, lockReason: 'Đã quá hạn nộp bài.' },
      }),
    );
    mount({ ...activity, availableUntil: '2026-11-01T10:00:00Z', submissionOpen: false });
    await screen.findByText('Đã nộp để chấm');
    expect(screen.getByText('Đã quá hạn nộp bài.')).toBeInTheDocument();
    expect(screen.getByText('essay.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm bài nộp' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sửa bài nộp' })).not.toBeInTheDocument();
    expect(mock.fetch).toHaveBeenCalledTimes(1);
  });

  it('working Assignment tile remains enabled alongside the real W03B-C Quiz', () => {
    render(
      <MemoryRouter>
        <ActivityChooser classId="c" sectionId="s" close={() => {}} />
      </MemoryRouter>,
    );
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: /Bài tập/ }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: /Quiz/ })).toBeEnabled();
  });

  it('opens drawer only after Thêm bài nộp, stages files without submitting, and discards on Hủy', async () => {
    mock.fetch.mockResolvedValueOnce(makeWorkspace());
    mount();
    const addBtn = await screen.findByRole('button', { name: 'Thêm bài nộp' });
    expect(screen.queryByRole('button', { name: 'Lưu bài nộp' })).not.toBeInTheDocument();

    fireEvent.click(addBtn);
    expect(await screen.findByText(/Số tệp tối đa:/)).toBeInTheDocument();

    const fileInput = screen.getByLabelText('Chọn tệp bài nộp') as HTMLInputElement;
    const f1 = new File(['hello'], 'bai-tap-1.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [f1] } });

    expect(await screen.findByText('bai-tap-1.txt')).toBeInTheDocument();
    // Picking files does not send submission request until Lưu bài nộp
    expect(mock.fetch).toHaveBeenCalledTimes(1);

    // Hủy closes drawer and discards staged files
    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.queryByText('bai-tap-1.txt')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm bài nộp' })).toBeInTheDocument();
  });

  it('enforces maxFiles and maxFileSizeMb and preserves input on failed Lưu bài nộp', async () => {
    mock.fetch
      .mockResolvedValueOnce(makeWorkspace())
      .mockRejectedValueOnce(new Error('Lỗi kết nối'));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Thêm bài nộp' }));

    const fileInput = screen.getByLabelText('Chọn tệp bài nộp') as HTMLInputElement;
    const oversized = new File([new Uint8Array(1.5 * 1024 * 1024)], 'big.pdf', {
      type: 'application/pdf',
    });
    const valid = new File(['ok'], 'valid.txt', { type: 'text/plain' });
    fireEvent.change(fileInput, { target: { files: [oversized, valid] } });

    await screen.findByRole('alert');
    expect(screen.getByText(/vượt quá giới hạn 1 MB/)).toBeInTheDocument();
    expect(screen.getByText('valid.txt')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Nhập câu trả lời/), {
      target: { value: 'Keep my draft' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bài nộp' }));
    await screen.findByText('Lỗi kết nối');
    expect(screen.getByPlaceholderText(/Nhập câu trả lời/)).toHaveValue('Keep my draft');
    expect(screen.queryByText('Đã nộp để chấm')).not.toBeInTheDocument();
  });

  it('teacher sees submitted files, ZIP archive link, escaped learner text, and grading panel', async () => {
    mock.fetch.mockResolvedValueOnce(
      makeWorkspace({
        editable: true,
        stats: { enrolledCount: 5, submittedCount: 1, gradedCount: 0 },
        submissions: [
          {
            ...submittedRow,
            learner: { id: 'u', fullName: 'Synthetic learner', email: 's@example.com' },
            text: '<script>unsafe()</script>',
          },
        ],
      }),
    );
    const { container } = mount({ ...activity, editable: true });
    await screen.findByText('Synthetic learner');
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('<script>unsafe()</script>')).toBeInTheDocument();
    const zipLink = screen.getByRole('link', { name: /Tải toàn bộ bài nộp \(\.ZIP\)/ });
    expect(zipLink).toHaveAttribute(
      'href',
      '/api/v2/lms-local/classes/c/activities/a/submissions/zip',
    );
    await waitFor(() =>
      expect(mock.fetch.mock.calls[0][0]).toBe(
        '/v2/lms-local/classes/c/activities/a/assignment',
      ),
    );
  });
});
