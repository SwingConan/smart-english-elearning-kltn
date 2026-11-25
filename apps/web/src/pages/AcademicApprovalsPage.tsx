import { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import { accountLabel } from '@/features/catalog/record-presentation';
import { classCodeLabel } from '@/features/demo/presentation';
import {
  control,
  planningApi,
  schoolDate,
  sourceTemplateWarning,
  type Session,
  type Assignment,
  type Version,
} from '@/features/academic/planning-api';

const cleanAcademicReason = (raw?: string | null): string => {
  if (!raw) return 'Chưa có mô tả chi tiết.';
  if (/^SYNTHETIC DEMO:.*instructor authority/i.test(raw)) {
    return 'Đề xuất điều phối và xác nhận quyền giảng viên đứng lớp sau kiểm tra điều kiện học vụ.';
  }
  if (/^\[Q02 E2E Demo\]\s*Tao buoi hoc 1 ONLINE$/i.test(raw.trim())) {
    return 'Tạo buổi học 1 trực tuyến theo kế hoạch giảng dạy của lớp.';
  }
  if (raw.trim() === 'Phan cong giang vien phu trach lop TOEIC toi theo lich hoc') {
    return 'Phân công giảng viên phụ trách lớp TOEIC buổi tối theo lịch học.';
  }
  return raw.replace(/^\[Q\d+\s+E2E\s+Demo\]\s*/i, '').trim();
};

export function AcademicApprovalsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<{
      sessions: Session[];
      assignments: Assignment[];
      versions: Version[];
    }>(),
    [reason, setReason] = useState(''),
    [eligibility, setEligibility] = useState(false),
    [reviewedSources, setReviewedSources] = useState<Record<string, string>>({}),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [tick, setTick] = useState(0),
    [categoryFilter, setCategoryFilter] = useState<'all' | 'versions' | 'assignments' | 'sessions'>('all');
  const [priceReference, setPriceReference] = useState(''),
    [priceConfirmed, setPriceConfirmed] = useState(false);

  useEffect(() => {
    let live = true;
    void planningApi
      .get<typeof data>('approvals')
      .then((d) => {
        if (live) setData(d);
      })
      .catch(() => {
        if (live) setError('Không tải được yêu cầu trong phạm vi duyệt.');
      });
    return () => {
      live = false;
    };
  }, [tick]);

  async function approve(kind: string, row: Session | Assignment | Version) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await planningApi.write(kind + '/' + row.id + '/approve', {
        reason,
        expectedLockVersion: row.lockVersion,
        ...(kind === 'versions'
          ? { poPriceConfirmed: priceConfirmed, poPriceReference: priceReference.trim() }
          : {}),
        ...(kind === 'assignments' ? { eligibilityConfirmed: eligibility } : {}),
        ...(kind === 'sessions' &&
        (row as Session).intent !== 'CANCEL' &&
        (row as Session).sourceTemplateStatus?.kind === 'STALE'
          ? {
              sourceTemplateReviewed:
                reviewedSources[row.id] === (row as Session).sourceTemplateStatus?.currentUpdatedAt,
              expectedSourceTemplateUpdatedAt: (row as Session).sourceTemplateStatus
                ?.currentUpdatedAt,
            }
          : {}),
      });
      setMessage(
        'Phê duyệt thành công. Quyết định đã được lưu vào hệ thống.',
      );
      setTick((x) => x + 1);
    } catch {
      setError(
        'Không duyệt được: bạn không có quyền phù hợp, không thể tự duyệt đề xuất của mình, hoặc dữ liệu đã thay đổi. Vui lòng thử lại.',
      );
    } finally {
      setBusy(false);
    }
  }

  const totalPending = data
    ? data.versions.length + data.assignments.length + data.sessions.length
    : 0;

  return (
    <main className="workspace-page">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          className={control + ' inline-flex items-center gap-1.5 text-sm font-semibold'}
          onClick={() => setTick((x) => x + 1)}
        >
          <RefreshCw size={15} aria-hidden="true" />
          Tải lại yêu cầu
        </button>
      </div>

      <header className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 rounded bg-[#e9f2e4] px-2.5 py-0.5 text-xs font-semibold text-[#2f5d1e]">
              <ShieldCheck size={13} aria-hidden="true" />
              Quản lý Đào tạo · Phê duyệt
            </span>
            <h1 className="text-2xl font-bold text-[#e66f2b] sm:text-3xl">
              Phê duyệt đào tạo
            </h1>
            <p className="max-w-3xl text-sm text-slate-600">
              Phê duyệt lịch học, phân công giảng viên và chương trình đào tạo theo thẩm quyền Quản lý Đào tạo.
            </p>
          </div>
          {data && (
            <div className="flex flex-wrap gap-2 text-center">
              <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-500">Tổng hàng đợi</p>
                <p className="text-lg font-bold text-slate-900">
                  {data.versions.length + data.assignments.length + data.sessions.length}
                </p>
              </div>
              <div className="rounded border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-500">Chương trình</p>
                <p className="text-lg font-bold text-slate-800">{data.versions.length}</p>
              </div>
              <div className="rounded border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-500">Phân công GV</p>
                <p className="text-lg font-bold text-slate-800">{data.assignments.length}</p>
              </div>
              <div className="rounded border border-slate-200 bg-white px-3 py-2">
                <p className="text-[11px] font-semibold text-slate-500">Buổi học</p>
                <p className="text-lg font-bold text-slate-800">{data.sessions.length}</p>
              </div>
            </div>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          {(
            [
              ['all', 'Tất cả'],
              ['assignments', 'Phân công giảng viên'],
              ['sessions', 'Lịch học & Buổi dạy'],
              ['versions', 'Phiên bản chương trình'],
            ] as const
          ).map(([key, labelText]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategoryFilter(key)}
              className={`rounded border px-3 py-1.5 text-xs font-semibold transition ${
                categoryFilter === key
                  ? 'border-[#76a35e] bg-[#76a35e] text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {labelText}
            </button>
          ))}
        </div>
      </header>

      {error && (
        <p role="alert" className="state-error text-sm font-medium">
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900"
        >
          {message}
        </p>
      )}

      <div className="workspace-card space-y-4">
        <label className="block space-y-1.5 text-sm font-semibold text-slate-700">
          Lý do quyết định
          <textarea
            className={control + ' block w-full'}
            rows={2}
            minLength={10}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Nhập lý do phê duyệt (tối thiểu 10 ký tự)"
          />
        </label>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="font-semibold text-slate-500">Gợi ý nhanh:</span>
          {[
            'Đã kiểm tra hồ sơ và điều kiện hợp lệ theo quy định học vụ.',
            'Phê duyệt lịch học chuẩn và phân công giảng viên của lớp.',
            'Xác nhận điều chỉnh vận hành theo kế hoạch trung tâm.',
          ].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setReason(preset)}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-[#e9f2e4] hover:border-[#cde0c2]"
            >
              {preset}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            className="size-4 rounded border-slate-300 text-indigo-600"
            checked={eligibility}
            onChange={(e) => setEligibility(e.target.checked)}
          />
          Đã kiểm tra giảng viên đủ điều kiện cho lớp/chương trình khi duyệt phân công
        </label>

        {(data?.versions?.length ?? 0) > 0 && (
          <fieldset className="workspace-subcard space-y-3">
            <legend className="px-1 text-sm font-bold text-indigo-950">
              Quyết định học phí chính thức
            </legend>
            <label className="block space-y-1 text-sm font-semibold text-slate-700">
              Số quyết định / Văn bản phê duyệt học phí
              <input
                className={control + ' block w-full'}
                value={priceReference}
                maxLength={300}
                onChange={(e) => {
                  setPriceReference(e.target.value);
                  setPriceConfirmed(false);
                }}
                placeholder="Nhập số văn bản hoặc mã quyết định học phí"
              />
            </label>
            <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                className="size-4 rounded border-slate-300 text-indigo-600"
                checked={priceConfirmed}
                onChange={(e) => setPriceConfirmed(e.target.checked)}
              />
              Tôi đã đối chiếu mức học phí với văn bản phê duyệt.
            </label>
            <p className="text-xs text-slate-600">
              Lưu ý: Mức học phí cần có văn bản phê duyệt trước khi ban hành phiên bản chương trình.
            </p>
          </fieldset>
        )}
      </div>

      {!data && !error && (
        <p role="status" className="workspace-card text-sm text-slate-600">
          Đang tải yêu cầu…
        </p>
      )}

      {data && (
        <div className="space-y-6">
          {totalPending === 0 && (
            <section className="workspace-card text-sm text-slate-600">
              Hiện chưa có yêu cầu học vụ nào đang chờ phê duyệt.
            </section>
          )}
          {(['versions', 'assignments', 'sessions'] as const)
            .filter((kind) => categoryFilter === 'all' || categoryFilter === kind)
            .filter((kind) => categoryFilter !== 'all' || data[kind].length > 0)
            .map((kind) => (
            <section key={kind} className="workspace-card space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-lg font-bold text-slate-950">
                  {
                    {
                      versions: 'Phiên bản chương trình',
                      assignments: 'Phân công giảng viên',
                      sessions: 'Lịch học (buổi học, dời lịch, hủy buổi)',
                    }[kind]
                  }
                </h2>
                <span className="badge-pending">{data[kind].length} yêu cầu</span>
              </div>

              {!data[kind].length && (
                <p className="text-sm text-slate-600">Không có yêu cầu chờ duyệt trong phạm vi.</p>
              )}

              <ul className="space-y-3">
                {data[kind].map((row) => (
                  <li key={row.id} className="workspace-subcard space-y-2.5 bg-white">
                    {kind === 'versions' ? (
                      <p className="font-bold text-slate-950">
                        {(row as Version).title} · v{(row as Version).number} ·{' '}
                        {(row as Version).standardTuitionFeeVnd === null
                          ? 'Chưa có học phí chuẩn'
                          : new Intl.NumberFormat('vi-VN').format(
                              (row as Version).standardTuitionFeeVnd!,
                            ) + ' VND'}{' '}
                        · hiệu lực {schoolDate((row as Version).effectiveFrom)}
                      </p>
                    ) : kind === 'assignments' ? (
                      <p className="font-bold text-slate-950">
                        {classCodeLabel((row as Assignment).classOffering?.code ?? '')} ·{' '}
                        {(row as Assignment).instructor
                          ? accountLabel((row as Assignment).instructor!.fullName)
                          : ''}{' '}
                        · {schoolDate((row as Assignment).effectiveFrom)} —{' '}
                        {schoolDate((row as Assignment).effectiveTo)}
                      </p>
                    ) : (
                      <p className="font-bold text-slate-950">
                        {classCodeLabel((row as Session).classOffering?.code ?? '')} ·{' '}
                        {{
                          PUBLISH: 'Công bố buổi học',
                          RESCHEDULE: 'Đổi lịch buổi học',
                          CANCEL: 'Hủy buổi học',
                        }[(row as Session).intent] ?? (row as Session).intent}{' '}
                        · {schoolDate((row as Session).startsAt)} —{' '}
                        {schoolDate((row as Session).endsAt)} ·{' '}
                        {(row as Session).room?.code ?? 'Online/chưa chọn phòng'} ·{' '}
                        {(row as Session).instructor
                          ? accountLabel((row as Session).instructor!.fullName)
                          : 'Chưa phân công'}
                      </p>
                    )}

                    <p className="text-sm text-slate-600">
                      Lý do đề xuất: {cleanAcademicReason(row.reason)}
                    </p>

                    {kind === 'sessions' && sourceTemplateWarning(row as Session) && (
                      <div
                        role="note"
                        className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
                      >
                        <p className="font-medium">{sourceTemplateWarning(row as Session)}</p>
                        {(row as Session).intent !== 'CANCEL' &&
                          (row as Session).sourceTemplateStatus?.kind === 'STALE' && (
                            <label className="mt-2 flex items-center gap-2 text-xs font-semibold">
                              <input
                                type="checkbox"
                                checked={
                                  reviewedSources[row.id] ===
                                  (row as Session).sourceTemplateStatus?.currentUpdatedAt
                                }
                                onChange={(e) =>
                                  setReviewedSources((s) => ({
                                    ...s,
                                    [row.id]: e.target.checked
                                      ? ((row as Session).sourceTemplateStatus?.currentUpdatedAt ??
                                        '')
                                      : '',
                                  }))
                                }
                              />
                              Đã kiểm tra mẫu tuần đã thay đổi; giữ giờ buổi nháp đang được đề xuất
                            </label>
                          )}
                      </div>
                    )}

                    <div className="mt-2 space-y-2 border-t border-slate-100 pt-2">
                        {reason.trim().length < 10 && (
                          <input
                            type="text"
                            className="input-field py-1.5 text-xs"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Nhập nhanh lý do duyệt (>= 10 ký tự)…"
                          />
                        )}
                        <button
                          type="button"
                          className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs"
                          disabled={
                            busy ||
                            (kind === 'versions' &&
                              (!priceConfirmed ||
                                priceReference.trim().length < 10 ||
                                (row as Version).standardTuitionFeeVnd === null)) ||
                            reason.trim().length < 10 ||
                            (kind === 'assignments' && !eligibility) ||
                            (kind === 'sessions' &&
                              (row as Session).intent !== 'CANCEL' &&
                              ((row as Session).sourceTemplateStatus?.kind === 'MISSING' ||
                                ((row as Session).sourceTemplateStatus?.kind === 'STALE' &&
                                  reviewedSources[row.id] !==
                                    (row as Session).sourceTemplateStatus?.currentUpdatedAt)))
                          }
                          onClick={() => void approve(kind, row)}
                        >
                          <CheckCircle2 size={15} aria-hidden="true" />
                          Duyệt{' '}
                          {
                            { versions: 'phiên bản', assignments: 'phân công', sessions: 'buổi' }[
                              kind
                            ]
                          }
                        </button>
                      </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
