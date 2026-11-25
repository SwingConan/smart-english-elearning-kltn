import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context';
import type { AuthUser } from '@/features/auth/api';
import { OperationsPage } from './OperationsPage';
import { OperationsPreflight } from './OperationsPreflight';
import { viewModel } from './model';
import type {
  BusinessRole,
  OperationsReader,
  OperationsReadRequest,
  OperationsOfflineSnapshot,
} from './contracts';
import { OperationsAuthorityAdapter } from '../../../../api/src/modules/operations/operations-authority-adapter';
import { OperationsSourceAdapter } from '../../../../api/src/modules/operations/operations-source-adapters';
import { OperationsTechnicalAdapter } from '../../../../api/src/modules/operations/operations-technical-adapter';
import { OperationsOfflineWorkbench } from '../../../../api/src/modules/operations/operations-workbench';
import type { OperationsAuthorityPort } from '../../../../api/src/modules/operations/operations-authority.contracts';
import type {
  CmsSourceRead,
  OperationsSourcePort,
} from '../../../../api/src/modules/operations/operations-source.contracts';
import type {
  OperationsWorkbenchPort,
  OperationsWorkbenchResult,
  OperationsWorkbenchSelection,
} from '../../../../api/src/modules/operations/operations-workbench.contracts';
import type {
  GrantRead,
  ResourceScope,
} from '../../../../api/src/modules/operations/operations.contracts';

const ref = (id: string) => ({ id, revision: 'synthetic-1' });
const date = '2026-11-06';
const scope = { kind: 'CMS' as const, id: 'synthetic-scope' };
function auth(role: BusinessRole): AuthContextValue {
  return {
    user: {
      id: 'synthetic-user',
      fullName: 'Synthetic actor',
      email: 'offline@example.invalid',
      role,
      status: 'ACTIVE',
    } as AuthUser,
    isLoading: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  };
}
const raw = (q: OperationsReadRequest): OperationsOfflineSnapshot => ({
  status: 'OFFLINE_TEST_ONLY',
  binding: q,
  scopes: [
    {
      kind: q.section === 'cms' ? 'CMS' : q.role === 'STUDENT' ? 'LEARNER' : 'TECHNICAL',
      id: q.scopeId,
      label: 'Phạm vi synthetic',
    },
  ],
  cms: [],
  settings: [],
  audit: [],
  metrics: [],
});
const cmsReader: OperationsReader = {
  read: async (q) => ({
    ...raw(q),
    cms: [
      {
        id: 'content',
        scopeId: q.scopeId,
        title: 'Revision synthetic',
        body: 'Nội dung nội bộ kiểm thử',
        state: 'IN_REVIEW',
        revision: ref('cms-revision'),
        history: [{ revision: ref('cms-revision'), state: 'IN_REVIEW' }],
      },
    ],
  }),
};
function element(
  role: BusinessRole,
  section: string,
  reader: OperationsReader,
  port?: OperationsWorkbenchPort,
) {
  return (
    <AuthContext.Provider value={auth(role)}>
      <MemoryRouter
        initialEntries={[
          `/workspace/operations/${section}?date=${date}&scope=${role === 'STUDENT' ? 'synthetic-user' : scope.id}`,
        ]}
      >
        <Routes>
          <Route
            path="/workspace/operations/:section"
            element={<OperationsPage reader={reader} preflightPort={port} />}
          />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  );
}
async function serverBoundary(
  role: BusinessRole = 'ACADEMIC_MANAGER',
  target: ResourceScope = scope,
) {
  const state = { grant: 'ACTIVE' as GrantRead['state'], selfAuthor: false };
  const authPort: OperationsAuthorityPort = {
    mode: 'IN_MEMORY_ONLY',
    readPrincipal: async () => ({
      ref: ref('principal'),
      accountState: 'ACTIVE',
      authorityEpoch: 'epoch',
      principal: {
        principalId: 'synthetic-user',
        personId: 'synthetic-person',
        role,
        sessionRef: ref('session'),
        sessionState: 'AUTHENTICATED',
      },
    }),
    readGrant: async (principalId, permission, resource) => ({
      ref: ref('grant-' + permission),
      principalId,
      permission,
      scope: resource,
      state: state.grant,
      validity: 'VALID',
      authorityEpoch: 'epoch',
      decisionRef: ref('grant-decision'),
      authorityRef: ref('independent-grant-authority'),
    }),
  };
  const authority = new OperationsAuthorityAdapter(authPort),
    context = (await authority.open()).context!;
  const cms: CmsSourceRead = {
    scope: target,
    manifestRef: ref('cms-head'),
    lineagePin: ref('lineage'),
    completeness: 'COMPLETE',
    data: {
      revision: {
        ref: ref('cms-revision'),
        contentId: target.id,
        state: 'IN_REVIEW',
        parentRef: null,
        authorPersonIds: ['another-author'],
        authorshipComplete: true,
        assetClearance: 'APPROVED',
        licensingDecisionRef: ref('license'),
      },
      parent: null,
      policy: {
        ref: ref('cms-policy'),
        state: 'APPROVED',
        approvalRef: ref('policy-approval'),
        scope: target,
        actions: ['PUBLISH', 'REJECT', 'WITHDRAW'],
      },
      reasonRef: ref('reason'),
    },
  };
  const sourcePort: OperationsSourcePort = {
    mode: 'IN_MEMORY_ONLY',
    readCms: vi.fn(async () => ({
      ...cms,
      data: {
        ...cms.data,
        revision: {
          ...cms.data.revision,
          authorPersonIds: [state.selfAuthor ? 'synthetic-person' : 'another-author'],
        },
      },
    })),
    readDaily: async () => null,
    readLineage: async () => ({
      ref: ref('lineage'),
      manifestRef: ref('cms-head'),
      completeness: 'COMPLETE',
      decisions: [
        {
          ref: ref('policy-approval'),
          subjectRef: ref('cms-policy'),
          scope: target,
          ruleRef: ref('policy-rule'),
          authorityRef: ref('policy-authority'),
          purpose: 'POLICY',
          state: 'APPROVED',
        },
        {
          ref: ref('license'),
          subjectRef: ref('cms-revision'),
          scope: target,
          ruleRef: ref('license-rule'),
          authorityRef: ref('license-authority'),
          purpose: 'LICENSE',
          state: 'APPROVED',
        },
      ],
    }),
    readCurrentHead: async () => ref('cms-head'),
  };
  const sources = new OperationsSourceAdapter(authority, sourcePort),
    technical = new OperationsTechnicalAdapter(authority, null);
  const workbench = new OperationsOfflineWorkbench(authority, sources, technical, context, target);
  return { state, workbench, sourcePort };
}
const selection: OperationsWorkbenchSelection = { kind: 'DAILY', scopeId: 'synthetic-user', date };
const outcome = (
  decision: 'CONDITIONS_MET_OFFLINE' | 'DENIED' | 'BLOCKED',
  reason = 'SYNTHETIC_CHECK',
): OperationsWorkbenchResult => ({
  guard: {
    decision,
    reason,
    assurance: 'OFFLINE_CONSISTENCY_ONLY',
    runtimeAuthorized: false,
    requiresServerVerification: true,
  },
  runtimeAuthorized: false,
  mutationPerformed: false,
  exportPerformed: false,
  auditPersisted: false,
});
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => {
      throw Error('HTTP forbidden in W10 offline tests');
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('W10 S4 offline cross-layer/UI quality', () => {
  it('default port is honestly unavailable and never executes a check', () => {
    render(<OperationsPreflight selection={selection} />);
    expect(screen.getByRole('button', { name: 'Kiểm tra điều kiện offline' })).toBeDisabled();
    expect(screen.getByText(/Chưa khả dụng · Chưa có cấu hình kiểm tra/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('CMS UI -> workbench -> existing authority/source guards only checks the pinned revision', async () => {
    const e = await serverBoundary();
    const spy = vi.spyOn(e.workbench, 'check');
    render(element('ACADEMIC_MANAGER', 'cms', cmsReader, e.workbench));
    await screen.findByText(/Dữ liệu kiểm thử —/);
    fireEvent.click(screen.getByRole('button', { name: /Revision synthetic/ }));
    expect(screen.getByRole('region', { name: 'Chi tiết phiên bản' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện offline' }));
    expect(
      await screen.findByText('Điều kiện nhất quán offline — chưa được phép thực thi'),
    ).toBeInTheDocument();
    expect(spy).toHaveBeenCalledWith({
      kind: 'CMS',
      scopeId: scope.id,
      request: { action: 'PUBLISH', expectedRevision: ref('cms-revision') },
    });
    for (const name of ['Duyệt & công bố', 'Từ chối', 'Thu hồi'])
      expect(screen.getByRole('button', { name })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['REVOKED', 'UNKNOWN'] as const)(
    '%s grant fails closed through the actual offline adapters',
    async (grant) => {
      const e = await serverBoundary();
      e.state.grant = grant;
      render(element('ACADEMIC_MANAGER', 'cms', cmsReader, e.workbench));
      await screen.findByText(/Dữ liệu kiểm thử —/);
      fireEvent.click(screen.getByRole('button', { name: /Revision synthetic/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện offline' }));
      await screen.findByText(
        grant === 'REVOKED' ? 'CURRENT_GRANT_DENIED' : 'GRANT_PROVENANCE_UNAVAILABLE',
      );
      expect(e.sourcePort.readCms).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Duyệt & công bố' })).toBeDisabled();
    },
  );
  it('self-author approval is rejected in UI without publishing', async () => {
    const e = await serverBoundary();
    e.state.selfAuthor = true;
    render(element('ACADEMIC_MANAGER', 'cms', cmsReader, e.workbench));
    await screen.findByText(/Dữ liệu kiểm thử —/);
    fireEvent.click(screen.getByRole('button', { name: /Revision synthetic/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện offline' }));
    expect(await screen.findByText('AUTHOR_CANNOT_APPROVE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Duyệt & công bố' })).toBeDisabled();
  });
  it.each(['settings', 'audit'] as const)(
    'QT %s shows a missing server binding rather than inventing approval',
    async (section) => {
      const e = await serverBoundary('SYSTEM_ADMIN', { kind: 'TECHNICAL', id: scope.id });
      const reader: OperationsReader = {
        read: async (q) => ({
          ...raw(q),
          settings:
            section === 'settings'
              ? [
                  {
                    scopeId: q.scopeId,
                    code: 'LOG_LEVEL',
                    sensitivity: 'ORDINARY',
                    configured: false,
                  },
                ]
              : [],
        }),
      };
      render(element('SYSTEM_ADMIN', section, reader, e.workbench));
      await screen.findByText(/Dữ liệu kiểm thử —/);
      fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện offline' }));
      await screen.findByText(
        section === 'settings'
          ? 'CONFIG_REQUEST_BINDING_UNAVAILABLE'
          : 'AUDIT_REVISION_BINDING_UNAVAILABLE',
      );
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it('daily source unavailable and CSV plan missing are distinct, never fake zero/export', async () => {
    const e = await serverBoundary('STUDENT', { kind: 'LEARNER', id: 'synthetic-user' });
    const reader: OperationsReader = { read: async (q) => raw(q) };
    render(element('STUDENT', 'reports', reader, e.workbench));
    await screen.findByText(/Dữ liệu kiểm thử —/);
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra quyền xem (offline)' }));
    await screen.findByText('DAILY_READ_INCOMPLETE');
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra CSV (offline)' }));
    await screen.findByText('EXPORT_SCHEMA_BINDING_UNAVAILABLE');
    expect(screen.getByRole('button', { name: /Xuất CSV riêng tư/ })).toBeDisabled();
    expect(screen.getByText(/Đây không phải kết quả bằng 0/)).toBeInTheDocument();
  });
  it('reader replacement hides the prior snapshot immediately, not just after a response', async () => {
    const reader2: OperationsReader = { read: () => new Promise(() => {}) };
    const rendered = render(element('ACADEMIC_MANAGER', 'cms', cmsReader));
    await screen.findByRole('button', { name: /Revision synthetic/ });
    rendered.rerender(element('ACADEMIC_MANAGER', 'cms', reader2));
    expect(screen.queryByRole('button', { name: /Revision synthetic/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Đang tải dữ liệu W10')).toBeInTheDocument();
  });
  it('history revision projection strips fields outside the contract and detaches copies', async () => {
    const q: OperationsReadRequest = {
      viewerId: 'synthetic-user',
      role: 'ACADEMIC_MANAGER',
      section: 'cms',
      date,
      scopeId: scope.id,
    };
    const source = (await cmsReader.read(q)) as OperationsOfflineSnapshot;
    const extra = {
      ...source,
      cms: [
        {
          ...source.cms[0],
          history: [
            { state: 'DRAFT' as const, revision: { ...ref('old'), secret: 'NEVER_DISCLOSE' } },
          ],
        },
      ],
    };
    const projected = viewModel(extra, q);
    expect(JSON.stringify(projected)).not.toContain('NEVER_DISCLOSE');
    extra.cms[0].history[0].revision.revision = 'changed';
    expect(projected.cms[0].history[0].revision.revision).toBe('synthetic-1');
  });
  it('heading and report scroll region are reachable via focus semantics (DOM only)', async () => {
    const reader: OperationsReader = {
      read: async (q) => ({
        ...raw(q),
        metrics: [
          {
            metricCode: 'SYNTHETIC_METRIC',
            sourceRef: ref('source'),
            scope: { kind: 'LEARNER', id: q.scopeId },
            domain: 'LEARNING',
            sourceWave: 'W03',
            effectiveAt: '2026-11-06T01:00:00.000Z',
            evidenceState: 'CONFIRMED',
            completeness: 'COMPLETE',
            value: 0,
            supersedesRef: null,
            provenance: 'OFFLINE_SYNTHETIC',
          },
        ],
      }),
    };
    render(element('STUDENT', 'reports', reader));
    expect(screen.getByRole('heading', { name: 'Báo cáo cuối ngày' })).toHaveFocus();
    await screen.findByRole('table');
    const region = screen.getByRole('region', { name: 'Bảng báo cáo có thể cuộn ngang' });
    expect(region).toHaveAttribute('tabindex', '0');
    region.focus();
    expect(region).toHaveFocus();
    expect(within(region).getByRole('table')).toBeInTheDocument();
  });
  it('prefight is single-flight and ignores obsolete results on selection change', async () => {
    let resolve!: (r: OperationsWorkbenchResult) => void;
    const port: OperationsWorkbenchPort = {
      mode: 'IN_MEMORY_ONLY',
      check: vi.fn<OperationsWorkbenchPort['check']>(
        () =>
          new Promise<OperationsWorkbenchResult>((r) => {
            resolve = r;
          }),
      ),
    };
    const rendered = render(<OperationsPreflight port={port} selection={selection} />);
    const button = screen.getByRole('button', { name: 'Kiểm tra điều kiện offline' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(port.check).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Đang kiểm tra điều kiện…' })).toBeDisabled();
    rendered.rerender(
      <OperationsPreflight port={port} selection={{ ...selection, scopeId: 'changed' }} />,
    );
    await act(async () => resolve(outcome('CONDITIONS_MET_OFFLINE', 'OBSOLETE_RESULT')));
    expect(screen.queryByText('OBSOLETE_RESULT')).not.toBeInTheDocument();
  });
  it('a replacement port cannot retain the former condition result', async () => {
    const first: OperationsWorkbenchPort = {
      mode: 'IN_MEMORY_ONLY',
      check: async () => outcome('CONDITIONS_MET_OFFLINE'),
    };
    const rendered = render(<OperationsPreflight port={first} selection={selection} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện offline' }));
    await screen.findByText('SYNTHETIC_CHECK');
    rendered.rerender(<OperationsPreflight selection={selection} />);
    expect(screen.queryByText('SYNTHETIC_CHECK')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kiểm tra điều kiện offline' })).toBeDisabled();
  });
  it.each(['runtimeAuthorized', 'mutationPerformed', 'exportPerformed', 'auditPersisted'] as const)(
    'rejects fake %s result flags',
    async (flag) => {
      const port: OperationsWorkbenchPort = {
        mode: 'IN_MEMORY_ONLY',
        check: async () =>
          ({
            ...outcome('CONDITIONS_MET_OFFLINE'),
            [flag]: true,
          }) as unknown as OperationsWorkbenchResult,
      };
      render(<OperationsPreflight port={port} selection={selection} />);
      fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện offline' }));
      await screen.findByText('UNVERIFIED_PREFLIGHT_RESULT');
      expect(screen.queryByText(/Điều kiện nhất quán offline/)).not.toBeInTheDocument();
    },
  );
  it.each(['throw', 'unsafe-reason'] as const)('sanitizes %s provider details', async (mode) => {
    const port: OperationsWorkbenchPort = {
      mode: 'IN_MEMORY_ONLY',
      check: async () => {
        if (mode === 'throw') throw Error('password=NEVER_DISCLOSE');
        return outcome('BLOCKED', 'password=NEVER_DISCLOSE');
      },
    };
    render(<OperationsPreflight port={port} selection={selection} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện offline' }));
    await screen.findByText(
      mode === 'throw' ? 'PREFLIGHT_UNAVAILABLE' : 'UNVERIFIED_PREFLIGHT_RESULT',
    );
    expect(screen.queryByText(/NEVER_DISCLOSE/)).not.toBeInTheDocument();
  });
});
