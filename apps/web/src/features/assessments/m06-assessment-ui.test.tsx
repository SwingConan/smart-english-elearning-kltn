import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssessmentGradingDetailPage } from '@/pages/AssessmentGradingDetailPage';
import { AssessmentGradingQueuePage } from '@/pages/AssessmentGradingQueuePage';
import { ClassAssessmentManagementPage } from '@/pages/ClassAssessmentManagementPage';
import { ProgressPage } from '@/pages/ProgressPage';
import { AudioRecorder, StudentTestAttemptPage } from '@/pages/StudentTestAttemptPage';
import { StudentTestResultPage } from '@/pages/StudentTestResultPage';
import { deferred, renderAssessmentRoute } from './assessment-test-utils';
import { classAssessmentApi, studentAssessmentApi } from './api';
import { learningApi } from '@/features/learning/api';
import type { GradingDetail, GradingQueue, StudentAttemptContent, StudentAttemptResult } from './types';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('M06 four-skill assessment UI', () => {
  it('uses a focused skill navigator without rendering raw task codes', async () => {
    vi.spyOn(studentAssessmentApi, 'getAttempt').mockResolvedValue(content());
    renderAttempt();
    expect(await screen.findByText(/Writing task/)).toBeInTheDocument();
    expect(screen.queryByText(/Speaking task/)).not.toBeInTheDocument();
    expect(screen.queryByText('M06-WRITE-01')).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /Câu 2/ })[0]);
    expect(await screen.findByText(/Speaking task/)).toBeInTheDocument();
    expect(screen.queryByText(/Writing task/)).not.toBeInTheDocument();
  });

  it('initializes a bounded timer from the current time', async () => {
    const timed = content();
    timed.attempt.expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    vi.spyOn(studentAssessmentApi, 'getAttempt').mockResolvedValue(timed);
    renderAttempt();
    expect(await screen.findByText(/29:5\d|30:00/)).toBeInTheDocument();
    expect(screen.queryByText(/\d{6,}:/)).not.toBeInTheDocument();
  });

  it('serializes Writing saves so the newest revision wins', async () => {
    vi.spyOn(studentAssessmentApi, 'getAttempt').mockResolvedValue(writingContent());
    const first = deferred<{ attemptId: string; answers: [] }>();
    const second = deferred<{ attemptId: string; answers: [] }>();
    const save = vi.spyOn(studentAssessmentApi, 'saveAnswers').mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderAttempt();
    const textarea = await screen.findByPlaceholderText('Nhập câu trả lời của bạn...');
    vi.useFakeTimers();
    fireEvent.change(textarea, { target: { value: 'Revision A' } });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(save).toHaveBeenCalledTimes(1);
    fireEvent.change(textarea, { target: { value: 'Revision B is newest' } });
    await act(async () => { first.resolve({ attemptId: 'a1', answers: [] }); await Promise.resolve(); });
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][2]).toEqual([expect.objectContaining({ textResponse: 'Revision B is newest' })]);
    await act(async () => { second.resolve({ attemptId: 'a1', answers: [] }); await Promise.resolve(); });
    expect(screen.getByText('Đã lưu')).toBeInTheDocument();
  });

  it('awaits an in-flight autosave before manual submit', async () => {
    vi.spyOn(studentAssessmentApi, 'getAttempt').mockResolvedValue(writingContent());
    const saving = deferred<{ attemptId: string; answers: [] }>();
    vi.spyOn(studentAssessmentApi, 'saveAnswers').mockReturnValue(saving.promise);
    const submit = vi.spyOn(studentAssessmentApi, 'submit').mockResolvedValue({ attempt: { id: 'a1', attemptNumber: 1, status: 'SUBMITTED', startedAt: '', submittedAt: '' }, test: { id: 't1', title: 'Kiểm tra giữa kỳ', type: 'IN_CLASS' }, resultAvailable: true });
    renderAttempt();
    const textarea = await screen.findByPlaceholderText('Nhập câu trả lời của bạn...');
    vi.useFakeTimers();
    fireEvent.change(textarea, { target: { value: 'Latest answer' } });
    await act(async () => { vi.advanceTimersByTime(500); });
    fireEvent.click(screen.getByRole('button', { name: /^Nộp bài$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận nộp' }));
    expect(submit).not.toHaveBeenCalled();
    await act(async () => { saving.resolve({ attemptId: 'a1', answers: [] }); await Promise.resolve(); await Promise.resolve(); });
    expect(submit).toHaveBeenCalledWith('e1', 'a1', [expect.objectContaining({ textResponse: 'Latest answer' })]);
  });

  it('preserves committed Speaking audio when re-record upload fails and draft is discarded', async () => {
    installRecorder();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:new-draft');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const upload = vi.fn().mockRejectedValue(new Error('upload failed'));
    render(<AudioRecorder disabled={false} initialCommitted initialPlaybackUrl="/api/committed" preparationSeconds={0} maxSeconds={30} onUpload={upload} onStateChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Ghi lại' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu ghi âm' })); await Promise.resolve(); });
    fireEvent.click(await screen.findByRole('button', { name: 'Dừng' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu câu trả lời' }));
    expect(await screen.findByText(/Bản ghi đã lưu trước đó vẫn được giữ/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ bản ghi mới' }));
    expect(document.querySelector('audio')?.getAttribute('src')).toBe('/api/committed');
    expect(revoke).toHaveBeenCalledWith('blob:new-draft');
  });

  it('enforces max recording duration and tears down media tracks on unmount', async () => {
    vi.useFakeTimers();
    const { stopTrack, recorderStop } = installRecorder();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:draft');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const view = render(<AudioRecorder disabled={false} initialCommitted={false} initialPlaybackUrl={null} preparationSeconds={0} maxSeconds={1} onUpload={vi.fn()} onStateChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu chuẩn bị' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu ghi âm' })); await Promise.resolve(); });
    expect(screen.getByRole('button', { name: 'Dừng' })).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(1100); });
    expect(recorderStop).toHaveBeenCalledTimes(1);
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Lưu câu trả lời' })).toBeInTheDocument();
    view.unmount();
    expect(stopTrack).toHaveBeenCalledTimes(1);
  });

  it('blocks submission while Speaking is recording or uploading', async () => {
    installRecorder();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:draft');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    vi.spyOn(studentAssessmentApi, 'getAttempt').mockResolvedValue(speakingContent());
    const uploading = deferred<{ playbackUrl: string; state: 'UPLOADED' }>();
    vi.spyOn(studentAssessmentApi, 'uploadAudio').mockReturnValue(uploading.promise);
    renderAttempt();
    fireEvent.click(await screen.findByRole('button', { name: 'Bắt đầu chuẩn bị' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu ghi âm' })); await Promise.resolve(); });
    expect(screen.getByRole('button', { name: /^Nộp bài$/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Dừng' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Lưu câu trả lời' }));
    expect(screen.getByRole('button', { name: /^Nộp bài$/ })).toBeDisabled();
    await act(async () => { uploading.resolve({ playbackUrl: '/api/new', state: 'UPLOADED' }); await Promise.resolve(); });
    await waitFor(() => expect(screen.getByRole('button', { name: /^Nộp bài$/ })).toBeEnabled());
  });

  it('allows partial grading drafts with criterion feedback and requires full final scores', async () => {
    vi.spyOn(classAssessmentApi, 'gradingDetail').mockResolvedValue(gradingDetail());
    const grade = vi.spyOn(classAssessmentApi, 'gradeAnswer').mockResolvedValue({});
    renderAssessmentRoute(<AssessmentGradingDetailPage />, '/instructor/classes/c1/assessments/ca1/attempts/a1/grading', '/instructor/classes/:classOfferingId/assessments/:classAssessmentId/attempts/:attemptId/grading', { role: 'INSTRUCTOR' });
    fireEvent.change((await screen.findAllByLabelText(/Điểm/))[0], { target: { value: '3' } });
    fireEvent.change(screen.getAllByLabelText('Nhận xét tiêu chí')[0], { target: { value: 'Rõ ý' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(grade).toHaveBeenCalledWith('c1', 'ca1', 'a1', 'tq1', expect.objectContaining({ finalize: false, criteria: [{ rubricCriterionId: 'r1', score: '3', feedback: 'Rõ ý' }] })));
    grade.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận điểm cuối' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/tất cả tiêu chí/);
    expect(grade).not.toHaveBeenCalled();
  });

  it('filters the grading queue and shows Listening/Reading snapshots', async () => {
    vi.spyOn(classAssessmentApi, 'gradingQueue').mockResolvedValue(gradingQueue());
    renderAssessmentRoute(<AssessmentGradingQueuePage />, '/instructor/classes/c1/assessments/ca1/grading', '/instructor/classes/:classOfferingId/assessments/:classAssessmentId/grading', { role: 'INSTRUCTOR' });
    expect((await screen.findAllByText('L 75% · R 63%')).length).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: 'Đã chấm' }));
    expect(screen.getByText('Learner Final')).toBeInTheDocument();
    expect(screen.queryByText('Learner Waiting')).not.toBeInTheDocument();
  });

  it('edits scheduling fields only for an assessment with no attempts', async () => {
    vi.spyOn(classAssessmentApi, 'list').mockResolvedValue({ classOffering: { id: 'c1', code: 'C1', name: 'Class', course: { id: 'course', title: 'Course' } }, availableTests: [], assessments: [{ id: 'ca1', stage: 'MIDTERM', openAt: null, closeAt: null, maxAttemptsOverride: 1, isActive: true, submissionCount: 0, pendingGradingCount: 0, attemptCount: 0, test: { id: 't1', title: 'Kiểm tra giữa kỳ', maxAttempts: 1, timeLimitMinutes: 30, _count: { testQuestions: 11 } } }] });
    const update = vi.spyOn(classAssessmentApi, 'update').mockResolvedValue({});
    renderAssessmentRoute(<ClassAssessmentManagementPage />, '/instructor/classes/c1/assessments', '/instructor/classes/:classOfferingId/assessments', { role: 'INSTRUCTOR' });
    fireEvent.click(await screen.findByRole('button', { name: 'Chỉnh sửa lịch' }));
    fireEvent.change(screen.getAllByLabelText('Loại đánh giá')[1], { target: { value: 'FINAL' } });
    fireEvent.change(screen.getAllByLabelText('Số lượt tối đa')[1], { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu lịch' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('c1', 'ca1', expect.objectContaining({ stage: 'FINAL', maxAttemptsOverride: 2 })));
  });

  it('shows truthful four-skill assessment snapshots in progress history', async () => {
    vi.spyOn(learningApi, 'getProgress').mockResolvedValue({ enrollmentId: 'e1', courseTitle: 'Course', totalLessons: 0, completedLessons: 0, progressPercent: 0, modules: [], assessments: [{ id: 'ca1', testId: 't1', title: 'Kiểm tra giữa kỳ', purpose: 'IN_CLASS', stage: 'MIDTERM', openAt: null, closeAt: null, status: 'COMPLETED', attemptId: 'a1', submittedAt: '2026-10-03T00:00:00Z', skillResults: [{ skill: 'LISTENING', state: 'FINAL', normalizedScore: 80 }, { skill: 'READING', state: 'FINAL', normalizedScore: 70.5 }, { skill: 'SPEAKING', state: 'PENDING_REVIEW', normalizedScore: null }, { skill: 'WRITING', state: 'MISSING_RESPONSE', normalizedScore: null }] }] });
    renderAssessmentRoute(<ProgressPage />, '/student/enrollments/e1/progress', '/student/enrollments/:enrollmentId/progress');
    expect(await screen.findByText('80%')).toBeInTheDocument();
    expect(screen.getByText('70.5%')).toBeInTheDocument();
    expect(screen.getByText('Chờ chấm')).toBeInTheDocument();
    expect(screen.getByText('Chưa có câu trả lời')).toBeInTheDocument();
  });

  it('renders retryable load errors instead of perpetual loading', async () => {
    vi.spyOn(classAssessmentApi, 'list').mockRejectedValue(new Error('network'));
    renderAssessmentRoute(<ClassAssessmentManagementPage />, '/instructor/classes/c1/assessments', '/instructor/classes/:classOfferingId/assessments', { role: 'INSTRUCTOR' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải lịch bài kiểm tra');
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    cleanup();
    vi.spyOn(classAssessmentApi, 'gradingDetail').mockRejectedValue(new Error('network'));
    renderAssessmentRoute(<AssessmentGradingDetailPage />, '/instructor/classes/c1/assessments/ca1/attempts/a1/grading', '/instructor/classes/:classOfferingId/assessments/:classAssessmentId/attempts/:attemptId/grading', { role: 'INSTRUCTOR' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể tải bài làm để chấm');
  });

  it('never fabricates an overall total while productive skills are pending', async () => {
    vi.spyOn(studentAssessmentApi, 'getResult').mockResolvedValue(pendingResult());
    renderAssessmentRoute(<StudentTestResultPage />, '/student/enrollments/e1/attempts/a1/result', '/student/enrollments/:enrollmentId/attempts/:attemptId/result');
    expect(await screen.findByText(/Tổng điểm đang chờ/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Chờ giảng viên chấm/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText(/NaN|0\/0/)).not.toBeInTheDocument();
  });
});

function renderAttempt() { return renderAssessmentRoute(<StudentTestAttemptPage />, '/student/enrollments/e1/attempts/a1', '/student/enrollments/:enrollmentId/attempts/:attemptId'); }
function question(id: string, responseType: 'TEXT_RESPONSE' | 'AUDIO_RESPONSE', skill: 'WRITING' | 'SPEAKING', text: string) { return { testQuestionId: id, points: 10, selectedOptionIds: [], textResponse: '', audioUploaded: false, question: { id: `q-${id}`, type: responseType, responseType, toeicSkill: skill, difficulty: 'MEDIUM' as const, content: text, options: [] } }; }
function content(): StudentAttemptContent { return { attempt: { id: 'a1', attemptNumber: 1, status: 'IN_PROGRESS', startedAt: '2026-10-03T00:00:00Z', submittedAt: null }, test: { id: 't1', title: 'Kiểm tra giữa kỳ', type: 'IN_CLASS', purpose: 'IN_CLASS', stage: 'MIDTERM', timeLimitMinutes: 30 }, groups: [{ id: 'g1', skill: 'WRITING', orderIndex: 0, title: 'Writing', instructions: null, taskCode: 'M06-WRITE-01', preparationSeconds: null, responseSeconds: null, recommendedSeconds: null, maxRecordingSeconds: null, stimulusText: null, stimuli: [], questions: [question('w1', 'TEXT_RESPONSE', 'WRITING', 'Writing task')] }, { id: 'g2', skill: 'SPEAKING', orderIndex: 1, title: 'Speaking', instructions: null, taskCode: 'M06-SPEAK-01', preparationSeconds: 0, responseSeconds: 30, recommendedSeconds: null, maxRecordingSeconds: 30, stimulusText: null, stimuli: [], questions: [question('s1', 'AUDIO_RESPONSE', 'SPEAKING', 'Speaking task')] }] }; }
function writingContent(): StudentAttemptContent { const value = content(); return { ...value, groups: [value.groups![0]] }; }
function speakingContent(): StudentAttemptContent { const value = content(); return { ...value, groups: [value.groups![1]] }; }
function installRecorder() { const stopTrack = vi.fn(); const recorderStop = vi.fn(); class FakeMediaRecorder { static isTypeSupported() { return true; } mimeType = 'audio/webm'; state = 'inactive'; ondataavailable: ((event: { data: Blob }) => void) | null = null; onstop: (() => void) | null = null; start() { this.state = 'recording'; } stop() { this.state = 'inactive'; recorderStop(); this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) }); this.onstop?.(); } } vi.stubGlobal('MediaRecorder', FakeMediaRecorder); vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) } }); return { stopTrack, recorderStop }; }
function gradingDetail(): GradingDetail { return { id: 'a1', attemptNumber: 1, submittedAt: '2026-10-03T00:00:00Z', learner: { id: 'l1', fullName: 'Learner', email: 'l@test' }, test: { id: 't1', title: 'Kiểm tra giữa kỳ' }, answers: [{ id: 'ans1', textResponse: 'Response', audioUrl: null, pointsAwarded: null, testQuestion: { id: 'tq1', points: 10, orderIndex: 0, question: { content: 'Write', responseType: 'TEXT_RESPONSE', toeicSkill: 'WRITING', rubric: { id: 'rubric', name: 'Writing rubric', criteria: [{ id: 'r1', name: 'Ý', description: null, orderIndex: 0, maxScore: 4, weight: 1 }, { id: 'r2', name: 'Ngôn ngữ', description: null, orderIndex: 1, maxScore: 4, weight: 1 }] } } }, evaluation: null }] }; }
function gradingQueue(): GradingQueue { const base = { attemptNumber: 1, submittedAt: '2026-10-03T00:00:00Z', skillScores: [{ skill: 'LISTENING' as const, normalizedScore: 75, status: 'FINAL', source: 'OBJECTIVE_AUTO' }, { skill: 'READING' as const, normalizedScore: 63, status: 'FINAL', source: 'OBJECTIVE_AUTO' }] }; return { assessment: { id: 'ca1', stage: 'MIDTERM', test: { id: 't1', title: 'Kiểm tra giữa kỳ' }, classOffering: { id: 'c1', code: 'C1', name: 'Class', course: { id: 'course', title: 'Course' } } }, submissions: [{ ...base, id: 'a1', learner: { id: 'l1', fullName: 'Learner Waiting', email: 'w@test' }, gradingState: 'SUBMITTED_PENDING_REVIEW' }, { ...base, id: 'a2', learner: { id: 'l2', fullName: 'Learner Final', email: 'f@test' }, gradingState: 'REVIEWED_FINAL' }] }; }
function pendingResult(): StudentAttemptResult { return { attempt: { id: 'a1', attemptNumber: 1, status: 'SUBMITTED', score: 8, maxScore: 8, percentage: 100, startedAt: '2026-10-03T00:00:00Z', submittedAt: '2026-10-03T00:20:00Z' }, test: { id: 't1', title: 'Kiểm tra giữa kỳ', type: 'IN_CLASS', purpose: 'IN_CLASS', stage: 'MIDTERM' }, gradingState: 'SUBMITTED_PENDING_REVIEW', total: null, skills: [{ skill: 'LISTENING', state: 'FINAL', status: 'FINAL', source: 'OBJECTIVE_AUTO', rawScore: 4, maxRawScore: 4, normalizedScore: 100 }, { skill: 'READING', state: 'FINAL', status: 'FINAL', source: 'OBJECTIVE_AUTO', rawScore: 4, maxRawScore: 4, normalizedScore: 100 }, { skill: 'SPEAKING', state: 'PENDING_REVIEW', status: null, source: null, rawScore: null, maxRawScore: 10, normalizedScore: null }, { skill: 'WRITING', state: 'PENDING_REVIEW', status: null, source: null, rawScore: null, maxRawScore: 10, normalizedScore: null }], questions: [] }; }
