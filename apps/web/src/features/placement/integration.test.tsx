import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PlacementIntegrationPage,
  PlacementDiagnosticPage,
  PlacementPreviewExamPage,
} from '@/pages/PlacementIntegrationPage';
const state = vi.hoisted(() => ({
  user: { id: 'learner', role: 'STUDENT' } as { id: string; role: string } | null,
}));
vi.mock('@/features/auth/auth-context', () => ({ useAuth: () => state }));
vi.mock('@/features/placement/DoublePromptAnswer', () => ({
  DoublePromptAnswer: () => <p>Existing durable S10 protocol</p>,
}));
const api = vi.hoisted(() => ({
  config: vi.fn(),
  history: vi.fn(),
  start: vi.fn(),
  exam: vi.fn(),
  write: vi.fn(),
  diagnostic: vi.fn(),
}));
vi.mock('./integration-api', () => ({ placementIntegration: api }));
function page(component: React.ReactNode, path = '/placement') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/placement" element={<PlacementIntegrationPage />} />
        <Route path="/placement/previews/:attemptId/exam" element={component} />
        <Route path="/placement/previews/:attemptId/result" element={component} />
        <Route path="/login" element={<p>Login</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
beforeEach(() => {
  sessionStorage.clear();
  state.user = { id: 'learner', role: 'STUDENT' };
  vi.clearAllMocks();
  api.config.mockResolvedValue({
    modes: ['LR', 'FOUR_SKILLS'],
    previewEnabled: true,
    fullExamEnabled: false,
    sources: [{ id: 'v', mode: 'LR', title: 'DEV only', itemCount: 2 }],
    message: 'Real source blocked',
  });
  api.history.mockResolvedValue([]);
});
afterEach(cleanup);
describe('W04A actual wizard contract', () => {
  it('requires login before fetching configuration or starting', () => {
    state.user = null;
    page(<PlacementIntegrationPage />);
    expect(screen.getByRole('link', { name: 'Đăng nhập để tiếp tục' })).toBeVisible();
    expect(api.config).not.toHaveBeenCalled();
  });
  it('has mode→independent goals, no selfLevel, and retains0 SW goal across refresh', async () => {
    page(<PlacementIntegrationPage />);
    await screen.findByText('Real source blocked');
    fireEvent.click(screen.getByRole('radio', { name: /Bốn kỹ năng/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục đến mục tiêu' }));
    fireEvent.change(screen.getByLabelText('Mục tiêu Listening & Reading (10–990)'), {
      target: { value: '650' },
    });
    fireEvent.change(screen.getByLabelText('Mục tiêu Speaking (0–200)'), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByLabelText('Mục tiêu Writing (0–200)'), {
      target: { value: '175' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục đến hướng dẫn' }));
    expect(screen.getByText(/Speaking: 0 · Writing: 175/)).toBeVisible();
    expect(screen.queryByText(/Trình độ hiện tại|Tôi chưa biết trình độ/)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        JSON.parse(sessionStorage.getItem('smart-english:placement-v2:learner')!).goalSpeaking,
      ).toBe('0'),
    );
    cleanup();
    page(<PlacementIntegrationPage />);
    await screen.findByText(/Speaking: 0 · Writing: 175/);
    expect(screen.getByRole('button', { name: 'Bài thi thật chưa đủ điều kiện' })).toBeDisabled();
  });
  it('mode switch clears SW inputs rather than inferring new ones', async () => {
    page(<PlacementIntegrationPage />);
    await screen.findByText('Real source blocked');
    fireEvent.click(screen.getByRole('radio', { name: /Bốn kỹ năng/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục đến mục tiêu' }));
    fireEvent.change(screen.getByLabelText('Mục tiêu Speaking (0–200)'), {
      target: { value: '150' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại chọn hình thức' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Listening & Reading' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp tục đến mục tiêu' }));
    expect(screen.queryByLabelText('Mục tiêu Speaking (0–200)')).not.toBeInTheDocument();
    expect(api.start).not.toHaveBeenCalled();
  });
  it('guest/staff cannot gain learner actions from a tile or role label', () => {
    state.user = { id: 'teacher', role: 'INSTRUCTOR' };
    page(<PlacementIntegrationPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('học viên');
    expect(api.config).not.toHaveBeenCalled();
  });
  it('does not retain another account draft', async () => {
    sessionStorage.setItem(
      'smart-english:placement-v2:other',
      JSON.stringify({
        version: 2,
        mode: 'LR',
        goalLR: '990',
        goalSpeaking: '',
        goalWriting: '',
        step: 3,
      }),
    );
    page(<PlacementIntegrationPage />);
    await screen.findByText('Real source blocked');
    expect(screen.getByText('Bước 1/3: Chọn hình thức')).toBeVisible();
  });
  it('result scaffold keeps pending/null separate from scores and no invented matching', async () => {
    api.diagnostic.mockResolvedValue({
      attemptId: 'a',
      mode: 'FOUR_SKILLS',
      state: 'PENDING',
      label: 'CHƯA ĐỦ DỮ LIỆU',
      goals: { goalLR: 650, goalSpeaking: 0, goalWriting: 175 },
      score: null,
      receipt: 'receipt',
      skillResults: ['LISTENING', 'READING', 'SPEAKING', 'WRITING'].map((skill) => ({
        skill,
        status:
          skill === 'SPEAKING' || skill === 'WRITING' ? 'PENDING_EVALUATION' : 'INSUFFICIENT_DATA',
        score: null,
      })),
      recommendations: [],
    });
    page(<PlacementDiagnosticPage />, '/placement/previews/a/result');
    await screen.findByRole('heading', { name: 'CHƯA ĐỦ DỮ LIỆU' });
    expect(screen.getAllByText('Chưa có điểm được phép công bố.')).toHaveLength(4);
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    expect(screen.getByText(/Không gợi ý lớp/)).toBeVisible();
  });
  it('preview Mark uses a persistent command separately from selected answers and preserves retry UUID', async () => {
    api.exam.mockResolvedValue({
      attemptId: 'a',
      state: 'DEV_PREVIEW',
      title: 'Private ungraded preview',
      lockVersion: 0,
      marked: [],
      groups: [
        {
          id: 'g',
          skill: 'READING',
          stimuli: [],
          questions: [
            {
              testQuestionId: 'q',
              content: 'Original preview prompt',
              responseType: 'SINGLE_CHOICE',
              options: [{ id: 'o', content: 'Option' }],
              selectedOptionIds: [],
              textResponse: null,
              audioUploaded: false,
            },
          ],
        },
      ],
    });
    api.write.mockRejectedValue(new Error('Lost ACK'));
    page(<PlacementPreviewExamPage />, '/placement/previews/a/exam');
    await screen.findByText('Original preview prompt');
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu Mark' }));
    await screen.findByRole('alert');
    expect(api.write.mock.calls[0][2]).toBe('marks');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại yêu cầu chưa xác nhận' }));
    await waitFor(() => expect(api.write).toHaveBeenCalledTimes(2));
    expect(api.write.mock.calls[0][3]).toEqual(api.write.mock.calls[1][3]);
    expect(api.write.mock.calls[0][3].marked).toBe(true);
  });
  it('confirmed Mark refreshes the server cursor and unlocks the next answer',async()=>{
    const first={attemptId:'a',state:'DEV_PREVIEW',title:'Original ungraded preview',lockVersion:0,marked:[],groups:[{id:'g',skill:'READING',stimuli:[],questions:[{testQuestionId:'q',content:'Original prompt',responseType:'SINGLE_CHOICE',options:[{id:'o',content:'Option'}],selectedOptionIds:[],textResponse:null,audioUploaded:false}]}]};
    api.exam.mockReset().mockResolvedValueOnce(first).mockResolvedValue({...first,lockVersion:1,marked:['q']});
    api.write.mockResolvedValue({state:'SAVED',lockVersion:1,receipt:null});
    page(<PlacementPreviewExamPage/>,'/placement/previews/a/exam');await screen.findByText('Original prompt');
    fireEvent.click(screen.getByRole('button',{name:'Đánh dấu Mark'}));
    await waitFor(()=>expect(screen.getByRole('radio',{name:'Option'})).toBeEnabled());
    await screen.findByRole('button',{name:'Bỏ Mark'});
    fireEvent.click(screen.getByRole('radio',{name:'Option'}));
    await waitFor(()=>expect(api.write).toHaveBeenCalledTimes(2));
    expect(api.write.mock.calls[1][2]).toBe('answers');expect(api.write.mock.calls[1][3].expectedLockVersion).toBe(1);
  });
});
