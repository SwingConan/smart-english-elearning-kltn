import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import { InspectorWorkspaceDashboard } from './InspectorWorkspaceDashboard';
import { InspectionPage } from '@/pages/InspectionPage';

function makeAuth(): AuthContextValue {
  return {
    user: {
      id: 'insp-1',
      email: 'inspector@gmail.com',
      fullName: 'Thanh tra đào tạo Smart English',
      role: 'TEACHING_INSPECTOR',
      status: 'ACTIVE',
    },
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  };
}

describe('Teaching Inspector Workspace & Inspection Page', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders InspectorWorkspaceDashboard with real KPIs, upcoming shifts, and scoped classes without internal debug links', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/workspace/classes')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 'cls-1',
                  code: 'SE-LR-550',
                  name: 'TOEIC 550 Buổi tối',
                  status: 'IN_PROGRESS',
                  activeLearnerCount: 12,
                  course: { id: 'c-1', title: 'TOEIC 550+', level: 'B1' },
                  instructor: { id: 'gv-1', fullName: 'Trần Thu Hà' },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            data: [
              {
                classCode: 'SE-LR-550',
                className: 'TOEIC 550 Buổi tối',
                valid: true,
                meetUrl: 'https://meet.google.com/abc-defg-hij',
                scheduledSeconds: 7200,
                observedSeconds: null,
                approvedSeconds: null,
                hoursState: 'UNCONFIRMED',
                assignment: {
                  id: 'a-1',
                  classId: 'cls-1',
                  startsAt: '2026-11-17T12:00:00.000Z',
                  endsAt: '2026-11-17T14:00:00.000Z',
                  state: 'ACTIVE',
                },
                reports: [],
                clocks: [],
              },
            ],
            notifications: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    render(
      <AuthContext.Provider value={makeAuth()}>
        <MemoryRouter>
          <InspectorWorkspaceDashboard />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    expect(await screen.findByRole('link', { name: /SE-LR-550 · TOEIC 550 Buổi tối/ })).toBeInTheDocument();
    expect(screen.getByText('Chờ tiếp nhận ca')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Vào Google Meet' })).toHaveAttribute(
      'href',
      'https://meet.google.com/abc-defg-hij',
    );
    expect(screen.queryByText(/Tối đa 100 lớp/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Tình trạng nguồn vận hành/ })).not.toBeInTheDocument();
  });

  it('allows immediate 1-click ACK with auto-reason and displays localized Vietnamese correction kinds on InspectionPage', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/commands') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        expect(body.action).toBe('ACK');
        expect(body.reason.length).toBeGreaterThanOrEqual(3);
        return new Response(JSON.stringify({ id: 'a-1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({
          from: '2026-11-16T00:00:00.000Z',
          to: '2026-11-23T00:00:00.000Z',
          nextAssignmentCursor: null,
          nextSessionCursor: null,
          sessions: [],
          inspectors: [],
          notifications: [],
          data: [
            {
              classCode: 'SE-LR-550',
              className: 'TOEIC 550 Buổi tối',
              personnel: { actualSeconds: null, approvedSeconds: null, correctedOutAt: null, revision: null },
              assignment: {
                id: 'a-1',
                classId: 'cls-1',
                sessionId: 's-1',
                teacherId: 'gv-1',
                inspectorId: 'insp-1',
                revision: 1,
                startsAt: new Date().toISOString(),
                endsAt: new Date(Date.now() + 7200000).toISOString(),
                state: 'ACTIVE',
                version: 0,
                reason: '[Q02 E2E Demo] Dieu phoi thanh tra ca buoi 1',
              },
              valid: true,
              rights: { assign: false, hours: false, shift: false, inspector: true, teacher: false },
              meetUrl: 'https://meet.google.com/abc-defg-hij',
              scheduledSeconds: 7200,
              observedSeconds: null,
              approvedSeconds: null,
              hoursState: 'UNCONFIRMED',
              attestation: 'TT-REPORTED',
              serverTime: new Date().toISOString(),
              segments: [],
              reports: [],
              decisions: [],
              disputes: [],
              clocks: [],
              corrections: [],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <AuthContext.Provider value={makeAuth()}>
        <MemoryRouter>
          <InspectionPage />
        </MemoryRouter>
      </AuthContext.Provider>,
    );

    const ackBtn = await screen.findByRole('button', { name: 'Tiếp nhận ca' });
    expect(ackBtn).toBeEnabled();
    expect(screen.getByText('Thiếu thao tác ra ca')).toBeInTheDocument();
    expect(screen.queryByText('MISSING_CHECKOUT')).not.toBeInTheDocument();

    fireEvent.click(ackBtn);
    await waitFor(() => {
      expect(screen.getByText('Đã ghi nhận thao tác thanh tra thành công.')).toBeInTheDocument();
    });
  });
});
