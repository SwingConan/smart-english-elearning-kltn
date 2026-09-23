import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import type { UserRole } from '@/features/auth/api';
import { RoleRoute } from '@/features/auth/RoleRoute';
import { ApiError } from '@/lib/api-client';
import { KnowledgeModelPage } from '@/pages/KnowledgeModelPage';
import { knowledgeModelApi } from './api';
import type { Skill } from './types';

const courseId = '10000000-0000-4000-8000-000000000004';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('KnowledgeModelPage', () => {
  it('loads the protected route, renders Skills and shows the empty state', async () => {
    vi.spyOn(knowledgeModelApi.skills, 'list').mockResolvedValue([skill('a', 'GRAMMAR')]);
    const page = renderPage();
    expect(await screen.findByText(/GRAMMAR.*Skill a/i)).toBeInTheDocument();
    page.unmount();

    vi.spyOn(knowledgeModelApi.skills, 'list').mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/định nghĩa kiến thức mà khóa học đo lường/i)).toBeInTheDocument();
  });

  it('shows loading and a safe Skill-list error without raw internals', async () => {
    let rejectList!: (reason: unknown) => void;
    vi.spyOn(knowledgeModelApi.skills, 'list').mockReturnValue(
      new Promise((_, reject) => { rejectList = reject; }),
    );
    renderPage();
    expect(screen.getByText(/Đang tải Knowledge Model/i)).toBeInTheDocument();
    rejectList(new Error('raw database stack'));
    expect(await screen.findByText(/Không thể tải Knowledge Model/i)).toBeInTheDocument();
    expect(screen.queryByText(/raw database stack/i)).not.toBeInTheDocument();
  });

  it('keeps non-Instructors outside the route', async () => {
    const list = vi.spyOn(knowledgeModelApi.skills, 'list');
    renderPage('STUDENT');
    expect(await screen.findByRole('heading', { name: /403/i })).toBeInTheDocument();
    expect(list).not.toHaveBeenCalled();
  });

  it('creates with defaults and custom BKT parameters', async () => {
    vi.spyOn(knowledgeModelApi.skills, 'list').mockResolvedValue([]);
    const create = vi.spyOn(knowledgeModelApi.skills, 'create')
      .mockResolvedValueOnce(skill('default', 'DEFAULT'))
      .mockResolvedValueOnce({ ...skill('custom', 'CUSTOM'), pInit: 0.2, pLearn: 0.3, pGuess: 0.1, pSlip: 0.05 });
    renderPage();
    await screen.findByText(/định nghĩa kiến thức/i);
    fireEvent.click(screen.getByRole('button', { name: /Tạo Skill/i }));
    const first = skillForm();
    expect(within(first).getByLabelText('pInit')).toHaveValue(0.5);
    expect(within(first).getByLabelText('pLearn')).toHaveValue(0.1);
    fillIdentity(first, 'DEFAULT', 'Default skill');
    fireEvent.submit(first);
    await waitFor(() => expect(create).toHaveBeenNthCalledWith(1, courseId, expect.objectContaining({ pInit: 0.5, pLearn: 0.1, pGuess: 0.2, pSlip: 0.1 })));

    fireEvent.click(screen.getByRole('button', { name: /Tạo Skill/i }));
    const second = skillForm();
    fillIdentity(second, 'CUSTOM', 'Custom skill');
    setNumber(second, 'pInit', '0.2'); setNumber(second, 'pLearn', '0.3');
    setNumber(second, 'pGuess', '0.1'); setNumber(second, 'pSlip', '0.05');
    fireEvent.submit(second);
    await waitFor(() => expect(create).toHaveBeenNthCalledWith(2, courseId, expect.objectContaining({ pInit: 0.2, pLearn: 0.3, pGuess: 0.1, pSlip: 0.05 })));
  });

  it('rejects out-of-range values and pGuess + pSlip >= 1 on the client', async () => {
    vi.spyOn(knowledgeModelApi.skills, 'list').mockResolvedValue([]);
    const create = vi.spyOn(knowledgeModelApi.skills, 'create');
    renderPage(); await screen.findByText(/định nghĩa kiến thức/i);
    fireEvent.click(screen.getByRole('button', { name: /Tạo Skill/i }));
    const form = skillForm(); fillIdentity(form, 'BAD', 'Bad skill');
    setNumber(form, 'pInit', '1.1'); fireEvent.submit(form);
    expect(await screen.findByText(/nằm trong \[0, 1\]/i)).toBeInTheDocument();
    setNumber(form, 'pInit', '0.5'); setNumber(form, 'pGuess', '0.8'); setNumber(form, 'pSlip', '0.2');
    fireEvent.submit(form);
    expect(await screen.findByText(/pGuess \+ pSlip phải nhỏ hơn 1/i)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('validates required identity, every BKT range and accepts valid boundaries', async () => {
    vi.spyOn(knowledgeModelApi.skills, 'list').mockResolvedValue([]);
    const create = vi.spyOn(knowledgeModelApi.skills, 'create').mockResolvedValue({
      ...skill('boundary', 'BOUNDARY'),
      pInit: 0,
      pLearn: 1,
      pGuess: 0,
      pSlip: 0,
    });
    renderPage(); await screen.findByText(/định nghĩa kiến thức/i);
    fireEvent.click(screen.getByRole('button', { name: /Tạo Skill/i }));
    const form = skillForm();
    fireEvent.submit(form);
    expect(await screen.findByText(/Code và tên không được để trống/i)).toBeInTheDocument();
    fillIdentity(form, 'BOUNDARY', 'Boundary skill');

    for (const [field, invalid] of [
      ['pInit', '-0.01'],
      ['pLearn', '1.01'],
      ['pGuess', '-0.01'],
      ['pSlip', '1.01'],
    ] as const) {
      setNumber(form, field, invalid);
      fireEvent.submit(form);
      expect(await screen.findByText(/nằm trong \[0, 1\]/i)).toBeInTheDocument();
      setNumber(
        form,
        field,
        field === 'pInit' ? '0.5' : field === 'pLearn' ? '0.1' : field === 'pGuess' ? '0.2' : '0.1',
      );
    }

    setNumber(form, 'pInit', '0');
    setNumber(form, 'pLearn', '1');
    setNumber(form, 'pGuess', '0');
    setNumber(form, 'pSlip', '0');
    fireEvent.submit(form);
    await waitFor(() => expect(create).toHaveBeenCalledWith(courseId, expect.objectContaining({
      pInit: 0, pLearn: 1, pGuess: 0, pSlip: 0,
    })));
  });

  it('guards duplicate Skill creation while the first request is pending', async () => {
    vi.spyOn(knowledgeModelApi.skills, 'list').mockResolvedValue([]);
    let resolveCreate!: (value: Skill) => void;
    const create = vi.spyOn(knowledgeModelApi.skills, 'create').mockReturnValue(
      new Promise((resolve) => { resolveCreate = resolve; }),
    );
    renderPage(); await screen.findByText(/định nghĩa kiến thức/i);
    fireEvent.click(screen.getByRole('button', { name: /Tạo Skill/i }));
    const form = skillForm(); fillIdentity(form, 'ONCE', 'Create once');
    fireEvent.submit(form); fireEvent.submit(form);
    expect(create).toHaveBeenCalledOnce();
    expect(within(form).getByRole('button', { name: /Đang lưu/i })).toBeDisabled();
    resolveCreate(skill('once', 'ONCE'));
    expect(await screen.findByText(/ONCE.*Skill once/i)).toBeInTheDocument();
  });

  it('sends metadata and BKT edits as delta-only PATCH and skips unchanged PATCH', async () => {
    const original = skill('a', 'GRAMMAR');
    vi.spyOn(knowledgeModelApi.skills, 'list').mockResolvedValue([original]);
    const update = vi.spyOn(knowledgeModelApi.skills, 'update')
      .mockResolvedValueOnce({ ...original, name: 'Grammar updated' })
      .mockResolvedValueOnce({ ...original, name: 'Grammar updated', pLearn: 0.25 });
    renderPage(); await screen.findByText(/GRAMMAR/);
    fireEvent.click(screen.getByRole('button', { name: /^Sửa$/i }));
    let form = skillForm();
    fireEvent.change(within(form).getByLabelText('Tên'), { target: { value: 'Grammar updated' } });
    fireEvent.submit(form);
    await waitFor(() => expect(update).toHaveBeenNthCalledWith(1, original.id, { name: 'Grammar updated' }));

    fireEvent.click(screen.getByRole('button', { name: /^Sửa$/i }));
    form = skillForm(); fireEvent.submit(form);
    expect(await screen.findByText(/Không có thay đổi/i)).toBeInTheDocument();
    expect(update).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /^Sửa$/i }));
    form = skillForm(); setNumber(form, 'pLearn', '0.25'); fireEvent.submit(form);
    await waitFor(() => expect(update).toHaveBeenNthCalledWith(2, original.id, { pLearn: 0.25 }));
  });

  it('shows friendly history-freeze and referenced-delete conflicts', async () => {
    const original = skill('a', 'GRAMMAR');
    vi.spyOn(knowledgeModelApi.skills, 'list').mockResolvedValue([original]);
    vi.spyOn(knowledgeModelApi.skills, 'update').mockRejectedValue(new ApiError(409, { message: 'raw history' }));
    const remove = vi.spyOn(knowledgeModelApi.skills, 'delete').mockRejectedValue(new ApiError(409, { message: 'P2003 raw' }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage(); await screen.findByText(/GRAMMAR/);
    fireEvent.click(screen.getByRole('button', { name: /^Sửa$/i }));
    const form = skillForm(); setNumber(form, 'pLearn', '0.25'); fireEvent.submit(form);
    expect(await screen.findByText(/không thể thay đổi tham số BKT/i)).toBeInTheDocument();
    expect(screen.queryByText(/raw history/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Xóa$/i }));
    expect(await screen.findByText(/đang được câu hỏi, bài học, tiên quyết hoặc lịch sử/i)).toBeInTheDocument();
    expect(remove).toHaveBeenCalledWith(original.id);
    expect(screen.queryByText(/P2003/i)).not.toBeInTheDocument();
  });

  it('deletes an unreferenced Skill after confirmation', async () => {
    const original = skill('a', 'GRAMMAR');
    vi.spyOn(knowledgeModelApi.skills, 'list').mockResolvedValue([original]);
    vi.spyOn(knowledgeModelApi.skills, 'delete').mockResolvedValue({ message: 'ok' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage(); await screen.findByText(/GRAMMAR/);
    fireEvent.click(screen.getByRole('button', { name: /^Xóa$/i }));
    expect(await screen.findByText(/Đã xóa Skill/i)).toBeInTheDocument();
    expect(screen.queryByText(/GRAMMAR.*Skill a/i)).not.toBeInTheDocument();
  });

  it('loads prerequisites, excludes self and sends a deduplicated full set including zero', async () => {
    const target = skill('a', 'ALPHA'); const beta = skill('b', 'BETA');
    const gamma = skill('c', 'GAMMA'); const delta = skill('d', 'DELTA');
    vi.spyOn(knowledgeModelApi.skills, 'list').mockResolvedValue([target, beta, gamma, delta]);
    vi.spyOn(knowledgeModelApi.prerequisites, 'list').mockResolvedValueOnce([beta, gamma]).mockResolvedValueOnce([]);
    const replace = vi.spyOn(knowledgeModelApi.prerequisites, 'replace').mockResolvedValue([]);
    renderPage(); await screen.findByText(/ALPHA/);
    fireEvent.click(within(skillCard('ALPHA')).getByRole('button', { name: /tiên quyết/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(/ALPHA.*Skill a/i)).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(/BETA/)).toBeChecked();
    expect(within(dialog).getByLabelText(/GAMMA/)).toBeChecked();
    fireEvent.click(within(dialog).getByLabelText(/BETA/));
    fireEvent.click(within(dialog).getByLabelText(/DELTA/));
    fireEvent.click(within(dialog).getByRole('button', { name: /Lưu liên kết/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith(target.id, [gamma.id, delta.id]));

    fireEvent.click(within(skillCard('ALPHA')).getByRole('button', { name: /tiên quyết/i }));
    const second = await screen.findByRole('dialog');
    fireEvent.click(within(second).getByRole('button', { name: /Lưu liên kết/i }));
    await waitFor(() => expect(replace).toHaveBeenLastCalledWith(target.id, []));
  });

  it('surfaces cycle errors and does not show false success', async () => {
    const target = skill('a', 'ALPHA'); const beta = skill('b', 'BETA');
    vi.spyOn(knowledgeModelApi.skills, 'list').mockResolvedValue([target, beta]);
    vi.spyOn(knowledgeModelApi.prerequisites, 'list').mockResolvedValue([]);
    vi.spyOn(knowledgeModelApi.prerequisites, 'replace').mockRejectedValue(new ApiError(400, { message: 'cycle raw' }));
    renderPage(); await screen.findByText(/ALPHA/);
    fireEvent.click(within(skillCard('ALPHA')).getByRole('button', { name: /tiên quyết/i }));
    const dialog = await screen.findByRole('dialog'); fireEvent.click(within(dialog).getByLabelText(/BETA/));
    fireEvent.click(within(dialog).getByRole('button', { name: /Lưu liên kết/i }));
    expect(await within(dialog).findByText(/tạo chu trình/i)).toBeInTheDocument();
    expect(screen.queryByText(/Đã cập nhật Skill tiên quyết/i)).not.toBeInTheDocument();
  });

  it('serializes exact full-set replacement bodies at the API boundary', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    await knowledgeModelApi.prerequisites.replace('target', ['b', 'c']);
    await knowledgeModelApi.questionSkills.replace('question', ['b', 'c']);
    await knowledgeModelApi.lessonSkills.replace('lesson', []);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/instructor/skills/target/prerequisites',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ prerequisiteSkillIds: ['b', 'c'] }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/instructor/questions/question/skills',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ skillIds: ['b', 'c'] }) }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/instructor/lessons/lesson/skills',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ skillIds: [] }) }),
    );
  });
});

function renderPage(role: UserRole = 'INSTRUCTOR') {
  const value: AuthContextValue = { user: { id: 'user', email: 'u@example.test', fullName: 'User', role, status: 'ACTIVE' }, isLoading: false, error: null, login: vi.fn(), register: vi.fn(), logout: vi.fn(), refreshUser: vi.fn().mockResolvedValue(undefined) };
  return render(<MemoryRouter initialEntries={[`/instructor/courses/${courseId}/skills`]}><AuthContext.Provider value={value}><Routes><Route path="/instructor/courses/:courseId/skills" element={<RoleRoute allowedRoles={['INSTRUCTOR']}><KnowledgeModelPage /></RoleRoute>} /></Routes></AuthContext.Provider></MemoryRouter>);
}
function skillForm() { return screen.getByRole('heading', { name: /(Tạo|Sửa) Skill \(KC\)/i }).closest('form')!; }
function fillIdentity(form: HTMLElement, code: string, name: string) { fireEvent.change(within(form).getByLabelText('Code'), { target: { value: code } }); fireEvent.change(within(form).getByLabelText('Tên'), { target: { value: name } }); }
function setNumber(form: HTMLElement, name: string, value: string) { fireEvent.change(within(form).getByLabelText(name), { target: { value } }); }
function skillCard(code: string) { return screen.getByText(new RegExp(code)).closest('article')!; }
function skill(id: string, code: string): Skill { return { id: `skill-${id}`, courseId, code, name: `Skill ${id}`, description: null, pInit: 0.5, pLearn: 0.1, pGuess: 0.2, pSlip: 0.1, createdAt: '', updatedAt: '' }; }
