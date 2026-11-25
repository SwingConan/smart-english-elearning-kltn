import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  FolderKanban,
  Layers,
  PlusCircle,
  Search,
} from 'lucide-react';
import { classLabel, isTechnicalQaRecord } from '@/features/catalog/record-presentation';
import { classCodeLabel } from '@/features/demo/presentation';
import { classStateLabel } from '@/features/presentation/labels';
import { QaRecordGate } from '@/features/catalog/SourceRecord';
import { academicApi, type Program, type AcademicClass, type Page } from '@/features/academic/api';

const control = 'rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm';

export function AcademicDashboardPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState(''),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1),
    [tab, setTab] = useState<'programs' | 'classes'>('programs'),
    [classStatusFilter, setClassStatusFilter] = useState('ALL');
  const [result, setResult] = useState<{
      key: string;
      data: Page<Program> | Page<AcademicClass>;
    }>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    level: 'FOUNDATION',
    skillScope: 'LR',
    defaultDurationWeeks: 12,
    defaultSessionsCount: 24,
    defaultPeriodsPerSession: 3,
    reason: '',
  });
  const key = tab + '|' + query + '|' + page;

  useEffect(() => {
    let live = true;
    const qs = '?' + new URLSearchParams({ search: query, page: String(page), limit: '10' });
    void (tab === 'programs' ? academicApi.programs(qs) : academicApi.classes(qs))
      .then((data) => {
        if (live) {
          setResult({ key, data });
          setError('');
        }
      })
      .catch(() => {
        if (live) setError('Không thể tải dữ liệu học vụ. Kiểm tra phiên và quyền hiện tại.');
      });
    return () => {
      live = false;
    };
  }, [tab, query, page, key]);

  const data = result?.key === key ? result.data : undefined;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const p = await academicApi.write<Program>('/programs', form);
      navigate('/academic/programs/' + p.id);
    } catch {
      setError('Chưa lưu được chương trình. Kiểm tra dữ liệu, phiên và thử lại.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="workspace-page">
      {/* Header Banner */}
      <header className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="space-y-1.5">
          <span className="inline-flex items-center gap-1.5 rounded bg-[#e9f2e4] px-2.5 py-0.5 text-xs font-semibold text-[#2f5d1e]">
            <FolderKanban size={13} aria-hidden="true" />
            Quản lý đào tạo · Học vụ
          </span>
          <h1 className="text-2xl font-bold text-[#e66f2b] sm:text-3xl">
            Chương trình và lớp học
          </h1>
          <p className="max-w-3xl text-sm text-slate-600">
            Quản lý khung chương trình đào tạo TOEIC, kế hoạch mở lớp, điều phối giảng viên và theo dõi tiến độ đào tạo.
          </p>
        </div>
      </header>

      {/* Filter & View Switcher Bar */}
      <div className="workspace-card flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-2" aria-label="Học vụ">
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === 'programs'
                ? 'bg-[#76a35e] text-white shadow-xs'
                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
            aria-pressed={tab === 'programs'}
            onClick={() => {
              setTab('programs');
              setPage(1);
            }}
          >
            Chương trình
          </button>
          <button
            type="button"
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === 'classes'
                ? 'bg-[#76a35e] text-white shadow-xs'
                : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
            }`}
            aria-pressed={tab === 'classes'}
            onClick={() => {
              setTab('classes');
              setPage(1);
            }}
          >
            Lớp học
          </button>
        </nav>

        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search);
            setPage(1);
          }}
        >
          <div className="relative">
            <Search
              size={15}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              className={control + ' pl-9'}
              aria-label="Tìm chương trình hoặc lớp"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tên, mã lớp hoặc trình độ"
            />
          </div>
          <button type="submit" className={control + ' font-semibold hover:bg-slate-50'}>
            Tìm kiếm
          </button>
        </form>
      </div>

      {error && (
        <p role="alert" className="state-error text-sm font-medium">
          {error}
        </p>
      )}
      {!data && !error && (
        <p role="status" className="workspace-card text-sm text-slate-600">
          Đang tải dữ liệu…
        </p>
      )}

      {/* Main Content Grid */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-4">
          {data && (() => {
            const visibleItems =
              tab === 'classes' && classStatusFilter !== 'ALL'
                ? (data.data as AcademicClass[]).filter((c) => c.status === classStatusFilter)
                : data.data;
            return (
            <section className="workspace-card space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <p className="text-sm font-bold text-slate-800">
                  {visibleItems.length}/{data.meta.total} kết quả · Trang {page}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {tab === 'classes' && (
                    <select
                      aria-label="Lọc trạng thái lớp"
                      value={classStatusFilter}
                      onChange={(e) => setClassStatusFilter(e.target.value)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800"
                    >
                      <option value="ALL">Tất cả trạng thái</option>
                      <option value="OPEN">Đang mở lớp</option>
                      <option value="IN_PROGRESS">Đang học</option>
                      <option value="DRAFT">Bản nháp</option>
                      <option value="COMPLETED">Đã kết thúc</option>
                      <option value="CANCELLED">Đã hủy</option>
                    </select>
                  )}
                  <span className="badge-info">
                    {tab === 'programs' ? 'Chương trình' : 'Lớp học'}
                  </span>
                </div>
              </div>

              {visibleItems.length > 0 && (
                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      {tab === 'programs' ? (
                        <tr>
                          <th>Chương trình</th>
                          <th>Trình độ &amp; Trạng thái</th>
                          <th>Số lớp</th>
                          <th>Thao tác</th>
                        </tr>
                      ) : (
                        <tr>
                          <th>Lớp học</th>
                          <th>Khóa học</th>
                          <th>Sĩ số</th>
                          <th>Trạng thái</th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {visibleItems.map((item) => {
                        const qa =
                          'title' in item
                            ? isTechnicalQaRecord(item.title)
                            : isTechnicalQaRecord(item.name, item.code, item.course.title);
                        return 'title' in item ? (
                          <tr key={item.id}>
                            <td>
                              <QaRecordGate qa={qa} label="Chương trình QA">
                                <Link
                                  className="font-bold text-indigo-700 hover:underline"
                                  to={'/academic/programs/' + item.id}
                                >
                                  {item.title}
                                </Link>
                              </QaRecordGate>
                            </td>
                            <td className="text-xs text-slate-600">
                              <span className="font-medium text-slate-800">{item.level}</span> ·{' '}
                              {item.isPublished ? 'Đã công khai' : 'Bản nháp'}
                            </td>
                            <td className="text-xs font-semibold">{item._count.classOfferings} lớp</td>
                            <td>
                              <Link
                                to={'/academic/programs/' + item.id + '/versions'}
                                className="btn-secondary inline-flex items-center gap-1.5 px-2.5 py-1 text-xs"
                              >
                                <Layers size={13} aria-hidden="true" />
                                Phiên bản &amp; Học phí
                              </Link>
                            </td>
                          </tr>
                        ) : (
                          <tr key={item.id}>
                            <td>
                              <QaRecordGate qa={qa} label="Lớp QA">
                                <Link
                                  className="font-bold text-indigo-700 hover:underline"
                                  to={'/academic/classes/' + item.id}
                                >
                                  {classCodeLabel(item.code)} · {classLabel(item.name, item.code, item.course.title)}
                                </Link>
                              </QaRecordGate>
                            </td>
                            <td className="text-xs text-slate-600">{item.course.title}</td>
                            <td className="text-xs font-semibold">
                              {item.activeLearnerCount}/{item.maxStudents ?? '—'}
                            </td>
                            <td>
                              <span
                                className={`badge ${
                                  item.status === 'OPEN' || item.status === 'IN_PROGRESS'
                                    ? 'badge-success'
                                    : item.status === 'DRAFT'
                                      ? 'badge-warning'
                                      : 'badge-neutral'
                                }`}
                              >
                                {classStateLabel(item.status)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {!visibleItems.length && (
                <p className="py-4 text-center text-sm text-slate-600">
                  Chưa có dữ liệu trong phạm vi này.
                </p>
              )}

              <div className="flex gap-3 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  className={control + ' font-semibold disabled:opacity-50'}
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Trang trước
                </button>
                <button
                  type="button"
                  className={control + ' font-semibold disabled:opacity-50'}
                  disabled={page * data.meta.limit >= data.meta.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Trang sau
                </button>
              </div>
            </section>
            );
          })()}
        </div>

        {/* Right Form Card: Create Draft Program */}
        <section className="workspace-card space-y-4">
          {tab === 'classes' && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-xs text-indigo-950">
              <strong className="font-semibold">Mở lớp học mới:</strong> Chọn một chương trình ở tab{' '}
              <button
                type="button"
                className="font-bold underline hover:text-indigo-700"
                onClick={() => {
                  setTab('programs');
                  setPage(1);
                }}
              >
                Chương trình
              </button>{' '}
              rồi vào mục <em>Phiên bản &amp; Học phí</em> để khởi tạo lớp theo học phí đã duyệt.
            </div>
          )}
          <div className="border-b border-slate-100 pb-3">
            <span className="badge-draft">Khởi tạo chuẩn mới</span>
            <h2 className="mt-1.5 text-xl font-bold text-slate-950">Tạo chương trình nháp</h2>
            <p className="mt-1 text-xs text-slate-600">
              Chương trình mới khởi tạo ở trạng thái bản nháp trước khi cấu hình học phần và phiên bản
              điều khoản.
            </p>
          </div>

          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => void submit(e)}>
            <label className="block space-y-1 text-sm font-semibold text-slate-700 sm:col-span-2">
              Tên chương trình
              <input
                className={control + ' block w-full'}
                required
                maxLength={300}
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </label>
            <label className="block space-y-1 text-sm font-semibold text-slate-700">
              Trình độ
              <input
                className={control + ' block w-full'}
                required
                maxLength={100}
                value={form.level}
                onChange={(e) => setForm((f) => ({ ...f, level: e.target.value }))}
              />
            </label>
            <label className="block space-y-1 text-sm font-semibold text-slate-700">
              Kỹ năng
              <select
                className={control + ' block w-full'}
                value={form.skillScope}
                onChange={(e) => setForm((f) => ({ ...f, skillScope: e.target.value }))}
              >
                {[
                  ['LR', 'Nghe & Đọc (L&R)'],
                  ['FOUR_SKILLS', 'Bốn kỹ năng (Nghe · Đọc · Nói · Viết)'],
                  ['LISTENING', 'Nghe (Listening)'],
                  ['READING', 'Đọc (Reading)'],
                  ['SPEAKING', 'Nói (Speaking)'],
                  ['WRITING', 'Viết (Writing)'],
                ].map(([val, lbl]) => (
                  <option key={val} value={val}>
                    {lbl}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1 text-sm font-semibold text-slate-700 sm:col-span-2">
              Mô tả và định hướng
              <textarea
                className={control + ' block w-full'}
                rows={2}
                maxLength={5000}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </label>
            <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
              <label className="block space-y-1 text-xs font-semibold text-slate-700">
                Thời lượng (tuần)
                <input
                  type="number"
                  min={1}
                  max={104}
                  className={control + ' block w-full'}
                  value={form.defaultDurationWeeks}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, defaultDurationWeeks: Number(e.target.value) || 12 }))
                  }
                />
              </label>
              <label className="block space-y-1 text-xs font-semibold text-slate-700">
                Số buổi mặc định
                <input
                  type="number"
                  min={1}
                  max={500}
                  className={control + ' block w-full'}
                  value={form.defaultSessionsCount}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, defaultSessionsCount: Number(e.target.value) || 24 }))
                  }
                />
              </label>
              <label className="block space-y-1 text-xs font-semibold text-slate-700">
                Số tiết/buổi (45p/tiết)
                <input
                  type="number"
                  min={1}
                  max={12}
                  className={control + ' block w-full'}
                  value={form.defaultPeriodsPerSession}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, defaultPeriodsPerSession: Number(e.target.value) || 3 }))
                  }
                />
              </label>
            </div>
            <label className="block space-y-1 text-sm font-semibold text-slate-700 sm:col-span-2">
              Lý do tạo
              <textarea
                className={control + ' block w-full'}
                rows={2}
                required
                minLength={10}
                maxLength={500}
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              />
            </label>
            <div className="flex justify-end sm:col-span-2">
              <button type="submit" className="btn-primary text-sm" disabled={busy}>
                <PlusCircle size={16} aria-hidden="true" />
                {busy ? 'Đang lưu…' : 'Tạo bản nháp'}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
