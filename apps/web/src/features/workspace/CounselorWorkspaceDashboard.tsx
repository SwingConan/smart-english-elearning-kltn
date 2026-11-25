import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  HeadphonesIcon,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/features/auth/auth-context';
import { accountLabel } from '@/features/catalog/record-presentation';
import { supportGet, type SupportConfig, type TicketSummary } from '@/features/support/support-api';
import { formatTicketStatusLabel } from '@/features/support/SupportAttachments';

function shortTicketRef(reference: string) {
  return reference.length > 20 ? `${reference.slice(0, 14)}…` : reference;
}

export function CounselorWorkspaceDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<SupportConfig | null>(null);
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [supportErr, setSupportErr] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setSupportErr('');

    const [cfgRes, tktRes] = await Promise.allSettled([
      supportGet<SupportConfig>('/config'),
      supportGet<{ items: TicketSummary[] }>('/tickets'),
    ]);

    if (cfgRes.status === 'fulfilled' && cfgRes.value && typeof cfgRes.value === 'object') {
      setConfig({
        ...cfgRes.value,
        topics: Array.isArray(cfgRes.value.topics) ? cfgRes.value.topics : [],
        taxonomy: Array.isArray(cfgRes.value.taxonomy) ? cfgRes.value.taxonomy : [],
      });
    } else {
      setConfig(null);
      setSupportErr('Không thể đọc cấu hình quyền CSKH theo chủ đề.');
    }

    if (tktRes.status === 'fulfilled' && Array.isArray(tktRes.value?.items)) {
      setTickets(tktRes.value.items);
    } else {
      setTickets([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const activeTopics = config?.topics ?? [];
  const openTickets = useMemo(
    () => tickets.filter((t) => !['RESOLVED', 'CLOSED'].includes(t.state)),
    [tickets],
  );
  const unassignedCount = useMemo(() => tickets.filter((t) => !t.assigned).length, [tickets]);
  const waitingSpecialistCount = useMemo(
    () => tickets.filter((t) => t.state === 'WAITING_SPECIALIST').length,
    [tickets],
  );
  const resolvedCount = useMemo(
    () => tickets.filter((t) => ['RESOLVED', 'CLOSED'].includes(t.state)).length,
    [tickets],
  );

  if (!user) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Main Header */}
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-wide text-[#76a35e] uppercase">
            Nhân viên tư vấn · {accountLabel(user.fullName)}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#e66f2b] sm:text-3xl">
            Tổng quan xử lý phiếu hỗ trợ học viên
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Tiếp nhận, phản hồi giải đáp, phối hợp chuyển chuyên môn hoặc báo cáo bộ phận kỹ thuật trong các chủ đề được phân công.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadAll()}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          Làm mới dữ liệu
        </button>
      </header>

      {/* Topic Grant Truth Banner */}
      <section
        aria-label="Phạm vi chủ đề phụ trách"
        className={`rounded-md border p-4 text-sm ${
          activeTopics.length > 0
            ? 'border-[#b9d4ab] bg-[#f4f9f1] text-slate-800'
            : 'border-amber-300 bg-amber-50 text-amber-950'
        }`}
      >
        <div className="flex items-start gap-2.5">
          {activeTopics.length > 0 ? (
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-[#5d8746]" aria-hidden="true" />
          ) : (
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
          )}
          <div className="space-y-1">
            <p className="font-bold">
              {activeTopics.length > 0
                ? `Đang phụ trách ${activeTopics.length} chủ đề hỗ trợ còn hiệu lực`
                : 'Chưa có chủ đề hỗ trợ còn hiệu lực phân công cho tài khoản này'}
            </p>
            <p className="text-xs leading-relaxed opacity-90">
              {supportErr
                ? supportErr
                : activeTopics.length > 0
                  ? `Chủ đề trong phạm vi: ${activeTopics.map((t) => t.title).join(', ')}.`
                  : 'Tài khoản chưa được cấp quyền xử lý chủ đề hỗ trợ còn hiệu lực. Khi Quản trị hệ thống kích hoạt quyền, hàng đợi phiếu sẽ tự động mở.'}
            </p>
          </div>
        </div>
      </section>

      {/* Ticket Summary Metrics */}
      <section aria-label="Tổng hợp hàng đợi phiếu hỗ trợ" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="rounded-md border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Phiếu đang mở</span>
            <HeadphonesIcon size={15} className="text-[#5d8746]" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">{openTickets.length}</p>
          <p className="mt-1 text-xs text-slate-500">Thuộc các chủ đề được phân quyền</p>
        </article>
        <article className="rounded-md border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Chờ nhận xử lý</span>
            <Clock3 size={15} className="text-[#e66f2b]" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#e66f2b]">{unassignedCount}</p>
          <p className="mt-1 text-xs text-slate-500">Chưa có tư vấn viên phụ trách</p>
        </article>
        <article className="rounded-md border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Chờ chuyên môn / kỹ thuật</span>
            <AlertTriangle size={15} className="text-amber-600" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-700">{waitingSpecialistCount}</p>
          <p className="mt-1 text-xs text-slate-500">Đang chờ Học vụ hoặc Kỹ thuật phản hồi</p>
        </article>
        <article className="rounded-md border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Đã giải quyết / Đóng</span>
            <CheckCircle2 size={15} className="text-[#5d8746]" aria-hidden="true" />
          </div>
          <p className="mt-2 text-2xl font-bold text-[#2d581b]">{resolvedCount}</p>
          <p className="mt-1 text-xs text-slate-500">Đã hoàn tất hỗ trợ học viên</p>
        </article>
      </section>

      {/* Active Ticket Queue Preview */}
      <section aria-labelledby="counselor-tickets-heading" className="rounded-md border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h2 id="counselor-tickets-heading" className="text-lg font-bold text-[#e66f2b]">
              Phiếu hỗ trợ trong phạm vi được giao
            </h2>
            <p className="text-xs text-slate-600">
              Hiển thị trực tiếp các phiếu học viên thuộc chủ đề bạn được phân quyền xử lý.
            </p>
          </div>
          <Link to="/workspace/support" className="inline-flex items-center gap-1 text-xs font-bold text-[#2d581b] hover:underline">
            Quản lý toàn bộ hàng đợi <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>

        {!tickets.length ? (
          <p className="mt-4 rounded border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            {activeTopics.length
              ? 'Hiện chưa có phiếu mới nào trong các chủ đề được giao.'
              : 'Hàng đợi phiếu đang trống do tài khoản chưa có chủ đề CSKH được cấp quyền.'}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
                  <th className="px-3 py-2">Mã phiếu</th>
                  <th className="px-3 py-2">Nội dung tóm tắt</th>
                  <th className="px-3 py-2">Chủ đề</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2">Phân công</th>
                  <th className="px-3 py-2">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {tickets.slice(0, 12).map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2.5 font-mono text-xs font-semibold text-slate-800" title={t.reference}>
                      {shortTicketRef(t.reference)}
                    </td>
                    <td className="max-w-xs truncate px-3 py-2.5 text-xs font-medium text-slate-900" title={t.title || ''}>
                      {t.title || 'Yêu cầu hỗ trợ học viên'}
                      {t.attachmentCount ? (
                        <span className="ml-2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                          {t.attachmentCount} tệp
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-700">{t.topic.title}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <span className="inline-flex rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
                        {formatTicketStatusLabel(t.state, t.assigned, 'STAFF')}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">
                      {t.assigned ? 'Bạn phụ trách' : 'Chưa phân công'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <Link
                        to={t.assigned ? `/workspace/support/tickets/${t.id}` : '/workspace/support'}
                        className="text-xs font-bold text-[#2d581b] hover:text-[#e66f2b] hover:underline"
                      >
                        {t.assigned ? 'Mở chi tiết phiếu' : 'Vào hàng đợi nhận'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
