import { resolveCenterDay } from '../../../../api/src/modules/operations/operations-foundation';
import type {
  BusinessRole,
  OperationsSection,
  OperationsReader,
  OperationsReadRequest,
  OperationsReadResult,
  OperationsViewModel,
  CmsState,
  CmsReadItem,
  OperationsWorkbenchPort,
} from './contracts';

export const operationsRoles: BusinessRole[] = [
  'STUDENT',
  'INSTRUCTOR',
  'COUNSELOR',
  'ACADEMIC_MANAGER',
  'CASHIER',
  'TEACHING_INSPECTOR',
  'SYSTEM_ADMIN',
];
export const sectionLabels: Record<OperationsSection, string> = {
  cms: 'Nội dung website',
  settings: 'Cấu hình kỹ thuật',
  audit: 'Nhật ký & sức khỏe',
  reports: 'Báo cáo cuối ngày',
};
export const cmsStates: Record<CmsState, string> = {
  DRAFT: 'Bản nháp',
  IN_REVIEW: 'Chờ duyệt',
  PUBLISHED: 'Đã công bố',
  REJECTED: 'Bị từ chối',
  WITHDRAWN: 'Đã thu hồi',
};
export const roleReportDescriptions: Record<BusinessRole, string> = {
  STUDENT: 'Hoạt động học, bài nộp và kết quả đã công bố của bạn.',
  INSTRUCTOR: 'Lịch dạy, chấm bài và điểm danh trong lớp được phân công.',
  COUNSELOR: 'Phiếu hỗ trợ học viên (CSKH) và lịch sử tư vấn 1:1 trong phạm vi.',
  ACADEMIC_MANAGER: 'Chương trình, lớp, lịch và các quyết định học vụ được phép.',
  CASHIER: 'Phiếu thu, phân bổ, đối soát và công nợ được phép.',
  TEACHING_INSPECTOR: 'Thanh tra được phân công, biên bản và ca của bản thân.',
  SYSTEM_ADMIN: 'Tài khoản, thay đổi quyền, sự kiện ứng dụng và vận hành.',
};
export function sectionsFor(role: string): OperationsSection[] {
  if (!operationsRoles.includes(role as BusinessRole)) return [];
  if (role === 'SYSTEM_ADMIN') return ['settings', 'audit', 'reports'];
  if (role === 'COUNSELOR' || role === 'ACADEMIC_MANAGER') return ['cms', 'reports'];
  return ['reports'];
}
export const unavailableReader: OperationsReader = {
  read: () => Promise.resolve({ status: 'UNAVAILABLE' }),
};
export const unavailableWorkbench: OperationsWorkbenchPort = {
  mode: 'UNIMPLEMENTED',
  check: () =>
    Promise.resolve({
      guard: {
        decision: 'BLOCKED',
        reason: 'WORKBENCH_INTEGRATION_UNAVAILABLE',
        assurance: 'OFFLINE_CONSISTENCY_ONLY',
        runtimeAuthorized: false,
        requiresServerVerification: true,
      },
      runtimeAuthorized: false,
      mutationPerformed: false,
      exportPerformed: false,
      auditPersisted: false,
    }),
};
export function centerToday(now = new Date()): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  return ['year', 'month', 'day'].map((k) => p.find((x) => x.type === k)?.value ?? '').join('-');
}
export function displayDay(date: string) {
  // Display-only configured target, never a server configuration/authorization pin.
  return resolveCenterDay({
    date,
    timeZone: 'Asia/Ho_Chi_Minh',
    configurationRef: { id: 'w10-ui-date-preview', revision: 'display-only' },
  });
}
export function requestKey(q: OperationsReadRequest): string {
  return JSON.stringify([q.viewerId, q.role, q.section, q.date, q.scopeId]);
}
const empty = (status: 'UNAVAILABLE' | 'DENIED'): OperationsViewModel => ({
  status,
  scopes: [],
  cms: [],
  settings: [],
  audit: [],
  metrics: [],
  runtimeAuthorized: false,
  exportPerformed: false,
});
const safeCode = (v: string) => typeof v === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(v);
const validRef = (v: { id: string; revision: string }) =>
  !!v && typeof v.id === 'string' && !!v.id && typeof v.revision === 'string' && !!v.revision;
export function viewModel(
  raw: OperationsReadResult,
  q: OperationsReadRequest,
): OperationsViewModel {
  if (!raw || raw.status === 'UNAVAILABLE') return empty('UNAVAILABLE');
  if (raw.status === 'DENIED') return empty('DENIED');
  if (
    raw.status !== 'OFFLINE_TEST_ONLY' ||
    !raw.binding ||
    requestKey(raw.binding) !== requestKey(q)
  )
    return empty('DENIED');
  const kinds: Record<BusinessRole, readonly string[]> = {
    STUDENT: ['LEARNER'],
    INSTRUCTOR: ['CLASS'],
    COUNSELOR: ['SUPPORT_QUEUE'],
    ACADEMIC_MANAGER: ['CLASS', 'PROGRAM'],
    CASHIER: ['LEDGER'],
    TEACHING_INSPECTOR: ['INSPECTION', 'STAFF'],
    SYSTEM_ADMIN: ['TECHNICAL'],
  };
  const allowedKinds = q.section === 'cms' ? ['CMS'] : kinds[q.role];
  if (
    !sectionsFor(q.role).includes(q.section) ||
    displayDay(q.date).status !== 'RESOLVED' ||
    !Array.isArray(raw.scopes) ||
    !raw.scopes.every(
      (s) =>
        !!s.id && allowedKinds.includes(s.kind) && (q.role !== 'STUDENT' || s.id === q.viewerId),
    ) ||
    (q.scopeId && !raw.scopes.some((s) => s.id === q.scopeId))
  )
    return empty('DENIED');
  const scopeMatches = (id: string) => !!q.scopeId && id === q.scopeId;
  const sourceScopeMatches = (scope: { kind: string; id: string }) =>
    !!scope &&
    scopeMatches(scope.id) &&
    raw.scopes.some((s) => s.id === scope.id && s.kind === scope.kind);
  // Inspect only the requested UC. No foreign/unrequested private rows reach the view.
  const cms = q.section === 'cms' ? raw.cms : [];
  const settings = q.section === 'settings' ? raw.settings : [];
  const audit = q.section === 'audit' ? raw.audit : [];
  const metrics = q.section === 'reports' ? raw.metrics : [];
  const day = displayDay(q.date);
  const inDay = (value: string) =>
    day.status === 'RESOLVED' &&
    typeof value === 'string' &&
    /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    Date.parse(value) >= Date.parse(day.window.startAt) &&
    Date.parse(value) < Date.parse(day.window.endExclusive);
  if (
    !Array.isArray(cms) ||
    !Array.isArray(settings) ||
    !Array.isArray(audit) ||
    !Array.isArray(metrics) ||
    cms.some(
      (r) =>
        !r ||
        !r.id ||
        !scopeMatches(r.scopeId) ||
        !Object.hasOwn(cmsStates, r.state) ||
        typeof r.title !== 'string' ||
        typeof r.body !== 'string' ||
        !validRef(r.revision) ||
        !Array.isArray(r.history) ||
        r.history.some(
          (h: CmsReadItem['history'][number]) =>
            !validRef(h.revision) || !Object.hasOwn(cmsStates, h.state),
        ),
    ) ||
    settings.some(
      (r) =>
        !r ||
        !scopeMatches(r.scopeId) ||
        !safeCode(r.code) ||
        !['ORDINARY', 'SENSITIVE', 'UNKNOWN'].includes(r.sensitivity),
    ) ||
    audit.some(
      (r) =>
        !r ||
        !sourceScopeMatches(r.scope) ||
        !safeCode(r.eventCode) ||
        !validRef(r.ref) ||
        !inDay(r.occurredAt),
    ) ||
    metrics.some(
      (r) =>
        !r ||
        !sourceScopeMatches(r.scope) ||
        !safeCode(r.metricCode) ||
        !['W01', 'W02', 'W03', 'W04', 'W05A', 'W05B', 'W06', 'W07', 'W08', 'W09'].includes(
          r.sourceWave,
        ) ||
        !inDay(r.effectiveAt),
    )
  )
    return empty('DENIED');
  return {
    status: 'OFFLINE_TEST_ONLY',
    scopes: raw.scopes.map((s) => ({ kind: s.kind, id: s.id, label: s.label })),
    cms: cms.map((r) => ({
      id: r.id,
      scopeId: r.scopeId,
      title: r.title,
      body: r.body,
      state: r.state,
      revision: { id: r.revision.id, revision: r.revision.revision },
      history: r.history.map((h: CmsReadItem['history'][number]) => ({
        revision: { id: h.revision.id, revision: h.revision.revision },
        state: h.state,
      })),
    })),
    settings: settings.map((r) => ({
      scopeId: r.scopeId,
      code: r.code,
      sensitivity: r.sensitivity,
      configured: r.configured === false ? false : null,
    })),
    audit: audit.map((r) => ({
      ref: { id: r.ref.id, revision: r.ref.revision },
      eventCode: r.eventCode,
      occurredAt: r.occurredAt,
    })),
    metrics: metrics.map((r) => ({
      code: r.metricCode,
      sourceWave: r.sourceWave,
      state:
        r.sourceWave === 'W05B' || r.sourceWave === 'W09' || r.evidenceState === 'CONFIRMED'
          ? 'UNVERIFIED'
          : ['PENDING', 'UNKNOWN', 'UNAVAILABLE', 'UNVERIFIED'].includes(r.evidenceState)
            ? (r.evidenceState as Exclude<typeof r.evidenceState, 'CONFIRMED'>)
            : 'UNKNOWN',
      value: null,
    })),
    runtimeAuthorized: false,
    exportPerformed: false,
  };
}
