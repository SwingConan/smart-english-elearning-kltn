import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LessonEditorDialog } from './LessonEditorDialog';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LessonEditorDialog', () => {
  it('authors objectives, canonical task focus and safe Markdown with unsaved-change protection', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<LessonEditorDialog isSaving={false} lesson={null} onCancel={vi.fn()} onSave={onSave} serverError={null} />);

    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'Part 1 foundations' } });
    fireEvent.click(screen.getByRole('button', { name: 'Listening' }));
    fireEvent.click(screen.getByLabelText(/Part 1 · Photographs/i));
    fireEvent.change(screen.getByLabelText('Mục tiêu 1'), { target: { value: ' Identify the subject ' } });
    fireEvent.change(screen.getByLabelText('Nội dung Markdown'), {
      target: { value: '## Focus\n\n<script>alert("unsafe")</script>' },
    });

    expect(screen.getByTestId('safe-markdown')).toHaveTextContent('<script>alert("unsafe")</script>');
    expect(document.querySelector('script')).toBeNull();
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Lưu bài học' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Part 1 foundations',
      learningObjectives: ['Identify the subject'],
      focusSkills: ['LISTENING'],
      focusTaskCodes: ['L1_PHOTOGRAPH'],
      contentMarkdown: '## Focus\n\n<script>alert("unsafe")</script>',
    })));
  });

  it('blocks incompatible skill/task input and renders server/loading feedback', () => {
    const view = render(<LessonEditorDialog isSaving={false} lesson={null} onCancel={vi.fn()} onSave={vi.fn()} serverError="Server rejected update" />);
    fireEvent.change(screen.getByLabelText('Tiêu đề'), { target: { value: 'Reading task' } });
    fireEvent.click(screen.getByLabelText(/Part 7 · Reading Comprehension/i));
    expect(screen.getByRole('alert')).toHaveTextContent('Task Reading yêu cầu chọn kỹ năng Reading');
    expect(screen.getByRole('button', { name: 'Lưu bài học' })).toBeDisabled();

    view.rerender(<LessonEditorDialog isSaving lesson={null} onCancel={vi.fn()} onSave={vi.fn()} serverError={null} />);
    expect(screen.getByRole('button', { name: 'Đang lưu…' })).toBeDisabled();
  });
});
