import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-client';
import { QuestionBankPage } from '@/pages/QuestionBankPage';
import { assessmentApi } from './api';
import { deferred, renderAssessmentRoute } from './assessment-test-utils';
import type { AssessmentQuestion, QuestionType } from './types';
import { knowledgeModelApi } from '@/features/knowledge-model/api';
import type { Skill } from '@/features/knowledge-model/types';

const courseId = 'course-a';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('QuestionBankPage', () => {
  it('renders all objective types, difficulties and CRUD actions without Question reorder', async () => {
    vi.spyOn(assessmentApi.questions, 'list').mockResolvedValue([
      question('sc', 'SINGLE_CHOICE', 'EASY'),
      question('tf', 'TRUE_FALSE', 'MEDIUM'),
      question('mc', 'MULTIPLE_CHOICE', 'HARD'),
    ]);
    renderPage();

    await screen.findByText('Question sc');
    expect(screen.getByText('Question tf')).toBeInTheDocument();
    expect(screen.getByText('Question mc')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tạo câu hỏi/i })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Sửa$/i })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: /^Xóa$/i })).toHaveLength(3);
    expect(screen.queryByRole('button', { name: /Đưa câu hỏi .* (lên|xuống)/i })).not.toBeInTheDocument();
  });

  it('shows loading, empty and safe failed-load states', async () => {
    const pending = deferred<AssessmentQuestion[]>();
    vi.spyOn(assessmentApi.questions, 'list').mockReturnValueOnce(pending.promise);
    const loading = renderPage();
    expect(screen.getByText(/Đang tải câu hỏi/i)).toBeInTheDocument();
    pending.resolve([]);
    expect(await screen.findByText(/Chưa có câu hỏi/i)).toBeInTheDocument();
    loading.unmount();

    vi.spyOn(assessmentApi.questions, 'list').mockRejectedValueOnce(new Error('raw stack database'));
    renderPage();
    expect(await screen.findByText(/Không thể tải ngân hàng câu hỏi/i)).toBeInTheDocument();
    expect(screen.queryByText(/raw stack database/i)).not.toBeInTheDocument();
  });

  it('validates SC, TF and MC forms plus normalized duplicate option text', async () => {
    vi.spyOn(assessmentApi.questions, 'list').mockResolvedValue([]);
    const create = vi.spyOn(assessmentApi.questions, 'create');
    renderPage();
    await openCreateForm();

    const form = screen.getByRole('heading', { name: /Tạo câu hỏi/i, level: 2 }).closest('form')!;
    fireEvent.submit(form);
    expect(await screen.findByText(/không được để trống/i)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();

    fillQuestion('SC content', [' Same ', 'same']);
    fireEvent.submit(form);
    expect(await screen.findByText(/không được trùng nhau/i)).toBeInTheDocument();

    const type = within(form).getAllByRole('combobox')[0];
    fireEvent.change(type, { target: { value: 'TRUE_FALSE' } });
    expect(within(form).getAllByRole('radio')).toHaveLength(2);
    expect(optionInputs(form)).toHaveLength(2);
    fireEvent.change(optionInputs(form)[0], { target: { value: 'Editable true' } });
    expect(optionInputs(form)[0]).toHaveValue('Editable true');

    fireEvent.change(type, { target: { value: 'MULTIPLE_CHOICE' } });
    expect(within(form).getAllByRole('checkbox')).toHaveLength(2);
    within(form).getAllByRole('checkbox').forEach((control) => {
      if ((control as HTMLInputElement).checked) fireEvent.click(control);
    });
    fireEvent.submit(form);
    expect(await screen.findByText(/ít nhất một đáp án đúng/i)).toBeInTheDocument();
  });

  it('sends only approved create/update data in current UI option order', async () => {
    const existing = question('edit', 'SINGLE_CHOICE', 'MEDIUM');
    vi.spyOn(assessmentApi.questions, 'list').mockResolvedValue([existing]);
    const create = vi.spyOn(assessmentApi.questions, 'create').mockResolvedValue(question('new', 'SINGLE_CHOICE', 'MEDIUM'));
    const update = vi.spyOn(assessmentApi.questions, 'update').mockResolvedValue({ ...existing, content: 'Updated' });
    const page = renderPage();
    await screen.findByText(existing.content);
    fireEvent.click(screen.getByRole('button', { name: /Tạo câu hỏi/i }));
    const form = screen.getByRole('heading', { name: /Tạo câu hỏi/i, level: 2 }).closest('form')!;
    fillQuestion('Created', ['First', 'Second']);
    fireEvent.click(within(form).getByLabelText(/Đưa đáp án 1 xuống/i));
    fireEvent.submit(form);
    await waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(create).toHaveBeenCalledWith(courseId, {
      type: 'SINGLE_CHOICE', difficulty: 'MEDIUM', content: 'Created', explanation: null,
      options: [{ content: 'Second', isCorrect: false }, { content: 'First', isCorrect: true }],
    });
    expect(Object.keys(create.mock.calls[0][1])).toEqual(['type', 'difficulty', 'content', 'explanation', 'options']);
    page.unmount();

    vi.spyOn(assessmentApi.questions, 'list').mockResolvedValue([existing]);
    renderPage();
    await screen.findByText(existing.content);
    fireEvent.click(screen.getByRole('button', { name: /^Sửa$/i }));
    const editForm = screen.getByRole('heading', { name: /Chỉnh sửa câu hỏi/i }).closest('form')!;
    fireEvent.change(within(editForm).getAllByRole('textbox')[0], { target: { value: 'Updated' } });
    fireEvent.submit(editForm);
    await waitFor(() => expect(update).toHaveBeenCalledOnce());
    expect(update.mock.calls[0][0]).toBe(existing.id);
    expect(update.mock.calls[0][1]).not.toHaveProperty('id');
    expect(update.mock.calls[0][1]).not.toHaveProperty('courseId');
    expect(update.mock.calls[0][1].options.every((option) => !('id' in option) && !('orderIndex' in option))).toBe(true);
  });

  it('guards duplicate save/delete mutations and shows distinct safe 409 messages', async () => {
    const existing = question('locked', 'SINGLE_CHOICE', 'MEDIUM');
    vi.spyOn(assessmentApi.questions, 'list').mockResolvedValue([existing]);
    const savePending = deferred<AssessmentQuestion>();
    const update = vi.spyOn(assessmentApi.questions, 'update').mockReturnValueOnce(savePending.promise);
    const remove = vi.spyOn(assessmentApi.questions, 'delete');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await screen.findByText(existing.content);
    fireEvent.click(screen.getByRole('button', { name: /^Sửa$/i }));
    const form = screen.getByRole('heading', { name: /Chỉnh sửa câu hỏi/i }).closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(update).toHaveBeenCalledOnce();
    expect(within(form).getByRole('button', { name: /Đang lưu/i })).toBeDisabled();
    savePending.reject(new ApiError(409, { message: 'raw Prisma P2002' }));
    expect(await screen.findByText(/lượt làm.*không thể chỉnh sửa/i)).toBeInTheDocument();
    expect(screen.queryByText(/Prisma|P2002/i)).not.toBeInTheDocument();

    const deletePending = deferred<{ message: string }>();
    remove.mockReturnValueOnce(deletePending.promise);
    fireEvent.click(screen.getByRole('button', { name: /^Xóa$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Đang xóa/i }));
    expect(remove).toHaveBeenCalledOnce();
    deletePending.reject(new ApiError(409, { message: 'raw foreign key' }));
    expect(await screen.findByText(/gỡ câu hỏi khỏi bài kiểm tra trước/i)).toBeInTheDocument();
    expect(screen.queryByText(/foreign key/i)).not.toBeInTheDocument();
  });

  it('invokes shared session-expiry handling and redirects safely on 401', async () => {
    vi.spyOn(assessmentApi.questions, 'list').mockRejectedValueOnce(new ApiError(401, null));
    const refresh = vi.fn().mockResolvedValue(undefined);
    renderAssessmentRoute(
      <QuestionBankPage />, `/instructor/courses/${courseId}/question-bank`,
      '/instructor/courses/:courseId/question-bank',
      { includeLogin: true, refreshUser: refresh, role: 'INSTRUCTOR' },
    );
    expect(await screen.findByText('Login page')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(`/login?returnUrl=${encodeURIComponent(`/instructor/courses/${courseId}/question-bank`)}`);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('loads existing Question Skills and sends exact multi/zero full sets', async () => {
    const existing = question('mapped', 'SINGLE_CHOICE', 'MEDIUM');
    const grammar = mappedSkill('grammar', 'GRAMMAR');
    const vocab = mappedSkill('vocab', 'VOCAB');
    vi.spyOn(assessmentApi.questions, 'list').mockResolvedValue([existing]);
    vi.spyOn(knowledgeModelApi.skills, 'list').mockResolvedValue([grammar, vocab]);
    vi.spyOn(knowledgeModelApi.questionSkills, 'list').mockResolvedValueOnce([grammar]).mockResolvedValueOnce([]);
    const replace = vi.spyOn(knowledgeModelApi.questionSkills, 'replace').mockResolvedValue([]);
    renderPage(); await screen.findByText(existing.content);
    fireEvent.click(screen.getByRole('button', { name: /Edit Skills/i }));
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText(/GRAMMAR/)).toBeChecked();
    fireEvent.click(within(dialog).getByLabelText(/VOCAB/));
    fireEvent.click(within(dialog).getByRole('button', { name: /Lưu liên kết/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(existing.id, [grammar.id, vocab.id]));
    expect(screen.getByRole('status')).toHaveTextContent(/Đã cập nhật Skill/i);

    fireEvent.click(screen.getByRole('button', { name: /Edit Skills/i }));
    dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Lưu liên kết/i }));
    await waitFor(() => expect(replace).toHaveBeenLastCalledWith(existing.id, []));
    expect(knowledgeModelApi.skills.list).toHaveBeenCalledTimes(1);
  });

  it('keeps Question mapping editable and surfaces backend errors', async () => {
    const existing = question('history', 'SINGLE_CHOICE', 'MEDIUM');
    const grammar = mappedSkill('grammar', 'GRAMMAR');
    vi.spyOn(assessmentApi.questions, 'list').mockResolvedValue([existing]);
    vi.spyOn(knowledgeModelApi.skills, 'list').mockResolvedValue([grammar]);
    vi.spyOn(knowledgeModelApi.questionSkills, 'list').mockResolvedValue([grammar]);
    vi.spyOn(knowledgeModelApi.questionSkills, 'replace').mockRejectedValue(new ApiError(400, { message: 'raw mapping' }));
    renderPage(); await screen.findByText(existing.content);
    fireEvent.click(screen.getByRole('button', { name: /Edit Skills/i }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Lưu liên kết/i }));
    expect(await within(dialog).findByText(/Không thể cập nhật liên kết Skill/i)).toBeInTheDocument();
    expect(screen.queryByText(/raw mapping/i)).not.toBeInTheDocument();
  });
});

function renderPage() {
  return renderAssessmentRoute(
    <QuestionBankPage />, `/instructor/courses/${courseId}/question-bank`,
    '/instructor/courses/:courseId/question-bank', { role: 'INSTRUCTOR' },
  );
}

async function openCreateForm() {
  await waitFor(() => expect(assessmentApi.questions.list).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: /Tạo câu hỏi/i }));
}

function fillQuestion(content: string, options: string[]) {
  const form = screen.getByRole('heading', { name: /Tạo câu hỏi/i, level: 2 }).closest('form')!;
  const inputs = within(form).getAllByRole('textbox');
  fireEvent.change(inputs[0], { target: { value: content } });
  options.forEach((value, index) => fireEvent.change(optionInputs(form)[index], { target: { value } }));
}

function optionInputs(form: HTMLElement) {
  return within(form).getAllByRole('textbox').slice(2);
}

function question(id: string, type: QuestionType, difficulty: AssessmentQuestion['difficulty']): AssessmentQuestion {
  return {
    id, courseId, type, difficulty, content: `Question ${id}`, explanation: null,
    createdAt: '2026-09-22T00:00:00Z', updatedAt: '2026-09-22T00:00:00Z',
    options: [
      { id: `${id}-a`, content: `${id} A`, isCorrect: true, orderIndex: 0 },
      { id: `${id}-b`, content: `${id} B`, isCorrect: false, orderIndex: 1 },
    ],
  };
}
function mappedSkill(id: string, code: string): Skill { return { id, courseId, code, name: code, description: null, pInit: 0.5, pLearn: 0.1, pGuess: 0.2, pSlip: 0.1, createdAt: '', updatedAt: '' }; }
