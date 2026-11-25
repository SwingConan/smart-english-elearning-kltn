import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/App';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import type { UserRole } from '@/features/auth/api';
import { academicApi } from './api';
import { planningApi, type Assignment, type Session, type Version } from './planning-api';
function app(role: UserRole, path: string) {
  const ctx: AuthContextValue = {
    user: {
      id: 'self',
      email: 'synthetic@example.invalid',
      fullName: 'Synthetic W02B',
      role,
      status: 'ACTIVE',
    },
    isLoading: false,
    error: null,
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    refreshUser: vi.fn(),
  };
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthContext.Provider value={ctx}>
        <App />
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const assignment = {
  id: 'a',
  proposedBy: 'other',
  state: 'PENDING_APPROVAL',
  lockVersion: 3,
  reason: 'Synthetic assignment reason',
  classOfferingId: 'class',
  instructorId: 'teacher',
  effectiveFrom: '2027-01-01T10:00:00Z',
  effectiveTo: '2027-02-01T10:00:00Z',
  instructor: { id: 'teacher', fullName: 'Approved DEV teacher' },
  classOffering: { id: 'class', code: 'DEV-1', name: 'DEV class' },
} as Assignment;
describe('W02B role-safe UI and genuine workflow requests', () => {
  const staleSession = {
    id: 'stale',
    state: 'PENDING_APPROVAL',
    proposedBy: 'other',
    lockVersion: 1,
    reason: 'Keep dated draft after source review',
    classOffering: { code: 'CF-1' },
    startsAt: '2027-01-04T11:00:00Z',
    endsAt: '2027-01-04T12:00:00Z',
    intent: 'PUBLISH',
    sourceTemplateStatus: {
      kind: 'STALE',
      capturedUpdatedAt: '2026-10-31T00:00:00.000Z',
      currentUpdatedAt: '2026-10-31T01:00:00.000Z',
    },
  } as Session;
  it('stale template requires explicit checkbox and sends the exact reviewed source version', async () => {
    vi.spyOn(planningApi, 'get').mockResolvedValue({
      sessions: [staleSession],
      assignments: [],
      versions: [],
    });
    const write = vi.spyOn(planningApi, 'write').mockResolvedValue({});
    app('ACADEMIC_MANAGER', '/academic/approvals');
    const btn = await screen.findByRole('button', { name: 'Duyệt buổi' });
    fireEvent.change(screen.getByLabelText('Lý do quyết định'), {
      target: { value: 'Independent source version review' },
    });
    expect(btn).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/Đã kiểm tra mẫu tuần đã thay đổi/));
    fireEvent.click(btn);
    await waitFor(() =>
      expect(write).toHaveBeenCalledWith(
        'sessions/stale/approve',
        expect.objectContaining({
          sourceTemplateReviewed: true,
          expectedSourceTemplateUpdatedAt: staleSession.sourceTemplateStatus!.currentUpdatedAt,
        }),
      ),
    );
  });
  it('refreshing a newer template version invalidates the earlier checkbox instead of silently accepting it', async () => {
    const updated = {
      ...staleSession,
      sourceTemplateStatus: {
        ...staleSession.sourceTemplateStatus!,
        currentUpdatedAt: '2026-10-31T02:00:00.000Z',
      },
    };
    vi.spyOn(planningApi, 'get')
      .mockResolvedValueOnce({ sessions: [staleSession], assignments: [], versions: [] })
      .mockResolvedValue({ sessions: [updated], assignments: [], versions: [] });
    const write = vi.spyOn(planningApi, 'write');
    app('ACADEMIC_MANAGER', '/academic/approvals');
    await screen.findByRole('button', { name: 'Duyệt buổi' });
    fireEvent.change(screen.getByLabelText('Lý do quyết định'), {
      target: { value: 'Do not reuse an outdated source review' },
    });
    fireEvent.click(screen.getByLabelText(/Đã kiểm tra mẫu tuần đã thay đổi/));
    expect(screen.getByRole('button', { name: 'Duyệt buổi' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại yêu cầu' }));
    await waitFor(() =>
      expect(screen.getByLabelText(/Đã kiểm tra mẫu tuần đã thay đổi/)).not.toBeChecked(),
    );
    expect(screen.getByRole('button', { name: 'Duyệt buổi' })).toBeDisabled();
    expect(write).not.toHaveBeenCalled();
  });
  it('repeated generation exposes stale preserved drafts and makes no publication request', async () => {
    vi.spyOn(academicApi, 'classes').mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 50 },
    });
    vi.spyOn(planningApi, 'get').mockImplementation(
      async <T,>(p: string) =>
        (p.startsWith('rooms') || p.startsWith('calendar') ? { data: [] } : []) as T,
    );
    const write = vi
      .spyOn(planningApi, 'write')
      .mockResolvedValue({ created: 0, existing: 1, staleExisting: 1 });
    app('ACADEMIC_MANAGER', '/academic/planning?classId=class');
    await screen.findByRole('heading', { name: 'Sinh bản nháp từ lịch tuần' });
    fireEvent.change(screen.getByLabelText('Lý do sinh lịch'), {
      target: { value: 'Review changed weekly source only' },
    });
    fireEvent.click(screen.getByLabelText(/Đã kiểm tra ngày nghỉ/));
    fireEvent.click(screen.getByRole('button', { name: 'Sinh lịch nháp' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/1 buổi có mẫu nguồn cũ/);
    expect(write).toHaveBeenCalledTimes(1);
  });
  it.each([
    'STUDENT',
    'INSTRUCTOR',
    'COUNSELOR',
    'CASHIER',
    'TEACHING_INSPECTOR',
    'SYSTEM_ADMIN',
    'ADMIN_COORDINATOR',
  ] as UserRole[])('%s cannot force room/schedule management UI', async (role) => {
    const spy = vi.spyOn(planningApi, 'get');
    app(role, '/academic/planning');
    expect(await screen.findByText(/403/)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });
  it('training academic manager can approve their own submitted assignment request', async () => {
    vi.spyOn(planningApi, 'get').mockResolvedValue({
      sessions: [],
      versions: [],
      assignments: [{ ...assignment, proposedBy: 'self' }],
    });
    const write = vi
      .spyOn(planningApi, 'write')
      .mockResolvedValue({ ...assignment, state: 'PUBLISHED' });
    app('ACADEMIC_MANAGER', '/academic/approvals');
    expect(screen.queryByText(/Bạn là người đề xuất/)).not.toBeInTheDocument();
    const btn = await screen.findByRole('button', { name: 'Duyệt phân công' });
    expect(btn).toBeInTheDocument();
    expect(write).not.toHaveBeenCalled();
  });
  it('independent assignment review requires explicit eligibility and sends CAS/reason', async () => {
    vi.spyOn(planningApi, 'get').mockResolvedValue({
      sessions: [],
      versions: [],
      assignments: [assignment],
    });
    const write = vi
      .spyOn(planningApi, 'write')
      .mockResolvedValue({ ...assignment, state: 'PUBLISHED' });
    app('ACADEMIC_MANAGER', '/academic/approvals');
    const btn = await screen.findByRole('button', { name: 'Duyệt phân công' });
    expect(btn).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Lý do quyết định'), {
      target: { value: 'Reviewed eligibility independently' },
    });
    expect(btn).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(btn);
    await waitFor(() =>
      expect(write).toHaveBeenCalledWith('assignments/a/approve', {
        expectedLockVersion: 3,
        reason: 'Reviewed eligibility independently',
        eligibilityConfirmed: true,
      }),
    );
  });
  it('failed independent approval reports failure and keeps decision input', async () => {
    vi.spyOn(planningApi, 'get').mockResolvedValue({
      sessions: [],
      versions: [],
      assignments: [assignment],
    });
    vi.spyOn(planningApi, 'write').mockRejectedValue(new Error('409'));
    app('ACADEMIC_MANAGER', '/academic/approvals');
    await screen.findByText('Approved DEV teacher', { exact: false });
    fireEvent.change(screen.getByLabelText('Lý do quyết định'), {
      target: { value: 'Retain this decision on conflict' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt phân công' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Không duyệt được/);
    expect(screen.getByLabelText('Lý do quyết định')).toHaveValue(
      'Retain this decision on conflict',
    );
  });
  it('calendar renders approved server projection at school time with room and no private creator', async () => {
    const s = {
      id: 's',
      state: 'PUBLISHED',
      revision: 2,
      startsAt: '2027-01-04T11:00:00Z',
      endsAt: '2027-01-04T12:30:00Z',
      modality: 'HYBRID',
      classOffering: { code: 'DEV-1', name: 'My class' },
      room: { code: 'R-1', location: 'Floor 3' },
      instructor: { fullName: 'Approved DEV teacher' },
    } as Session;
    vi.spyOn(planningApi, 'get').mockResolvedValue({ data: [s], meta: { total: 1 } });
    app('STUDENT', '/calendar');
    expect(await screen.findByRole('heading', { name: 'DEV-1 · My class' })).toBeInTheDocument();
    expect(screen.getByText(/18:00/)).toBeInTheDocument();
    expect(screen.getByText(/Floor 3/)).toBeInTheDocument();
    expect(screen.queryByText(/PENDING_APPROVAL|proposedBy/)).not.toBeInTheDocument();
  });
  it('unknown standard price remains unknown and creates version without zero', async () => {
    vi.spyOn(planningApi, 'get').mockResolvedValue([]);
    const write = vi.spyOn(planningApi, 'write').mockResolvedValue({ id: 'v' });
    app('ACADEMIC_MANAGER', '/academic/programs/course/versions');
    await screen.findByRole('heading', { name: 'Phiên bản và điều khoản chương trình' });
    fireEvent.change(screen.getByLabelText('Tên chuẩn phiên bản'), {
      target: { value: 'New typed standard' },
    });
    fireEvent.change(screen.getByLabelText('Lý do phiên bản'), {
      target: { value: 'Explicit new institutional metadata' },
    });
    expect(screen.getByLabelText('Học phí chuẩn (VND)')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu phiên bản nháp' }));
    await waitFor(() =>
      expect(write).toHaveBeenCalledWith(
        'programs/course/versions',
        expect.objectContaining({
          standardPricingType: undefined,
          standardTuitionFeeVnd: undefined,
        }),
        'POST',
      ),
    );
  });
  it('approved version displays immutable terms without edit/submit controls', async () => {
    const v = {
      id: 'v',
      number: 1,
      title: 'Approved terms',
      description: 'Frozen terms',
      state: 'PUBLISHED',
      standardTuitionFeeVnd: 1800000,
      effectiveFrom: '2027-01-01T10:00:00Z',
      proposedBy: 'self',
    } as Version;
    vi.spyOn(planningApi, 'get').mockResolvedValue([v]);
    app('ACADEMIC_MANAGER', '/academic/programs/course/versions');
    expect(await screen.findByRole('heading', { name: 'v1 · Approved terms' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sửa phiên bản nháp' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gửi duyệt phiên bản' })).not.toBeInTheDocument();
  });
  it('generation submits explicit exception review/range and never auto-approves', async () => {
    vi.spyOn(academicApi, 'classes').mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 50 },
    });
    vi.spyOn(planningApi, 'get').mockImplementation(
      async <T,>(path: string) =>
        (({ rooms: { data: [] }, instructors: [] })[path.split('?')[0] as 'rooms'] ??
          (path.startsWith('calendar') ? { data: [] } : [])) as T,
    );
    const write = vi.spyOn(planningApi, 'write').mockResolvedValue({ created: 1, existing: 0 });
    app('ACADEMIC_MANAGER', '/academic/planning?classId=class');
    await screen.findByRole('heading', { name: 'Sinh bản nháp từ lịch tuần' });
    fireEvent.change(screen.getByLabelText('Lý do sinh lịch'), {
      target: { value: 'Reviewed holidays and dated range' },
    });
    fireEvent.click(screen.getByLabelText(/Đã kiểm tra ngày nghỉ/));
    fireEvent.click(screen.getByRole('button', { name: 'Sinh lịch nháp' }));
    await waitFor(() =>
      expect(write).toHaveBeenCalledWith(
        'classes/class/generate-sessions',
        expect.objectContaining({
          exceptionsReviewed: true,
          excludeDates: [],
          timezone: 'Asia/Ho_Chi_Minh',
        }),
      ),
    );
    expect(write).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole('status')).toHaveTextContent(/Chưa công bố lịch/);
  });
  it('requires explicit confirmation before submitting a draft version for review; cancel makes 0 API calls (EX-04)', async () => {
    const draft = {
      id: 'v-draft',
      number: 2,
      title: 'Draft terms v2',
      description: 'Needs independent review',
      state: 'DRAFT',
      lockVersion: 4,
      reason: 'Ready for review',
      standardTuitionFeeVnd: 2400000,
      effectiveFrom: '2027-02-01T10:00:00Z',
      proposedBy: 'self',
    } as Version;
    vi.spyOn(planningApi, 'get').mockResolvedValue([draft]);
    const write = vi.spyOn(planningApi, 'write').mockResolvedValue({});
    app('ACADEMIC_MANAGER', '/academic/programs/course/versions');
    const submitBtn = await screen.findByRole('button', { name: 'Gửi duyệt phiên bản' });
    fireEvent.click(submitBtn);
    expect(screen.getByRole('dialog', { name: 'Gửi duyệt phiên bản điều khoản?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ở lại' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(write).not.toHaveBeenCalled();

    fireEvent.click(submitBtn);
    expect(
      screen.getByRole('dialog', { name: 'Gửi duyệt phiên bản điều khoản?' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận gửi duyệt' }));
    await waitFor(() =>
      expect(write).toHaveBeenCalledWith('versions/v-draft/submit', {
        expectedLockVersion: 4,
        reason: 'Ready for review',
      }),
    );
  });
});
