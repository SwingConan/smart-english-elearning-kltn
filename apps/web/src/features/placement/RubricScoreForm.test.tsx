import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RubricScoreForm } from './RubricScoreForm';
import type { WorkflowReview } from './workflow-api';

afterEach(cleanup);
const review: WorkflowReview = {
  mode: 'FOUR_SKILLS',
  attemptId: 'a',
  state: 'SUBMITTED',
  evaluations: [],
  tasks: [
    {
      groupId: 'writing',
      questionId: 'q',
      skill: 'WRITING',
      prompt: 'Original task',
      text: 'Original response',
      recordingUrl: null,
    },
  ],
  rubrics: [
    {
      id: 'approved',
      kind: 'RUBRIC',
      mode: 'FOUR_SKILLS',
      sourceId: 'source',
      approvedById: 'checker',
      body: {
        tasks: [
          {
            groupId: 'writing',
            criteria: [
              { code: 'CONTENT', descriptor: 'Answers the original task', max: 4 },
              { code: 'LANGUAGE', descriptor: 'Accuracy', max: 3 },
            ],
          },
        ],
      },
    },
  ],
};
describe('original-response rubric scoring', () => {
  it('requires every criterion, bounds, evidence and an explicit attestation; submits the approved task structure', async () => {
    const submit = vi.fn().mockResolvedValue(true);
    render(
      <RubricScoreForm
        review={review}
        rubricId="approved"
        skill="WRITING"
        busy={false}
        onSubmit={submit}
      />,
    );
    const save = screen.getByRole('button', { name: /Xác nhận điểm chấm cuối/ });
    expect(save).toBeDisabled();
    for (const code of ['CONTENT', 'LANGUAGE']) {
      fireEvent.change(screen.getByLabelText(new RegExp('^Điểm ' + code)), {
        target: { value: '2.5' },
      });
      fireEvent.change(screen.getByLabelText('Chứng cứ ' + code + ' · Bài 1'), {
        target: { value: 'Original sentence addresses the task.' },
      });
      fireEvent.change(screen.getByLabelText('Phản hồi ' + code + ' · Bài 1'), {
        target: { value: 'Support the announcement with more details.' },
      });
    }
    fireEvent.change(screen.getByLabelText('Lý do xác nhận/sửa bản chấm'), {
      target: { value: 'Reviewed the original writing response.' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    expect(save).toBeEnabled();
    fireEvent.change(screen.getByLabelText(/^Điểm LANGUAGE/), { target: { value: '4' } });
    expect(save).toBeDisabled();
    expect(screen.getByRole('checkbox')).not.toBeChecked();
    fireEvent.change(screen.getByLabelText(/^Điểm LANGUAGE/), { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(save);
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0][0].writing).toEqual([
      expect.objectContaining({ code: 'CONTENT', score: 2.5 }),
      expect.objectContaining({ code: 'LANGUAGE', score: 2.5 }),
    ]);
  });
  it('cannot sign a skill without approved task criteria', () => {
    render(
      <RubricScoreForm
        review={review}
        rubricId="approved"
        skill="SPEAKING"
        busy={false}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('button')).toBeDisabled();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });
});
