import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminWorkspaceDashboard } from './AdminWorkspaceDashboard';
import { AuthorityPage } from '@/pages/AuthorityPage';
import { AdminOperationsCenterPage } from '@/features/operations/AdminOperationsCenterPage';
import { ToastProvider } from '@/components/ui/Feedback';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mocks.fetch(...args),
  apiUrl: (p: string) => '/api' + p,
  ApiError: class extends Error {
    status: number;
    constructor(msg: string, status = 400) {
      super(msg);
      this.status = status;
    }
  },
}));

vi.mock('@/features/auth/auth-context', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-self-id',
      email: 'admin@gmail.com',
      fullName: 'Quản trị Smart English',
      role: 'SYSTEM_ADMIN',
      status: 'ACTIVE',
    },
    isLoading: false,
    refreshUser: vi.fn(),
  }),
}));

const sampleAccounts = [
  {
    id: 'admin-self-id',
    email: 'admin@gmail.com',
    fullName: 'Quản trị Smart English',
    role: 'SYSTEM_ADMIN',
    status: 'ACTIVE',
    createdAt: '2026-11-10T10:00:00.000Z',
    updatedAt: '2026-11-11T10:00:00.000Z',
    context: {
      operationalClassAssignments: 0,
      totalClassAssignments: 0,
      enrollmentCount: 0,
    },
  },
  {
    id: 'student-1',
    email: 'student@gmail.com',
    fullName: 'Học viên Smart English',
    role: 'STUDENT',
    status: 'ACTIVE',
    createdAt: '2026-11-10T10:00:00.000Z',
    updatedAt: '2026-11-11T10:00:00.000Z',
    context: {
      operationalClassAssignments: 0,
      totalClassAssignments: 0,
      enrollmentCount: 3,
    },
  },
  {
    id: 'teacher-1',
    email: 'teacher@gmail.com',
    fullName: 'Giảng viên tiếng Anh công sở',
    role: 'INSTRUCTOR',
    status: 'ACTIVE',
    createdAt: '2026-11-10T10:00:00.000Z',
    updatedAt: '2026-11-11T10:00:00.000Z',
    context: {
      operationalClassAssignments: 2,
      totalClassAssignments: 2,
      enrollmentCount: 0,
    },
  },
];

beforeEach(() => {
  mocks.fetch.mockReset();
});

afterEach(cleanup);

function mockStandardAdminApis() {
  mocks.fetch.mockImplementation((url: string, init?: { method?: string; body?: string }) => {
    if (url === '/workspace') {
      return Promise.resolve({
        role: 'SYSTEM_ADMIN',
        capabilities: {
          accountsManage: true,
          authorityApprove: false,
          classRead: false,
          recoveryApprove: false,
        },
      });
    }
    if (url.startsWith('/admin/accounts?')) {
      const qs = new URLSearchParams(url.split('?')[1] ?? '');
      const role = qs.get('role');
      const status = qs.get('status');
      const search = qs.get('search')?.toLowerCase() ?? '';
      const filtered = sampleAccounts.filter((acc) => {
        if (role && acc.role !== role) return false;
        if (status && acc.status !== status) return false;
        if (
          search &&
          !acc.email.toLowerCase().includes(search) &&
          !acc.fullName.toLowerCase().includes(search)
        ) {
          return false;
        }
        return true;
      });
      return Promise.resolve({
        data: filtered,
        meta: { page: 1, limit: 50, total: filtered.length, totalPages: 1 },
        summary: { total: 3, active: 3, inactive: 0, locked: 0 },
      });
    }
    if (url.startsWith('/admin/accounts/') && init?.method === 'PATCH') {
      return Promise.resolve({ id: 'teacher-1', role: 'INSTRUCTOR', status: 'LOCKED' });
    }
    if (url.startsWith('/admin/accounts/')) {
      const id = url.replace('/admin/accounts/', '');
      return Promise.resolve(sampleAccounts.find((a) => a.id === id) ?? sampleAccounts[0]);
    }
    if (url === '/authority') {
      return Promise.resolve({
        grants: [],
        roles: [
          {
            id: 'role-dec-1',
            userId: 'teacher-1',
            previousRole: 'INSTRUCTOR',
            nextRole: 'COUNSELOR',
            requestedBy: 'other-admin',
            approvedBy: null,
            reason: 'Chờ phê duyệt độc lập',
          },
        ],
        audit: [],
      });
    }
    if (url === '/health') {
      return Promise.resolve({
        status: 'ok',
        service: 'smart-english-elearning-api',
        timestamp: '2026-11-13T18:30:00.000Z',
      });
    }
    if (url.startsWith('/v2/operations/system-audit')) {
      return Promise.resolve({
        viewerId: 'admin-self-id',
        role: 'SYSTEM_ADMIN',
        health: {
          status: 'HEALTHY',
          database: 'CONNECTED',
          activeSessions: 12,
          totalUsers: 3,
          checkedAt: '2026-11-13T18:30:00.000Z',
        },
        events: [
          {
            id: 'ev-1',
            actorId: 'admin-self-id',
            action: 'ACCOUNT_STATUS',
            objectType: 'USER',
            objectId: 'teacher-1',
            decision: 'ALLOW',
            reason: 'Kiểm tra token=supersecret123 không được lộ ra UI',
            createdAt: '2026-11-13T18:25:00.000Z',
          },
          {
            id: 'ev-2',
            actorId: 'student-1',
            action: 'GRANT_REQUEST',
            objectType: 'AUTHORITY',
            objectId: 'student-1',
            decision: 'DENY',
            reason: 'Không đủ quyền truy cập tài nguyên quản trị',
            createdAt: '2026-11-12T10:00:00.000Z',
          },
        ],
      });
    }
    if (url === '/v2/operations/system-config') {
      return Promise.resolve({
        checkedAt: '2026-11-13T18:30:00.000Z',
        settings: [
          {
            code: 'REPORT_CENTER_TIME_ZONE',
            category: 'REPORTING',
            sensitivity: 'ORDINARY',
            configured: true,
            maskedValue: 'Asia/Ho_Chi_Minh',
            connectionState: 'VERIFIED_TIMEZONE',
            operatorNote: 'Múi giờ UTC+7',
          },
          {
            code: 'SMTP_CREDENTIALS',
            category: 'EMAIL_RECOVERY',
            sensitivity: 'SENSITIVE',
            configured: false,
            maskedValue: '••••••••',
            connectionState: 'UNCONFIGURED',
            operatorNote: 'Mật khẩu SMTP luôn che',
          },
        ],
        proposals: [],
      });
    }
    if (url === '/v2/operations/readiness') {
      return Promise.resolve({
        mode: 'INTEGRATION_BLOCKED',
        health: 'UNKNOWN',
        sources: [
          {
            domain: 'W01_AUTHORITY',
            state: 'UNVERIFIED',
            reason: 'W10_CAPABILITY_SCOPE_AND_AUDIT_READER_REQUIRED',
          },
          {
            domain: 'W09_CERTIFICATE',
            state: 'UNAVAILABLE',
            reason: 'ISSUANCE_NOT_IMPLEMENTED',
          },
        ],
      });
    }
    return Promise.resolve({});
  });
}

describe('SYSTEM_ADMIN UI contracts (UC 1 & UC 2)', () => {
  it('renders AdminWorkspaceDashboard with real account counts, sessions and redacted audit log', async () => {
    mockStandardAdminApis();
    render(
      <MemoryRouter>
        <AdminWorkspaceDashboard />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Tổng quan quản trị hệ thống')).toBeInTheDocument();
      expect(screen.getByText(/Kết nối ổn định · 12 phiên hoạt động/)).toBeInTheDocument();
    });

    expect(screen.getByText('Đổi trạng thái tài khoản')).toBeInTheDocument();
    expect(screen.queryByText(/supersecret123/)).not.toBeInTheDocument();
  });

  it('UC 1 AuthorityPage filters accounts, prevents self-lock, and exposes sanitized history guarantees', async () => {
    mockStandardAdminApis();
    render(
      <ToastProvider>
        <MemoryRouter>
          <AuthorityPage />
        </MemoryRouter>
      </ToastProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Quản lý tài khoản người dùng')).toBeInTheDocument();
      expect(screen.getByText('student@gmail.com')).toBeInTheDocument();
    });

    // Self account selected first -> blocks self lock/role mutation
    await waitFor(() => {
      expect(screen.getByText(/Giới hạn tự thao tác/)).toBeInTheDocument();
    });

    // Filter by role INSTRUCTOR
    fireEvent.change(screen.getByLabelText('Lọc theo vai trò'), {
      target: { value: 'INSTRUCTOR' },
    });

    await waitFor(() => {
      expect(screen.queryByText('student@gmail.com')).not.toBeInTheDocument();
      expect(screen.getByText('teacher@gmail.com')).toBeInTheDocument();
    });

    // Inspect instructor detail: shows dependency counts and history preservation notice
    await waitFor(() => {
      expect(
        screen.getByText(/giữ nguyên toàn bộ lịch sử học tập, thanh toán, bài nộp và phê duyệt/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('Lớp vận hành')).toBeInTheDocument();
  });

  it('UC 2 AdminOperationsCenterPage distinguishes Operational / Unreachable / Undetermined services and filters logs', async () => {
    mockStandardAdminApis();
    // Simulate readiness failing while API & DB succeed -> tests Unreachable distinction too
    const baseImpl = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation((url: string, init?: { method?: string; body?: string }) => {
      if (url === '/v2/operations/readiness') {
        return Promise.reject(new Error('Readiness endpoint timeout'));
      }
      return baseImpl(url, init);
    });

    render(
      <MemoryRouter>
        <AdminOperationsCenterPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('API Backend (NestJS)')).toBeInTheDocument();
      expect(screen.getByText('PostgreSQL & Session Store')).toBeInTheDocument();
    });

    // Distinguishes all 3 required states in real cards
    expect(screen.getAllByText('Hoạt động').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Chưa thể xác định').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Không truy cập được').length).toBeGreaterThan(0);

    // Secrets are redacted in audit display
    expect(screen.queryByText(/supersecret123/)).not.toBeInTheDocument();
    expect(screen.getByText(/token=\*\*\*REDACTED\*\*\*/)).toBeInTheDocument();

    // Filter by outcome DENY
    fireEvent.change(screen.getByLabelText('Lọc theo kết quả'), {
      target: { value: 'DENY' },
    });
    await waitFor(() => {
      expect(screen.getByText('1 bản ghi khớp bộ lọc')).toBeInTheDocument();
    });
  });
});
