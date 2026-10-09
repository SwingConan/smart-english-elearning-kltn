import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { TestEditorPage } from '@/pages/TestEditorPage';
import { TestManagementPage } from '@/pages/TestManagementPage';
import { assessmentApi } from './api';
import * as curriculum from './curriculum';
import { deferred, renderAssessmentRoute } from './assessment-test-utils';
import type { AssessmentQuestion, AssessmentTestDetail, AssessmentTestGroup, AssessmentTestQuestion, TestStatus, TestType } from './types';

const courseId = 'course-a';
const testId = 'test-a';
const lessons = [{ id: 'lesson-a', label: 'Module A — Lesson A' }];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TestManagementPage', () => {
  it('renders Placement/Quiz, lifecycle state and approved actions without out-of-scope UI', async () => {
    const placement = detail('placement', 'PLACEMENT', 'DRAFT', []);
    const quiz = detail('quiz', 'QUIZ', 'PUBLISHED', [testQuestion('quiz-tq', 'q1', 'Quiz question', 0)]);
    mockManagement([placement, quiz]);
    renderManagement();

    await screen.findByText(placement.title);
    expect(screen.getByText(quiz.title)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Chỉnh sửa/i })).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Tạo bài kiểm tra/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Xuất bản$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Về bản nháp/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Xóa$/i })).toHaveLength(2);
    expect(document.body.textContent).toContain('3');
    expect(document.body.textContent).toContain('1');
    expect(screen.queryByText(/timeLimit|passingScore|kết quả học viên/i)).not.toBeInTheDocument();
  });

  it('creates Placement without lesson and Quiz with a same-course optional lesson', async () => {
    mockManagement([]);
    const create = vi.spyOn(assessmentApi.tests, 'create')
      .mockImplementation(async (_course, input) => ({ ...detail(`created-${input.type}`, input.type, 'DRAFT', []), ...input }));
    renderManagement();
    await screen.findByText(/Chưa có bài kiểm tra/i);
    fireEvent.click(screen.getByRole('button', { name: /Tạo bài kiểm tra/i }));
    let form = screen.getByRole('heading', { name: /Tạo bài kiểm tra bản nháp/i }).closest('form')!;
    expect(within(form).queryByLabelText(/Bài học/i)).not.toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText(/Tiêu đề/i), { target: { value: ' Placement ' } });
    fireEvent.change(within(form).getByRole('spinbutton'), { target: { value: '0' } });
    fireEvent.submit(form);
    expect(await screen.findByText(/số nguyên.*1/i)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
    fireEvent.change(within(form).getByRole('spinbutton'), { target: { value: '1' } });
    fireEvent.submit(form);
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create.mock.calls[0]).toEqual([courseId, {
      type: 'PLACEMENT', title: 'Placement', description: null, lessonId: null,
      maxAttempts: 1, showResultAfterSubmit: true,
    }]);

    fireEvent.click(screen.getByRole('button', { name: /Tạo bài kiểm tra/i }));
    form = screen.getByRole('heading', { name: /Tạo bài kiểm tra bản nháp/i }).closest('form')!;
    fireEvent.change(within(form).getByLabelText(/^Loại$/i), { target: { value: 'QUIZ' } });
    expect(within(form).getByRole('option', { name: lessons[0].label })).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText(/Tiêu đề/i), { target: { value: 'Draft Quiz' } });
    fireEvent.submit(form);
    await waitFor(() => expect(create).toHaveBeenCalledTimes(2));
    expect(create.mock.calls[1][1]).toMatchObject({ type: 'QUIZ', lessonId: null });
    expect(create.mock.calls[1][1]).not.toHaveProperty('timeLimit');
    expect(create.mock.calls[1][1]).not.toHaveProperty('passingScore');
    expect(create.mock.calls[1][1]).not.toHaveProperty('orderIndex');
  });

  it('validates maxAttempts and guards publish while showing useful backend validation', async () => {
    const draft = detail('draft', 'PLACEMENT', 'DRAFT', []);
    mockManagement([draft]);
    const publishPending = deferred<AssessmentTestDetail>();
    const publish = vi.spyOn(assessmentApi.tests, 'publish').mockReturnValueOnce(publishPending.promise);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderManagement();
    await screen.findByText(draft.title);
    const publishButton = screen.getByRole('button', { name: /^Xuất bản$/i });
    fireEvent.click(publishButton);
    fireEvent.click(publishButton);
    expect(publish).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /Đang xuất bản/i })).toBeDisabled();
    publishPending.reject(new ApiError(400, { message: 'Test must contain at least one question' }));
    expect(await screen.findByText(/ít nhất một câu hỏi/i)).toBeInTheDocument();
  });

  it('updates visible state after successful publish/unpublish/delete lifecycle actions', async () => {
    const draft = detail('lifecycle', 'QUIZ', 'DRAFT', [testQuestion('tq', 'q', 'Lifecycle question', 0)]);
    mockManagement([draft]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(assessmentApi.tests, 'publish').mockResolvedValue({ ...draft, status: 'PUBLISHED' });
    vi.spyOn(assessmentApi.tests, 'unpublish').mockResolvedValue({ ...draft, status: 'DRAFT' });
    vi.spyOn(assessmentApi.tests, 'delete').mockResolvedValue({ message: 'ok' });
    renderManagement();
    await screen.findByText(draft.title);
    fireEvent.click(screen.getByRole('button', { name: /^Xuất bản$/i }));
    expect(await screen.findByRole('button', { name: /Về bản nháp/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Về bản nháp/i }));
    expect(await screen.findByRole('button', { name: /^Xuất bản$/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Xóa$/i }));
    await waitFor(() => expect(screen.queryByText(draft.title)).not.toBeInTheDocument());
  });

  it('shows a useful QUIZ-without-Lesson publish message', async () => {
    const quiz = { ...detail('quiz-no-lesson', 'QUIZ', 'DRAFT', [testQuestion('tq', 'q', 'Question', 0)]), lessonId: null };
    mockManagement([quiz]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(assessmentApi.tests, 'publish').mockRejectedValueOnce(new ApiError(400, { message: 'published QUIZ must reference a Lesson' }));
    renderManagement();
    await screen.findByText(quiz.title);
    fireEvent.click(screen.getByRole('button', { name: /^Xuất bản$/i }));
    expect(await screen.findByText(/QUIZ.*chọn một bài học/i)).toBeInTheDocument();
  });

  it('maps historical unpublish/delete conflicts to safe distinct UX and preserves rows', async () => {
    const published = detail('published', 'QUIZ', 'PUBLISHED', [testQuestion('tq', 'q', 'Kept question', 0)]);
    mockManagement([published]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(assessmentApi.tests, 'unpublish').mockRejectedValueOnce(new ApiError(409, { message: 'raw P2003' }));
    vi.spyOn(assessmentApi.tests, 'delete').mockRejectedValueOnce(new ApiError(409, { message: 'raw stack' }));
    renderManagement();
    await screen.findByText(published.title);
    fireEvent.click(screen.getByRole('button', { name: /Về bản nháp/i }));
    expect(await screen.findByText(/đã có học viên bắt đầu làm bài/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Xóa$/i }));
    expect(await screen.findByText(/đã có lịch sử làm bài/i)).toBeInTheDocument();
    expect(screen.getByText(published.title)).toBeInTheDocument();
    expect(screen.queryByText(/P2003|raw stack/i)).not.toBeInTheDocument();
  });
});

describe('TestEditorPage', () => {
  it('owns create, select, rename, same-skill reorder and delete in Step 3 while Step 5 stays current', async () => {
    const first = { ...testGroup('group-listening-1', 'LISTENING', 0), title: 'Nghe 1' };
    const second = { ...testGroup('group-listening-2', 'LISTENING', 1), title: 'Nghe 2' };
    let server: AssessmentTestDetail = { ...detail(testId, 'QUIZ', 'DRAFT', []), questionGroups: [first, second] };
    vi.spyOn(curriculum, 'loadCourseLessons').mockResolvedValue(lessons);
    vi.spyOn(assessmentApi.questions, 'page').mockResolvedValue({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 });
    vi.spyOn(assessmentApi.tests, 'get').mockImplementation(async () => server);
    const create = vi.spyOn(assessmentApi.groups, 'create').mockImplementation(async (_id, input) => {
      const created = { ...testGroup('group-listening-3', input.skill, 2), title: input.title ?? null };
      server = { ...server, questionGroups: [...(server.questionGroups ?? []), created] };
      return created;
    });
    const update = vi.spyOn(assessmentApi.groups, 'update').mockImplementation(async (_id, groupId, input) => {
      const updated = { ...(server.questionGroups ?? []).find((group) => group.id === groupId)!, ...input };
      server = { ...server, questionGroups: (server.questionGroups ?? []).map((group) => group.id === groupId ? updated : group) };
      return updated;
    });
    const reorder = vi.spyOn(assessmentApi.groups, 'reorder').mockImplementation(async (_id, ids) => {
      server = { ...server, questionGroups: ids.map((id, orderIndex) => ({ ...(server.questionGroups ?? []).find((group) => group.id === id)!, orderIndex })) };
      return server.questionGroups ?? [];
    });
    const remove = vi.spyOn(assessmentApi.groups, 'delete').mockImplementation(async (_id, groupId) => {
      server = { ...server, questionGroups: (server.questionGroups ?? []).filter((group) => group.id !== groupId) };
      return { message: 'ok' };
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderEditor();
    await screen.findByText(server.title);
    fireEvent.click(screen.getByRole('button', { name: /2\. Cấu trúc đề/i }));
    const structure = screen.getByTestId('skill-structure-summary').closest('section')!;
    expect(structure).toBeInTheDocument();
    expect(within(structure).queryByRole('button', { name: /Lưu tên cụm|Xóa cụm|Đưa cụm/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /3\. Nội dung phần thi/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /^\+ Cụm$/i })[0]);
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    const title = screen.getByRole('textbox', { name: /Tên cụm đang soạn/i });
    expect(title).toHaveValue('Cụm câu hỏi 3');
    fireEvent.change(title, { target: { value: 'Cụm smoke đã đổi tên' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu tên cụm/i }));
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(screen.getByRole('textbox', { name: /Tên cụm đang soạn/i })).toHaveValue('Cụm smoke đã đổi tên');
    fireEvent.click(screen.getByRole('button', { name: /Đưa cụm đang chọn lên/i }));
    await waitFor(() => expect(reorder).toHaveBeenCalledWith(testId, ['group-listening-1', 'group-listening-3', 'group-listening-2']));
    expect(screen.getByRole('textbox', { name: /Tên cụm đang soạn/i })).toHaveValue('Cụm smoke đã đổi tên');
    fireEvent.click(screen.getByRole('button', { name: /5\. Xem trước/i }));
    expect(within(screen.getByLabelText(/Bản xem trước dành cho học viên/i)).getByText(/Cụm smoke đã đổi tên/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /3\. Nội dung phần thi/i }));
    fireEvent.click(screen.getByRole('button', { name: /Xóa cụm/i }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(testId, 'group-listening-3'));
    expect(screen.getByRole('textbox', { name: /Tên cụm đang soạn/i })).toHaveValue('Nghe 1');
  });

  it('edits allowed metadata and keeps title/description/result policy usable after structural 409', async () => {
    const current = detail(testId, 'QUIZ', 'PUBLISHED', [testQuestion('tq-a', 'q-a', 'Question A', 0)]);
    mockEditor(current, [question('q-b', 'Question B')]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(assessmentApi.testQuestions, 'delete').mockRejectedValueOnce(new ApiError(409, { message: 'raw conflict' }));
    const update = vi.spyOn(assessmentApi.tests, 'update').mockImplementation(async (_id, input) => ({ ...current, ...input, updatedAt: 'later' }));
    renderEditor();
    await screen.findByText('Question A');
    fireEvent.click(screen.getByRole('button', { name: /^Gỡ$/i }));
    expect(await screen.findByText(/Không thể thay đổi cấu trúc bài kiểm tra/i)).toBeInTheDocument();
    expect(screen.getByText('Question A')).toBeInTheDocument();

    const form = screen.getByRole('heading', { name: /Thông tin đề/i }).closest('form')!;
    fireEvent.change(within(form).getByLabelText(/Tiêu đề/i), { target: { value: 'Updated title' } });
    fireEvent.change(within(form).getByLabelText(/^Mô tả$/i), { target: { value: 'Updated description' } });
    fireEvent.submit(form);
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0][1]).toEqual({ title: 'Updated title', description: 'Updated description' });
    fireEvent.click(screen.getByRole('button', { name: /4\. Thiết lập/i }));
    const settings = screen.getByRole('heading', { name: /Thiết lập bài kiểm tra/i }).closest('form')!;
    fireEvent.click(within(settings).getByRole('checkbox'));
    fireEvent.submit(settings);
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1][1]).toEqual({ showResultAfterSubmit: false });
  });

  it('PATCHes only effective metadata deltas while retaining genuine locked-field edits', async () => {
    const current = detail(testId, 'QUIZ', 'DRAFT', []);
    mockEditor(current, []);
    const update = vi.spyOn(assessmentApi.tests, 'update')
      .mockImplementation(async (_id, input) => ({ ...current, ...input, updatedAt: `updated-${update.mock.calls.length}` }));
    renderEditor();
    await screen.findByText(current.title);
    let form = screen.getByRole('heading', { name: /Thông tin đề/i }).closest('form')!;

    fireEvent.submit(form);
    expect(update).not.toHaveBeenCalled();

    fireEvent.change(within(form).getByLabelText(/Tiêu đề/i), { target: { value: 'Title only' } });
    fireEvent.submit(form);
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0][1]).toEqual({ title: 'Title only' });
    expect(update.mock.calls[0][1]).not.toHaveProperty('type');
    expect(update.mock.calls[0][1]).not.toHaveProperty('lessonId');
    expect(update.mock.calls[0][1]).not.toHaveProperty('maxAttempts');
    expect(update.mock.calls[0][1]).not.toHaveProperty('description');
    expect(update.mock.calls[0][1]).not.toHaveProperty('showResultAfterSubmit');

    fireEvent.click(screen.getByRole('button', { name: /4\. Thiết lập/i }));
    form = screen.getByRole('heading', { name: /Thiết lập bài kiểm tra/i }).closest('form')!;
    fireEvent.change(within(form).getByLabelText(/Số lượt làm/i), { target: { value: '4' } });
    fireEvent.submit(form);
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update.mock.calls[1][1]).toEqual({ maxAttempts: 4 });
  });

  it('keeps all five builder steps distinct and renders a safe learner-like preview', async () => {
    const item = testQuestion('tq-a', 'q-a', 'Which time is confirmed?', 0);
    const group = { ...testGroup('group-reading', 'READING', 0), title: 'Reading Part', instructions: 'Choose the best answer.', testQuestions: [item] };
    const current = { ...detail(testId, 'QUIZ', 'DRAFT', [item]), questionGroups: [group] };
    mockEditor(current, [question('q-b', 'Question B')]);
    renderEditor();
    const identity = (await screen.findByRole('heading', { name: /Thông tin đề/i })).closest('form')!;
    expect(within(identity).getByLabelText(/^Tiêu đề$/i)).toBeInTheDocument();
    expect(within(identity).queryByLabelText(/Số lượt làm/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /2\. Cấu trúc đề/i }));
    const structure = screen.getByRole('heading', { name: /Tóm tắt cấu trúc bốn kỹ năng/i }).closest('section')!;
    expect(within(structure).queryByText(/Thêm từ ngân hàng câu hỏi/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /3\. Nội dung phần thi/i }));
    expect(screen.getByRole('heading', { name: /Thêm từ ngân hàng câu hỏi/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /4\. Thiết lập/i }));
    const settings = screen.getByRole('heading', { name: /Thiết lập bài kiểm tra/i }).closest('form')!;
    expect(within(settings).getByLabelText(/Số lượt làm/i)).toBeInTheDocument();
    expect(within(settings).queryByLabelText(/^Tiêu đề$/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Kiểm tra khả năng xuất bản/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /5\. Xem trước/i }));
    const preview = screen.getByLabelText(/Bản xem trước dành cho học viên/i);
    expect(preview).toBeInTheDocument();
    expect(within(preview).getByText('Which time is confirmed?')).toBeInTheDocument();
    expect(within(preview).getByText('A')).toBeInTheDocument();
    expect(within(preview).getByText('B')).toBeInTheDocument();
    expect(within(preview).queryByText(/đáp án đúng/i)).not.toBeInTheDocument();
  });

  it('renders authorized IMAGE/AUDIO URLs with one-question, shared-group, and no-media scope', async () => {
    const imageQuestion = testQuestion('tq-image', 'q-image', 'Image question', 0);
    const audioQuestions = [
      testQuestion('tq-audio-1', 'q-audio-1', 'Audio question 1', 1),
      testQuestion('tq-audio-2', 'q-audio-2', 'Audio question 2', 2),
      testQuestion('tq-audio-3', 'q-audio-3', 'Audio question 3', 3),
    ];
    const plainQuestion = testQuestion('tq-plain', 'q-plain', 'Question without media', 4);
    const groups: AssessmentTestGroup[] = [
      {
        ...testGroup('image-group', 'LISTENING', 0), title: 'Image group', testQuestions: [imageQuestion],
        stimuli: [{ id: 'image-id', type: 'IMAGE', orderIndex: 0, textContent: null, mimeType: 'image/png', altText: 'Visible prompt image', mediaUrl: '/api/instructor/tests/test-a/stimuli/image-id/media' }],
      },
      {
        ...testGroup('audio-group', 'LISTENING', 1), title: 'Audio group', testQuestions: audioQuestions,
        stimuli: [{ id: 'audio-id', type: 'AUDIO', orderIndex: 0, textContent: null, mimeType: 'audio/mpeg', altText: 'Visible prompt audio', mediaUrl: '/api/instructor/tests/test-a/stimuli/audio-id/media' }],
      },
      { ...testGroup('plain-group', 'LISTENING', 2), title: 'No media group', testQuestions: [plainQuestion] },
    ];
    const allQuestions = [imageQuestion, ...audioQuestions, plainQuestion];
    mockEditor({ ...detail(testId, 'QUIZ', 'DRAFT', allQuestions), questionGroups: groups }, []);
    renderEditor();
    await screen.findByText(/QUIZ test-a/i);
    fireEvent.click(screen.getByRole('button', { name: /5\./i }));

    const preview = screen.getByLabelText(/Bản xem trước dành cho học viên/i);
    expect(within(preview).getByRole('img', { name: 'Visible prompt image' })).toHaveAttribute(
      'src', '/api/instructor/tests/test-a/stimuli/image-id/media',
    );
    expect(within(preview).getByLabelText('Visible prompt audio')).toHaveAttribute(
      'src', '/api/instructor/tests/test-a/stimuli/audio-id/media',
    );
    expect(within(preview).getByText('Dùng cho: Câu 1')).toBeInTheDocument();
    expect(within(preview).getByText('Dùng chung cho: Câu 1–3')).toBeInTheDocument();
    expect(within(preview).getByText('Question without media')).toBeInTheDocument();
    expect(within(preview).queryByText(/đáp án đúng/i)).not.toBeInTheDocument();
  });

  it('adds only available same-course Questions and validates/saves positive integer points', async () => {
    const existing = testQuestion('tq-a', 'q-a', 'Question A', 0);
    const current = detail(testId, 'PLACEMENT', 'DRAFT', [existing]);
    const available = question('q-b', 'Question B');
    mockEditor(current, [question('q-a', 'Question A'), available]);
    const added = testQuestion('tq-b', 'q-b', 'Question B', 1);
    const add = vi.spyOn(assessmentApi.testQuestions, 'add').mockResolvedValue(added);
    const updatePoints = vi.spyOn(assessmentApi.testQuestions, 'update').mockResolvedValue({ ...existing, points: 4 });
    renderEditor();
    await screen.findByText('Question A');
    const picker = screen.getByLabelText(/^Câu hỏi$/i);
    expect(within(picker).queryByRole('option', { name: /Question A/i })).not.toBeInTheDocument();
    fireEvent.change(picker, { target: { value: available.id } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm câu hỏi/i }));
    await waitFor(() => expect(add).toHaveBeenCalledWith(testId, available.id, 1));
    expect(await screen.findByText('Question B')).toBeInTheDocument();

    const article = screen.getByText('Question A').closest('article')!;
    const points = within(article).getByRole('spinbutton');
    fireEvent.change(points, { target: { value: '0' } });
    fireEvent.click(within(article).getByRole('button', { name: /Lưu điểm/i }));
    expect(await screen.findByText(/số nguyên.*1/i)).toBeInTheDocument();
    expect(updatePoints).not.toHaveBeenCalled();
    fireEvent.change(points, { target: { value: '4' } });
    fireEvent.click(within(article).getByRole('button', { name: /Lưu điểm/i }));
    await waitFor(() => expect(updatePoints).toHaveBeenCalledWith(testId, existing.id, 4));
  });

  it('keeps multi-page selection for a 1,000-question server-side picker', async () => {
    const current = {
      ...detail(testId, 'PLACEMENT', 'DRAFT', []),
      questionGroups: [{
        id: 'reading-part', skill: 'READING' as const, orderIndex: 0, title: 'Reading', instructions: null,
        preparationSeconds: null, responseSeconds: null, recommendedSeconds: null, maxRecordingSeconds: null,
        stimuli: [], testQuestions: [],
      }],
    };
    vi.spyOn(curriculum, 'loadCourseLessons').mockResolvedValue(lessons);
    vi.spyOn(assessmentApi.tests, 'get').mockResolvedValue(current);
    vi.spyOn(assessmentApi.questions, 'page').mockImplementation(async (_course, query) => {
      const page = query?.page ?? 1;
      const item = question(`q-${page}`, `Question page ${page}`);
      return { items: [item], page, pageSize: 20, total: 1000, totalPages: 50 };
    });
    renderEditor();
    expect((await screen.findAllByText('Reading')).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Mở bộ chọn câu hỏi/i }));
    const dialog = await screen.findByRole('dialog', { name: /Bộ chọn câu hỏi/i });
    expect(within(dialog).getByText(/1000 câu phù hợp/i)).toBeInTheDocument();
    fireEvent.click((await within(dialog).findAllByRole('checkbox'))[0]);
    expect(within(dialog).getByText(/Đã chọn 1 câu/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Trang sau/i }));
    const pageTwo = await within(dialog).findByText('Question page 2');
    fireEvent.click(pageTwo.closest('label')!.querySelector('input')!);
    expect(within(dialog).getByText(/Đã chọn 2 câu/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: /Trang trước/i }));
    const pageOne = await within(dialog).findByText('Question page 1');
    expect(pageOne.closest('label')!.querySelector('input')).toBeChecked();
    expect(assessmentApi.questions.page).toHaveBeenCalledWith(courseId, expect.objectContaining({ page: 2, pageSize: 20, skill: 'READING' }), expect.any(AbortSignal));
  });

  it('adds L-13 atomically to the selected group and shows it exactly once in immediate Step 5 preview', async () => {
    const group = { ...testGroup('reading-group', 'READING', 0), title: 'Cụm đọc chung' };
    let server = { ...detail(testId, 'QUIZ', 'DRAFT', []), questionGroups: [group] };
    const l13 = question('q-l13', 'M07-VG-L-13');
    mockEditor(server, [l13]);
    vi.mocked(assessmentApi.tests.get).mockImplementation(async () => server);
    const addBatch = vi.spyOn(assessmentApi.testQuestions, 'addBatch').mockImplementation(async (_testId, questionIds, points, groupId) => {
      const added = testQuestion('tq-l13', questionIds[0], l13.content, 0);
      added.points = points;
      added.groupId = groupId;
      server = {
        ...server,
        testQuestions: [added],
        questionGroups: [{ ...group, testQuestions: [added] }],
      };
      return [added];
    });
    renderEditor();
    await screen.findByText(server.title);
    fireEvent.click(screen.getByRole('button', { name: /3\. Nội dung phần thi/i }));
    fireEvent.click(screen.getByRole('button', { name: /Mở bộ chọn câu hỏi/i }));
    const dialog = await screen.findByRole('dialog', { name: /Bộ chọn câu hỏi/i });
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: /Thêm 1 câu/i }));
    await waitFor(() => expect(addBatch).toHaveBeenCalledWith(testId, ['q-l13'], 1, 'reading-group'));
    expect(screen.getAllByText('M07-VG-L-13')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /5\. Xem trước/i }));
    const preview = screen.getByLabelText(/Bản xem trước dành cho học viên/i);
    expect(within(preview).getAllByText('M07-VG-L-13')).toHaveLength(1);
    expect(within(preview).queryByText(/đáp án đúng/i)).not.toBeInTheDocument();
    expect(assessmentApi.tests.get).toHaveBeenCalledTimes(2);
  });

  it('guards duplicate add/points requests and maps duplicate Question conflict safely', async () => {
    const existing = testQuestion('tq-a', 'q-a', 'Question A', 0);
    const available = question('q-b', 'Question B');
    mockEditor(detail(testId, 'PLACEMENT', 'DRAFT', [existing]), [available]);
    const addPending = deferred<AssessmentTestQuestion>();
    const add = vi.spyOn(assessmentApi.testQuestions, 'add').mockReturnValueOnce(addPending.promise);
    renderEditor();
    await screen.findByText('Question A');
    fireEvent.change(screen.getByLabelText(/^Câu hỏi$/i), { target: { value: available.id } });
    const addButton = screen.getByRole('button', { name: /Thêm câu hỏi/i });
    fireEvent.click(addButton);
    fireEvent.click(addButton);
    expect(add).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: /Đang thêm/i })).toBeDisabled();
    addPending.reject(new ApiError(409, { message: 'raw duplicate P2002' }));
    expect(await screen.findByText(/đã có trong bài kiểm tra|cấu trúc.*khóa/i)).toBeInTheDocument();
    expect(screen.queryByText(/P2002/i)).not.toBeInTheDocument();

    const pointsPending = deferred<AssessmentTestQuestion>();
    const update = vi.spyOn(assessmentApi.testQuestions, 'update').mockReturnValueOnce(pointsPending.promise);
    const article = screen.getByText('Question A').closest('article')!;
    fireEvent.change(within(article).getByRole('spinbutton'), { target: { value: '5' } });
    const save = within(article).getByRole('button', { name: /Lưu điểm/i });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(update).toHaveBeenCalledOnce();
    pointsPending.resolve({ ...existing, points: 5 });
    await waitFor(() => expect(within(article).getByRole('spinbutton')).toHaveValue(5));
  });

  it('sends complete reorder membership, keeps success, rolls back failure and guards pending controls', async () => {
    const first = testQuestion('tq-a', 'q-a', 'Question A', 0);
    const second = testQuestion('tq-b', 'q-b', 'Question B', 1);
    const current = detail(testId, 'PLACEMENT', 'DRAFT', [first, second]);
    mockEditor(current, []);
    let server = current;
    vi.mocked(assessmentApi.tests.get).mockImplementation(async () => server);
    const reorder = vi.spyOn(assessmentApi.testQuestions, 'reorder')
      .mockImplementationOnce(async () => {
        const reordered = [{ ...second, orderIndex: 0 }, { ...first, orderIndex: 1 }];
        server = { ...server, testQuestions: reordered };
        return reordered;
      });
    renderEditor();
    await screen.findByText('Question A');
    fireEvent.click(screen.getByLabelText(/Đưa câu 1 xuống/i));
    await waitFor(() => expect(reorder).toHaveBeenCalledWith(testId, [second.id, first.id]));
    expect(questionOrder()).toEqual(['Question B', 'Question A']);

    const pending = deferred<AssessmentTestQuestion[]>();
    reorder.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByLabelText(/Đưa câu 2 lên/i));
    expect(reorder).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText(/Đưa câu 1 xuống/i)).toBeDisabled();
    expect(questionOrder()).toEqual(['Question A', 'Question B']);
    pending.reject(new ApiError(409, { message: 'raw reorder conflict' }));
    await screen.findByText(/Không thể thay đổi cấu trúc bài kiểm tra/i);
    expect(questionOrder()).toEqual(['Question B', 'Question A']);
    expect(screen.queryByText(/raw reorder conflict/i)).not.toBeInTheDocument();
  });

  it('removes on success but retains the Question after historical failure', async () => {
    const first = testQuestion('tq-a', 'q-a', 'Question A', 0);
    const second = testQuestion('tq-b', 'q-b', 'Question B', 1);
    let server = detail(testId, 'PLACEMENT', 'DRAFT', [first, second]);
    mockEditor(server, []);
    vi.mocked(assessmentApi.tests.get).mockImplementation(async () => server);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(assessmentApi.testQuestions, 'delete')
      .mockImplementationOnce(async (_testId, testQuestionId) => {
        server = { ...server, testQuestions: server.testQuestions.filter((item) => item.id !== testQuestionId) };
        return { message: 'ok' };
      })
      .mockRejectedValueOnce(new ApiError(409, { message: 'raw history' }));
    renderEditor();
    await screen.findByText('Question A');
    fireEvent.click(within(screen.getByText('Question A').closest('article')!).getByRole('button', { name: /^Gỡ$/i }));
    await waitFor(() => expect(screen.queryByText('Question A')).not.toBeInTheDocument());
    fireEvent.click(within(screen.getByText('Question B').closest('article')!).getByRole('button', { name: /^Gỡ$/i }));
    expect(await screen.findByText(/Không thể thay đổi cấu trúc bài kiểm tra/i)).toBeInTheDocument();
    expect(screen.getByText('Question B')).toBeInTheDocument();
  });

  it('presents IN_CLASS purpose truthfully and never sends a legacy type mutation', async () => {
    const current = {
      ...detail(testId, 'QUIZ', 'PUBLISHED', [testQuestion('tq-a', 'q-a', 'Question A', 0)]),
      type: 'IN_CLASS' as const,
      purpose: 'IN_CLASS' as const,
    };
    mockEditor(current, []);
    const update = vi.spyOn(assessmentApi.tests, 'update').mockImplementation(async (_id, input) => ({ ...current, ...input }));
    renderEditor();
    const form = (await screen.findByText('Bài kiểm tra trên lớp')).closest('form')!;
    expect(within(form).queryByLabelText(/^Loại$/)).not.toBeInTheDocument();
    expect(within(form).queryByText('Xếp lớp')).not.toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText(/Tiêu đề/i), { target: { value: 'Tên mới' } });
    fireEvent.submit(form);
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0][1]).toEqual({ title: 'Tên mới' });
  });
});

function renderManagement() {
  return renderAssessmentRoute(
    <TestManagementPage />, `/instructor/courses/${courseId}/tests`,
    '/instructor/courses/:courseId/tests', { role: 'INSTRUCTOR' },
  );
}

function renderEditor() {
  return renderAssessmentRoute(
    <TestEditorPage />, `/instructor/tests/${testId}/edit`,
    '/instructor/tests/:testId/edit', { role: 'INSTRUCTOR' },
  );
}

function mockManagement(tests: AssessmentTestDetail[]) {
  vi.spyOn(curriculum, 'loadCourseLessons').mockResolvedValue(lessons);
  vi.spyOn(assessmentApi.tests, 'list').mockResolvedValue(tests);
  vi.spyOn(assessmentApi.tests, 'get').mockImplementation(async (id) => tests.find((test) => test.id === id)!);
}

function mockEditor(test: AssessmentTestDetail, questions: AssessmentQuestion[]) {
  vi.spyOn(curriculum, 'loadCourseLessons').mockResolvedValue(lessons);
  vi.spyOn(assessmentApi.tests, 'get').mockResolvedValue(test);
  vi.spyOn(assessmentApi.questions, 'page').mockResolvedValue({ items: questions, page: 1, pageSize: 20, total: questions.length, totalPages: 1 });
}

function detail(id: string, type: TestType, status: TestStatus, testQuestions: AssessmentTestQuestion[]): AssessmentTestDetail {
  return {
    id, courseId, lessonId: type === 'QUIZ' ? 'lesson-a' : null, type,
    title: `${type} ${id}`, description: 'Description', status, maxAttempts: 3,
    showResultAfterSubmit: true, createdAt: '2026-09-22T00:00:00Z', updatedAt: '2026-09-22T00:00:00Z',
    testQuestions,
  };
}

function question(id: string, content: string): AssessmentQuestion {
  return {
    id, courseId, type: 'SINGLE_CHOICE', toeicSkill: 'READING', difficulty: 'MEDIUM', content, explanation: null,
    createdAt: '2026-09-22T00:00:00Z', updatedAt: '2026-09-22T00:00:00Z',
    options: [
      { id: `${id}-a`, content: 'A', isCorrect: true, orderIndex: 0 },
      { id: `${id}-b`, content: 'B', isCorrect: false, orderIndex: 1 },
    ],
  };
}

function testQuestion(id: string, questionId: string, content: string, orderIndex: number): AssessmentTestQuestion {
  return {
    id, testId, questionId, orderIndex, points: 2,
    question: {
      id: questionId, type: 'SINGLE_CHOICE', difficulty: 'MEDIUM', content, explanation: null,
      options: [
        { id: `${questionId}-a`, content: 'A', isCorrect: true, orderIndex: 0 },
        { id: `${questionId}-b`, content: 'B', isCorrect: false, orderIndex: 1 },
      ],
    },
  };
}

function testGroup(id: string, skill: AssessmentTestGroup['skill'], orderIndex: number): AssessmentTestGroup {
  return {
    id, skill, orderIndex, title: `Phần ${skill === 'LISTENING' ? 'Nghe' : 'Đọc'}`,
    instructions: null, preparationSeconds: null, responseSeconds: null,
    recommendedSeconds: null, maxRecordingSeconds: null, stimuli: [], testQuestions: [],
  };
}

function questionOrder() {
  return Array.from(document.querySelectorAll('article'))
    .map((article) => ['Question A', 'Question B'].find((text) => article.textContent?.includes(text)))
    .filter((value): value is string => Boolean(value));
}
