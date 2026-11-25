import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import type { AuthUser, UserRole } from '@/features/auth/api';
import { RoleRoute } from '@/features/auth/RoleRoute';
import { OperationsPage } from './OperationsPage';
import { OperationsNavigationLink } from './OperationsNavigationLink';
import { cmsStates, operationsRoles } from './model';
import type {
  BusinessRole,
  OperationsOfflineSnapshot,
  OperationsReader,
  OperationsReadRequest,
  OperationsReadResult,
} from './contracts';
import { App } from '@/App';
import { ToastProvider } from '@/components/ui/Feedback';

const user = (role: UserRole = 'STUDENT'): AuthUser => ({
  id: 'viewer-1',
  email: 'synthetic@example.invalid',
  fullName: 'Synthetic actor',
  role,
  status: 'ACTIVE',
});
function context(u: AuthUser | null = user()): AuthContextValue {
  return {
    user: u,
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  };
}
const kinds = {
  STUDENT: 'LEARNER',
  INSTRUCTOR: 'CLASS',
  COUNSELOR: 'SUPPORT_QUEUE',
  ACADEMIC_MANAGER: 'CLASS',
  CASHIER: 'LEDGER',
  TEACHING_INSPECTOR: 'INSPECTION',
  SYSTEM_ADMIN: 'TECHNICAL',
} as const;
function snapshot(q: OperationsReadRequest): OperationsOfflineSnapshot {
  return {
    status: 'OFFLINE_TEST_ONLY',
    binding: q,
    scopes: [
      {
        kind: q.section === 'cms' ? 'CMS' : kinds[q.role],
        id: q.scopeId || 'scope-1',
        label: 'Phạm vi synthetic',
      },
    ],
    cms: [],
    settings: [],
    audit: [],
    metrics: [],
  };
}
const loadedReader = (
  change?: (q: OperationsReadRequest, raw: OperationsOfflineSnapshot) => OperationsOfflineSnapshot,
): OperationsReader => ({
  read: vi.fn(async (q) => (change ? change(q, snapshot(q)) : snapshot(q))),
});
function route(role: BusinessRole, section = 'reports') {
  return `/workspace/operations/${section}?date=2026-11-06&scope=${role === 'STUDENT' ? 'viewer-1' : 'scope-1'}`;
}
function setup({
  role = 'STUDENT',
  section = 'reports',
  reader,
  initial,
  value = context(user(role)),
  app = false,
}: {
  role?: UserRole;
  section?: string;
  reader?: OperationsReader;
  initial?: string;
  value?: AuthContextValue;
  app?: boolean;
} = {}) {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[initial ?? route(role as BusinessRole, section)]}>
        {app ? (
          <ToastProvider>
            <App />
          </ToastProvider>
        ) : (
          <Routes>
            <Route
              path="/workspace/operations/:section?"
              element={
                <RoleRoute allowedRoles={operationsRoles}>
                  <OperationsPage reader={reader} />
                </RoleRoute>
              }
            />
            <Route path="/login" element={<h1>Đăng nhập kiểm thử</h1>} />
          </Routes>
        )}
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}
const ready = () => screen.findByText(/Dữ liệu kiểm thử — không phải dữ liệu vận hành/);
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw new Error('W10 offline test must not access HTTP');
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('W10 operations offline UI', () => {
  it.each(operationsRoles)('renders honest unavailable daily reporting for %s', async (role) => {
    setup({ role });
    expect(await screen.findByText(/Chưa khả dụng · Chưa có nguồn máy chủ/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Báo cáo cuối ngày' })).toBeInTheDocument();
    expect(screen.getByText('Độ đầy đủ').parentElement).toHaveTextContent('UNKNOWN');
    expect(screen.getByRole('button', { name: /Xuất CSV riêng tư/ })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(operationsRoles.filter((role) => role !== 'STUDENT'))(
    'registered App route reaches the W10 report for %s',
    async (role) => {
      setup({ role, app: true });
      expect(await screen.findByText(/Chưa khả dụng · Chưa có nguồn máy chủ/)).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Báo cáo cuối ngày' })).toBeInTheDocument();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('registered App route redirects STUDENT from /workspace/operations/* to /workspace', async () => {
    setup({ role: 'STUDENT', app: true });
    expect(
      await screen.findByText(/Không gian Học viên TOEIC/, {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(
      vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/operations')),
    ).toBe(false);
  });
  it('routes guests to existing login guard without a W10 read', async () => {
    const reader = loadedReader();
    setup({ value: context(null), reader });
    expect(await screen.findByRole('heading', { name: 'Đăng nhập kiểm thử' })).toBeInTheDocument();
    expect(reader.read).not.toHaveBeenCalled();
  });
  it.each(['INACTIVE', 'LOCKED'] as const)('denies %s account before reading', async (status) => {
    const reader = loadedReader();
    setup({ value: context({ ...user(), status }), reader });
    expect(await screen.findByRole('heading', { name: /Bạn chưa có quyền/ })).toBeInTheDocument();
    expect(reader.read).not.toHaveBeenCalled();
  });
  it('denies legacy role without reading', async () => {
    const reader = loadedReader();
    setup({ role: 'ADMIN_COORDINATOR', reader });
    expect(await screen.findByText('403 — Không có quyền truy cập')).toBeInTheDocument();
    expect(reader.read).not.toHaveBeenCalled();
  });
  it.each([
    ['STUDENT', 'cms'],
    ['INSTRUCTOR', 'settings'],
    ['COUNSELOR', 'audit'],
    ['ACADEMIC_MANAGER', 'settings'],
    ['CASHIER', 'cms'],
    ['TEACHING_INSPECTOR', 'audit'],
    ['SYSTEM_ADMIN', 'cms'],
  ] as const)('denies %s direct URL %s without reading', async (role, section) => {
    const reader = loadedReader();
    setup({ role, section, reader });
    expect(await screen.findByRole('heading', { name: /Bạn chưa có quyền/ })).toBeInTheDocument();
    expect(reader.read).not.toHaveBeenCalled();
  });
  it('rejects an unknown section and redirects a root entry to role landing', async () => {
    const reader = loadedReader();
    setup({ section: 'not-a-section', reader });
    expect(await screen.findByRole('heading', { name: /Bạn chưa có quyền/ })).toBeInTheDocument();
    expect(reader.read).not.toHaveBeenCalled();
    cleanup();
    setup({ role: 'SYSTEM_ADMIN', initial: '/workspace/operations' });
    expect(await screen.findByRole('heading', { name: 'Cấu hình kỹ thuật' })).toBeInTheDocument();
  });
  it('shows a loading state and sanitizes errors; retry is an explicit single read', async () => {
    const read = vi
      .fn<OperationsReader['read']>()
      .mockRejectedValueOnce(new Error('password=DO_NOT_RENDER'))
      .mockResolvedValueOnce({ status: 'UNAVAILABLE' });
    setup({ reader: { read } });
    expect(screen.getByLabelText('Đang tải dữ liệu W10')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể đọc dữ liệu');
    expect(screen.queryByText(/DO_NOT_RENDER/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử đọc lại' }));
    await screen.findByText(/Chưa khả dụng · Chưa có nguồn máy chủ/);
    expect(read).toHaveBeenCalledTimes(2);
  });
  it('does not read on invalid date', async () => {
    const reader = loadedReader();
    setup({ initial: '/workspace/operations/reports?date=bad&scope=viewer-1', reader });
    expect(await screen.findByRole('alert')).toHaveTextContent('Ngày không hợp lệ');
    expect(reader.read).not.toHaveBeenCalled();
  });
  it('hides a mismatched snapshot and prevents cross-scope display', async () => {
    const reader = loadedReader((q, raw) => ({ ...raw, binding: { ...q, scopeId: 'foreign' } }));
    setup({ reader });
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể xác minh phạm vi');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
  it('ignores stale read resolution after date changes', async () => {
    const pending: { q: OperationsReadRequest; resolve: (r: OperationsReadResult) => void }[] = [];
    const reader: OperationsReader = {
      read: vi.fn<OperationsReader['read']>(
        (q) =>
          new Promise<OperationsReadResult>((resolve) => {
            pending.push({ q, resolve });
          }),
      ),
    };
    setup({ reader });
    await waitFor(() => expect(pending).toHaveLength(1));
    fireEvent.change(screen.getByLabelText('Ngày báo cáo · UTC+7'), {
      target: { value: '2026-11-07' },
    });
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[1].resolve({ status: 'UNAVAILABLE' }));
    await screen.findByText(/Chưa khả dụng · Chưa có nguồn máy chủ/);
    await act(async () => pending[0].resolve(snapshot(pending[0].q)));
    expect(screen.queryByText(/Dữ liệu kiểm thử —/)).not.toBeInTheDocument();
  });
  it('removes loaded data immediately when principal loses ACTIVE state', async () => {
    const reader = loadedReader();
    const rendered = setup({ reader });
    await ready();
    rendered.rerender(
      <AuthContext.Provider value={context({ ...user(), status: 'LOCKED' })}>
        <MemoryRouter>
          <OperationsPage reader={reader} />
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(screen.queryByText(/Dữ liệu kiểm thử —/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Bạn chưa có quyền/ })).toBeInTheDocument();
  });
  it('TV composes and previews safely in memory; saving/submitting stays blocked', async () => {
    setup({ role: 'COUNSELOR', section: 'cms' });
    await screen.findByText(/Chưa khả dụng ·/);
    fireEvent.change(screen.getByLabelText('Tiêu đề'), {
      target: { value: 'Bản soạn tiếng Việt' },
    });
    fireEvent.change(screen.getByLabelText('Nội dung · Markdown'), {
      target: { value: '<script>window.bad = true</script>\n# Nội dung kiểm thử' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước bản soạn' }));
    const preview = screen.getByRole('region', { name: 'Xem trước bản soạn' });
    expect(within(preview).getByText('Bản soạn tiếng Việt')).toBeInTheDocument();
    expect(preview.querySelector('script')).toBeNull();
    expect(screen.getByRole('button', { name: 'Lưu bản nháp' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Gửi học vụ duyệt' })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('HVU sees revision history, all five state filters and blocked independent decisions', async () => {
    const reader = loadedReader((q, raw) => ({
      ...raw,
      cms: [
        {
          id: 'content',
          scopeId: q.scopeId,
          title: 'Nội dung synthetic',
          body: 'Bản đọc kiểm thử',
          state: 'IN_REVIEW',
          revision: { id: 'r', revision: '5' },
          history: Object.keys(cmsStates).map((state, i) => ({
            revision: { id: `r${i}`, revision: `${i + 1}` },
            state: state as keyof typeof cmsStates,
          })),
        },
      ],
    }));
    setup({ role: 'ACADEMIC_MANAGER', section: 'cms', reader });
    await ready();
    const filter = screen.getByLabelText('Trạng thái nội dung');
    for (const label of Object.values(cmsStates))
      expect(within(filter).getByRole('option', { name: label })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Nội dung synthetic/ }));
    expect(screen.getByRole('heading', { name: 'Lịch sử phiên bản' })).toBeInTheDocument();
    expect(screen.getByLabelText('Lý do quyết định')).toBeEnabled();
    for (const label of ['Duyệt & công bố', 'Từ chối', 'Thu hồi'])
      expect(screen.getByRole('button', { name: label })).toBeDisabled();
    expect(screen.getByText(/Người soạn phải khác người duyệt/)).toBeInTheDocument();
    fireEvent.change(filter, { target: { value: 'DRAFT' } });
    expect(screen.getByText(/Chưa có nội dung phù hợp/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Chi tiết phiên bản' })).not.toBeInTheDocument();
  });
  it('QT masks config metadata, keeps sensitive action blocked, and never claims connection', async () => {
    const reader = loadedReader((q, raw) => ({
      ...raw,
      settings: [
        {
          scopeId: q.scopeId,
          code: 'MAIL_PROVIDER',
          sensitivity: 'SENSITIVE',
          configured: true,
          secret: 'SECRET_CREDENTIAL',
        },
      ],
    }));
    setup({ role: 'SYSTEM_ADMIN', section: 'settings', reader });
    await ready();
    expect(screen.getByText('MAIL_PROVIDER')).toBeInTheDocument();
    expect(screen.getByText(/Giá trị: ••••••••/)).toBeInTheDocument();
    expect(screen.queryByText(/SECRET_CREDENTIAL|CONNECTED/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đề nghị thay đổi cấu hình' })).toBeDisabled();
  });
  it('QT health remains UNKNOWN; audit filters without disclosing actor/payload', async () => {
    const reader = loadedReader((q, raw) => ({
      ...raw,
      audit: ['GRANT_REVOKED', 'CONFIG_REQUESTED'].map((eventCode, i) => ({
        ref: { id: `e${i}`, revision: '1' },
        scope: { kind: 'TECHNICAL', id: q.scopeId },
        occurredAt: '2026-11-06T10:00:00Z',
        eventCode,
        actorPseudonym: 'PRIVATE_ACTOR',
        fieldPolicyRef: { id: 'policy', revision: '1' },
        sourceRevision: { id: 's', revision: '1' },
        payload: 'SECRET_CREDENTIAL',
      })),
    }));
    setup({ role: 'SYSTEM_ADMIN', section: 'audit', reader });
    await ready();
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
    expect(screen.queryByText(/PRIVATE_ACTOR|SECRET_CREDENTIAL/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Loại sự kiện'), { target: { value: 'GRANT_REVOKED' } });
    expect(screen.getAllByText('GRANT_REVOKED').length).toBe(2);
    expect(screen.queryAllByText('CONFIG_REQUESTED')).toHaveLength(1); // filter option only
  });
  it('reports filter test provenance without accepting W05B/W09 confirmed zero or exporting', async () => {
    const reader = loadedReader((q, raw) => ({
      ...raw,
      metrics: ['W03', 'W05B', 'W09'].map((wave, i) => ({
        metricCode: `METRIC_${i}`,
        sourceRef: { id: `s${i}`, revision: '1' },
        scope: { kind: kinds[q.role], id: q.scopeId },
        domain: 'LEARNING',
        sourceWave: wave as 'W03' | 'W05B' | 'W09',
        effectiveAt: '2026-11-06T10:00:00Z',
        evidenceState: 'CONFIRMED',
        completeness: 'COMPLETE',
        value: 0,
        supersedesRef: null,
        provenance: 'OFFLINE_SYNTHETIC',
      })),
    }));
    setup({ reader });
    await ready();
    expect(screen.getAllByLabelText('Chưa xác minh giá trị')).toHaveLength(3);
    fireEvent.change(screen.getByLabelText('Nguồn báo cáo'), { target: { value: 'W09' } });
    const table = screen.getByRole('table');
    expect(within(table).getByText('METRIC_2')).toBeInTheDocument();
    expect(within(table).queryByText('METRIC_0')).not.toBeInTheDocument();
    expect(within(table).queryByText('0')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Trạng thái bằng chứng'), {
      target: { value: 'PENDING' },
    });
    expect(screen.getByText(/Đây không phải kết quả bằng 0/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Xuất CSV riêng tư/ }));
    expect(fetch).not.toHaveBeenCalled();
  });
  it('scope filter issues a newly bound read instead of merging resources', async () => {
    const reader = loadedReader((q, raw) => ({
      ...raw,
      scopes: [
        { kind: 'CLASS', id: 'scope-1', label: 'Lớp synthetic A' },
        { kind: 'CLASS', id: 'scope-2', label: 'Lớp synthetic B' },
      ],
    }));
    setup({ role: 'INSTRUCTOR', reader });
    await ready();
    fireEvent.change(screen.getByLabelText('Phạm vi'), { target: { value: 'scope-2' } });
    await waitFor(() =>
      expect(reader.read).toHaveBeenLastCalledWith(expect.objectContaining({ scopeId: 'scope-2' })),
    );
    await ready();
    expect(screen.getByLabelText('Phạm vi')).toHaveValue('scope-2');
  });
  it.each([320, 1440])(
    'retains semantic navigation, labels and responsive containers at nominal width %s (DOM only)',
    async (width) => {
      vi.stubGlobal('innerWidth', width);
      setup({ role: 'SYSTEM_ADMIN', reader: loadedReader() });
      await ready();
      expect(screen.getByRole('navigation', { name: 'Chức năng vận hành' })).toHaveClass(
        'overflow-x-auto',
      );
      expect(screen.getByLabelText('Ngày báo cáo · UTC+7')).toHaveAttribute('type', 'date');
      expect(screen.getByLabelText('Phạm vi')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Báo cáo cuối ngày' })).toHaveAttribute(
        'aria-current',
        'page',
      );
    },
  );
  it.each([null, 'ADMIN_COORDINATOR', 'STUDENT', 'SYSTEM_ADMIN'] as const)(
    'navigation eligibility %s never grants operation authority',
    (role) => {
      render(
        <AuthContext.Provider value={context(role ? user(role) : null)}>
          <MemoryRouter>
            <OperationsNavigationLink />
          </MemoryRouter>
        </AuthContext.Provider>,
      );
      const link = screen.queryByRole('link', { name: 'Vận hành & báo cáo' });
      if (!role || role === 'ADMIN_COORDINATOR') expect(link).not.toBeInTheDocument();
      else expect(link).toHaveAttribute('href', '/workspace/operations');
    },
  );
});
