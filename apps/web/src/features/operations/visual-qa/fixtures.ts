import type {
  BusinessRole,
  OperationsOfflineSnapshot,
  OperationsReadRequest,
  OperationsReader,
  OperationsSection,
} from '../contracts';

export const watermark = 'SYNTHETIC DATA — VISUAL QA ONLY';
export const fixtureDate = '2026-11-06';
export const qaRoles: BusinessRole[] = [
  'STUDENT',
  'INSTRUCTOR',
  'COUNSELOR',
  'ACADEMIC_MANAGER',
  'CASHIER',
  'TEACHING_INSPECTOR',
  'SYSTEM_ADMIN',
];
export type FixtureState =
  | 'normal'
  | 'empty'
  | 'pending'
  | 'unknown'
  | 'zero'
  | 'unavailable'
  | 'loading'
  | 'error'
  | 'denied';
export interface QaScenario {
  id: string;
  role: BusinessRole;
  section: OperationsSection;
  state: FixtureState;
}
export const scenarios: QaScenario[] = [
  { id: 'cms-tv', role: 'COUNSELOR', section: 'cms', state: 'normal' },
  { id: 'cms-hvu', role: 'ACADEMIC_MANAGER', section: 'cms', state: 'normal' },
  { id: 'settings-qt', role: 'SYSTEM_ADMIN', section: 'settings', state: 'normal' },
  { id: 'audit-qt', role: 'SYSTEM_ADMIN', section: 'audit', state: 'normal' },
  { id: 'cms-role-denied', role: 'STUDENT', section: 'cms', state: 'denied' },
  ...qaRoles.map((role) => ({
    id: 'report-' + role.toLowerCase(),
    role,
    section: 'reports' as const,
    state: 'normal' as const,
  })),
  ...(
    [
      'empty',
      'pending',
      'unknown',
      'zero',
      'unavailable',
      'loading',
      'error',
      'denied',
    ] as FixtureState[]
  ).map((state) => ({
    id: 'report-state-' + state,
    role: 'STUDENT' as const,
    section: 'reports' as const,
    state,
  })),
];
const ref = (id: string, revision = 'synthetic-1') => ({ id, revision });
const kinds = {
  STUDENT: 'LEARNER',
  INSTRUCTOR: 'CLASS',
  COUNSELOR: 'SUPPORT_QUEUE',
  ACADEMIC_MANAGER: 'CLASS',
  CASHIER: 'LEDGER',
  TEACHING_INSPECTOR: 'INSPECTION',
  SYSTEM_ADMIN: 'TECHNICAL',
} as const;
export function fixtureScope(role: BusinessRole) {
  return role === 'STUDENT' ? 'synthetic-viewer' : 'synthetic-resource';
}
export function snapshot(q: OperationsReadRequest, state: FixtureState): OperationsOfflineSnapshot {
  const resource = { kind: q.section === 'cms' ? ('CMS' as const) : kinds[q.role], id: q.scopeId };
  const data: OperationsOfflineSnapshot = {
    status: 'OFFLINE_TEST_ONLY',
    binding: { ...q },
    scopes: [
      {
        ...resource,
        label:
          'Phạm vi kiểm thử — lớp TOEIC synthetic với tên dài để kiểm tra hiển thị trên màn hình nhỏ',
      },
    ],
    cms: [],
    settings: [],
    audit: [],
    metrics: [],
  };
  if (state === 'empty') return data;
  if (q.section === 'cms')
    return {
      ...data,
      cms: (['DRAFT', 'IN_REVIEW', 'PUBLISHED', 'REJECTED', 'WITHDRAWN'] as const).map(
        (status, i) => ({
          id: 'synthetic-content-' + i,
          scopeId: q.scopeId,
          title:
            i === 1
              ? 'Chương trình TOEIC synthetic — thông báo lịch học, quyền riêng tư và hướng dẫn học tập với tiêu đề dài để kiểm tra xuống dòng trên điện thoại'
              : 'Bài viết synthetic ' + (i + 1) + ' · ' + status,
          body: [
            '# Nội dung synthetic — chỉ kiểm tra giao diện',
            'Không phải thông báo đã được học vụ duyệt hay tài liệu được phát hành.',
            '- Mỗi trạng thái được tạo cố định trong fixture.',
            '- Quyền runtime và quyết định thật chưa được xác minh.',
            ...Array.from(
              { length: i === 1 ? 8 : 1 },
              (_, n) =>
                'Đoạn ' +
                (n + 1) +
                ': Nội dung kiểm thử tiếng Việt và English. Bố cục cần dễ đọc, không che nút hoặc tràn ra ngoài vùng nội dung.',
            ),
          ].join('\n\n'),
          state: status,
          revision: ref('synthetic-revision-' + i, 'v' + (i + 1)),
          history: Array.from({ length: 7 }, (_, j) => ({
            revision: ref('synthetic-history-' + i + '-' + j, 'v' + (j + 1)),
            state: j === 6 ? status : ('DRAFT' as const),
          })),
        }),
      ),
    };
  if (q.section === 'settings')
    return {
      ...data,
      settings: [
        { scopeId: q.scopeId, code: 'MAIL_PROVIDER', sensitivity: 'SENSITIVE', configured: true },
        {
          scopeId: q.scopeId,
          code: 'SYNTHETIC_LONG_CONFIGURATION_METADATA_CODE',
          sensitivity: 'ORDINARY',
          configured: false,
        },
        { scopeId: q.scopeId, code: 'STORAGE_PROVIDER', sensitivity: 'UNKNOWN', configured: null },
      ],
    };
  if (q.section === 'audit')
    return {
      ...data,
      audit: Array.from({ length: 16 }, (_, i) => ({
        ref: ref('synthetic-event-' + i),
        scope: resource,
        occurredAt: `2026-11-06T0${i % 8}:15:00.000Z`,
        eventCode: [
          'GRANT_REVOKED',
          'CONFIG_CHANGE_REQUESTED',
          'SYNTHETIC_APPLICATION_ERROR_WITH_LONG_LABEL',
          'SESSION_EXPIRED',
        ][i % 4],
        actorPseudonym: 'SYNTHETIC_REDACTION_TRIPWIRE',
        fieldPolicyRef: ref('synthetic-field-policy'),
        sourceRevision: ref('synthetic-audit-source'),
      })),
    };
  return {
    ...data,
    metrics: Array.from({ length: state === 'zero' ? 1 : 24 }, (_, i) => ({
      metricCode:
        state === 'zero'
          ? 'SYNTHETIC_DECLARED_ZERO'
          : 'SYNTHETIC_ACTIVITY_WITH_A_LONG_METRIC_LABEL_' + String(i + 1).padStart(2, '0'),
      sourceRef: ref('synthetic-source-' + i),
      scope: resource,
      domain: 'LEARNING' as const,
      sourceWave: (['W03', 'W05B', 'W09', 'W06'] as const)[i % 4],
      effectiveAt: '2026-11-06T01:00:00.000Z',
      evidenceState:
        state === 'pending'
          ? ('PENDING' as const)
          : state === 'unknown'
            ? ('UNKNOWN' as const)
            : state === 'zero'
              ? ('CONFIRMED' as const)
              : (['PENDING', 'UNKNOWN', 'UNAVAILABLE', 'CONFIRMED', 'UNVERIFIED'] as const)[i % 5],
      completeness: i % 2 ? ('PARTIAL' as const) : ('COMPLETE' as const),
      value: state === 'zero' ? 0 : i + 1,
      supersedesRef: null,
      provenance: 'OFFLINE_SYNTHETIC' as const,
    })),
  };
}
/** No source loader/service. Malformed/denied/error fixtures never contact API. */
export function readerFor(scenario: QaScenario): OperationsReader {
  return {
    read: async (q) => {
      if (scenario.state === 'loading') return new Promise(() => {});
      if (scenario.state === 'error') throw Error('Synthetic unavailable reader');
      if (scenario.state === 'unavailable') return { status: 'UNAVAILABLE' };
      if (scenario.state === 'denied') return { status: 'DENIED' };
      return snapshot(q, scenario.state);
    },
  };
}
