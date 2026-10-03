import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudentTestAttemptPage } from '@/pages/StudentTestAttemptPage';
import { StudentTestResultPage } from '@/pages/StudentTestResultPage';
import { renderAssessmentRoute } from './assessment-test-utils';
import { studentAssessmentApi } from './api';
import type { StudentAttemptContent, StudentAttemptResult } from './types';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('M06 four-skill assessment UI', () => {
  it('renders grouped Writing and Speaking response controls with a real submit dialog', async () => {
    vi.spyOn(studentAssessmentApi, 'getAttempt').mockResolvedValue(content());
    renderAssessmentRoute(<StudentTestAttemptPage />, '/student/enrollments/e1/attempts/a1', '/student/enrollments/:enrollmentId/attempts/:attemptId');
    expect(await screen.findByText('Writing task')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Nhập câu trả lời/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Bắt đầu ghi âm/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Nộp bài$/i }));
    expect(screen.getByRole('dialog')).toHaveTextContent(/Xác nhận nộp bài/i);
  });

  it('never fabricates an overall total while productive skills are pending', async () => {
    vi.spyOn(studentAssessmentApi, 'getResult').mockResolvedValue(pendingResult());
    renderAssessmentRoute(<StudentTestResultPage />, '/student/enrollments/e1/attempts/a1/result', '/student/enrollments/:enrollmentId/attempts/:attemptId/result');
    expect(await screen.findByText(/Tổng điểm đang chờ/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Chờ giảng viên chấm/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/NaN|0\/0/)).not.toBeInTheDocument();
  });
});

function content(): StudentAttemptContent { const question = (id: string, responseType: 'TEXT_RESPONSE' | 'AUDIO_RESPONSE', skill: 'WRITING' | 'SPEAKING', contentText: string) => ({ testQuestionId: id, points: 10, selectedOptionIds: [], textResponse: '', audioUploaded: false, question: { id: `q-${id}`, type: responseType, responseType, toeicSkill: skill, difficulty: 'MEDIUM' as const, content: contentText, options: [] } }); return { attempt: { id: 'a1', attemptNumber: 1, status: 'IN_PROGRESS', startedAt: '2026-10-03T00:00:00Z', submittedAt: null }, test: { id: 't1', title: 'Giữa kỳ', type: 'IN_CLASS', purpose: 'IN_CLASS', stage: 'MIDTERM', timeLimitMinutes: 30 }, groups: [{ id: 'g1', skill: 'WRITING', orderIndex: 0, title: 'Writing', instructions: null, taskCode: null, preparationSeconds: null, responseSeconds: null, recommendedSeconds: null, maxRecordingSeconds: null, stimulusText: null, stimuli: [], questions: [question('w1', 'TEXT_RESPONSE', 'WRITING', 'Writing task')] }, { id: 'g2', skill: 'SPEAKING', orderIndex: 1, title: 'Speaking', instructions: null, taskCode: null, preparationSeconds: null, responseSeconds: null, recommendedSeconds: null, maxRecordingSeconds: 60, stimulusText: null, stimuli: [], questions: [question('s1', 'AUDIO_RESPONSE', 'SPEAKING', 'Speaking task')] }] }; }
function pendingResult(): StudentAttemptResult { return { attempt: { id: 'a1', attemptNumber: 1, status: 'SUBMITTED', score: 8, maxScore: 8, percentage: 100, startedAt: '2026-10-03T00:00:00Z', submittedAt: '2026-10-03T00:20:00Z' }, test: { id: 't1', title: 'Giữa kỳ', type: 'IN_CLASS', purpose: 'IN_CLASS', stage: 'MIDTERM' }, gradingState: 'SUBMITTED_PENDING_REVIEW', total: null, skills: [{ skill: 'LISTENING', state: 'FINAL', status: 'FINAL', source: 'OBJECTIVE_AUTO', rawScore: 4, maxRawScore: 4, normalizedScore: 100 }, { skill: 'READING', state: 'FINAL', status: 'FINAL', source: 'OBJECTIVE_AUTO', rawScore: 4, maxRawScore: 4, normalizedScore: 100 }, { skill: 'SPEAKING', state: 'PENDING_REVIEW', status: null, source: null, rawScore: null, maxRawScore: 10, normalizedScore: null }, { skill: 'WRITING', state: 'PENDING_REVIEW', status: null, source: null, rawScore: null, maxRawScore: 10, normalizedScore: null }], questions: [] }; }
